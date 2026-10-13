import type { User } from '@supabase/supabase-js'
import { requireSupabase } from './supabase'
import { isMissingColumnError } from './postgres'
import { resolvePostMediaPaths } from './postMedia'

export type ProfileRecord = { id: string; username: string; full_name: string; avatar_url: string | null; bio: string | null; verified_type: string | null; followers_count?: number; following_count?: number }
export type MessageRecord = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  attachment_path: string | null
  attachment_name?: string | null
  attachment_mime_type?: string | null
  attachment_size_bytes?: number | null
  message_type?: 'text' | 'image' | 'video' | 'file' | 'audio' | 'voice' | 'system' | 'shared_post'
  reply_to_id?: string | null
  created_at: string
  updated_at?: string | null
  edited_at?: string | null
  deleted_at?: string | null
  sender?: Pick<ProfileRecord, 'username' | 'full_name' | 'avatar_url'>
  reply_to?: Pick<MessageRecord, 'id' | 'body' | 'sender_id'> | null
}
export type ConversationRecord = { id: string; title: string | null; is_group: boolean; is_public?: boolean; updated_at: string; last_message_id?: string | null; conversation_members?: { user_id: string; profile: ProfileRecord }[] }

export const MESSAGE_ATTACHMENT_BUCKET = 'message-attachments'
export const MAX_MESSAGE_ATTACHMENT_BYTES = 25 * 1024 * 1024

export async function uploadMessageAttachment(conversationId: string, userId: string, file: File) {
  if (file.size <= 0 || file.size > MAX_MESSAGE_ATTACHMENT_BYTES) throw new Error('La pièce jointe doit faire au maximum 25 Mo.')
  if (!file.type || (!file.type.startsWith('image/') && !file.type.startsWith('video/') && file.type !== 'application/pdf' && !file.type.startsWith('text/'))) throw new Error('Type de fichier non pris en charge. Utilisez une image, une vidéo, un PDF ou un fichier texte.')
  const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'attachment'
  const path = `${conversationId}/${userId}/${crypto.randomUUID()}-${safeName}`
  const { error } = await requireSupabase().storage.from(MESSAGE_ATTACHMENT_BUCKET).upload(path, file, { upsert: false, contentType: file.type })
  if (error) throw error
  return path
}

export async function getMessageAttachmentUrl(path: string, expiresIn = 3600) {
  const { data, error } = await requireSupabase().storage.from(MESSAGE_ATTACHMENT_BUCKET).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}

/**
 * Enregistre une publication. Les médias sont stockés sous forme de chemins d’objets
 * Storage (`media_paths text[]`, colonne ajoutée par la migration 008) ; le premier chemin
 * est aussi copié dans `media_path`, colonne historique de la migration 001.
 * Si `media_paths` n’existe pas encore dans la base, la publication est quand même
 * enregistrée avec sa première image plutôt que d’échouer.
 */
export async function createPost(authorId: string, body: string, postType = 'text', mediaPaths: string[] = []) {
  const client = requireSupabase()
  const content = body.trim() || ' '
  const paths = mediaPaths.filter(Boolean)
  const payload: Record<string, unknown> = { author_id: authorId, body: content, post_type: postType }
  if (paths.length) {
    payload.media_paths = paths
    payload.media_path = paths[0]
  }
  const attempt = await client.from('posts').insert(payload).select('id, created_at, post_type, media_paths').single()
  if (!attempt.error) return attempt.data as { id: string; created_at: string; media_paths?: string[] | null }
  if (paths.length && isMissingColumnError(attempt.error, 'media_paths')) {
    const withoutArray = { ...payload }
    delete withoutArray.media_paths
    const fallback = await client.from('posts').insert(withoutArray).select('id, created_at, post_type').single()
    if (fallback.error) throw fallback.error
    return { ...(fallback.data as { id: string; created_at: string }), media_paths: null }
  }
  throw attempt.error
}

export async function getMyProfile(user: User) {
  const { data, error } = await requireSupabase().from('profiles').select('id, username, full_name, avatar_url, bio, verified_type, followers_count, following_count').eq('id', user.id).maybeSingle()
  if (error) throw error
  return data as ProfileRecord | null
}

export async function listConversations(userId: string) {
  const { data, error } = await requireSupabase().from('conversation_members').select('conversation:conversations(id, title, is_group, is_public, updated_at, last_message_id), profile:profiles(id, username, full_name, avatar_url, bio, verified_type)').eq('user_id', userId)
  if (error) throw error
  return (data ?? []).map((row: any) => ({ ...row.conversation, conversation_members: [{ user_id: row.user_id, profile: row.profile }] })) as ConversationRecord[]
}

