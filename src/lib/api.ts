import type { User } from '@supabase/supabase-js'
import { requireSupabase } from './supabase'
import { describeAccessError, isCheckConstraintError, isMissingColumnError, isMissingRelationError, isPermissionError } from './postgres'
import type { QueryError } from './postgres'
import { resolvePostMediaPaths } from './postMedia'
import { conversationFromMembershipRow, conversationFromRow, conversationPreview, messageFromRow, nextTolerantToken, publicGroupFromRow, tokenName } from './messagesModel'
import type { ConversationPreview } from './messagesModel'
import type { PublicGroupModel } from './messagesModel'

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
  sender?: Pick<ProfileRecord, 'id' | 'username' | 'full_name' | 'avatar_url'>
  reply_to?: Pick<MessageRecord, 'id' | 'body' | 'sender_id'> | null
}
export type ConversationRecord = { id: string; title: string | null; is_group: boolean; updated_at: string; created_by?: string; last_read_at?: string | null; conversation_members?: { user_id: string; profile: ProfileRecord | null }[] }

export const MESSAGE_ATTACHMENT_BUCKET = 'message-attachments'
export const MAX_MESSAGE_ATTACHMENT_BYTES = 25 * 1024 * 1024

export async function uploadMessageAttachment(conversationId: string, userId: string, file: File) {
  if (file.size <= 0 || file.size > MAX_MESSAGE_ATTACHMENT_BYTES) throw new Error('La pièce jointe doit faire au maximum 25 Mo.')
  if (!file.type || (!file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.startsWith('audio/') && file.type !== 'application/pdf' && !file.type.startsWith('text/'))) throw new Error('Type de fichier non pris en charge. Utilisez une image, une vidéo, un audio, un PDF ou un fichier texte.')
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

/** Colonnes de conversation garanties par les migrations 001 et 006 du dépôt. */
const CONVERSATION_COLUMNS = 'id, title, is_group, updated_at, created_by'

/**
 * Rejoue une requête en retirant, une à une, les colonnes (ou relations) que la
 * base ne connaît pas encore. `optional` est la liste des jetons acceptant de
 * manquer : une erreur sur un jeton obligatoire est remontée telle quelle.
 * C’est ce qui permet à la messagerie de rester utilisable sur une base dont le
 * schéma a quelques années, sans jamais inventer de donnée.
 */
async function retryWithoutMissing<T>(options: {
  attempt: (tokens: string[]) => PromiseLike<{ data: T[] | null; error?: QueryError }>
  optional: string[]
}): Promise<{ rows: T[]; missing: string[] }> {
  const missing: string[] = []
  let tokens = [...options.optional]
  for (;;) {
    const { data, error } = await options.attempt(tokens)
    if (!error) return { rows: data ?? [], missing }
    const offender = nextTolerantToken(error, tokens, missing)
    if (!offender) throw error
    missing.push(tokenName(offender))
    tokens = tokens.filter(token => token !== offender)
  }
}

/** Version insert du même principe : on retire la clé refusée puis on retente. */
async function insertWithoutMissing(table: string, payload: Record<string, unknown>, select: string, optionalKeys: string[]) {
  const client = requireSupabase()
  const dropped: string[] = []
  let current: Record<string, unknown> = { ...payload }
  for (;;) {
    const result = await client.from(table).insert(current).select(select).single()
    if (!result.error) return result.data
    const offender = optionalKeys.find(key => key in current && !dropped.includes(key) && isMissingColumnError(result.error, key))
    if (!offender) throw result.error
    dropped.push(offender)
    current = { ...current }
    delete current[offender]
  }
}

/** Traduit en français les refus de structure et d’accès, avec le remède. */
function writeError(error: unknown, action: string): Error {
  const explained = describeAccessError(error as Parameters<typeof describeAccessError>[0], action)
  return new Error(explained ?? (error instanceof Error ? error.message : `${action} impossible.`))
}

export type PublicGroupRecord = PublicGroupModel
export type JoinGroupResult = { group: PublicGroupRecord; conversation: ConversationRecord | null; note: string | null }

/**
 * Conversations de l’utilisateur, triées par activité. Seules les colonnes réellement
 * portées par `conversations` (migration 001) sont demandées : rien n’est simulé côté
 * client, et le tri s’appuie sur `updated_at` que le trigger 009 fait avancer.
 */
export async function listConversations(userId: string) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('conversation_members')
    .select(`last_read_at, conversation:conversations(${CONVERSATION_COLUMNS}), profile:profiles(id, username, full_name, avatar_url, bio, verified_type)`)
    .eq('user_id', userId)
  if (error) throw new Error(describeAccessError(error, 'La liste de tes conversations') ?? error.message)
  const rows = (data ?? []) as any[]
  return rows
    .map(conversationFromMembershipRow)
    .filter((conversation): conversation is ConversationRecord => Boolean(conversation))
}

