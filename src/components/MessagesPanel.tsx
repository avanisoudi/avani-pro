import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createDirectConversation, createGroupConversation, deleteMessage, getMyProfile, getMessageAttachmentUrl, joinPublicGroup, listConversations, listMessages, listProfilesByIds, listPublicGroups, listMessageReactions, markConversationRead, messageReactionsSupported, MAX_MESSAGE_ATTACHMENT_BYTES, searchMessageContacts, sendMessage, setMessageReaction, type ConversationRecord, type MessageRecord, type ProfileRecord, type PublicGroupRecord, type ReactionType, updateMessage, uploadMessageAttachment } from '../lib/api'
import { supabase } from '../lib/supabase'

type TypingState = Record<string, string>

function MessageAttachment({ message }: { message: MessageRecord }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  useEffect(() => { let active = true; if (!message.attachment_path) return () => { active = false }; getMessageAttachmentUrl(message.attachment_path).then(value => { if (active) setUrl(value) }).catch(() => { if (active) setError(true) }); return () => { active = false } }, [message.attachment_path])
  if (error) return <span className="attachment-error">Pièce jointe indisponible</span>
  if (!url) return <span className="attachment-loading">Chargement de la pièce jointe…</span>
  if (message.attachment_mime_type?.startsWith('image/')) return <a href={url} target="_blank" rel="noreferrer"><img className="message-attachment-image" src={url} alt={message.attachment_name || 'Pièce jointe'} /></a>
  return <a className="message-attachment-link" href={url} target="_blank" rel="noreferrer">↗ {message.attachment_name || 'Ouvrir la pièce jointe'}</a>
}

