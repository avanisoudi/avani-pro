import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { listConversations, listMessages, markConversationRead, sendMessage, type ConversationRecord, type MessageRecord } from '../lib/api'
import { supabase } from '../lib/supabase'

type TypingState = Record<string, string>

function messageAuthorName(message: MessageRecord) {
  return message.sender?.full_name || message.sender?.username || ''
}

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
  const typingTimeout = useRef<number | null>(null)

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
    listMessages(selected.id)
      .then(items => {
        if (!cancelled) {
          setMessages(items)
          setHasOlder(items.length >= 50)
        }
      })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Impossible de charger les messages.') })
    void markConversationRead(selected.id, user.id).catch(() => undefined)

    const channel = supabase.channel(`conversation:${selected.id}`, {
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
      })
      .on('broadcast', { event: 'typing' }, payload => {
        const data = payload.payload as { userId?: string; name?: string; active?: boolean }
        if (!data.userId || data.userId === user.id) return
        setTyping(current => {
          const next = { ...current }
          if (data.active) next[data.userId] = data.name || ''
          else delete next[data.userId]
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
      void supabase.removeChannel(channel)
    }
  }, [selected, user])

  const broadcastTyping = async (active: boolean) => {
    if (!selected || !user || !supabase) return
    const channel = supabase.getChannels().find(item => item.topic === `realtime:conversation:${selected.id}`)
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
        <div><span className="eyebrow">MESSAGERIE</span><small>Conversations de votre compte</small></div>
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
              {!message.deleted_at && <div className="message-meta-actions">
                <button type="button" onClick={() => setReplyTo(message)}>Répondre</button>
                {message.sender_id === user.id && <><button type="button" onClick={() => { setEditingId(message.id); setEditingBody(message.body) }}>Modifier</button><button type="button" onClick={() => void removeMessage(message)}>Supprimer</button></>}
              </div>}
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
}
