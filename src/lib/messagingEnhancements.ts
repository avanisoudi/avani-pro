import { requireSupabase } from './supabase'

export type ConversationUserSettings = {
  conversation_id: string
  user_id: string
  is_archived: boolean
  is_muted: boolean
  is_pinned: boolean
  wallpaper: string | null
  disappearing_after_seconds: number
  updated_at: string
}

const DEFAULT_SETTINGS = {
  is_archived: false,
  is_muted: false,
  is_pinned: false,
  wallpaper: 'default',
  disappearing_after_seconds: 0,
}

export async function getConversationUserSettings(conversationId: string, userId: string): Promise<ConversationUserSettings> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('conversation_user_settings')
    .select('conversation_id,user_id,is_archived,is_muted,is_pinned,wallpaper,disappearing_after_seconds,updated_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data ?? {
    conversation_id: conversationId,
    user_id: userId,
    ...DEFAULT_SETTINGS,
    updated_at: new Date(0).toISOString(),
  }) as ConversationUserSettings
}

export async function updateConversationUserSettings(
  conversationId: string,
  userId: string,
  patch: Partial<Pick<ConversationUserSettings, 'is_archived' | 'is_muted' | 'is_pinned' | 'wallpaper' | 'disappearing_after_seconds'>>,
): Promise<ConversationUserSettings> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('conversation_user_settings')
    .upsert({
      conversation_id: conversationId,
      user_id: userId,
      ...patch,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'conversation_id,user_id' })
    .select('conversation_id,user_id,is_archived,is_muted,is_pinned,wallpaper,disappearing_after_seconds,updated_at')
    .single()
  if (error) throw error
  return data as ConversationUserSettings
}

export async function setMessageStarred(messageId: string, userId: string, starred: boolean) {
  const client = requireSupabase()
  const result = starred
    ? await client.from('message_stars').upsert({ message_id: messageId, user_id: userId }, { onConflict: 'message_id,user_id' })
    : await client.from('message_stars').delete().eq('message_id', messageId).eq('user_id', userId)
  if (result.error) throw result.error
}


export async function listStarredMessageIds(userId: string, conversationId: string): Promise<string[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('message_stars')
    .select('message_id, messages!inner(conversation_id)')
    .eq('user_id', userId)
    .eq('messages.conversation_id', conversationId)
  if (error) throw error
  return (data ?? []).map((row: { message_id: string }) => row.message_id)
}

export async function toggleMessageStar(messageId: string, userId: string, starred: boolean): Promise<void> {
  await setMessageStarred(messageId, userId, starred)
}

export async function listPinnedMessages(conversationId: string): Promise<Array<{ message_id: string; pinned_by: string }>> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('message_pins')
    .select('message_id,pinned_by')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function setMessagePinned(messageId: string, conversationId: string, userId: string, pinned: boolean): Promise<void> {
  const client = requireSupabase()
  const result = pinned
    ? await client.from('message_pins').upsert({ message_id: messageId, conversation_id: conversationId, pinned_by: userId }, { onConflict: 'conversation_id,message_id' })
    : await client.from('message_pins').delete().eq('conversation_id', conversationId).eq('message_id', messageId)
  if (result.error) throw result.error
}


export async function listMyConversationSettings(userId: string): Promise<ConversationUserSettings[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('conversation_user_settings')
    .select('conversation_id,user_id,is_archived,is_muted,is_pinned,wallpaper,disappearing_after_seconds,updated_at')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as ConversationUserSettings[]
}
