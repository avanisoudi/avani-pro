import { requireSupabase } from './supabase'
import { describeAccessError, isMissingColumnError, isMissingRelationError, isPermissionError } from './postgres'
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

/**
 * Groupe + conversation de chat. Tout est réel : si la base ne peut pas porter la
 * conversation liée (colonne `groups.conversation_id` absente, migration 006 non
 * appliquée), le groupe est quand même créé et le message le dit explicitement.
 */
export async function createGroup(ownerId: string, name: string, description: string, visibility: 'private' | 'public') {
  const client = requireSupabase()
  const groupName = name.trim()
  if (groupName.length < 2) throw new Error('Un groupe porte un nom d’au moins 2 caractères.')
  const { data: conversation, error: conversationError } = await client
    .from('conversations')
    .insert({ title: groupName, is_group: true, created_by: ownerId })
    .select('id, title, is_group, updated_at')
    .single()
  if (conversationError) throw new Error(describeAccessError(conversationError, 'La création du chat de groupe') ?? conversationError.message)
  const conversationId = (conversation as { id: string }).id
  const { error: conversationMemberError } = await client.from('conversation_members').insert({ conversation_id: conversationId, user_id: ownerId })
  if (conversationMemberError) {
    await client.from('conversations').delete().eq('id', conversationId).eq('created_by', ownerId)
    throw new Error(describeAccessError(conversationMemberError, 'L’ajout au chat de groupe') ?? conversationMemberError.message)
  }
  const payload: Record<string, unknown> = { owner_id: ownerId, name: groupName, description: description.trim() || null, visibility, conversation_id: conversationId }
  const attempt = await client.from('groups').insert(payload).select('id, name, description, visibility, conversation_id, created_at').single()
  if (attempt.error) {
    // Base sans la colonne de liaison : le groupe est créé sans chat plutôt que de refuser la création.
    if (isMissingColumnError(attempt.error, 'conversation_id')) {
      delete payload.conversation_id
      const fallback = await client.from('groups').insert(payload).select('id, name, description, visibility, created_at').single()
      if (fallback.error) throw new Error(describeAccessError(fallback.error, 'La création du groupe') ?? fallback.error.message)
      await client.from('conversation_members').delete().eq('conversation_id', conversationId).eq('user_id', ownerId)
      await client.from('conversations').delete().eq('id', conversationId).eq('created_by', ownerId)
      return { ...(fallback.data as Record<string, unknown>), conversation_id: null, chat_note: 'Groupe créé sans chat : la colonne groups.conversation_id (migration 006) manque à la base.' }
    }
    throw new Error(describeAccessError(attempt.error, 'La création du groupe') ?? attempt.error.message)
  }
  const group = attempt.data as Record<string, unknown>
  const { error: memberError } = await client.from('group_members').insert({ group_id: group.id, user_id: ownerId, role: 'owner' })
  if (memberError) throw new Error(describeAccessError(memberError, 'L’ajout du fondateur au groupe') ?? memberError.message)
  return group
}

/** Mes groupes : la liaison de chat est optionnelle, la liste doit rester affichable. */
export async function listMyGroups(userId: string) {
  const client = requireSupabase()
  const attempt = await client
    .from('group_members')
    .select('role, joined_at, group:groups(id, name, description, visibility, conversation_id, created_at, owner_id)')
    .eq('user_id', userId)
  let rows = attempt.data as any[] | null
  if (attempt.error) {
    if (!isMissingColumnError(attempt.error, 'conversation_id')) throw new Error(describeAccessError(attempt.error, 'La liste de tes groupes') ?? attempt.error.message)
    const fallback = await client
      .from('group_members')
      .select('role, joined_at, group:groups(id, name, description, visibility, created_at, owner_id)')
      .eq('user_id', userId)
    if (fallback.error) throw new Error(describeAccessError(fallback.error, 'La liste de tes groupes') ?? fallback.error.message)
    rows = fallback.data as any[]
  }
  return (rows ?? [])
    .map((row: any) => {
      const group = Array.isArray(row.group) ? row.group[0] : row.group
      if (!group || !group.id) return null
      return { ...group, role: row.role ?? 'member', joined_at: row.joined_at ?? null }
    })
    .filter(Boolean) as Array<Record<string, unknown> & { id: string; role: string }>
}

/** Ajoute un membre au groupe et à son chat, en un seul message d’erreur si le chat refuse. */
export async function addGroupMember(groupId: string, conversationId: string | null, memberId: string) {
  const client = requireSupabase()
  const { error: groupError } = await client.from('group_members').upsert({ group_id: groupId, user_id: memberId, role: 'member' }, { onConflict: 'group_id,user_id', ignoreDuplicates: true })
  if (groupError) throw new Error(describeAccessError(groupError, 'L’invitation au groupe') ?? groupError.message)
  if (!conversationId) return { chatJoined: false, note: 'Membre ajouté au groupe. Ce groupe n’a pas encore de chat associé (migration 006).' }
  const { error: conversationError } = await client.from('conversation_members').upsert({ conversation_id: conversationId, user_id: memberId }, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true })
  if (conversationError) {
    return { chatJoined: false, note: `Membre ajouté au groupe, mais pas à son chat : ${describeAccessError(conversationError, 'L’ajout au chat') ?? conversationError.message}` }
  }
  return { chatJoined: true, note: null }
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
export type CommentListResult = { comments: CommentRecord[]; total: number; repliesSupported: boolean }

