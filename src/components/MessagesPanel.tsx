import { mentionAtCursor, insertMention } from '../lib/mentions'
import { useOnlineMembers } from '../lib/onlinePresence'
import '../messaging.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { formatRowTime, reactionTotal, unreadBadge, type ConversationPreview } from '../lib/messagesModel'
import { updateChatAvatar, manageChat, listConversationMembers, createDirectConversation, createGroupConversation, deleteMessage, getMyProfile, getMessageAttachmentUrl, joinPublicGroup, listConversations, listMessages, listConversationPreviews, listProfilesByIds, listPublicGroups, listMessageReactions, markConversationRead, messageReactionsSupported, MAX_MESSAGE_ATTACHMENT_BYTES, searchMessageContacts, sendMessage, setMessageReaction, type ConversationRecord, type MessageRecord, type ProfileRecord, type PublicGroupRecord, type ReactionType, updateMessage, uploadMessageAttachment } from '../lib/api'
import { supabase } from '../lib/supabase'

type TypingState = Record<string, string>

function MessageAttachment({ message }: { message: MessageRecord }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  useEffect(() => { let active = true; if (!message.attachment_path) return () => { active = false }; getMessageAttachmentUrl(message.attachment_path).then(value => { if (active) setUrl(value) }).catch(() => { if (active) setError(true) }); return () => { active = false } }, [message.attachment_path])
  if (error) return <span className="attachment-error">Pièce jointe indisponible</span>
  if (!url) return <span className="attachment-loading">Chargement de la pièce jointe…</span>
  if (message.attachment_mime_type?.startsWith('video/')) return <video className="message-attachment-video" controls preload="metadata" src={url} aria-label={message.attachment_name || 'Vidéo jointe'} />
  if (message.attachment_mime_type?.startsWith('audio/')) return <audio controls preload="metadata" src={url} aria-label={message.attachment_name || 'Audio joint'} />
  if (message.attachment_mime_type?.startsWith('image/')) return <a href={url} target="_blank" rel="noreferrer"><img className="message-attachment-image" src={url} alt={message.attachment_name || 'Pièce jointe'} /></a>
  return <a className="message-attachment-link" href={url} target="_blank" rel="noreferrer">↗ {message.attachment_name || 'Ouvrir la pièce jointe'}</a>
}

function ChatAvatar({ chat }: { chat: ConversationRecord }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let active = true
    setUrl('')
    if (chat.avatar_path) void getMessageAttachmentUrl(chat.avatar_path).then(value => { if (active) setUrl(value) }).catch(() => undefined)
    return () => { active = false }
  }, [chat.avatar_path])
  return <div className="avatar avatar-md avatar-soft">{url ? <img src={url} alt="Photo du groupe" /> : (chat.title || 'AV').slice(0, 2).toUpperCase()}</div>
}

function MentionText({ text, members, me }: { text: string; members: ProfileRecord[]; me: string }) {
  const usernames = new Map(members.map(member => [member.username.toLowerCase(), member]))
  const segments = text.split(/(@[a-zA-Z0-9_]+)/g)
  return <>{segments.map((part, index) => {
    const member = part.startsWith('@') && (!segments[index - 1] || /\s$/.test(segments[index - 1])) ? usernames.get(part.slice(1).toLowerCase()) : undefined
    return member ? <a className={`message-mention ${member.id === me ? 'mentions-me' : ''}`} href={`/u/${encodeURIComponent(member.username)}`} key={index}>{part}</a> : part
  })}</>
}