/**
 * Aperçus de la liste de gauche : une seule requête « messages » pour toutes les
 * conversations visibles (les plus récents d'abord), d'où l'aperçu, l'heure et le
 * nombre de non-lus. `limit` borne la lecture : au-delà, le badge est marqué
 * tronqué par le modèle plutôt que de mentir sur le total.
 */
export async function listConversationPreviews(userId: string, conversations: Array<Pick<ConversationRecord, 'id' | 'last_read_at'>>, limit = 150) {
  const ids = conversations.map(item => item.id).filter(Boolean)
  if (!ids.length) return {} as Record<string, ConversationPreview>
  const client = requireSupabase()
  let loaded: any[]
  try {
    loaded = (await retryWithoutMissing<any>({
      optional: ['deleted_at', 'message_type', 'attachment_name'],
      attempt: tokens => client
        .from('messages')
        .select(['id, conversation_id, sender_id, body, created_at', ...tokens].join(', '))
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
        .limit(limit),
    })).rows as any[]
  } catch (caught) {
    throw writeError(caught, 'L’aperçu des conversations')
  }
  const buckets = new Map<string, any[]>()
  for (const row of loaded) {
    const list = buckets.get(row.conversation_id)
    if (list) list.push(row)
    else buckets.set(row.conversation_id, [row])
  }
  const truncated = loaded.length >= limit
  return Object.fromEntries(conversations.map(item => [
    item.id,
    conversationPreview(buckets.get(item.id) ?? [], { lastReadAt: item.last_read_at ?? null, myId: userId, truncated }),
  ])) as Record<string, ConversationPreview>
}

/**
 * Groupes publics réels : la liste vient de la table `groups` (visibilité
 * publique) avec un comptage de membres agrégé, plus de carte décorative.
 */
export async function listPublicGroups(limit = 12) {
  const client = requireSupabase()
  const { rows } = await retryWithoutMissing<any>({
    optional: ['conversation_id', 'group_members(count)'],
    attempt: tokens => client
      .from('groups')
      .select(['id, name, description, created_at', ...tokens].join(', '))
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(limit),
  })
  return (rows as any[]).map(row => publicGroupFromRow(row) as PublicGroupRecord)
}

/**
 * Rejoint un groupe public, puis son chat. L’adhésion au groupe et l’ouverture
 * du chat sont deux droits distincts en RLS : si le second est refusé, le
 * résultat le dit explicitement au lieu de faire semblant.
 */
export async function joinPublicGroup(userId: string, groupId: string): Promise<JoinGroupResult> {
  const client = requireSupabase()
  const { data: group, error } = await client
    .from('groups')
    .select('id, name, description, conversation_id, created_at')
    .eq('id', groupId)
    .eq('visibility', 'public')
    .maybeSingle()
  if (error) throw writeError(error, 'La lecture du groupe public')
  if (!group) throw new Error('Ce groupe public est introuvable ou n’accepte plus les rejoignements.')
  const record = group as PublicGroupRecord

  const membership = await client.from('group_members').upsert({ group_id: groupId, user_id: userId, role: 'member' }, { onConflict: 'group_id,user_id', ignoreDuplicates: true })
  if (membership.error) throw writeError(membership.error, 'Le rejoint du groupe')

  if (!record.conversation_id) {
    return { group: record, conversation: null, note: 'Groupe rejoint. Son fil de discussion reste à créer : la colonne groups.conversation_id (migration 006) manque à la base.' }
  }
  const conversationMember = await client.from('conversation_members').upsert({ conversation_id: record.conversation_id, user_id: userId }, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true })
  if (conversationMember.error) {
    return { group: record, conversation: null, note: `Groupe rejoint, mais le chat reste fermé : ${conversationMember.error.message ?? 'règles d’accès.'} (la migration 009 ajoute la policy de rejoint public).` }
  }
  const { data: conversation } = await client.from('conversations').select(CONVERSATION_COLUMNS).eq('id', record.conversation_id).maybeSingle()
  return { group: record, conversation: (conversationFromRow(conversation) as ConversationRecord | null) ?? null, note: null }
}

