import { useCallback, useEffect, useRef } from 'react'
import { markConversationRead, type MessageRecord } from './api'

/** Only acknowledge a rendered, foreground thread while its latest messages are visible. */
export function useConversationReading(conversationId: string | undefined, userId: string | undefined, messages: MessageRecord[], blocked: boolean,
  onRead: (id: string, marker: string) => void, onError: (message: string) => void) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const opened = useRef<string | null>(null)
  const nearBottom = useRef(true)
  const acknowledged = useRef(new Map<string, number>())
  const retry = useRef<() => void>(() => undefined)
  const callbacks = useRef({ onRead, onError })
  useEffect(() => { callbacks.current = { onRead, onError } }, [onRead, onError])
  useEffect(() => {
    const scroller = scrollRef.current
    if (!conversationId || !userId || !scroller) return
    const items = messages.filter(message => message.conversation_id === conversationId)
    if (!items.length) return
    let active = true, pending = false
    const latest = items.reduce((a, b) => Date.parse(a.created_at) > Date.parse(b.created_at) ? a : b)
    const attempt = async () => {
      if (!active || pending || blocked || document.visibilityState !== 'visible' || !document.hasFocus()) return
      if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 24) return
      if ((acknowledged.current.get(`${userId}/${conversationId}`) ?? 0) >= Date.parse(latest.created_at)) return
      pending = true
      try {
        const marker = await markConversationRead(conversationId, userId, latest.id)
        acknowledged.current.set(`${userId}/${conversationId}`, Date.parse(marker))
        if (active) callbacks.current.onRead(conversationId, marker)
      } catch (caught) { if (active) callbacks.current.onError(caught instanceof Error ? caught.message : 'Lecture non enregistrée. Réessayez.') }
      finally { pending = false }
    }
    const onScroll = () => { nearBottom.current = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 24; void attempt() }
    retry.current = () => { scroller.scrollTop = scroller.scrollHeight; nearBottom.current = true; void attempt() }
    const frame = requestAnimationFrame(() => {
      if (opened.current !== conversationId || nearBottom.current) scroller.scrollTop = scroller.scrollHeight
      opened.current = conversationId
      onScroll()
    })
    scroller.addEventListener('scroll', onScroll)
    window.addEventListener('focus', onScroll)
    document.addEventListener('visibilitychange', onScroll)
    return () => {
      active = false; cancelAnimationFrame(frame); retry.current = () => undefined
      scroller.removeEventListener('scroll', onScroll)
      window.removeEventListener('focus', onScroll)
      document.removeEventListener('visibilitychange', onScroll)
    }
  }, [conversationId, userId, messages, blocked])
  return { scrollRef, retryRead: useCallback(() => retry.current(), []) }
}