const COMMENT_SELECT = 'id, post_id, author_id, parent_id, body, created_at, author:profiles!comments_author_id_fkey(username, full_name, avatar_url, verified_type)'
const COMMENT_SELECT_WITHOUT_PARENT = 'id, post_id, author_id, body, created_at, author:profiles!comments_author_id_fkey(username, full_name, avatar_url, verified_type)'

function toCommentRecord(row: Record<string, unknown>): CommentRecord {
  const author = Array.isArray(row.author) ? row.author[0] : row.author
  return {
    id: String(row.id ?? crypto.randomUUID()),
    post_id: String(row.post_id ?? ''),
    author_id: String(row.author_id ?? ''),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    body: String(row.body ?? ''),
    created_at: String(row.created_at ?? new Date().toISOString()),
    author: (author as CommentRecord['author']) ?? undefined,
  }
}

/**
 * Commentaire d’une publication : liste paginée côté client (100 lignes) et
 * total exact renvoyé par PostgREST. Si la base ne connaît pas encore la colonne
 * `parent_id`, la requête est rejouée sans elle au lieu de faire échouer l’ouverture des commentaires.
 */
export async function listComments(postId: string): Promise<CommentListResult> {
  const client = requireSupabase()
  const request = (columns: string) =>
    client.from('comments').select(columns, { count: 'exact' }).eq('post_id', postId).order('created_at', { ascending: true }).limit(100)
  const withParents = await request(COMMENT_SELECT)
  if (withParents.error && isMissingColumnError(withParents.error, 'parent_id')) {
    const withoutParents = await request(COMMENT_SELECT_WITHOUT_PARENT)
    if (withoutParents.error) throw withoutParents.error
    const comments = ((withoutParents.data ?? []) as unknown as Array<Record<string, unknown>>).map(toCommentRecord)
    return { comments, total: Math.max(withoutParents.count ?? 0, comments.length), repliesSupported: false }
  }
  if (withParents.error) throw withParents.error
  const comments = ((withParents.data ?? []) as unknown as Array<Record<string, unknown>>).map(toCommentRecord)
  return { comments, total: Math.max(withParents.count ?? 0, comments.length), repliesSupported: true }
}