const MESSAGE_REQUIRED = 'id, conversation_id, sender_id, body, attachment_path, created_at, sender:profiles!messages_sender_id_fkey(id, username, full_name, avatar_url)'
const MESSAGE_OPTIONAL = [
  'edited_at',
  'updated_at',
  'deleted_at',
  'message_type',
  'attachment_name',
  'attachment_mime_type',
  'attachment_size_bytes',
  'reply_to:messages!messages_reply_to_id_fkey(id, body, sender_id)',
]

/** Historique d’une conversation, du plus ancien au plus récent. */
export async function listMessages(conversationId: string, before?: string, limit = 50) {
  const client = requireSupabase()
  const { rows } = await retryWithoutMissing<any>({
    optional: MESSAGE_OPTIONAL,
    attempt: async tokens => {
      let query = client.from('messages')
        .select([MESSAGE_REQUIRED, ...tokens].join(', '))
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (before) query = query.lt('created_at', before)
      return await query
    },
  })
  return (rows as any[]).reverse().map((row: any) => messageFromRow<MessageRecord>(row))
}

/**
 * Envoi réel : les colonnes d’options que la base ne porte pas sont abandonnées
 * une à une (pièces jointes, réponse, type), le message part quand même.
 */
export async function sendMessage(conversationId: string, senderId: string, body: string, options?: { replyToId?: string | null; messageType?: MessageRecord['message_type']; attachmentPath?: string | null; attachmentName?: string | null; attachmentMimeType?: string | null; attachmentSizeBytes?: number | null }) {
  const content = body.trim()
  if (!content && !options?.attachmentPath) throw new Error('Un message ne peut pas être vide.')
  if (content.length > 10000) throw new Error('Le message est trop long.')
  const payload: Record<string, unknown> = {
    conversation_id: conversationId,
    sender_id: senderId,
    // La contrainte historique exige au moins un caractère : une pièce jointe
    // seule est donc accompagnée d’un libellé, jamais d’une chaîne vide.
    body: content || `Pièce jointe : ${options?.attachmentName || 'fichier'}`,
    attachment_path: options?.attachmentPath ?? null,
    reply_to_id: options?.replyToId ?? null,
    message_type: options?.messageType ?? 'text',
    attachment_name: options?.attachmentName ?? null,
    attachment_mime_type: options?.attachmentMimeType ?? null,
    attachment_size_bytes: options?.attachmentSizeBytes ?? null,
  }
  try {
    const data = await insertWithoutMissing('messages', payload, '*', ['reply_to_id', 'message_type', 'attachment_path', 'attachment_name', 'attachment_mime_type', 'attachment_size_bytes'])
    return messageFromRow<MessageRecord>(data as any)
  } catch (error) {
    if (isMissingColumnError(error as QueryError, 'attachment_path')) {
      // Base très ancienne sans pièces jointes : le texte part quand même.
      const withoutAttachment = { ...payload }
      delete withoutAttachment.attachment_path
      const data = await insertWithoutMissing('messages', withoutAttachment, '*', ['reply_to_id', 'message_type'])
      return messageFromRow<MessageRecord>(data as any)
    }
    throw writeError(error, 'L’envoi du message')
  }
}

/** Marque lu : droit accessoire, un refus de RLS ne doit pas casser la conversation. */
export async function markConversationRead(conversationId: string, userId: string) {
  const { error } = await requireSupabase().from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('user_id', userId)
  if (!error) return true
  if (isPermissionError(error) || isMissingColumnError(error, 'last_read_at')) return false
  throw writeError(error, 'Le marquage « lu »')
}