export async function listPublicGroups() {
  const { data, error } = await requireSupabase()
    .from('conversations')
    .select('id, title, is_group, is_public, updated_at, last_message_id')
    .eq('is_group', true)
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ConversationRecord[]
}

export async function joinPublicGroup(userId: string, conversationId: string) {
  await requireProfilesExist([userId])
  const client = requireSupabase()
  const { error } = await client.from('conversation_members').upsert(
    { conversation_id: conversationId, user_id: userId },
    { onConflict: 'conversation_id,user_id', ignoreDuplicates: true },
  )
  if (error) throw error
  const { data, error: conversationError } = await client
    .from('conversations')
    .select('id, title, is_group, is_public, updated_at, last_message_id')
    .eq('id', conversationId)
    .eq('is_group', true)
    .eq('is_public', true)
    .single()
  if (conversationError) throw conversationError
  return data as ConversationRecord
}

export async function listMessages(conversationId: string, before?: string, limit = 50) {
  const client = requireSupabase()
  let query = client.from('messages')
    .select('id, conversation_id, sender_id, body, attachment_path, attachment_name, attachment_mime_type, attachment_size_bytes, message_type, reply_to_id, created_at, updated_at, edited_at, deleted_at, reply_to:messages!messages_reply_to_id_fkey(id, body, sender_id), sender:profiles!messages_sender_id_fkey(username, full_name, avatar_url)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (before) query = query.lt('created_at', before)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).reverse().map((row: any) => ({
    ...row,
    sender: Array.isArray(row.sender) ? row.sender[0] : row.sender,
    reply_to: Array.isArray(row.reply_to) ? row.reply_to[0] ?? null : row.reply_to ?? null,
  })) as MessageRecord[]
}

export async function sendMessage(conversationId: string, senderId: string, body: string, options?: { replyToId?: string | null; messageType?: MessageRecord['message_type']; attachmentPath?: string | null; attachmentName?: string | null; attachmentMimeType?: string | null; attachmentSizeBytes?: number | null }) {
  const content = body.trim()
  if (!content && !options?.attachmentPath) throw new Error('Un message ne peut pas être vide.')
  if (content.length > 10000) throw new Error('Le message est trop long.')
  const { data, error } = await requireSupabase().from('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    body: content,
    reply_to_id: options?.replyToId ?? null,
    message_type: options?.messageType ?? 'text',
    attachment_path: options?.attachmentPath ?? null,
    attachment_name: options?.attachmentName ?? null,
    attachment_mime_type: options?.attachmentMimeType ?? null,
    attachment_size_bytes: options?.attachmentSizeBytes ?? null,
  }).select('id, conversation_id, sender_id, body, attachment_path, attachment_name, attachment_mime_type, attachment_size_bytes, message_type, reply_to_id, created_at, updated_at, edited_at, deleted_at').single()
  if (error) throw error
  return data as MessageRecord
}

export async function markConversationRead(conversationId: string, userId: string) {
  const { error } = await requireSupabase().from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('user_id', userId)
  if (error) throw error
}

export async function updateMessage(messageId: string, senderId: string, body: string) {
  const content = body.trim()
  if (!content || content.length > 10000) throw new Error('Message invalide.')
  const { data, error } = await requireSupabase().from('messages').update({ body: content }).eq('id', messageId).eq('sender_id', senderId).select('id, body, updated_at, edited_at').single()
  if (error) throw error
  return data as Pick<MessageRecord, 'id' | 'body' | 'updated_at' | 'edited_at'>
}

export async function deleteMessage(messageId: string, senderId: string) {
  const { data, error } = await requireSupabase().from('messages').update({ body: '', deleted_at: new Date().toISOString() }).eq('id', messageId).eq('sender_id', senderId).select('id, body, deleted_at, updated_at').single()
  if (error) throw error
  return data as Pick<MessageRecord, 'id' | 'body' | 'deleted_at' | 'updated_at'>
}

export async function listMessageReactions(messageIds: string[]) {
  if (!messageIds.length) return []
  const { data, error } = await requireSupabase().from('message_reactions').select('message_id, user_id, reaction_type, created_at').in('message_id', messageIds)
  if (error) throw error
  return (data ?? []) as Array<{ message_id: string; user_id: string; reaction_type: ReactionType; created_at: string }>
}

export async function setMessageReaction(messageId: string, userId: string, reaction: ReactionType | null) {
  const client = requireSupabase()
  const result = reaction
    ? await client.from('message_reactions').upsert({ message_id: messageId, user_id: userId, reaction_type: reaction }, { onConflict: 'message_id,user_id' })
    : await client.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', userId)
  if (result.error) throw result.error
  return reaction
}

