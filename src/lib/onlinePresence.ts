import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { onlineConversationUserIds } from './messagesModel'

// One presence subscription for the signed-in app, not one per opened chat.
const listeners = new Set<() => void>()
let snapshot: readonly string[] | null = null
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const getSnapshot = () => snapshot
function publish(ids: readonly string[] | null) { snapshot = ids; listeners.forEach(listener => listener()) }

export function useAppPresence(userId: string | undefined) {
  useEffect(() => {
    if (!userId || !supabase) { publish(null); return }
    const client = supabase
    let active = true
    publish(null)
    const channel = client.channel('avani-app-online', { config: { presence: { key: userId } } })
      .on('presence', { event: 'sync' }, () => {
        if (active) publish(onlineConversationUserIds(channel.presenceState<{ userId: string }>()))
      })
      .subscribe(async status => {
        if (!active) return
        if (status === 'SUBSCRIBED') await channel.track({ userId })
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') publish(null)
      })
    const offline = () => { if (active) publish(null) }
    window.addEventListener('offline', offline)
    return () => {
      active = false
      window.removeEventListener('offline', offline)
      publish(null)
      void client.removeChannel(channel)
    }
  }, [userId])
}

export function useOnlineMembers(memberIds: readonly string[]): number | null {
  const online = useSyncExternalStore(subscribe, getSnapshot, () => null)
  if (online === null) return null
  const members = new Set(memberIds)
  return online.filter(id => members.has(id)).length
}