export async function updateMessage(messageId: string, senderId: string, body: string) {
  const content = body.trim()
  if (!content || content.length > 10000) throw new Error('Message invalide.')
  const client = requireSupabase()
  const stamped = { body: content, edited_at: new Date().toISOString() }
  let result = await client.from('messages').update(stamped).eq('id', messageId).eq('sender_id', senderId).select('id, body, edited_at').single()
  if (result.error && isMissingColumnError(result.error, 'edited_at')) {
    result = await client.from('messages').update({ body: content }).eq('id', messageId).eq('sender_id', senderId).select('id, body').single()
  }
  if (result.error) throw writeError(result.error, 'La modification du message')
  return result.data as Pick<MessageRecord, 'id' | 'body'> & { edited_at?: string | null }
}

/** Suppression logique : le corps est vidé, ce que l’ancienne contrainte refusait. */
export async function deleteMessage(messageId: string, senderId: string) {
  const client = requireSupabase()
  const stamp = { body: '', deleted_at: new Date().toISOString() }
  let result = await client.from('messages').update(stamp).eq('id', messageId).eq('sender_id', senderId).select('id, body, deleted_at, updated_at').single()
  if (result.error && isMissingColumnError(result.error, 'deleted_at')) {
    result = await client.from('messages').update({ body: ' ' }).eq('id', messageId).eq('sender_id', senderId).select('id, body').single()
  } else if (result.error && isCheckConstraintError(result.error, 'messages_body_check')) {
    result = await client.from('messages').update({ ...stamp, body: ' ' }).eq('id', messageId).eq('sender_id', senderId).select('id, body, deleted_at').single()
  }
  if (result.error) throw writeError(result.error, 'La suppression du message')
  return result.data as Pick<MessageRecord, 'id' | 'body' | 'deleted_at' | 'updated_at'>
}

let reactionsSupport: boolean | null = null

/**
 * `message_reactions` n’est créée par aucune migration historique : on le détecte
 * une fois par session pour proposer (ou non) les réactions, au lieu d’échouer
 * à chaque ouverture de conversation.
 */
export async function messageReactionsSupported() {
  if (reactionsSupport !== null) return reactionsSupport
  const { error } = await requireSupabase().from('message_reactions').select('message_id', { head: true, count: 'exact' }).limit(1)
  reactionsSupport = !error || !(isMissingRelationError(error, 'message_reactions') || isMissingColumnError(error, 'message_reactions'))
  return reactionsSupport
}

export async function listMessageReactions(messageIds: string[]) {
  if (!messageIds.length) return []
  if (!(await messageReactionsSupported())) return []
  const { data, error } = await requireSupabase().from('message_reactions').select('message_id, user_id, reaction_type, created_at').in('message_id', messageIds)
  if (error) {
    if (isMissingRelationError(error, 'message_reactions') || isPermissionError(error)) {
      reactionsSupport = false
      return []
    }
    throw writeError(error, 'La lecture des réactions')
  }
  return (data ?? []) as Array<{ message_id: string; user_id: string; reaction_type: ReactionType; created_at: string }>
}

export async function setMessageReaction(messageId: string, userId: string, reaction: ReactionType | null) {
  if (!(await messageReactionsSupported())) throw new Error('Les réactions de messages ne sont pas activées dans cette base : exécute supabase/migrations/009_messages_live.sql.')
  const client = requireSupabase()
  const result = reaction
    ? await client.from('message_reactions').upsert({ message_id: messageId, user_id: userId, reaction_type: reaction }, { onConflict: 'message_id,user_id' })
    : await client.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', userId)
  if (result.error) throw writeError(result.error, 'La réaction du message')
  return reaction
}

/**
 * Profils par identifiants : sert à nommer proprement les messages qui arrivent
 * en direct (l’événement Realtime ne porte que la ligne `messages`).
 */
export async function listProfilesByIds(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return []
  const { data, error } = await requireSupabase().from('profiles').select('id, username, full_name, avatar_url, bio, verified_type').in('id', ids)
  if (error) throw error
  return (data ?? []) as ProfileRecord[]
}