export async function searchMessageContacts(userId: string, query: string) {
  const client = requireSupabase()
  const term = query.trim()
  let request = client.from('profiles').select('id, username, full_name, avatar_url, bio, verified_type').neq('id', userId).order('full_name').limit(20)
  if (term) request = request.or(`full_name.ilike.%${term}%,username.ilike.%${term}%`)
  const { data, error } = await request
  if (error) throw error
  return (data ?? []) as ProfileRecord[]
}

async function requireProfilesExist(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) throw new Error('Aucun profil sélectionné.')
  const client = requireSupabase()
  const { data, error } = await client.from('profiles').select('id').in('id', ids)
  if (error) throw error
  const existing = new Set((data ?? []).map((row: { id: string }) => row.id))
  const missing = ids.filter(id => !existing.has(id))
  if (missing.length) throw new Error('Le profil sélectionné n’existe pas dans Avani Pro. Créez d’abord le profil dans Supabase.')
  return existing
}

async function getConversation(client: ReturnType<typeof requireSupabase>, conversationId: string) {
  const { data, error } = await client.from('conversations').select('id, title, is_group, updated_at, last_message_id').eq('id', conversationId).single()
  if (error) throw error
  return data as ConversationRecord
}

export async function createGroupConversation(userId: string, title: string, memberIds: string[]) {
  const name = title.trim()
  const uniqueMembers = [...new Set(memberIds.filter(id => id && id !== userId))]
  if (!name) throw new Error('Le nom du groupe est requis.')
  if (!uniqueMembers.length) throw new Error('Ajoutez au moins une personne au groupe.')
  await requireProfilesExist([userId, ...uniqueMembers])
  const client = requireSupabase()
  const conversationId = crypto.randomUUID()

  const { error } = await client.from('conversations').insert({ id: conversationId, title: name, is_group: true, created_by: userId })
  if (error) throw error

  const members = [userId, ...uniqueMembers].map(memberId => ({ conversation_id: conversationId, user_id: memberId }))
  const { error: membersError } = await client.from('conversation_members').insert(members)
  if (membersError) {
    await client.from('conversations').delete().eq('id', conversationId).eq('created_by', userId)
    throw membersError
  }
  return getConversation(client, conversationId)
}

export async function createDirectConversation(userId: string, contactId: string, contactName: string) {
  if (!contactId || contactId === userId) throw new Error('Profil destinataire invalide.')
  await requireProfilesExist([userId, contactId])
  const client = requireSupabase()

  const { data: myMemberships, error: myMembershipsError } = await client.from('conversation_members').select('conversation_id').eq('user_id', userId)
  if (myMembershipsError) throw myMembershipsError
  const myConversationIds = (myMemberships ?? []).map(row => row.conversation_id)
  if (myConversationIds.length) {
    const { data: shared, error: sharedError } = await client
      .from('conversation_members')
      .select('conversation:conversations(id, title, is_group, updated_at, last_message_id)')
      .eq('user_id', contactId)
      .in('conversation_id', myConversationIds)
    if (sharedError) throw sharedError
    const existing = (shared ?? []).map((row: any) => Array.isArray(row.conversation) ? row.conversation[0] : row.conversation).find((conversation: ConversationRecord | null) => conversation && !conversation.is_group)
    if (existing) return existing
  }

  const conversationId = crypto.randomUUID()
  const { error } = await client.from('conversations').insert({ id: conversationId, title: contactName, is_group: false, created_by: userId })
  if (error) throw error
  const { error: membersError } = await client.from('conversation_members').insert([{ conversation_id: conversationId, user_id: userId }, { conversation_id: conversationId, user_id: contactId }])
  if (membersError) {
    await client.from('conversations').delete().eq('id', conversationId).eq('created_by', userId)
    throw membersError
  }
  return getConversation(client, conversationId)
}

export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry'
type LikeRow = { post_id: string; user_id: string; reaction_type: ReactionType }
export type ReactionCounts = Record<ReactionType, number>
/** Chemins bruts déclarés par une ligne `posts`, dans l’ordre d’affichage. */
function mediaPathsOf(row: { media_paths?: unknown; media_path?: unknown }): string[] {
  const list = Array.isArray(row.media_paths) ? (row.media_paths as unknown[]).filter((path): path is string => typeof path === 'string' && path.length > 0) : []
  const single = typeof row.media_path === 'string' && row.media_path ? [row.media_path] : []
  return [...new Set([...list, ...single])]
}

export type FeedPostRecord = { id: string; body: string; post_type: string; created_at: string; updated_at?: string | null; author: ProfileRecord; likes: number; comments: number; shares: number; liked: boolean; saved: boolean; reaction: ReactionType | null; reactionCounts: ReactionCounts; media?: string[] }

/**
 * Lignes de réactions du fil. Si la base ne porte pas encore `reaction_type`,
 * la requête est rejouée sans cette colonne et chaque ligne vaut « J’aime » :
 * le compteur reste exact et le fil s’affiche au lieu d’échouer.
 */