export function MessagesPanel({ user, onAction, initialConversationId }: { user: User | null; onAction: (message: string) => void; initialConversationId?: string }) {
  const [conversations, setConversations] = useState<ConversationRecord[]>([])
  const [publicGroups, setPublicGroups] = useState<PublicGroupRecord[]>([])
  const [listError, setListError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [reactionsLive, setReactionsLive] = useState(true)
  const senderCache = useRef(new Map<string, ProfileRecord>())
  const [previews, setPreviews] = useState<Record<string, ConversationPreview>>({})
  const [previewError, setPreviewError] = useState('')
  const [joiningPublicGroup, setJoiningPublicGroup] = useState<string | null>(null)
  const [selected, setSelected] = useState<ConversationRecord | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  useEffect(() => { selectedIdRef.current = selected?.id ?? null }, [selected?.id])
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const inboxLoaded = useRef(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState<'all' | 'unread' | 'public' | 'private'>('all')
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null)
  const reactionHoldTimer = useRef<number | null>(null)
  const [typing, setTyping] = useState<TypingState>({})
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting')
  const [hasOlder, setHasOlder] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [replyTo, setReplyTo] = useState<MessageRecord | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)
  const [members, setMembers] = useState<ProfileRecord[]>([])
  const presentMembers = useOnlineMembers(members.map(member => member.id))
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState('')
  const [groupBusy, setGroupBusy] = useState(false)
  const [groupError, setGroupError] = useState('')
  const [groupNewName, setGroupNewName] = useState('')
  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteResults, setInviteResults] = useState<ProfileRecord[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [memberReload, setMemberReload] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [messageQuery, setMessageQuery] = useState('')
  const [mentionCursor, setMentionCursor] = useState(0)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionsHidden, setMentionsHidden] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const [newConversationOpen, setNewConversationOpen] = useState(false)
  const [groupMode, setGroupMode] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const [contacts, setContacts] = useState<ProfileRecord[]>([])
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [groupTitle, setGroupTitle] = useState('')
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError, setContactsError] = useState('')
  const [creationError, setCreationError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const selectedContactProfiles = useRef(new Map<string, ProfileRecord>())
  const [creatingConversation, setCreatingConversation] = useState(false)
  const [messageReactions, setMessageReactions] = useState<Record<string, Record<ReactionType, number>>>({})
  const [myReactions, setMyReactions] = useState<Record<string, ReactionType | null>>({})
  const typingTimeout = useRef<number | null>(null)

  useEffect(() => {
    if (!newConversationOpen || !user) return
    let active = true
    setContactsLoading(true)
    setContactsError('')
    const timer = window.setTimeout(() => {
      void searchMessageContacts(user.id, contactQuery).then(rows => {
        if (active) {
          setContacts(rows)
          for (const row of rows) selectedContactProfiles.current.set(row.id, row)
        }
      }).catch(() => {
        if (active) { setContacts([]); setContactsError('Impossible de charger les personnes. Vérifiez votre connexion et réessayez.') }
      }).finally(() => { if (active) setContactsLoading(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [newConversationOpen, contactQuery, user])

  const openNewConversation = (group: boolean) => {
    setGroupMode(group)
    setSelectedContacts([])
    setContactQuery('')
    setGroupTitle('')
    setCreationError('')
    setContacts([])
    setNewConversationOpen(true)
  }

  useEffect(() => {
    if (!newConversationOpen) return
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    dialog?.querySelector<HTMLInputElement>('input')?.focus()
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creatingConversation) setNewConversationOpen(false)
      if (event.key !== 'Tab' || !dialog) return
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]'))
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handleKeys)
    return () => { document.removeEventListener('keydown', handleKeys); previousFocus?.focus() }
  }, [newConversationOpen, creatingConversation])

  useEffect(() => {
    if (!selected) return
    let active = true
    setMembersLoading(true)
    setMembersError('')
    setMembers([])
    void listConversationMembers(selected.id).then(rows => { if (active) setMembers(rows) })
      .catch(() => { if (active) setMembersError('Impossible de charger les membres de cette conversation.') })
      .finally(() => { if (active) setMembersLoading(false) })
    return () => { active = false }
  }, [selected?.id, memberReload])

  useEffect(() => {
    if (!user || !infoOpen || !selected || selected.created_by !== user.id || !inviteQuery.trim()) { setInviteResults([]); return }
    let active = true
    setInviteLoading(true)
    const timer = window.setTimeout(() => {
      void searchMessageContacts(user.id, inviteQuery).then(rows => { if (active) setInviteResults(rows.filter(row => !members.some(member => member.id === row.id))) })
        .catch(() => { if (active) setGroupError('Recherche de membres indisponible.') })
        .finally(() => { if (active) setInviteLoading(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [inviteQuery, infoOpen, selected?.id, selected?.created_by, members, user?.id])

  const groupAction = async (action: 'rename' | 'add' | 'remove' | 'transfer' | 'leave', target?: string) => {
    if (!selected || groupBusy) return
    if (['remove', 'transfer', 'leave'].includes(action) && !window.confirm(action === 'leave' ? 'Quitter ce groupe ? Vous perdrez l’accès à ses messages.' : action === 'transfer' ? 'Transférer la gestion du groupe à ce membre ? Vous ne pourrez plus administrer le groupe.' : 'Retirer cette personne du groupe ?')) return
    const chat = selected
    setGroupBusy(true)
    setGroupError('')
    try {
      await manageChat(chat.id, action, target, action === 'rename' ? groupNewName : undefined)
      if (action === 'leave') {
        setSelected(null)
        setConversations(current => current.filter(item => item.id !== chat.id))
      } else {
        setMemberReload(value => value + 1)
        setInviteQuery('')
        if (action === 'rename' || action === 'transfer') {
          const updated = { ...chat, ...(action === 'rename' ? { title: groupNewName.trim() } : { created_by: target }) }
          setSelected(current => current?.id === chat.id ? updated : current)
          setConversations(current => current.map(item => item.id === chat.id ? updated : item))
        }
      }
      onAction('Groupe mis à jour.')
    } catch (caught) { setGroupError(caught instanceof Error ? caught.message : 'Modification du groupe impossible.') }
    finally { setGroupBusy(false) }
  }

  const mention = selected?.is_group && !mentionsHidden ? mentionAtCursor(draft, mentionCursor) : null
  const mentionCandidates = mention ? members.filter(member => member.id !== user?.id && member.username && (member.username.toLowerCase().startsWith(mention.query.toLowerCase()) || member.full_name.toLowerCase().includes(mention.query.toLowerCase()))).slice(0, 6) : []
  const chooseMention = (member: ProfileRecord) => {
    if (!mention) return
    const next = insertMention(draft, mention.start, mention.end, member.username)
    handleDraftChange(next.text)
    setMentionCursor(next.cursor)
    setMentionsHidden(true)
    window.requestAnimationFrame(() => { composerRef.current?.focus(); composerRef.current?.setSelectionRange(next.cursor, next.cursor) })
  }
  const changeGroupPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!selected || !user || !file || groupBusy) return
    const chat = selected
    setGroupBusy(true)
    setGroupError('')
    try {
      const path = await updateChatAvatar(chat.id, user.id, file)
      setSelected(current => current?.id === chat.id ? { ...current, avatar_path: path } : current)
      setConversations(current => current.map(item => item.id === chat.id ? { ...item, avatar_path: path } : item))
      onAction('Photo du groupe mise à jour.')
    } catch (caught) { setGroupError(caught instanceof Error ? caught.message : 'Impossible de modifier la photo.') }
    finally { setGroupBusy(false) }
  }

  const insertEmoji = (emoji: string) => {
    const input = composerRef.current
    const start = input?.selectionStart ?? draft.length
    const end = input?.selectionEnd ?? start
    handleDraftChange(draft.slice(0, start) + emoji + draft.slice(end))
    setEmojiOpen(false)
    window.requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + emoji.length, start + emoji.length) })
  }

  const startConversation = async () => {
    if (!user || !selectedContacts.length || creatingConversation) return
    setCreatingConversation(true)
    setCreationError('')
    try {
      const created = groupMode
        ? await createGroupConversation(user.id, groupTitle, selectedContacts)
        : await createDirectConversation(user.id, selectedContacts[0], selectedContactProfiles.current.get(selectedContacts[0])?.full_name || '')
      setConversations(current => [created, ...current.filter(item => item.id !== created.id)])
      setSelected(created)
      setNewConversationOpen(false)
      setSelectedContacts([]); setContactQuery(''); setGroupTitle('')
    } catch (caught) {
      setCreationError(caught instanceof Error ? caught.message : 'Impossible de créer la conversation.')
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
      if (listFilter === 'unread' && !(previews[conversation.id]?.unread > 0)) return false
      if (listFilter === 'public' && !inPublicGroup) return false
      if (listFilter === 'private' && inPublicGroup) return false
      return (conversation.title || '').toLowerCase().includes(search.toLowerCase())
    }),
    [conversations, search, listFilter, publicChatIds, previews],
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
    if (!inboxLoaded.current) setLoading(true)
    setError('')
    setListError('')
    listConversations(user.id)
      .then(items => {
        if (cancelled) return undefined
        const sortedItems = items.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        setConversations(sortedItems)
        setSelected(current => current && sortedItems.some(item => item.id === current.id) ? (sortedItems.find(item => item.id === current.id) ?? current) : (sortedItems.find(item => item.id === initialConversationId) ?? (window.matchMedia('(max-width: 680px)').matches ? null : sortedItems[0]) ?? null))
        // Les aperçus (dernier message, heure, non-lus) partent de la même liste :
        // une seule requête `messages` borde toute la colonne de gauche.
        return listConversationPreviews(user.id, sortedItems)
          .then(rows => { if (!cancelled) { setPreviews(rows); setPreviewError('') } })
          .catch(caught => { if (!cancelled) setPreviewError(caught instanceof Error ? caught.message : 'Aperçus de conversations indisponibles.') })
      })
      .catch(caught => { if (!cancelled) setListError(caught instanceof Error ? caught.message : 'Impossible de charger tes conversations.') })
      .finally(() => { if (!cancelled) { inboxLoaded.current = true; setLoading(false) } })
    listPublicGroups()
      .then(items => { if (!cancelled) setPublicGroups(items) })
      .catch(() => { if (!cancelled) setPublicGroups([]) })
    void messageReactionsSupported().then(live => { if (!cancelled) setReactionsLive(live) }).catch(() => undefined)
    void getMyProfile(user)
      .then(profile => { if (profile) senderCache.current.set(profile.id, profile) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [user, initialConversationId, reloadToken])

  // Never carry a draft, reply or edit into a different conversation.
  useEffect(() => {
    setDraft('')
    setAttachment(null)
    setReplyTo(null)
    setEditingId(null)
    setEditingBody('')
    setInfoOpen(false)
    setGroupError('')
    setGroupNewName('')
    setInviteQuery('')
    setSearchOpen(false)
    setMessageQuery('')
    setEmojiOpen(false)
  }, [selected?.id])

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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => bump())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'conversation_members' }, () => bump())
      .subscribe()
    return () => {
      if (timer) window.clearTimeout(timer)
      void supabase?.removeChannel(channel)
    }
  }, [user])

  const refreshMessageReactions = useCallback(async (items: MessageRecord[]) => {
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
    } catch { /* la lecture des reactions ne doit jamais vider le fil */ }
  }, [user])

  useEffect(() => {
    if (!selected || !user || !supabase) return
    let cancelled = false
    setMessages([])
    setReactionPickerId(null)
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
    void markConversationRead(selected.id, user.id).then(read => {
      // `markConversationRead` renvoie false quand la policy ou la colonne manque :
      // dans ce cas on ne fait pas semblant d'avoir tout lu, le badge reste.
      if (read && !cancelled) setPreviews(current => ({ ...current, [selected.id]: { preview: current[selected.id]?.preview ?? '', at: current[selected.id]?.at ?? null, unread: 0, truncated: false } }))
    })

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

    const onOnline = () => { setConnection('reconnecting') }
    const onOffline = () => { setConnection('offline') }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
      void client.removeChannel(channel)
    }
  // `refreshMessageReactions` est memoise sur [user] : le citer ne provoque pas de
  // reabonnement, et garantit que l'effet voit la version courante en cas de changement.
  }, [selected, user, refreshMessageReactions])

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
    if (!selected || !user || (!draft.trim() && !attachment) || sending || connection === 'offline') return
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
      if (selectedIdRef.current === selected.id) {
        setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message])
        setReplyTo(null)
        setAttachment(null)
      }
      // L'ordre de la liste est tenu par `conversations.updated_at`, que le trigger
      // `touch_conversation_on_message` (migration 009) fait avancer à chaque message.
      setConversations(current => [{ ...selected, updated_at: message.created_at }, ...current.filter(item => item.id !== selected.id).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))])
      setPreviews(current => ({ ...current, [selected.id]: { preview: message.body.replace(/\s+/g, ' ').trim() || 'Pièce jointe', at: message.created_at, unread: current[selected.id]?.unread ?? 0, truncated: false } }))
    } catch (caught) {
      if (selectedIdRef.current === selected.id) setDraft(body)
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

  useEffect(() => {
    if (!reactionPickerId) return
    const closeOnOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-reaction-control]')) setReactionPickerId(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setReactionPickerId(null) }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [reactionPickerId])

  const cancelReactionHold = () => {
    if (reactionHoldTimer.current !== null) window.clearTimeout(reactionHoldTimer.current)
    reactionHoldTimer.current = null
  }
  useEffect(() => () => { if (reactionHoldTimer.current !== null) window.clearTimeout(reactionHoldTimer.current) }, [])

  const reactionOptions: Array<[ReactionType, string]> = [['like', '👍'], ['love', '❤️'], ['haha', '😂'], ['wow', '😮'], ['sad', '😢'], ['angry', '😡']]
  const reactionEmoji = Object.fromEntries(reactionOptions) as Record<ReactionType, string>

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

  if (!user) return <section className="placeholder"><div className="placeholder-orb">◌</div><span className="eyebrow">Discussions</span><h2>Connectez-vous pour discuter.</h2><p>Vos conversations sont chargées depuis votre compte réel.</p></section>
  if (loading) return <section className="placeholder"><div className="placeholder-orb">◌</div><h2>Chargement de vos conversations…</h2></section>

  return <section className={`messages-panel avani-messenger ${selected ? 'has-conversation' : ''}`} aria-label="Messagerie Avani Pro">
    <div className="conversation-list">
      <div className="messages-heading">
        <div><span className="eyebrow">Discussions</span><small>Conversations de votre compte</small></div><div className="message-new-actions"><button type="button" onClick={() => openNewConversation(false)}>＋ Discussion</button><button type="button" onClick={() => openNewConversation(true)}>＋ Groupe</button></div>
      </div>
      <label className="message-search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher une conversation" aria-label="Rechercher une conversation" /></label><div className="message-filters"><button className={listFilter === 'all' ? 'active' : ''} type="button" onClick={() => setListFilter('all')}>Toutes</button><button className={listFilter === 'unread' ? 'active' : ''} type="button" onClick={() => setListFilter('unread')}>Non lues</button><button className={listFilter === 'public' ? 'active' : ''} type="button" onClick={() => setListFilter('public')}>Groupes publics</button><button className={listFilter === 'private' ? 'active' : ''} type="button" onClick={() => setListFilter('private')}>Privées</button></div>
      {previewError && <p className="messages-note">{previewError} <button type="button" onClick={() => setReloadToken(value => value + 1)}>Réessayer</button></p>}
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
      {conversations.length > 0 && visibleConversations.length === 0 && <p className="empty-copy">{listFilter === 'unread' ? 'Aucune conversation non lue.' : listFilter === 'public' ? 'Aucune conversation de groupe public : rejoins un groupe ci-dessous ou attend une invitation.' : listFilter === 'private' ? 'Aucune discussion privée. ＋ Discussion pour en ouvrir une.' : 'Aucune conversation ne correspond à cette recherche.'}</p>}
      {conversations.length === 0 && publicGroups.length === 0 && <p className="empty-copy">{listError ? 'Aucune conversation chargée — vois la bannière ci-dessus.' : 'Aucune conversation pour le moment. Lance une discussion privée ou rejoins un groupe public.'}</p>}
      {visibleConversations.map(conversation => {
        const preview = previews[conversation.id]
        const badge = unreadBadge(preview?.unread ?? 0, preview?.truncated ?? false)
        return <button className={`conversation-row ${selected?.id === conversation.id ? 'selected' : ''} ${badge ? 'unread' : ''}`} key={conversation.id} onClick={() => setSelected(conversation)}>
          <ChatAvatar chat={conversation} />
          <div className="conversation-row-main">
            <strong>{conversation.title || 'Conversation sans titre'}</strong>
            <small className="conversation-preview">{preview?.preview || (connection === 'connected' ? 'Temps réel actif' : connection === 'reconnecting' ? 'Reconnexion…' : '')}</small>
          </div>
          <div className="conversation-row-side">
            {preview?.at && <span className="conversation-row-time">{formatRowTime(preview.at)}</span>}
            {badge ? <span className="unread-pill" aria-label={`${preview?.unread ?? 0} messages non lus`}>{badge}</span> : null}
          </div>
        </button>
      })}
    </div>

    <div className="message-thread">
      {selected ? <>
        <div className="thread-head"><button type="button" className="thread-back" onClick={() => setSelected(null)} aria-label="Retour aux discussions">←</button>
          <div className="thread-title"><ChatAvatar chat={selected} /><div><span className="eyebrow">{selected.is_group ? 'GROUPE' : 'CONVERSATION PRIVÉE'}</span><strong>{selected.title || ''}</strong><small><span className="pulse-dot" />{connection === 'connected' ? presentMembers === null || membersLoading || membersError ? 'Présence indisponible ou en synchronisation…' : `${presentMembers} personne${presentMembers > 1 ? 's' : ''} en ligne` : connection === 'reconnecting' ? 'Reconnexion…' : connection === 'offline' ? 'Hors connexion' : 'Connexion…'}</small></div></div><div className="thread-head-actions"><button type="button" aria-label="Rechercher dans les messages chargés" aria-expanded={searchOpen} onClick={() => { setSearchOpen(value => !value); setInfoOpen(false) }}>⌕</button><button type="button" aria-label="Informations et membres" aria-expanded={infoOpen} onClick={() => { setInfoOpen(value => !value); setSearchOpen(false) }}>ⓘ</button></div>
        </div>

        {searchOpen && <section className="thread-utility" aria-label="Recherche de messages">
          <label>Rechercher dans les messages chargés<input autoFocus type="search" value={messageQuery} onChange={event => setMessageQuery(event.target.value)} placeholder="Mot ou phrase…" /></label>
          <p>La recherche porte sur les messages déjà chargés. Chargez les anciens messages pour étendre les résultats.</p>
          {messageQuery.trim() && <div className="thread-search-results">{messages.filter(message => !message.deleted_at && message.body.toLocaleLowerCase('fr').includes(messageQuery.trim().toLocaleLowerCase('fr'))).map(message => <button type="button" key={message.id} onClick={() => { const node = document.getElementById(`message-${message.id}`); node?.scrollIntoView({ behavior: 'smooth', block: 'center' }); node?.focus({ preventScroll: true }) }}>{message.body}<small>{new Date(message.created_at).toLocaleString('fr-FR')}</small></button>)}{!messages.some(message => !message.deleted_at && message.body.toLocaleLowerCase('fr').includes(messageQuery.trim().toLocaleLowerCase('fr'))) && <p role="status">Aucun message correspondant parmi les messages chargés.</p>}</div>}
        </section>}
        {infoOpen && <section className="thread-utility" aria-label="Informations sur la conversation">
          <strong>{selected.title || 'Conversation'} · {selected.is_group ? 'Groupe' : 'Discussion privée'}</strong>
          {selected.is_group && selected.created_by === user.id && <label className="group-photo-upload">Photo du groupe (JPEG, PNG, WebP · 5 Mo maximum)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={groupBusy} onChange={event => void changeGroupPhoto(event)} /></label>}
          {groupError && <p role="alert">{groupError}</p>}
          {membersLoading && <p role="status">Chargement des membres…</p>}
          {membersError && <p role="alert">{membersError} <button type="button" onClick={() => setMemberReload(value => value + 1)}>Réessayer</button></p>}
          {!membersLoading && !membersError && <><p>{members.length} membre{members.length > 1 ? 's' : ''} visible{members.length > 1 ? 's' : ''}</p><ul className="thread-members">{members.map(member => <li key={member.id}><span className="avatar avatar-sm avatar-soft">{member.avatar_url ? <img src={member.avatar_url} alt="" /> : member.full_name.slice(0, 2).toUpperCase()}</span><span>{member.full_name}{member.id === user.id ? ' (vous)' : ''}<small>@{member.username}</small></span></li>)}</ul></>}
          {selected.is_group && !publicChatIds.has(selected.id) && <div className="group-management">
            {groupError && <p role="alert">{groupError}</p>}
            {selected.created_by === user.id ? <>
              <p>Vous êtes responsable de ce groupe. Transférez la gestion à un autre membre avant de le quitter.</p>
              <form onSubmit={event => { event.preventDefault(); void groupAction('rename') }}><label>Nouveau nom<input maxLength={100} value={groupNewName} onChange={event => setGroupNewName(event.target.value)} placeholder={selected.title || 'Nom du groupe'} disabled={groupBusy} /></label><button type="submit" disabled={groupBusy || !groupNewName.trim()}>Renommer</button></form>
              <label>Ajouter une personne<input value={inviteQuery} onChange={event => setInviteQuery(event.target.value)} placeholder="Nom ou identifiant" disabled={groupBusy} /></label>
              {inviteLoading && inviteQuery.trim() && <p role="status">Recherche…</p>}
              {!inviteLoading && inviteQuery.trim() && inviteResults.length === 0 && <p>Aucune nouvelle personne trouvée.</p>}
              {inviteResults.map(person => <button key={person.id} type="button" disabled={groupBusy || inviteLoading} onClick={() => void groupAction('add', person.id)}>Ajouter {person.full_name}</button>)}
              <ul>{members.filter(member => member.id !== user.id).map(member => <li key={member.id}><span>{member.full_name}</span><button type="button" disabled={groupBusy} onClick={() => void groupAction('remove', member.id)}>Retirer</button><button type="button" disabled={groupBusy} onClick={() => void groupAction('transfer', member.id)}>Transférer la gestion</button></li>)}</ul>
            </> : <button type="button" disabled={groupBusy} onClick={() => void groupAction('leave')}>Quitter le groupe</button>}
            {groupBusy && <p role="status">Mise à jour du groupe…</p>}
          </div>}
        </section>}
        <div className="message-scroll" aria-live="polite">
          {hasOlder && <button type="button" className="message-button" onClick={() => void loadOlder()} disabled={loadingOlder}>{loadingOlder ? 'Chargement…' : 'Charger les anciens messages'}</button>}
          {messages.length === 0 && <p className="empty-copy">Commencez la conversation.</p>}
          {messages.map(message => {
            const mine = message.sender_id === user.id
            const counts = messageReactions[message.id]
            const total = reactionTotal(counts)
            const pills = reactionOptions.map(([type]) => [type, counts?.[type] ?? 0] as const).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1])
            // Only actual reactions are shown below a message; choices open on demand.
            return <div className={`message-line ${mine ? 'mine' : ''}`} key={message.id} tabIndex={-1} id={`message-${message.id}`}>
              <div className={`message-bubble ${mine ? 'mine' : ''}`}
                onContextMenu={event => { if (reactionsLive && !message.deleted_at) { event.preventDefault(); setReactionPickerId(message.id) } }}
                onPointerDown={event => { if (event.pointerType === 'touch' && reactionsLive && !message.deleted_at) { cancelReactionHold(); reactionHoldTimer.current = window.setTimeout(() => setReactionPickerId(message.id), 500) } }}
                onPointerUp={cancelReactionHold} onPointerCancel={cancelReactionHold} onPointerMove={cancelReactionHold}>
                {!mine && selected.is_group && message.sender?.full_name && <strong className="message-sender-name">{message.sender.full_name}</strong>}
                {message.reply_to && <button type="button" className="message-reply-preview" onClick={() => document.getElementById(`message-${message.reply_to?.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>↳ {message.reply_to.body}</button>}
                {editingId === message.id ? <div className="message-edit"><textarea value={editingBody} onChange={event => setEditingBody(event.target.value)} aria-label="Modifier le message" /><button type="button" onClick={() => void saveEdit()}>Enregistrer</button><button type="button" onClick={() => { setEditingId(null); setEditingBody('') }}>Annuler</button></div> : <>
                  {message.attachment_path && !message.deleted_at && <MessageAttachment message={message} />}<span>{message.deleted_at ? 'Ce message a été supprimé.' : <MentionText text={message.body} members={members} me={user.id} />}</span>
                </>}
              </div>
              {reactionsLive && !message.deleted_at && total > 0 && <div className="message-reaction-pills" aria-label={`${total} réaction${total > 1 ? 's' : ''}`}>
                {pills.map(([type, count]) => <button type="button" data-reaction-control key={type} className={myReactions[message.id] === type ? 'is-mine' : ''} aria-label={`${type} : ${count} réaction${count > 1 ? 's' : ''}. Choisir ou retirer votre réaction`} onClick={() => setReactionPickerId(current => current === message.id ? null : message.id)}><span aria-hidden="true">{reactionEmoji[type]}</span><small>{count}</small></button>)}
              </div>}
              <div className="message-foot">
                <span className="message-time">{new Date(message.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}{message.edited_at && !message.deleted_at ? ' · modifié' : ''}</span>
                {!message.deleted_at && <div className="message-tools">
                  {reactionsLive && <div className="reaction-control" data-reaction-control>
                    <button type="button" className="reaction-trigger" aria-label="Réagir au message" aria-expanded={reactionPickerId === message.id} onClick={() => setReactionPickerId(current => current === message.id ? null : message.id)}>☺</button>
                    {reactionPickerId === message.id && <div className="message-reactions" role="group" aria-label="Choisir une réaction">
                      {reactionOptions.map(([type, emoji]) => <button key={type} type="button" className={`message-reaction ${myReactions[message.id] === type ? 'selected' : ''}`} onClick={() => { void reactToMessage(message.id, type); setReactionPickerId(null) }} aria-label={myReactions[message.id] === type ? `Retirer votre réaction ${emoji}` : `Réagir ${emoji}`} aria-pressed={myReactions[message.id] === type}><span aria-hidden="true">{emoji}</span></button>)}
                      <button type="button" className="reaction-close" aria-label="Fermer les réactions" onClick={() => setReactionPickerId(null)}>×</button>
                    </div>}
                  </div>}
                  <details name="message-actions" className="message-action-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }} onKeyDown={event => { if (event.key === 'Escape') event.currentTarget.open = false }}><summary aria-label="Actions du message">⌄</summary><div className="message-meta-actions">
                    <button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setReplyTo(message) }}>Répondre</button>
                    {mine && <><button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setEditingId(message.id); setEditingBody(message.body) }}>Modifier</button><button type="button" onClick={() => { if (window.confirm('Supprimer ce message pour tous les membres de cette discussion ?')) void removeMessage(message) }}>Supprimer</button></>}
                  </div></details>
                </div>}
              </div>
            </div>
          })}
        </div>

        {Object.keys(typing).length > 0 && <div className="typing-indicator">{Object.values(typing).filter(Boolean).join(', ')} {Object.keys(typing).length > 1 ? 'écrivent…' : 'écrit…'}</div>}

        {replyTo && <div className="reply-composer"><span>Réponse à : {replyTo.body}</span><button type="button" onClick={() => setReplyTo(null)} aria-label="Annuler la réponse">×</button></div>}

        {mention && mentionCandidates.length > 0 && <div className="mention-suggestions" role="listbox" aria-label="Mentionner un membre" id="mention-list">{mentionCandidates.map((member, index) => <button type="button" role="option" aria-selected={index === mentionIndex % mentionCandidates.length} id={`mention-option-${index}`} key={member.id} onMouseDown={event => event.preventDefault()} onClick={() => chooseMention(member)}><strong>{member.full_name}</strong><small>@{member.username}</small></button>)}</div>}
        {emojiOpen && <div className="composer-emojis" role="group" aria-label="Choisir un émoji">{['😀','😊','😂','❤️','👍','🙏','🎉','🔥','💜','👋','✅','💡','🤝','🚀','👏','💬'].map(emoji => <button type="button" key={emoji} aria-label={`Insérer ${emoji}`} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}<button type="button" onClick={() => setEmojiOpen(false)} aria-label="Fermer les émojis">×</button></div>}
        <form className="message-compose" onSubmit={submit}>
          <div className="message-input-wrap"><textarea ref={composerRef} rows={1} aria-controls={mentionCandidates.length ? 'mention-list' : undefined} aria-activedescendant={mentionCandidates.length ? `mention-option-${mentionIndex % mentionCandidates.length}` : undefined}
            onSelect={event => setMentionCursor(event.currentTarget.selectionStart)}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing) return
              if (mentionCandidates.length && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
                event.preventDefault()
                if (event.key === 'Escape') setMentionsHidden(true)
                else if (event.key === 'ArrowDown') setMentionIndex(index => (index + 1) % mentionCandidates.length)
                else if (event.key === 'ArrowUp') setMentionIndex(index => (index + mentionCandidates.length - 1) % mentionCandidates.length)
                else chooseMention(mentionCandidates[mentionIndex % mentionCandidates.length])
                return
              }
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() }
            }} value={draft} onChange={event => { handleDraftChange(event.target.value); setMentionCursor(event.target.selectionStart); setMentionIndex(0); setMentionsHidden(false) }} placeholder={selected.is_group ? 'Message au groupe · @ pour mentionner…' : 'Écrire un message…'} aria-label="Votre message" disabled={connection === 'offline' || sending} />{attachment && <span className="attachment-chip">{attachment.name}<button type="button" onClick={() => setAttachment(null)} aria-label="Retirer la pièce jointe">×</button></span>}</div>
          <button type="button" className="emoji-toggle" aria-label="Insérer un émoji" aria-expanded={emojiOpen} disabled={connection === 'offline' || sending} onClick={() => setEmojiOpen(value => !value)}>☺</button>
          <label className="attachment-button" title="Ajouter une pièce jointe">＋<input aria-label="Ajouter une pièce jointe" type="file" disabled={sending || connection === 'offline'} accept="image/*,video/*,audio/*,application/pdf,text/plain" onChange={chooseAttachment} /></label><button className="primary-button" aria-label="Envoyer le message" disabled={(!draft.trim() && !attachment) || connection === 'offline' || sending}>{sending ? '…' : '➤'}</button>
        </form>
      </> : <div className="empty-thread"><span>◌</span><h2>Vos échanges, votre réseau.</h2><p>Choisissez une discussion ou commencez un nouvel échange.</p><button type="button" className="primary-button" onClick={() => openNewConversation(false)}>Écrire à une personne</button><button type="button" className="empty-group-action" onClick={() => openNewConversation(true)}>Créer un groupe</button></div>}
    </div>
    <aside className="message-profile-panel" aria-label="Informations sur la conversation">
      {selected ? <>
        <div className="message-profile-hero">
          <div className="message-profile-avatar"><ChatAvatar chat={selected} /><span className="pulse-dot" /></div>
          <h2>{selected.title || 'Conversation'}</h2>
          <p>{selected.is_group ? 'Groupe AVANI PRO' : connection === 'connected' ? 'En ligne ou récemment actif' : connection === 'offline' ? 'Hors connexion' : 'Statut de connexion'}</p>
          <div className="message-profile-actions"><button type="button" onClick={() => setInfoOpen(value => !value)} aria-expanded={infoOpen}>ⓘ Informations</button><button type="button" onClick={() => { setSearchOpen(value => !value); setInfoOpen(false) }}>⌕ Rechercher</button></div>
        </div>
        <section className="message-profile-section">
          <h3>À propos</h3>
          <p>{selected.is_group ? `${members.length} membre${members.length === 1 ? '' : 's'} dans ce groupe` : 'Conversation privée sur AVANI PRO'}</p>
          <p className="message-profile-muted">{selected.is_group ? 'Échangez, partagez des fichiers et retrouvez les membres du groupe.' : 'Vos échanges restent dans votre messagerie.'}</p>
        </section>
        <section className="message-profile-section">
          <h3>Membres <span>{members.length}</span></h3>
          {membersLoading ? <p className="message-profile-muted">Chargement des membres…</p> : membersError ? <p className="message-profile-muted">{membersError}</p> : <div className="message-profile-members">{members.slice(0, 5).map(member => <div className="message-profile-member" key={member.id}><span className="avatar avatar-sm avatar-soft">{member.avatar_url ? <img src={member.avatar_url} alt="" /> : (member.full_name || 'AV').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span><span><strong>{member.full_name || member.username}</strong><small>@{member.username}</small></span></div>)}</div>}
        </section>
        <section className="message-profile-section">
          <h3>Photos et médias <span>{messages.filter(message => !message.deleted_at && message.attachment_path && message.attachment_mime_type?.startsWith('image/')).length}</span></h3>
          <div className="message-profile-media-grid">{messages.filter(message => !message.deleted_at && message.attachment_path && message.attachment_mime_type?.startsWith('image/')).slice(-4).reverse().map(message => <div className="message-profile-media-item" key={message.id}><MessageAttachment message={message} /></div>)}</div>
          {!messages.some(message => !message.deleted_at && message.attachment_path && message.attachment_mime_type?.startsWith('image/')) && <p className="message-profile-muted">Les photos partagées apparaîtront ici.</p>}
        </section>
        <section className="message-profile-section">
          <h3>Fichiers partagés <span>{messages.filter(message => !message.deleted_at && message.attachment_path && !message.attachment_mime_type?.startsWith('image/')).length}</span></h3>
          <div className="message-profile-files">{messages.filter(message => !message.deleted_at && message.attachment_path && !message.attachment_mime_type?.startsWith('image/')).slice(-5).reverse().map(message => <div className="message-profile-file" key={message.id}><span className="message-profile-file-icon">↗</span><span><strong>{message.attachment_name || 'Fichier partagé'}</strong><small>{formatRowTime(message.created_at)}</small></span></div>)}</div>
          {!messages.some(message => !message.deleted_at && message.attachment_path && !message.attachment_mime_type?.startsWith('image/')) && <p className="message-profile-muted">Les documents et pièces jointes apparaîtront ici.</p>}
        </section>
      </> : <div className="message-profile-empty"><span>✦</span><h2>Votre espace de discussion</h2><p>Sélectionnez une conversation pour afficher ses informations, ses membres et les fichiers partagés.</p></div>}
    </aside>
    {newConversationOpen && <div className="message-dialog-backdrop" role="presentation"><div ref={dialogRef} className="message-dialog" role="dialog" aria-modal="true" aria-label={groupMode ? 'Créer un groupe' : 'Nouvelle discussion'}>
      <div className="message-dialog-head"><div><span className="eyebrow">{groupMode ? 'NOUVEAU GROUPE' : 'NOUVELLE DISCUSSION'}</span><strong>{groupMode ? 'Créer un groupe' : 'Écrire à une personne'}</strong></div><button type="button" disabled={creatingConversation} onClick={() => setNewConversationOpen(false)} aria-label="Fermer">×</button></div>
      {groupMode && <input className="message-dialog-input" maxLength={100} disabled={creatingConversation} value={groupTitle} onChange={event => setGroupTitle(event.target.value)} placeholder="Nom du groupe" aria-label="Nom du groupe" />}
      <input className="message-dialog-input" value={contactQuery} onChange={event => setContactQuery(event.target.value)} placeholder="Rechercher par nom ou identifiant" aria-label="Rechercher une personne" disabled={creatingConversation} />
      <p className="message-dialog-help">{groupMode ? 'Donnez un nom au groupe et choisissez au moins une personne. Vous serez automatiquement membre.' : 'Choisissez un membre Avani Pro pour ouvrir une discussion privée.'}</p>
      {selectedContacts.length > 0 && <div className="selected-contact-chips" aria-label="Personnes sélectionnées">{selectedContacts.map(id => <button type="button" disabled={creatingConversation} key={id} onClick={() => setSelectedContacts(current => current.filter(value => value !== id))} aria-label={`Retirer ${selectedContactProfiles.current.get(id)?.full_name || 'cette personne'}`}>{selectedContactProfiles.current.get(id)?.full_name || 'Membre'} <span aria-hidden="true">×</span></button>)}</div>}
      {contactsLoading && <p className="message-dialog-help" role="status">Recherche des personnes…</p>}
      {contactsError && <p className="message-dialog-error" role="alert">{contactsError}<button type="button" onClick={() => setContactQuery(value => value + ' ')}>Réessayer</button></p>}
      {!contactsLoading && !contactsError && contacts.length === 0 && <p className="message-dialog-help" role="status">Aucune personne trouvée. Essayez un autre nom ou identifiant.</p>}
      {creationError && <p className="message-dialog-error" role="alert">{creationError}</p>}
      <div className="message-contact-list" aria-busy={contactsLoading}>{contacts.map(contact => { const selectedContact = selectedContacts.includes(contact.id); return <button type="button" disabled={creatingConversation || contactsLoading} aria-pressed={selectedContact} key={contact.id} className={`message-contact-row ${selectedContact ? 'selected' : ''}`} onClick={() => setSelectedContacts(current => groupMode ? (selectedContact ? current.filter(id => id !== contact.id) : [...current, contact.id]) : [contact.id])}><div className="avatar avatar-sm avatar-soft">{contact.avatar_url ? <img src={contact.avatar_url} alt="" /> : (contact.full_name || '').split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase()}</div><div><strong>{contact.full_name || ''}</strong><small>@{contact.username || ''}</small></div><span>{selectedContact ? '✓' : '+'}</span></button> })}</div>
      <div className="message-dialog-footer"><span>{selectedContacts.length ? `${selectedContacts.length} sélectionné(s)` : ''}</span><button type="button" className="primary-button" disabled={!selectedContacts.length || creatingConversation || (groupMode && !groupTitle.trim())} onClick={() => void startConversation()}>{creatingConversation ? 'Création…' : groupMode ? 'Créer le groupe' : 'Commencer'}</button></div>
    </div></div>}
  </section>
}