export function MessagesPanel({ user, onAction, initialConversationId }: { user: User | null; onAction: (message: string) => void; initialConversationId?: string }) {
  const [conversations, setConversations] = useState<ConversationRecord[]>([])
  const [publicGroups, setPublicGroups] = useState<PublicGroupRecord[]>([])
  const [listError, setListError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [reactionsLive, setReactionsLive] = useState(true)
  const senderCache = useRef(new Map<string, ProfileRecord>())
  const [joiningPublicGroup, setJoiningPublicGroup] = useState<string | null>(null)
  const [selected, setSelected] = useState<ConversationRecord | null>(null)
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState<'all' | 'public' | 'private'>('all')
  const [typing, setTyping] = useState<TypingState>({})
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting')
  const [hasOlder, setHasOlder] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [replyTo, setReplyTo] = useState<MessageRecord | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [newConversationOpen, setNewConversationOpen] = useState(false)
  const [groupMode, setGroupMode] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const [contacts, setContacts] = useState<ProfileRecord[]>([])
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [groupTitle, setGroupTitle] = useState('')
  const [creatingConversation, setCreatingConversation] = useState(false)
  const [messageReactions, setMessageReactions] = useState<Record<string, Record<ReactionType, number>>>({})
  const [myReactions, setMyReactions] = useState<Record<string, ReactionType | null>>({})
  const typingTimeout = useRef<number | null>(null)

  useEffect(() => {
    if (!newConversationOpen || !user) return
    let active = true
    void searchMessageContacts(user.id, contactQuery).then(rows => { if (active) setContacts(rows) }).catch(() => { if (active) setContacts([]) })
    return () => { active = false }
  }, [newConversationOpen, contactQuery, user])

  const startConversation = async () => {
    if (!user || !selectedContacts.length || creatingConversation) return
    setCreatingConversation(true)
    try {
      const created = groupMode
        ? await createGroupConversation(user.id, groupTitle, selectedContacts)
        : await createDirectConversation(user.id, selectedContacts[0], contacts.find(item => item.id === selectedContacts[0])?.full_name || '')
      setConversations(current => [created, ...current.filter(item => item.id !== created.id)])
      setSelected(created)
      setNewConversationOpen(false)
      setSelectedContacts([]); setContactQuery(''); setGroupTitle('')
    } catch (caught) {
      onAction(caught instanceof Error ? caught.message : 'Impossible de créer la conversation.')
    } finally { setCreatingConversation(false) }
  }

  /** Nomme proprement un message qui arrive en direct (l’événement Realtime ne porte que la ligne `messages`). */
  const withSender = async (message: MessageRecord): Promise<MessageRecord> => {
    if (message.sender || !message.sender_id) return message
    const known = senderCache.current.get(message.sender_id)
    if (known) return { ...message, sender: { id: known.id, username: known.username, full_name: known.full_name, avatar_url: known.avatar_url } }
    try {
      const [profile] = await listProfilesByIds([message.sender_id])
      if (profile) {
        senderCache.current.set(profile.id, profile)
        return { ...message, sender: { id: profile.id, username: profile.username, full_name: profile.full_name, avatar_url: profile.avatar_url } }
      }
    } catch {
      /* un message reste lisible même si son profil est injoignable : on ne vide pas le fil pour ça */
    }
    return message
  }
  const rememberSenders = (items: MessageRecord[]) => {
    for (const item of items) {
      const sender = item.sender as { id?: string; username?: string; full_name?: string; avatar_url?: string | null } | undefined
      if (sender?.id) senderCache.current.set(sender.id, { id: sender.id, username: sender.username ?? '', full_name: sender.full_name ?? '', avatar_url: sender.avatar_url ?? null, bio: null, verified_type: null })
    }
  }

  // Les conversations de groupes publics viennent de `groups` (via leur
  // conversation rattachée), pas d'un drapeau inventé côté client.
  const publicChatIds = useMemo(() => new Set(publicGroups.map(group => group.conversation_id).filter(Boolean) as string[]), [publicGroups])
  const visibleConversations = useMemo(
    () => conversations.filter(conversation => {
      const inPublicGroup = publicChatIds.has(conversation.id)
      if (listFilter === 'public' && !inPublicGroup) return false
      if (listFilter === 'private' && inPublicGroup) return false
      return (conversation.title || '').toLowerCase().includes(search.toLowerCase())
    }),
    [conversations, search, listFilter, publicChatIds],
  )
  const joinGroup = async (group: PublicGroupRecord) => {
    if (!user || joiningPublicGroup) return
    setJoiningPublicGroup(group.id)
    try {
      const result = await joinPublicGroup(user.id, group.id)
      setPublicGroups(current => current.map(item => item.id === group.id ? result.group : item))
      if (result.conversation) {
        setConversations(current => [result.conversation as ConversationRecord, ...current.filter(item => item.id !== result.conversation!.id)])
        setSelected(result.conversation as ConversationRecord)
      }
      onAction(result.note || (result.conversation ? `Tu es dans « ${result.group.name} », le chat est ouvert.` : `Tu es dans « ${result.group.name} ».`))
    } catch (caught) {
      onAction(caught instanceof Error ? caught.message : 'Impossible de rejoindre ce groupe.')
    } finally {
      setJoiningPublicGroup(null)
    }
  }


  // Les conversations et les groupes publics sont chargés indépendamment : une table
  // absente ou une règle d’accès manquante ne doit pas vider tout l’écran de messagerie.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    setError('')
    setListError('')
    listConversations(user.id)
      .then(items => {
        if (cancelled) return
        const sortedItems = items.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        setConversations(sortedItems)
        setSelected(current => current && sortedItems.some(item => item.id === current.id) ? current : (sortedItems.find(item => item.id === initialConversationId) ?? sortedItems[0] ?? null))
      })
      .catch(caught => { if (!cancelled) setListError(caught instanceof Error ? caught.message : 'Impossible de charger tes conversations.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    listPublicGroups()
      .then(items => { if (!cancelled) setPublicGroups(items) })
      .catch(() => { if (!cancelled) setPublicGroups([]) })
    void messageReactionsSupported().then(live => { if (!cancelled) setReactionsLive(live) }).catch(() => undefined)
    void getMyProfile(user)
      .then(profile => { if (profile) senderCache.current.set(profile.id, profile) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [user, initialConversationId, reloadToken])

  // Liste en direct : nouvelle conversation (invitation) ou nouveau message reçu
  // ailleurs — on rejoue la lecture de la boîte de réception, sans polling ni doublon.
  useEffect(() => {
    if (!user || !supabase) return
    let timer: number | null = null
    const bump = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => { timer = null; setReloadToken(value => value + 1) }, 900)
    }
    const channel = supabase
      .channel(`inbox:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${user.id}` }, () => bump())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => bump())
      .subscribe()
    return () => {
      if (timer) window.clearTimeout(timer)
      void supabase?.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    if (!selected || !user || !supabase) return
    let cancelled = false
    setMessages([])
    setTyping({})
    setHasOlder(true)
    setMessageReactions({})
    setMyReactions({})
    listMessages(selected.id)
      .then(items => {
        if (!cancelled) {
          rememberSenders(items)
          setMessages(items)
          setHasOlder(items.length >= 50)
          void refreshMessageReactions(items)
        }
      })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Impossible de charger les messages.') })
    void markConversationRead(selected.id, user.id)

    const client = supabase
    const refreshReactionsFor = async (messageIds: string[]) => {
      if (!messageIds.length) return
      try {
        const rows = await listMessageReactions(messageIds)
        setMessageReactions(current => {
          const next = { ...current }
          for (const id of messageIds) next[id] = { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }
          for (const row of rows) next[row.message_id][row.reaction_type] += 1
          return next
        })
        setMyReactions(current => {
          const next = { ...current }
          for (const id of messageIds) next[id] = rows.find(row => row.message_id === id && row.user_id === user.id)?.reaction_type ?? null
          return next
        })
      } catch { /* realtime reaction UI can recover on the next event/load */ }
    }
    const channel = client.channel(`conversation:${selected.id}`, {
      config: { presence: { key: user.id } },
    })

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selected.id}` }, payload => {
        const incoming = payload.new as MessageRecord
        // L'événement ne porte que la ligne brute `messages` (sans l'embed `sender`) :
        // on nomme l'expéditeur via le cache de profils avant de l'afficher.
        // La déduplication sur l'id serve évite tout doublon avec l'envoi optimiste.
        void withSender(incoming).then(message => {
          setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message])
        })
        if (incoming.sender_id !== user.id) void markConversationRead(selected.id, user.id)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selected.id}` }, payload => {
        const incoming = payload.new as MessageRecord
        setMessages(current => current.map(message => message.id === incoming.id ? { ...message, ...incoming } : message))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selected.id}` }, payload => {
        const deleted = payload.old as MessageRecord
        setMessages(current => current.filter(message => message.id !== deleted.id))
        setMessageReactions(current => { const next = { ...current }; delete next[deleted.id]; return next })
        setMyReactions(current => { const next = { ...current }; delete next[deleted.id]; return next })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, payload => {
        const changed = (payload.new || payload.old) as { message_id?: string }
        if (changed.message_id) void refreshReactionsFor([changed.message_id])
      })
      .on('broadcast', { event: 'typing' }, payload => {
        const data = payload.payload as { userId?: string; name?: string; active?: boolean }
        const typingUserId = data.userId
        if (!typingUserId || typingUserId === user.id) return
        setTyping(current => {
          const next = { ...current }
          if (data.active) next[typingUserId] = data.name || ''
          else delete next[typingUserId]
          return next
        })
      })
      .on('presence', { event: 'sync' }, () => {
        setConnection('connected')
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          setConnection('connected')
          await channel.track({ userId: user.id, onlineAt: new Date().toISOString() })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection('reconnecting')
        } else if (status === 'CLOSED') {
          setConnection('offline')
        }
      })

    const onOnline = () => setConnection('connected')
    const onOffline = () => setConnection('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
      void client.removeChannel(channel)
    }
  }, [selected, user])

  const broadcastTyping = async (active: boolean) => {
    if (!selected || !user || !supabase) return
    const client = supabase
    if (!client) return
    const channel = client.getChannels().find(item => item.topic === `realtime:conversation:${selected.id}`)
    if (!channel) return
    await channel.send({ type: 'broadcast', event: 'typing', payload: { userId: user.id, name: user.user_metadata?.full_name || '', active } })
  }

  const handleDraftChange = (value: string) => {
    setDraft(value)
    if (!value.trim()) {
      void broadcastTyping(false)
      if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
      return
    }
    void broadcastTyping(true)
    if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
    typingTimeout.current = window.setTimeout(() => { void broadcastTyping(false) }, 1800)
  }

  const chooseAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_MESSAGE_ATTACHMENT_BYTES) { onAction('La pièce jointe dépasse la limite de 25 Mo.'); return }
    setAttachment(file)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || !user || (!draft.trim() && !attachment) || sending) return
    const body = draft.trim()
    setSending(true)
    setDraft('')
    void broadcastTyping(false)
    try {
      const attachmentPath = attachment ? await uploadMessageAttachment(selected.id, user.id, attachment) : null
      const sent = await sendMessage(selected.id, user.id, body || `Pièce jointe : ${attachment?.name || ''}`, { replyToId: replyTo?.id ?? null, attachmentPath, attachmentName: attachment?.name ?? null, attachmentMimeType: attachment?.type ?? null, attachmentSizeBytes: attachment?.size ?? null, messageType: attachment?.type.startsWith('image/') ? 'image' : attachment ? 'file' : 'text' })
      // `sendMessage` renvoie la ligne réellement insérée : c'est elle qui s'affiche,
      // sans doublon si Realtime la renvoie aussi. L'insertion `select('*')` ne contient
      // pas l'embed profil, donc on la nomme avec le profil en cache.
      const me = senderCache.current.get(user.id)
      const message: MessageRecord = sent.sender || !me ? sent : { ...sent, sender: { id: me.id, username: me.username, full_name: me.full_name, avatar_url: me.avatar_url } }
      setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message])
      setReplyTo(null)
      setAttachment(null)
      // L'ordre de la liste est tenu par `conversations.updated_at`, que le trigger
      // `touch_conversation_on_message` (migration 009) fait avancer à chaque message.
      setConversations(current => current.filter(item => item.id !== selected.id).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).concat([{ ...selected, updated_at: message.created_at }]))
    } catch (caught) {
      setDraft(body)
      onAction(caught instanceof Error ? caught.message : 'Message non envoyé.')
    } finally { setSending(false) }
  }

  const loadOlder = async () => {
    if (!selected || !hasOlder || loadingOlder || messages.length === 0) return
    setLoadingOlder(true)
    try {
      const older = await listMessages(selected.id, messages[0].created_at)
      setMessages(current => {
        const ids = new Set(current.map(item => item.id))
        return [...older.filter(item => !ids.has(item.id)), ...current]
      })
      setHasOlder(older.length >= 50)
    } catch (caught) {
      onAction(caught instanceof Error ? caught.message : 'Impossible de charger les anciens messages.')
    } finally {
      setLoadingOlder(false)
    }
  }

  const refreshMessageReactions = async (items: MessageRecord[]) => {
    if (!items.length || !user) return
    try {
      const rows = await listMessageReactions(items.map(item => item.id))
      const counts: Record<string, Record<ReactionType, number>> = {}
      const mine: Record<string, ReactionType | null> = {}
      for (const item of items) counts[item.id] = { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }
      for (const row of rows) {
        if (!counts[row.message_id]) counts[row.message_id] = { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }
        counts[row.message_id][row.reaction_type] += 1
        if (row.user_id === user.id) mine[row.message_id] = row.reaction_type
      }
      for (const item of items) if (!(item.id in mine)) mine[item.id] = null
      setMessageReactions(counts)
      setMyReactions(mine)
    } catch { /* keep message rendering independent from reaction reads */ }
  }

  const reactToMessage = async (messageId: string, reaction: ReactionType) => {
    if (!user) return
    const nextReaction = myReactions[messageId] === reaction ? null : reaction
    try {
      await setMessageReaction(messageId, user.id, nextReaction)
      await refreshMessageReactions(messages)
    } catch (caught) {
      onAction(caught instanceof Error ? caught.message : 'Réaction impossible.')
    }
  }

  const reactionOptions: Array<[ReactionType, string]> = [['like', '👍'], ['love', '❤️'], ['haha', '😂'], ['wow', '😮'], ['sad', '😢'], ['angry', '😡']]

  const saveEdit = async () => {
    if (!editingId || !user || !editingBody.trim()) return
    const message = messages.find(item => item.id === editingId)
    if (!message) return
    try {
      const updated = await updateMessage(editingId, user.id, editingBody)
      setMessages(current => current.map(item => item.id === editingId ? { ...item, ...updated } : item))
      setEditingId(null)
      setEditingBody('')
    } catch (caught) {
      onAction(caught instanceof Error ? caught.message : 'Modification impossible.')
    }
  }

  const removeMessage = async (message: MessageRecord) => {
    if (!user || message.sender_id !== user.id) return
    try {
      const deleted = await deleteMessage(message.id, user.id)
      setMessages(current => current.map(item => item.id === message.id ? { ...item, ...deleted, body: '', deleted_at: deleted.deleted_at } : item))
    } catch (caught) {
      onAction(caught instanceof Error ? caught.message : 'Suppression impossible.')
    }
  }

  if (!user) return <section className="placeholder"><div className="placeholder-orb">◌</div><span className="eyebrow">MESSAGERIE</span><h2>Connectez-vous pour discuter.</h2><p>Vos conversations sont chargées depuis votre compte réel.</p></section>
  if (loading) return <section className="placeholder"><div className="placeholder-orb">◌</div><h2>Chargement de vos conversations…</h2></section>

  return <section className="messages-panel">
    <div className="conversation-list">
      <div className="messages-heading">
        <div><span className="eyebrow">MESSAGERIE</span><small>Conversations de votre compte</small></div><div className="message-new-actions"><button type="button" onClick={() => { setGroupMode(false); setNewConversationOpen(true) }}>＋ Discussion</button><button type="button" onClick={() => { setGroupMode(true); setNewConversationOpen(true) }}>＋ Groupe</button></div>
      </div>
      <label className="message-search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher une conversation" aria-label="Rechercher une conversation" /></label><div className="message-filters"><button className={listFilter === 'all' ? 'active' : ''} type="button" onClick={() => setListFilter('all')}>Toutes</button><button className={listFilter === 'public' ? 'active' : ''} type="button" onClick={() => setListFilter('public')}>Groupes publics</button><button className={listFilter === 'private' ? 'active' : ''} type="button" onClick={() => setListFilter('private')}>Privées</button></div>
      {!reactionsLive && <p className="messages-note">Réactions masquées&nbsp;: la table <code>message_reactions</code> est absente de la base. Exécute <code>supabase/migrations/009_messages_live.sql</code> pour les activer.</p>}
      {(error || listError) && <div className="messages-alert" role="alert">
        <div><strong>La messagerie est incomplète.</strong><p>{error || listError}</p></div>
        <button type="button" onClick={() => { setError(''); setListError(''); setReloadToken(value => value + 1) }}>Réessayer</button>
      </div>}
      {publicGroups.length > 0 && <div className="public-group-section">
        <div className="public-group-heading"><div><span>GROUPES PUBLICS</span><small>Ouverts à tous les membres Avani Pro</small></div><b>{publicGroups.length} groupe{publicGroups.length > 1 ? 's' : ''}</b></div>
        {publicGroups.map(group => {
          const chat = group.conversation_id ? conversations.find(item => item.id === group.conversation_id) : undefined
          return <div className={`public-group-row ${chat ? 'joined' : ''}`} key={group.id}>
            <div className="avatar avatar-md avatar-soft">{group.name?.slice(0, 2).toUpperCase() || 'GR'}</div>
            <div className="public-group-info">
              <strong>{group.name}</strong>
              <small>{group.description || (chat ? 'Ta conversation de groupe est ouverte' : 'Groupe public Avani Pro')}</small>
              <small className="public-group-meta">{group.member_count === null ? 'Membres : comptage indisponible' : `${group.member_count} membre${group.member_count > 1 ? 's' : ''}`}</small>
            </div>
            {chat
              ? <button type="button" onClick={() => setSelected(chat)}>Ouvrir</button>
              : <button type="button" onClick={() => void joinGroup(group)} disabled={joiningPublicGroup === group.id}>{joiningPublicGroup === group.id ? '…' : 'Rejoindre'}</button>}
          </div>
        })}
      </div>}
      {conversations.length > 0 && visibleConversations.length === 0 && <p className="empty-copy">{listFilter === 'public' ? 'Aucune conversation de groupe public : rejoins un groupe ci-dessous ou attend une invitation.' : listFilter === 'private' ? 'Aucune discussion privée. ＋ Discussion pour en ouvrir une.' : 'Aucune conversation ne correspond à cette recherche.'}</p>}
      {conversations.length === 0 && publicGroups.length === 0 && <p className="empty-copy">{listError ? 'Aucune conversation chargée — vois la bannière ci-dessus.' : 'Aucune conversation pour le moment. Lance une discussion privée ou rejoins un groupe public.'}</p>}
      {visibleConversations.map(conversation => <button className={`conversation-row ${selected?.id === conversation.id ? 'selected' : ''}`} key={conversation.id} onClick={() => setSelected(conversation)}>
        <div className="avatar avatar-md avatar-soft">{conversation.title?.slice(0, 2).toUpperCase() || ''}</div>
        <div><strong>{conversation.title || ''}</strong><small>{connection === 'connected' ? 'Temps réel actif' : connection === 'reconnecting' ? 'Reconnexion…' : ''}</small></div>
      </button>)}
    </div>

    <div className="message-thread">
      {selected ? <>
        <div className="thread-head">
          <div className="thread-title"><div className="avatar avatar-md avatar-soft">{(selected.title || 'AV').slice(0, 2).toUpperCase()}</div><div><span className="eyebrow">{selected.is_group ? 'GROUPE' : 'CONVERSATION PRIVÉE'}</span><strong>{selected.title || ''}</strong><small><span className="pulse-dot" />{connection === 'connected' ? 'Connecté en temps réel' : connection === 'reconnecting' ? 'Reconnexion…' : connection === 'offline' ? 'Hors connexion' : 'Connexion…'}</small></div></div><div className="thread-head-actions"><button type="button" onClick={() => onAction(selected.is_group ? 'Les membres du groupe sont accessibles depuis cet espace.' : 'Cette conversation est privée entre ses membres.')}>ⓘ</button></div>
        </div>

        <div className="message-scroll" aria-live="polite">
          {hasOlder && <button type="button" className="message-button" onClick={() => void loadOlder()} disabled={loadingOlder}>{loadingOlder ? 'Chargement…' : 'Charger les anciens messages'}</button>}
          {messages.length === 0 && <p className="empty-copy">Commencez la conversation.</p>}
          {messages.map(message => <div className={`message-bubble ${message.sender_id === user.id ? 'mine' : ''}`} key={message.id}>
            {message.reply_to && <button type="button" className="message-reply-preview" onClick={() => document.getElementById(`message-${message.reply_to?.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>↳ {message.reply_to.body}</button>}
            {editingId === message.id ? <div><textarea value={editingBody} onChange={event => setEditingBody(event.target.value)} aria-label="Modifier le message" /><button type="button" onClick={() => void saveEdit()}>Enregistrer</button><button type="button" onClick={() => { setEditingId(null); setEditingBody('') }}>Annuler</button></div> : <>
              {message.attachment_path && !message.deleted_at && <MessageAttachment message={message} />}<span id={`message-${message.id}`}>{message.deleted_at ? 'Ce message a été supprimé.' : message.body}</span>
              <small>{new Date(message.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}{message.edited_at && !message.deleted_at ? ' · modifié' : ''}</small>
              {!message.deleted_at && <>
                <div className="message-reactions" aria-label="Réactions au message" hidden={!reactionsLive}>
                  {reactionOptions.map(([type, emoji]) => {
                    const count = messageReactions[message.id]?.[type] ?? 0
                    const selectedReaction = myReactions[message.id] === type
                    return <button key={type} type="button" className={`message-reaction ${selectedReaction ? 'selected' : ''}`} onClick={() => void reactToMessage(message.id, type)} aria-label={`Réagir ${type}${count ? `, ${count}` : ''}`} aria-pressed={selectedReaction}><span aria-hidden="true">{emoji}</span>{count > 0 && <small>{count}</small>}</button>
                  })}
                </div>
                <div className="message-meta-actions">
                  <button type="button" onClick={() => setReplyTo(message)}>Répondre</button>
                {message.sender_id === user.id && <><button type="button" onClick={() => { setEditingId(message.id); setEditingBody(message.body) }}>Modifier</button><button type="button" onClick={() => void removeMessage(message)}>Supprimer</button></>}
                </div>
              </>}
            </>}
          </div>)}
        </div>

        {Object.keys(typing).length > 0 && <div className="typing-indicator">{Object.values(typing).filter(Boolean).join(', ')} {Object.keys(typing).length > 1 ? 'écrivent…' : 'écrit…'}</div>}

        {replyTo && <div className="reply-composer"><span>Réponse à : {replyTo.body}</span><button type="button" onClick={() => setReplyTo(null)} aria-label="Annuler la réponse">×</button></div>}

        <form className="message-compose" onSubmit={submit}>
          <div className="message-input-wrap"><input value={draft} onChange={event => handleDraftChange(event.target.value)} placeholder={selected.is_group ? 'Écrire au groupe…' : 'Écrire un message…'} aria-label="Votre message" disabled={connection === 'offline'} />{attachment && <span className="attachment-chip">{attachment.name}<button type="button" onClick={() => setAttachment(null)} aria-label="Retirer la pièce jointe">×</button></span>}</div>
          <label className="attachment-button" title="Ajouter une pièce jointe">＋<input type="file" accept="image/*,video/*,application/pdf,text/plain" onChange={chooseAttachment} /></label><button className="primary-button" disabled={(!draft.trim() && !attachment) || connection === 'offline' || sending}>{sending ? 'Envoi…' : 'Envoyer ↗'}</button>
        </form>
      </> : <div className="empty-thread"><span>◌</span><p>Sélectionnez une conversation.</p></div>}
    </div>
    {newConversationOpen && <div className="message-dialog-backdrop" role="presentation"><div className="message-dialog" role="dialog" aria-modal="true" aria-label={groupMode ? 'Créer un groupe' : 'Nouvelle discussion'}>
      <div className="message-dialog-head"><div><span className="eyebrow">{groupMode ? 'NOUVEAU GROUPE' : 'NOUVELLE DISCUSSION'}</span><strong>{groupMode ? 'Créer un groupe' : 'Écrire à une personne'}</strong></div><button type="button" onClick={() => setNewConversationOpen(false)} aria-label="Fermer">×</button></div>
      {groupMode && <input className="message-dialog-input" value={groupTitle} onChange={event => setGroupTitle(event.target.value)} placeholder="Nom du groupe" aria-label="Nom du groupe" />}
      <input className="message-dialog-input" value={contactQuery} onChange={event => setContactQuery(event.target.value)} placeholder="Rechercher une personne" aria-label="Rechercher une personne" autoFocus />
      <div className="message-contact-list">{contacts.map(contact => { const selectedContact = selectedContacts.includes(contact.id); return <button type="button" key={contact.id} className={`message-contact-row ${selectedContact ? 'selected' : ''}`} onClick={() => setSelectedContacts(current => groupMode ? (selectedContact ? current.filter(id => id !== contact.id) : [...current, contact.id]) : [contact.id])}><div className="avatar avatar-sm avatar-soft">{contact.avatar_url ? <img src={contact.avatar_url} alt="" /> : (contact.full_name || '').split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase()}</div><div><strong>{contact.full_name || ''}</strong><small>@{contact.username || ''}</small></div><span>{selectedContact ? '✓' : '+'}</span></button> })}</div>
      <div className="message-dialog-footer"><span>{selectedContacts.length ? `${selectedContacts.length} sélectionné(s)` : ''}</span><button type="button" className="primary-button" disabled={!selectedContacts.length || creatingConversation || (groupMode && !groupTitle.trim())} onClick={() => void startConversation()}>{creatingConversation ? 'Création…' : groupMode ? 'Créer le groupe' : 'Commencer'}</button></div>
    </div></div>}
  </section>
}
