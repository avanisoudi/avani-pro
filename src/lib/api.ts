import type { User } from '@supabase/supabase-js'
import { requireSupabase } from './supabase'

export type ProfileRecord = { id: string; username: string; full_name: string; avatar_url: string | null; bio: string | null; verified_type: string | null; followers_count?: number; following_count?: number }
export type MessageRecord = { id: string; conversation_id: string; sender_id: string; body: string; attachment_path: string | null; created_at: string; sender?: Pick<ProfileRecord, 'username' | 'full_name' | 'avatar_url'> }
export type ConversationRecord = { id: string; title: string | null; is_group: boolean; updated_at: string; conversation_members?: { user_id: string; profile: ProfileRecord }[] }

export async function createPost(authorId: string, body: string, postType = 'text') {
  const client = requireSupabase()
  const { data, error } = await client.from('posts').insert({ author_id: authorId, body: body.trim(), post_type: postType }).select('id, created_at').single()
  if (error) throw error
  return data as { id: string; created_at: string }
}

export async function getMyProfile(user: User) {
  const { data, error } = await requireSupabase().from('profiles').select('id, username, full_name, avatar_url, bio, verified_type, followers_count, following_count').eq('id', user.id).maybeSingle()
  if (error) throw error
  return data as ProfileRecord | null
}

export async function listConversations(userId: string) {
  const { data, error } = await requireSupabase().from('conversation_members').select('conversation:conversations(id, title, is_group, updated_at), profile:profiles(id, username, full_name, avatar_url, bio, verified_type)').eq('user_id', userId)
  if (error) throw error
  return (data ?? []).map((row: any) => ({ ...row.conversation, conversation_members: [{ user_id: row.user_id, profile: row.profile }] })) as ConversationRecord[]
}

export async function listMessages(conversationId: string) {
  const { data, error } = await requireSupabase().from('messages').select('id, conversation_id, sender_id, body, attachment_path, created_at, sender:profiles!messages_sender_id_fkey(username, full_name, avatar_url)').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(100)
  if (error) throw error
  return (data ?? []).map((row: any) => ({ ...row, sender: Array.isArray(row.sender) ? row.sender[0] : row.sender })) as MessageRecord[]
}

export async function sendMessage(conversationId: string, senderId: string, body: string) {
  const { data, error } = await requireSupabase().from('messages').insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() }).select('id, conversation_id, sender_id, body, attachment_path, created_at').single()
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

export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry'
export type ReactionCounts = Record<ReactionType, number>
export type FeedPostRecord = { id: string; body: string; post_type: string; created_at: string; author: ProfileRecord; likes: number; comments: number; shares: number; liked: boolean; saved: boolean; reaction: ReactionType | null; reactionCounts: ReactionCounts }

export async function listFeedPosts(userId?: string | null) {
  const client = requireSupabase()
  const [{ data: posts, error: postsError }, { data: likes, error: likesError }, { data: comments, error: commentsError }, { data: shares, error: sharesError }, savedResult] = await Promise.all([
    client.from('posts').select('id, body, post_type, created_at, author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, bio, verified_type)').order('created_at', { ascending: false }).limit(50),
    client.from('likes').select('post_id, user_id, reaction_type'),
    client.from('comments').select('post_id'),
    client.from('post_shares').select('post_id'),
    userId ? client.from('saved_posts').select('post_id').eq('user_id', userId) : Promise.resolve({ data: [], error: null }),
  ])
  if (postsError) throw postsError
  if (likesError) throw likesError
  if (commentsError) throw commentsError
  if (sharesError) throw sharesError
  const countBy = (rows: Array<{ post_id: string }> | null) => (rows ?? []).reduce<Record<string, number>>((counts, row) => { counts[row.post_id] = (counts[row.post_id] ?? 0) + 1; return counts }, {})
  const likeRows = (likes ?? []) as Array<{ post_id: string; user_id: string; reaction_type: ReactionType }>
  const myReactions = new Map(likeRows.filter(row => row.user_id === userId).map(row => [row.post_id, row.reaction_type]))
  const reactionCountsByPost = likeRows.reduce<Record<string, ReactionCounts>>((all, row) => {
    const current = all[row.post_id] ?? { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }
    current[row.reaction_type] = (current[row.reaction_type] ?? 0) + 1
    all[row.post_id] = current
    return all
  }, {})
  const savedIds = new Set(((savedResult.data ?? []) as Array<{ post_id: string }>).map(row => row.post_id))
  const likeCounts = countBy(likeRows), commentCounts = countBy(comments), shareCounts = countBy(shares)
  return (posts ?? []).map((row: any) => ({ id: row.id, body: row.body, post_type: row.post_type, created_at: row.created_at, author: Array.isArray(row.author) ? row.author[0] : row.author, likes: likeCounts[row.id] ?? 0, comments: commentCounts[row.id] ?? 0, shares: shareCounts[row.id] ?? 0, liked: myReactions.has(row.id), reaction: myReactions.get(row.id) ?? null, reactionCounts: reactionCountsByPost[row.id] ?? { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }, saved: savedIds.has(row.id) })) as FeedPostRecord[]
}
export async function setPostReaction(postId: string, userId: string, reaction: ReactionType | null) {
  const client = requireSupabase()
  const result = reaction ? await client.from('likes').upsert({ post_id: postId, user_id: userId, reaction_type: reaction }, { onConflict: 'post_id,user_id' }) : await client.from('likes').delete().eq('post_id', postId).eq('user_id', userId)
  if (result.error) throw result.error
  return reaction
}

export async function togglePostLike(postId: string, userId: string, liked: boolean) {
  return setPostReaction(postId, userId, liked ? null : 'like')
}

export async function toggleSavedPost(postId: string, userId: string, saved: boolean) {
  const client = requireSupabase()
  const result = saved ? await client.from('saved_posts').delete().eq('post_id', postId).eq('user_id', userId) : await client.from('saved_posts').insert({ post_id: postId, user_id: userId })
  if (result.error) throw result.error
  return !saved
}

export async function recordPostShare(postId: string, userId: string) {
  const { error } = await requireSupabase().from('post_shares').insert({ post_id: postId, user_id: userId })
  if (error) throw error
}

export async function updatePost(postId: string, authorId: string, body: string) {
  const { data, error } = await requireSupabase().from('posts').update({ body: body.trim(), updated_at: new Date().toISOString() }).eq('id', postId).eq('author_id', authorId).select('id, body, updated_at').single()
  if (error) throw error
  return data as { id: string; body: string; updated_at: string }
}

export async function deletePost(postId: string, authorId: string) {
  const { error } = await requireSupabase().from('posts').delete().eq('id', postId).eq('author_id', authorId)
  if (error) throw error
}
