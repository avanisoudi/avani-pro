import { requireSupabase } from './supabase'
import type { ProfileRecord } from './api'

export async function updateMyProfile(userId: string, values: Pick<ProfileRecord, 'full_name' | 'username' | 'bio'> | { avatar_url: string }) {
  const { data, error } = await requireSupabase().from('profiles').update(values).eq('id', userId).select('id, username, full_name, avatar_url, bio, verified_type').single()
  if (error) throw error
  return data as ProfileRecord
}

export async function uploadProfilePhoto(userId: string, file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choisissez une image de profil.')
  if (file.size > 5 * 1024 * 1024) throw new Error('La photo doit faire moins de 5 Mo.')
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/avatar-${crypto.randomUUID()}.${extension}`
  const client = requireSupabase()
  const { error: uploadError } = await client.storage.from('avatars').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' })
  if (uploadError) throw uploadError
  const { data: publicUrl } = client.storage.from('avatars').getPublicUrl(path)
  return updateMyProfile(userId, { avatar_url: publicUrl.publicUrl })
}

export async function toggleFollow(followerId: string, followingId: string, following: boolean) {
  const client = requireSupabase()
  const result = following
    ? await client.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId)
    : await client.from('follows').insert({ follower_id: followerId, following_id: followingId })
  if (result.error) throw result.error
  return !following
}

export async function listDiscoverableProfiles(currentUserId: string) {
  const { data, error } = await requireSupabase().from('profiles').select('id, username, full_name, avatar_url, bio, verified_type').neq('id', currentUserId).order('created_at', { ascending: false }).limit(12)
  if (error) throw error
  return (data ?? []) as ProfileRecord[]
}

export async function createGroup(ownerId: string, name: string, description: string, visibility: 'private' | 'public') {
  const client = requireSupabase()
  const { data: conversation, error: conversationError } = await client.from('conversations').insert({ title: name.trim(), is_group: true, created_by: ownerId }).select('id, title, is_group, updated_at').single()
  if (conversationError) throw conversationError
  const { error: conversationMemberError } = await client.from('conversation_members').insert({ conversation_id: conversation.id, user_id: ownerId })
  if (conversationMemberError) throw conversationMemberError
  const { data, error } = await client.from('groups').insert({ owner_id: ownerId, name: name.trim(), description: description.trim() || null, visibility, conversation_id: conversation.id }).select('id, name, description, visibility, conversation_id, created_at').single()
  if (error) throw error
  const { error: memberError } = await client.from('group_members').insert({ group_id: data.id, user_id: ownerId, role: 'owner' })
  if (memberError) throw memberError
  return data
}

export async function listMyGroups(userId: string) {
  const { data, error } = await requireSupabase().from('group_members').select('group:groups(id, name, description, visibility, conversation_id, created_at, owner_id)').eq('user_id', userId)
  if (error) throw error
  return (data ?? []).map((row: any) => row.group)
}

export async function addGroupMember(groupId: string, conversationId: string, memberId: string) {
  const client = requireSupabase()
  const { error: groupError } = await client.from('group_members').insert({ group_id: groupId, user_id: memberId, role: 'member' })
  if (groupError) throw groupError
  const { error: conversationError } = await client.from('conversation_members').insert({ conversation_id: conversationId, user_id: memberId })
  if (conversationError) throw conversationError
}

export async function isAdmin(userId: string) {
  const { data, error } = await requireSupabase().from('admin_roles').select('role').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data as { role: string } | null
}

export async function getAdminStats() {
  const client = requireSupabase()
  const [users, pages, posts, reports] = await Promise.all([
    client.from('profiles').select('id', { count: 'exact', head: true }),
    client.from('pages').select('id', { count: 'exact', head: true }),
    client.from('posts').select('id', { count: 'exact', head: true }),
    client.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ])
  const error = users.error || pages.error || posts.error || reports.error
  if (error) throw error
  return { users: users.count ?? 0, pages: pages.count ?? 0, posts: posts.count ?? 0, reports: reports.count ?? 0 }
}

export type CommentRecord = { id: string; post_id: string; author_id: string; parent_id: string | null; body: string; created_at: string; author?: Pick<ProfileRecord, 'username' | 'full_name' | 'avatar_url' | 'verified_type'> }

export async function listComments(postId: string) {
  const { data, error } = await requireSupabase().from('comments').select('id, post_id, author_id, parent_id, body, created_at, author:profiles!comments_author_id_fkey(username, full_name, avatar_url, verified_type)').eq('post_id', postId).order('created_at', { ascending: true }).limit(100)
  if (error) throw error
  return (data ?? []).map((row: any) => ({ ...row, author: Array.isArray(row.author) ? row.author[0] : row.author })) as CommentRecord[]
}

export async function createComment(postId: string | number, authorId: string, body: string, parentId?: string | null) {
  const { data, error } = await requireSupabase().from('comments').insert({ post_id: String(postId), author_id: authorId, body: body.trim(), parent_id: parentId ?? null }).select('id, post_id, author_id, parent_id, body, created_at').single()
  if (error) throw error
  return data as CommentRecord
}

export async function deleteComment(commentId: string, authorId: string) {
  const { error } = await requireSupabase().from('comments').delete().eq('id', commentId).eq('author_id', authorId)
  if (error) throw error
}

export async function uploadPostImage(userId: string, file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choisissez une image pour la publication.')
  if (file.size > 10 * 1024 * 1024) throw new Error('L’image doit faire moins de 10 Mo.')
  const path = `${userId}/posts/${crypto.randomUUID()}-${file.name.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}`
  const client = requireSupabase()
  const { error } = await client.storage.from('files').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' })
  if (error) throw error
  const { data, error: signedError } = await client.storage.from('files').createSignedUrl(path, 60 * 60 * 24 * 7)
  if (signedError || !data?.signedUrl) throw signedError ?? new Error('Impossible de préparer l’image.')
  return data.signedUrl
}

export async function uploadPrivateFile(userId: string, file: File) {
  if (file.size > 50 * 1024 * 1024) throw new Error('La taille maximale est de 50 Mo.')
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-')
  const path = `${userId}/${crypto.randomUUID()}-${safeName}`
  const client = requireSupabase()
  const { error: uploadError } = await client.storage.from('files').upload(path, file, { upsert: false, contentType: file.type })
  if (uploadError) throw uploadError
  const { data, error } = await client.from('files').insert({ owner_id: userId, storage_path: path, original_name: file.name, mime_type: file.type || 'application/octet-stream', size_bytes: file.size }).select('id, original_name, storage_path, created_at').single()
  if (error) throw error
  return data
}

export type PageRecord = { id: string; owner_id: string; name: string; slug: string; category: string; description: string | null; verified: boolean; followers_count: number; created_at: string }

export async function createPage(ownerId: string, values: Pick<PageRecord, 'name' | 'slug' | 'category' | 'description'>) {
  const client = requireSupabase()
  const { data, error } = await client.from('pages').insert({ owner_id: ownerId, name: values.name.trim(), slug: values.slug.toLowerCase().trim(), category: values.category, description: values.description?.trim() || null }).select('id, owner_id, name, slug, category, description, verified, followers_count, created_at').single()
  if (error) throw error
  const { error: memberError } = await client.from('page_members').insert({ page_id: data.id, user_id: ownerId, role: 'admin' })
  if (memberError) throw memberError
  return data as PageRecord
}

export async function listMyPages(ownerId: string) {
  const { data, error } = await requireSupabase().from('pages').select('id, owner_id, name, slug, category, description, verified, followers_count, created_at').eq('owner_id', ownerId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PageRecord[]
}

export async function togglePageFollow(pageId: string, userId: string, following: boolean) {
  const client = requireSupabase()
  const result = following ? await client.from('page_followers').delete().eq('page_id', pageId).eq('user_id', userId) : await client.from('page_followers').insert({ page_id: pageId, user_id: userId })
  if (result.error) throw result.error
  return !following
}

export async function listOpenReports() {
  const { data, error } = await requireSupabase().from('reports').select('id, reason, status, post_id, comment_id, created_at').in('status', ['open', 'reviewing']).order('created_at', { ascending: false }).limit(20)
  if (error) throw error
  return data ?? []
}

export async function listAuditLogs() {
  const { data, error } = await requireSupabase().from('audit_logs').select('id, action, entity_type, entity_id, created_at').order('created_at', { ascending: false }).limit(20)
  if (error) throw error
  return data ?? []
}

export async function updateComment(commentId: string, authorId: string, body: string) {
  const { data, error } = await requireSupabase().from('comments').update({ body: body.trim(), updated_at: new Date().toISOString() }).eq('id', commentId).eq('author_id', authorId).select('id, body, updated_at').single()
  if (error) throw error
  return data as { id: string; body: string; updated_at: string }
}

export type StoryRecord = { id: string; author_id: string; media_path: string; media_type: 'image' | 'video'; caption: string | null; privacy: 'public' | 'followers' | 'private'; created_at: string; expires_at: string; author?: Pick<ProfileRecord, 'id' | 'username' | 'full_name' | 'avatar_url' | 'verified_type'>; media_url?: string }

export async function listActiveStories(userId: string) {
  const client = requireSupabase()
  const [{ data, error }, { data: follows, error: followsError }] = await Promise.all([
    client.from('stories').select('id, author_id, media_path, media_type, caption, privacy, created_at, expires_at, author:profiles!stories_author_id_fkey(id, username, full_name, avatar_url, verified_type)').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: true }).limit(100),
    client.from('follows').select('following_id').eq('follower_id', userId),
  ])
  if (error) throw error
  if (followsError) throw followsError
  const followingIds = new Set((follows ?? []).map((row: { following_id: string }) => row.following_id))
  const rows = ((data ?? []).map((row: any) => ({ ...row, author: Array.isArray(row.author) ? row.author[0] : row.author })) as StoryRecord[])
    .filter(row => row.author_id === userId || row.privacy === 'public' || (row.privacy === 'followers' && followingIds.has(row.author_id)))
  // Generate signed URLs only for stories the current user is allowed to see.
  const paths = [...new Set(rows.map(row => row.media_path))]
  const signed = await Promise.all(paths.map(async path => {
    const result = await client.storage.from('story-media').createSignedUrl(path, 60 * 60)
    return [path, result.data?.signedUrl ?? null] as const
  }))
  const urls = new Map(signed)
  return rows.map(row => ({ ...row, media_url: urls.get(row.media_path) ?? undefined }))
}

export async function createStory(userId: string, file: File, caption: string, privacy: 'public' | 'followers' | 'private') {
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) throw new Error('Choisissez une photo ou une vidéo.')
  if (file.size > 50 * 1024 * 1024) throw new Error('La story doit faire moins de 50 Mo.')
  const extension = file.name.split('.').pop()?.toLowerCase() || (file.type.startsWith('video/') ? 'mp4' : 'jpg')
  const path = userId + '/' + crypto.randomUUID() + '.' + extension
  const client = requireSupabase()
  const { error: uploadError } = await client.storage.from('story-media').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' })
  if (uploadError) throw uploadError
  const { data, error } = await client.from('stories').insert({ author_id: userId, media_path: path, media_type: file.type.startsWith('video/') ? 'video' : 'image', caption: caption.trim() || null, privacy }).select('id, author_id, media_path, media_type, caption, privacy, created_at, expires_at').single()
  if (error) { await client.storage.from('story-media').remove([path]); throw error }
  return data as StoryRecord
}

export async function deleteStory(storyId: string, userId: string) {
  const client = requireSupabase()
  const { data, error } = await client.from('stories').select('media_path').eq('id', storyId).eq('author_id', userId).single()
  if (error) throw error
  const { error: deleteError } = await client.from('stories').delete().eq('id', storyId).eq('author_id', userId)
  if (deleteError) throw deleteError
  await client.storage.from('story-media').remove([data.media_path])
}

export async function listFollowingIds(userId: string) {
  const { data, error } = await requireSupabase().from('follows').select('following_id').eq('follower_id', userId)
  if (error) throw error
  return (data ?? []).map((row: any) => row.following_id as string)
}

export async function getFeatureFlags() {
  const { data, error } = await requireSupabase().from('feature_flags').select('key, enabled, description')
  if (error) throw error
  return (data ?? []) as Array<{ key: string; enabled: boolean; description: string | null }>
}

export async function getMySettings(userId: string) {
  const client = requireSupabase()
  const { data, error } = await client.from('user_settings').select('user_id, profile_visibility, message_permission, mention_permission, story_visibility, appearance, language, notification_preferences, updated_at').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data
}

export async function saveMySettings(userId: string, values: Record<string, unknown>) {
  const { data, error } = await requireSupabase().from('user_settings').upsert({ user_id: userId, ...values, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select().single()
  if (error) throw error
  return data
}