export async function searchMessageContacts(userId: string, query: string) {
  const client = requireSupabase()
  const term = query.trim().replace(/[,%_().\\"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
  let request = client.from('profiles').select('id, username, full_name, avatar_url, bio, verified_type').neq('id', userId).order('full_name').limit(20)
  if (term) request = request.or(`full_name.ilike.%${term}%,username.ilike.%${term}%`)
  const { data, error } = await request
  if (error) throw error
  return (data ?? []) as ProfileRecord[]
}

async function getConversation(client: ReturnType<typeof requireSupabase>, conversationId: string) {
  const { data, error } = await client.from('conversations').select(CONVERSATION_COLUMNS).eq('id', conversationId).single()
  if (error) throw writeError(error, 'La conversation créée')
  const conversation = conversationFromRow(data)
  if (!conversation) throw new Error('La conversation créée est introuvable : vérifie les règles d’accès de la table conversations.')
  return conversation as ConversationRecord
}

async function createChat(title: string, group: boolean, memberIds: string[]) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('avani_create_chat', { p_title: title.trim(), p_group: group, p_members: [...new Set(memberIds)] })
  if (error) throw new Error(error.code === 'PGRST202' ? 'La migration 013_conversation_management.sql doit être appliquée pour créer les discussions.' : error.message)
  return getConversation(client, data as string)
}

export async function createGroupConversation(userId: string, title: string, memberIds: string[]) {
  return createChat(title, true, memberIds.filter(id => id !== userId))
}

export async function createDirectConversation(userId: string, contactId: string, contactName: string) {
  if (!contactId || contactId === userId) throw new Error('Profil destinataire invalide.')
  return createChat(contactName, false, [contactId])
}

export async function manageChat(chatId: string, action: 'rename' | 'add' | 'remove' | 'transfer' | 'leave', target?: string, title?: string) {
  const { error } = await requireSupabase().rpc('avani_manage_chat', { p_chat: chatId, p_action: action, p_target: target ?? null, p_title: title ?? null })
  if (error) throw new Error(error.code === 'PGRST202' ? 'La migration 013_conversation_management.sql doit être appliquée pour gérer les groupes.' : error.message)
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
/**
 * Lignes de réactions des publications du fil. `ids` restreint la requête aux
 * publications affichées : on ne lit jamais la table `likes` en entier.
 */
async function listLikeRows(client: ReturnType<typeof requireSupabase>, ids: string[] = []) {
  const detailedQuery = ids.length
    ? client.from('likes').select('post_id, user_id, reaction_type').in('post_id', ids)
    : client.from('likes').select('post_id, user_id, reaction_type')
  const detailed = await detailedQuery
  if (!detailed.error) return (detailed.data ?? []) as LikeRow[]
  if (!isMissingColumnError(detailed.error, 'reaction_type')) throw detailed.error
  const plain = await (ids.length ? client.from('likes').select('post_id, user_id').in('post_id', ids) : client.from('likes').select('post_id, user_id'))
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

export async function listFeedPosts(userId?: string | null): Promise<FeedPostRecord[]> {
  const client = requireSupabase()
  const { data: posts, error: postsError } = await selectFeedPosts(client)
  if (postsError) throw postsError
  const rows = (posts ?? []) as any[]
  if (rows.length === 0) return []
  // Compteurs restreints aux publications affichées (aucune lecture complète des tables).
  const ids = rows.map(row => row.id)
  const [likeRows, { data: comments, error: commentsError }, { data: shares, error: sharesError }, savedResult] = await Promise.all([
    listLikeRows(client, ids),
    client.from('comments').select('post_id').in('post_id', ids),
    client.from('post_shares').select('post_id').in('post_id', ids),
    userId ? client.from('saved_posts').select('post_id').eq('user_id', userId).in('post_id', ids) : Promise.resolve({ data: [], error: null }),
  ])
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

/** Read actual members under the signed-in user's RLS policies. */
export async function listConversationMembers(conversationId: string): Promise<ProfileRecord[]> {
  const { data, error } = await requireSupabase().from('conversation_members').select('user_id').eq('conversation_id', conversationId)
  if (error) throw error
  return listProfilesByIds((data ?? []).map(row => row.user_id))
}
