import type { User } from '@supabase/supabase-js'
import { requireSupabase } from './supabase'

export type ProfileRecord = { id: string; username: string; full_name: string; avatar_url: string | null; bio: string | null; verified_type: string | null }
export type MessageRecord = { id: string; conversation_id: string; sender_id: string; body: string; attachment_path: string | null; created_at: string; sender?: Pick<ProfileRecord, 'username' | 'full_name' | 'avatar_url'> }
export type ConversationRecord = { id: string; title: string | null; is_group: boolean; updated_at: string; conversation_members?: { user_id: string; profile: ProfileRecord }[] }

export async function createPost(authorId: string, body: string, postType = 'text') {
  const client = requireSupabase()
  const { data, error } = await client.from('posts').insert({ author_id: authorId, body: body.trim(), post_type: postType }).select('id, created_at').single()
  if (error) throw error
  return data as { id: string; created_at: string }
}

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

export async function createDirectConversation(userId: string, contactId: string, contactName: string) {
  const client = requireSupabase()
  const { data: conversation, error } = await client.from('conversations').insert({ title: contactName, is_group: false, created_by: userId }).select('id, title, is_group, updated_at').single()
  if (error) throw error
  const { error: membersError } = await client.from('conversation_members').insert([{ conversation_id: conversation.id, user_id: userId }, { conversation_id: conversation.id, user_id: contactId }])
  if (membersError) throw membersError
  return conversation as ConversationRecord
}
