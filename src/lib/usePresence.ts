import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export function usePresence(user: User | null) {
  const [onlineCount, setOnlineCount] = useState(0)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!user || !supabase) return
    const client = supabase
    const channel = client.channel('avani:presence', { config: { presence: { key: user.id } } })
    const refresh = () => {
      const state = channel.presenceState() as Record<string, unknown[]>
      setOnlineCount(Object.keys(state).length)
    }
    channel.on('presence', { event: 'sync' }, refresh)
      .on('presence', { event: 'join' }, refresh)
      .on('presence', { event: 'leave' }, refresh)
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          setConnected(true)
          await channel.track({ user_id: user.id, online_at: new Date().toISOString() })
          refresh()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnected(false)
        }
      })
    return () => { void channel.untrack(); void client.removeChannel(channel) }
  }, [user])

  return { onlineCount, connected }
}
