import type { User } from '@supabase/supabase-js'
import { requireSupabase } from './supabase'

export type ProfileRecord = { id: string; username: string; full_name: string; avatar_url: string | null; bio: string | null; verified_type: string | null }
export type MessageRecord = { id: string; conversation_id: string; sender_id: string; body: string; attachment_path: string | null; created_at: string; sender?: Pick<ProfileRecord, 'username' | 'full_name' | 'avatar_url'> }
export type ConversationRecord = { id: string; title: string | null; is_group: boolean; updated_at: string; conversation_members?: { user_id: string; profile: ProfileRecord }[] }

export async function getMyProfile(user: User) {
  const client = requireSupabase()
  const { data, error } = await client.from('profiles').select('id, username, full_name, avatar_url, bio, verified_type').eq('id', user.id).maybeSingle()
  if (error) throw error
  return data as ProfileRecord | null
}

export async function listConversations(userId: string) {
  const client = requireSupabase()
  const { data, error } = await client.from('conversation_members').select('conversation:conversations(id, title, is_group, updated_at), profile:profiles(id, username, full_name, avatar_url, bio, verified_type)').eq('user_id', userId)
  if (error) throw error
  return (data ?? []).map((row: any) => ({ ...row.conversation, conversation_members: [{ user_id: row.user_id, profile: row.profile }] })) as ConversationRecord[]
}

export async function listMessages(conversationId: string) {
  const client = requireSupabase()
  const { data, error } = await client.from('messages').select('id, conversation_id, sender_id, body, attachment_path, created_at, sender:profiles!messages_sender_id_fkey(username, full_name, avatar_url)').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(100)
  if (error) throw error
  return (data ?? []).map((row: any) => ({ ...row, sender: Array.isArray(row.sender) ? row.sender[0] : row.sender })) as MessageRecord[]
}

export async function sendMessage(conversationId: string, senderId: string, body: string) {
  const client = requireSupabase()
  const { data, error } = await client.from('messages').insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() }).select('id, conversation_id, sender_id, body, attachment_path, created_at').single()
  if (error) throw error
  return data as MessageRecord
}
