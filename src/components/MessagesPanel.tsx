import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createDirectConversation, createGroupConversation, listConversations, listMessages, listMessageReactions, markConversationRead, searchMessageContacts, sendMessage, setMessageReaction, type ConversationRecord, type MessageRecord, type ProfileRecord, type ReactionType } from '../lib/api'
import { supabase } from '../lib/supabase'

type TypingState = Record<string, string>

export function MessagesPanel({ user, onAction, initialConversationId }: { user: User | null; onAction: (message: string) => void; initialConversationId?: string }) {
  const [conversations, setConversations] = useState<ConversationRecord[]>([])
  const [selected, setSelected] = useState<ConversationRecord | null>(null)
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
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

  const visibleConversations = useMemo(
    () => conversations.filter(conversation => (conversation.title || '').toLowerCase().includes(search.toLowerCase())),
    [conversations, search],
  )

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    setError('')
    listConversations(user.id)
      .then(items => {
        if (cancelled) return
        setConversations(items.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)))
        setSelected(items.find(item => item.id === initialConversationId) ?? items[0] ?? null)
      })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Impossible de charger les conversations.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, initialConversationId])

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
          setMessages(items)
          setHasOlder(items.length >= 50)
          void refreshMessageReactions(items)
        }
      })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Impossible de charger les messages.') })
    void markConversationRead(selected.id, user.id).catch(() => undefined)

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
        setMessages(current => current.some(message => message.id === incoming.id) ? current : [...current, incoming])
        if (incoming.sender_id !== user.id) void markConversationRead(selected.id, user.id).catch(() => undefined)
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || !user || !draft.trim()) return
    const body = draft.trim()
    setDraft('')
    void broadcastTyping(false)
    try {
      const message = await sendMessage(selected.id, user.id, body, { replyToId: replyTo?.id ?? null })
      setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message])
      setReplyTo(null)
      setConversations(current => current.map(item => item.id === selected.id ? { ...item, updated_at: message.created_at, last_message_id: message.id } : item).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)))
    } catch (caught) {
      setDraft(body)
      onAction(caught instanceof Error ? caught.message : 'Message non envoyé.')
    }
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
      const { updateMessage } = await import('../lib/api')
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
      const { deleteMessage } = await import('../lib/api')
      const deleted = await deleteMessage(message.id, user.id)
      setMessages(current => current.map(item => item.id === message.id ? { ...item, ...deleted, body: '', deleted_at: deleted.deleted_at } : item))
    } catch (caught) {
      onAction(caught instanceof Error ? caught.message : 'Suppression impossible.')
    }
  }

  if (!user) return <section className="placeholder"><div className="placeholder-orb">◌</div><span className="eyebrow">MESSAGERIE</span><h2>Connectez-vous pour discuter.</h2><p>Vos conversations sont chargées depuis votre compte réel.</p></section>
  if (loading) return <section className="placeholder"><div className="placeholder-orb">◌</div><h2>Chargement de vos conversations…</h2></section>
  if (error) return <section className="placeholder"><div className="placeholder-orb">!</div><h2>Impossible de charger la messagerie.</h2><p>{error}</p></section>

  return <section className="messages-panel">
    <div className="conversation-list">
      <div className="messages-heading">
        <div><span className="eyebrow">MESSAGERIE</span><small>Conversations de votre compte</small></div><div className="message-new-actions"><button type="button" onClick={() => { setGroupMode(false); setNewConversationOpen(true) }}>＋ Discussion</button><button type="button" onClick={() => { setGroupMode(true); setNewConversationOpen(true) }}>＋ Groupe</button></div>
      </div>
      <label className="message-search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher une conversation" aria-label="Rechercher une conversation" /></label>
      {conversations.length === 0 && <p className="empty-copy">Aucune conversation pour le moment.</p>}
      {visibleConversations.map(conversation => <button className={`conversation-row ${selected?.id === conversation.id ? 'selected' : ''}`} key={conversation.id} onClick={() => setSelected(conversation)}>
        <div className="avatar avatar-md avatar-soft">{conversation.title?.slice(0, 2).toUpperCase() || ''}</div>
        <div><strong>{conversation.title || ''}</strong><small>{connection === 'connected' ? 'Temps réel actif' : connection === 'reconnecting' ? 'Reconnexion…' : ''}</small></div>
      </button>)}
    </div>

    <div className="message-thread">
      {selected ? <>
        <div className="thread-head">
          <div><span className="eyebrow">{selected.is_group ? 'GROUPE' : 'CONVERSATION'}</span><strong>{selected.title || ''}</strong><small>{connection === 'connected' ? 'Connecté' : connection === 'reconnecting' ? 'Reconnexion…' : connection === 'offline' ? 'Hors connexion' : 'Connexion…'}</small></div>
        </div>

        <div className="message-scroll" aria-live="polite">
          {hasOlder && <button type="button" className="message-button" onClick={() => void loadOlder()} disabled={loadingOlder}>{loadingOlder ? 'Chargement…' : 'Charger les anciens messages'}</button>}
          {messages.length === 0 && <p className="empty-copy">Commencez la conversation.</p>}
          {messages.map(message => <div className={`message-bubble ${message.sender_id === user.id ? 'mine' : ''}`} key={message.id}>
            {message.reply_to && <button type="button" className="message-reply-preview" onClick={() => document.getElementById(`message-${message.reply_to?.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>↳ {message.reply_to.body}</button>}
            {editingId === message.id ? <div><textarea value={editingBody} onChange={event => setEditingBody(event.target.value)} aria-label="Modifier le message" /><button type="button" onClick={() => void saveEdit()}>Enregistrer</button><button type="button" onClick={() => { setEditingId(null); setEditingBody('') }}>Annuler</button></div> : <>
              <span id={`message-${message.id}`}>{message.deleted_at ? 'Ce message a été supprimé.' : message.body}</span>
              <small>{new Date(message.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}{message.edited_at && !message.deleted_at ? ' · modifié' : ''}</small>
              {!message.deleted_at && <>
                <div className="message-reactions" aria-label="Réactions au message">
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
          <input value={draft} onChange={event => handleDraftChange(event.target.value)} placeholder={selected.is_group ? 'Écrire au groupe…' : 'Écrire un message…'} aria-label="Votre message" disabled={connection === 'offline'} />
          <button className="primary-button" disabled={!draft.trim() || connection === 'offline'}>Envoyer ↗</button>
        </form>
      </> : <div className="empty-thread"><span>◌</span><p>Sélectionnez une conversation.</p></div>}
    </div>
  </section>
    {newConversationOpen && <div className="message-dialog-backdrop" role="presentation"><div className="message-dialog" role="dialog" aria-modal="true" aria-label={groupMode ? 'Créer un groupe' : 'Nouvelle discussion'}>
      <div className="message-dialog-head"><div><span className="eyebrow">{groupMode ? 'NOUVEAU GROUPE' : 'NOUVELLE DISCUSSION'}</span><strong>{groupMode ? 'Créer un groupe' : 'Écrire à une personne'}</strong></div><button type="button" onClick={() => setNewConversationOpen(false)} aria-label="Fermer">×</button></div>
      {groupMode && <input className="message-dialog-input" value={groupTitle} onChange={event => setGroupTitle(event.target.value)} placeholder="Nom du groupe" aria-label="Nom du groupe" />}
      <input className="message-dialog-input" value={contactQuery} onChange={event => setContactQuery(event.target.value)} placeholder="Rechercher une personne" aria-label="Rechercher une personne" autoFocus />
      <div className="message-contact-list">{contacts.map(contact => { const selectedContact = selectedContacts.includes(contact.id); return <button type="button" key={contact.id} className={`message-contact-row ${selectedContact ? 'selected' : ''}`} onClick={() => setSelectedContacts(current => groupMode ? (selectedContact ? current.filter(id => id !== contact.id) : [...current, contact.id]) : [contact.id])}><div className="avatar avatar-sm avatar-soft">{contact.avatar_url ? <img src={contact.avatar_url} alt="" /> : (contact.full_name || '').split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase()}</div><div><strong>{contact.full_name || ''}</strong><small>@{contact.username || ''}</small></div><span>{selectedContact ? '✓' : '+'}</span></button> })}</div>
      <div className="message-dialog-footer"><span>{selectedContacts.length ? `${selectedContacts.length} sélectionné(s)` : ''}</span><button type="button" className="primary-button" disabled={!selectedContacts.length || creatingConversation || (groupMode && !groupTitle.trim())} onClick={() => void startConversation()}>{creatingConversation ? 'Création…' : groupMode ? 'Créer le groupe' : 'Commencer'}</button></div>
    </div></div>}
  </section>
}