export async function createComment(postId: string | number, authorId: string, body: string, parentId?: string | null) {
  const content = body.trim()
  if (!content) throw new Error('Écrivez votre commentaire avant de l’envoyer.')
  if (content.length > 2000) throw new Error('Le commentaire dépasse 2 000 caractères.')
  const client = requireSupabase()
  const payload: Record<string, unknown> = { post_id: String(postId), author_id: authorId, body: content }
  if (parentId) payload.parent_id = parentId
  const attempt = await client.from('comments').insert(payload).select('*').single()
  if (!attempt.error) return toCommentRecord((attempt.data ?? {}) as unknown as Record<string, unknown>)
  if (parentId && isMissingColumnError(attempt.error, 'parent_id')) {
    const withoutParent = { ...payload }
    delete withoutParent.parent_id
    const fallback = await client.from('comments').insert(withoutParent).select('*').single()
    if (fallback.error) throw fallback.error
    return toCommentRecord((fallback.data ?? {}) as unknown as Record<string, unknown>)
  }
  throw attempt.error
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
    // Une story dure 24 h : le lien doit rester valable toute la durée de vie de la story.
    const result = await client.storage.from('story-media').createSignedUrl(path, 60 * 60 * 24)
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

/* ---------------------------------------------------------------------------
 * Drapeaux de fonctionnalité et vues de stories.
 *
 * Ces deux surfaces étaient jusqu'ici réclamées par le client sans qu'aucune
 * migration du dépôt ne les crée : elles sont donc traitées comme « optionnelles,
 * mais jamais silencieuses ». Une table absente se dit, avec le nom du fichier à
 * exécuter ; elle n'est jamais maquillée en « tout désactivé » ou en compteur à zéro.
 * ------------------------------------------------------------------------- */
export type FeatureFlag = { key: string; enabled: boolean; description: string | null }

/** État des lieux des drapeaux. `note` explique ce qui manque, sans jeter l'erreur au visage du fil. */
export async function readFeatureFlags(): Promise<{ flags: FeatureFlag[]; note: string | null }> {
  const client = requireSupabase()
  const { data, error } = await client.from('feature_flags').select('key, enabled, description').order('key')
  if (!error) return { flags: (data ?? []) as FeatureFlag[], note: null }
  if (isMissingRelationError(error, 'feature_flags')) {
    return { flags: [], note: 'Aucun drapeau en base : la table `feature_flags` est créée par `supabase/migrations/011_feature_flags.sql`. Toutes les fonctions restent ouvertes en attendant.' }
  }
  if (isPermissionError(error)) {
    return { flags: [], note: describeAccessError(error, 'Les drapeaux de fonctionnalité ne peuvent pas être lus', '011_feature_flags.sql') ?? 'Lecture des drapeaux refusée par les règles d’accès (RLS).' }
  }
  throw error
}

/**
 * Écriture réservée à l'administration (policy `only admin can write feature flags`).
 * L'échec est renvoyé tel quel, en français, pour être affiché : un drapeau qui ne
 * s'enregistre pas doit se voir.
 */
export async function setFeatureFlag(key: string, enabled: boolean): Promise<{ error: string | null }> {
  const client = requireSupabase()
  const { error } = await client.from('feature_flags').upsert({ key, enabled, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (!error) return { error: null }
  if (isMissingRelationError(error, 'feature_flags')) return { error: 'Impossible d’enregistrer ce drapeau : exécute d’abord `supabase/migrations/011_feature_flags.sql` dans le SQL Editor.' }
  if (isPermissionError(error)) return { error: 'Seule l’administration peut activer ou couper une fonctionnalité (policy RLS de `feature_flags`).' }
  return { error: describeAccessError(error, 'Ce drapeau n’a pas pu être enregistré', '011_feature_flags.sql') ?? (error.message || 'Échec d’enregistrement du drapeau.') }
}

export type StoryEngagement = { counts: Record<string, number>; note: string | null }

/**
 * Vues de stories, par identifiant. `story_views` est optionnelle : si elle manque,
 * `counts` reste vide et `note` le explique — les panneaux affichent alors « indisponibles »
 * au lieu d'un zéro qui ferait croire que personne n'a regardé.
 */
export async function listStoryViewCounts(storyIds: string[]): Promise<StoryEngagement> {
  if (storyIds.length === 0) return { counts: {}, note: null }
  const client = requireSupabase()
  const { data, error } = await client.from('story_views').select('story_id').in('story_id', storyIds)
  if (error) {
    if (isMissingRelationError(error, 'story_views')) return { counts: {}, note: 'Compteur de vues hors service : la table `story_views` est créée par `supabase/migrations/010_stories.sql`.' }
    if (isPermissionError(error)) return { counts: {}, note: describeAccessError(error, 'Les vues de stories ne peuvent pas être lues', '010_stories.sql') ?? 'Lecture des vues refusée par les règles d’accès.' }
    throw error
  }
  const counts = ((data ?? []) as Array<{ story_id: string }>).reduce<Record<string, number>>((all, row) => {
    all[row.story_id] = (all[row.story_id] ?? 0) + 1
    return all
  }, {})
  return { counts, note: null }
}

/** Marque une vue, une seule fois par appareil et par story (contrainte unique de 010). */
export async function viewStory(storyId: string, userId: string) {
  const client = requireSupabase()
  const { error } = await client.from('story_views').insert({ story_id: storyId, viewer_id: userId })
  if (!error) return true
  // Doublon de vue : la contrainte unique fait son travail, ce n'est pas une erreur à montrer.
  if (error.code === '23505' || /duplicate key/i.test(error.message ?? '')) return true
  if (isMissingRelationError(error, 'story_views')) return false
  throw error
}

/**
 * Archive personnelle : MES stories, y compris expirées — `listActiveStories` ne rend que
 * ce qui est encore en avant sur le fil. Rien n'est supprimé en base à l'expiration, seule
 * la fenêtre de lecture change, ce qui est exactement ce que ce panneau affiche.
 */
export async function listMyStoryArchive(userId: string): Promise<StoryRecord[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('stories')
    .select('id, author_id, media_path, media_type, caption, privacy, created_at, expires_at')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(60)
  if (error) throw error
  return (data ?? []) as StoryRecord[]
}

/**
 * Stories déjà vues par moi, parmi `storyIds`. Sans cette lecture, l'anneau « à ne pas
 * manquer » serait décoratif : il serait posé sur toutes les bagues à chaque ouverture.
 * Ici, il vient de `story_views`, et une vue enregistrée à l'instant disparaît de la liste
 * au rechargement suivant.
 */
export async function listMyStoryViews(userId: string, storyIds: string[]): Promise<{ seen: string[]; note: string | null }> {
  if (storyIds.length === 0) return { seen: [], note: null }
  const client = requireSupabase()
  const { data, error } = await client.from('story_views').select('story_id').eq('viewer_id', userId).in('story_id', storyIds)
  if (error) {
    if (isMissingRelationError(error, 'story_views')) return { seen: [], note: 'Anneaux « à voir » indisponibles : la table `story_views` est créée par `supabase/migrations/010_stories.sql`.' }
    if (isPermissionError(error)) return { seen: [], note: describeAccessError(error, 'Mes vues de stories ne peuvent pas être relues', '010_stories.sql') ?? 'Lecture de mes vues refusée par les règles d’accès.' }
    throw error
  }
  return { seen: ((data ?? []) as Array<{ story_id: string }>).map(row => row.story_id), note: null }
}
