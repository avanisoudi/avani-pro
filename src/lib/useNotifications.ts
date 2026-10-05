import { useEffect, useState } from 'react'
import { requireSupabase, supabase } from './supabase'

export type NotificationRecord = { id: string; user_id: string; actor_id: string | null; type: string; payload: { message?: string; [key: string]: unknown }; read_at: string | null; created_at: string }

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  useEffect(() => {
    if (!userId || !supabase) return
    let active = true
    const client = supabase
    requireSupabase().from('notifications').select('id, user_id, actor_id, type, payload, read_at, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(25).then(({ data }) => { if (active) setNotifications((data ?? []) as NotificationRecord[]) })
    const channel = client.channel(`notifications:${userId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, payload => setNotifications(current => [payload.new as NotificationRecord, ...current].slice(0, 25))).subscribe()
    return () => { active = false; void client.removeChannel(channel) }
  }, [userId])
  const markAllRead = async () => { if (!userId || !supabase) return; await requireSupabase().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null); setNotifications(current => current.map(item => ({ ...item, read_at: item.read_at ?? new Date().toISOString() }))) }
  return { notifications, unreadCount: notifications.filter(item => !item.read_at).length, markAllRead }
}