async function listLikeRows(client: ReturnType<typeof requireSupabase>) {
  const detailed = await client.from('likes').select('post_id, user_id, reaction_type')
  if (!detailed.error) return (detailed.data ?? []) as LikeRow[]
  if (!isMissingColumnError(detailed.error, 'reaction_type')) throw detailed.error
  const plain = await client.from('likes').select('post_id, user_id')
  if (plain.error) throw plain.error
  return ((plain.data ?? []) as Array<{ post_id: string; user_id: string }>).map(row => ({ ...row, reaction_type: 'like' as ReactionType }))
}

/**
 * Publications du fil. Les colonnes de médias sont ajoutées par la migration 008 :
 * si la base ne les porte pas encore, la requête est rejouée sans elles et le fil
 * continue d’afficher les médias déjà présents dans le texte des publications.
 */
async function selectFeedPosts(client: ReturnType<typeof requireSupabase>) {
  const withMedia = await client
    .from('posts')
    .select('id, body, post_type, created_at, updated_at, media_path, media_paths, author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, bio, verified_type)')
    .order('created_at', { ascending: false })
    .limit(50)
  if (!withMedia.error) return withMedia
  if (!isMissingColumnError(withMedia.error, 'media_path') && !isMissingColumnError(withMedia.error, 'media_paths')) throw withMedia.error
  return client
    .from('posts')
    .select('id, body, post_type, created_at, updated_at, author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, bio, verified_type)')
    .order('created_at', { ascending: false })
    .limit(50)
}

export async function listFeedPosts(userId?: string | null) {
  const client = requireSupabase()
  const [{ data: posts, error: postsError }, likeRows, { data: comments, error: commentsError }, { data: shares, error: sharesError }, savedResult] = await Promise.all([
    selectFeedPosts(client),
    listLikeRows(client),
    client.from('comments').select('post_id'),
    client.from('post_shares').select('post_id'),
    userId ? client.from('saved_posts').select('post_id').eq('user_id', userId) : Promise.resolve({ data: [], error: null }),
  ])
  if (postsError) throw postsError
  if (commentsError) throw commentsError
  if (sharesError) throw sharesError
  const countBy = (rows: Array<{ post_id: string }> | null) => (rows ?? []).reduce<Record<string, number>>((counts, row) => { counts[row.post_id] = (counts[row.post_id] ?? 0) + 1; return counts }, {})
  const myReactions = new Map(likeRows.filter(row => row.user_id === userId).map(row => [row.post_id, row.reaction_type]))
  const reactionCountsByPost = likeRows.reduce<Record<string, ReactionCounts>>((all, row) => {
    const current = all[row.post_id] ?? { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }
    current[row.reaction_type] = (current[row.reaction_type] ?? 0) + 1
    all[row.post_id] = current
    return all
  }, {})
  const savedIds = new Set(((savedResult.data ?? []) as Array<{ post_id: string }>).map(row => row.post_id))
  const rows = (posts ?? []) as any[]
  const storedPaths = rows.flatMap((row: any) => mediaPathsOf(row))
  const mediaUrls = await resolvePostMediaPaths(storedPaths)
  const likeCounts = countBy(likeRows), commentCounts = countBy(comments), shareCounts = countBy(shares)
  return rows.map((row: any) => ({ id: row.id, body: row.body, post_type: row.post_type, created_at: row.created_at, updated_at: row.updated_at ?? null, media: mediaPathsOf(row).map(path => mediaUrls.get(path) ?? path), author: Array.isArray(row.author) ? row.author[0] : row.author, likes: likeCounts[row.id] ?? 0, comments: commentCounts[row.id] ?? 0, shares: shareCounts[row.id] ?? 0, liked: myReactions.has(row.id), reaction: myReactions.get(row.id) ?? null, reactionCounts: reactionCountsByPost[row.id] ?? { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }, saved: savedIds.has(row.id) })) as FeedPostRecord[]
}
export type ReactionUserRecord = { user_id: string; reaction_type: ReactionType; created_at: string; user: Pick<ProfileRecord, 'id' | 'username' | 'full_name' | 'avatar_url'> | null }

export async function listReactionUsers(postId: string, reactionType?: ReactionType | 'all') {
  const client = requireSupabase()
  let query = client
    .from('likes')
    .select('user_id, reaction_type, created_at, user:profiles!likes_user_id_fkey(id, username, full_name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
  if (reactionType && reactionType !== 'all') query = query.eq('reaction_type', reactionType)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    user_id: row.user_id,
    reaction_type: row.reaction_type,
    created_at: row.created_at,
    user: Array.isArray(row.user) ? row.user[0] ?? null : row.user ?? null,
  })) as ReactionUserRecord[]
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
