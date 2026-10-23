/**
 * Mappers purs entre une ligne PostgREST et les modèles de la messagerie et des
 * groupes. Ils sont volontairement sans dépendance : testables avec `npm run
 * test:feed`, et utilisés par l’API comme par les écrans.
 */

/** `reply_to:messages!fkey(id, body)` -> `reply_to` : le nom que PostgREST cite dans ses erreurs. */
export function tokenName(token: string) {
  return token.split('(')[0].split(':')[0].split('!')[0].trim()
}

/**
 * Prochain jeton à abandonner quand une requête échoue : on ne retire que ce qui
 * est explicitement signalé par la base et qui n’a pas déjà été retiré.
 * `null` = il faut remonter l’erreur (colonne obligatoire, RLS, autre problème).
 */
export function nextTolerantToken(error: unknown, tokens: string[], alreadyMissing: string[]): string | null {
  if (!error) return null
  const text = `${(error as { message?: unknown }).message ?? ''} ${(error as { details?: unknown }).details ?? ''} ${(error as { hint?: unknown }).hint ?? ''}`.toLowerCase()
  // Une table absente n'est pas une colonne de trop : la tolérer masquerait un
  // schéma incomplet (et l'application tenterait des requêtes encore plus fausses).
  if (/relation .* does not exist|relation .* not found|undefined table/.test(text)) return null
  if (!/(does not exist|doesn.t exist|could not find|no such column|check the system catalog)/.test(text)) return null
  for (const token of tokens) {
    const name = tokenName(token)
    if (alreadyMissing.includes(name)) continue
    if (text.includes(name.toLowerCase()) || text.includes(name.toLowerCase().replace(/_id$/, ''))) return token
  }
  return null
}

export type ConversationModel = { id: string; title: string | null; is_group: boolean; updated_at: string; last_read_at?: string | null; conversation_members?: { user_id: string; profile: unknown }[] }

/** Ligne `conversation_members` avec sa conversation embarquée -> conversation du modèle client. */
export function conversationFromMembershipRow(row: any): ConversationModel | null {
  const embedded = Array.isArray(row?.conversation) ? row.conversation[0] : row?.conversation
  if (!embedded || typeof embedded.id !== 'string') return null
  return {
    ...embedded,
    title: embedded.title ?? null,
    is_group: Boolean(embedded.is_group),
    updated_at: embedded.updated_at ?? new Date(0).toISOString(),
    last_read_at: row.last_read_at ?? null,
    conversation_members: [{ user_id: row.user_id ?? row.profile?.id ?? '', profile: row.profile ?? null }],
  }
}

/** Conversation telle que renvoyée par une insertion/lecture simple de `conversations`. */
export function conversationFromRow(row: any): ConversationModel | null {
  if (!row || typeof row.id !== 'string') return null
  return { ...row, title: row.title ?? null, is_group: Boolean(row.is_group), updated_at: row.updated_at ?? new Date(0).toISOString() }
}

export type PublicGroupModel = { id: string; name: string; description: string | null; conversation_id: string | null; created_at: string | null; member_count: number | null }

/**
 * Ligne `groups` (visibilité publique) -> groupe affichable. Le comptage vient de
 * l’embed d’agrégat `group_members(count)` ; s’il est absent, on affiche rien plutôt
 * que « 0 membre », qui serait faux tant que la policy de lecture du roster manque.
 */
export function publicGroupFromRow(row: any): PublicGroupModel {
  const roster = row?.group_members
  const member_count = Array.isArray(roster)
    ? (typeof roster[0]?.count === 'number' ? roster[0].count : roster.length)
    : null
  return {
    id: row.id,
    name: row.name ?? 'Groupe sans titre',
    description: row.description ?? null,
    conversation_id: row.conversation_id ?? null,
    created_at: row.created_at ?? null,
    member_count,
  }
}

/** Ligne `messages` -> message du client (embeds uniques ou tableaux selon la base). */
export function messageFromRow<T = any>(row: any): T {
  return {
    ...row,
    sender: Array.isArray(row?.sender) ? row.sender[0] : row?.sender,
    reply_to: Array.isArray(row?.reply_to) ? row.reply_to[0] ?? null : row?.reply_to ?? null,
  } as T
}

/**
 * Aperçu de conversation pour la liste de gauche, comme Messenger : dernier message
 * lisible, heure du fil et nombre de messages non lus. Les lignes sont fournies du
 * plus récent au plus ancien ; rien n'est inventé quand la conversation est vide.
 */
export type ConversationPreview = { preview: string; at: string | null; unread: number; truncated: boolean }

export function conversationPreview(
  rows: any[],
  options: { lastReadAt?: string | null; myId: string; truncated?: boolean },
): ConversationPreview {
  const readable = rows.filter(row => row && typeof row === 'object')
  const newest = readable.find(row => !row.deleted_at) ?? readable[0] ?? null
  let preview = ''
  if (newest?.deleted_at) preview = 'Message supprimé'
  else if (newest?.attachment_name) preview = newest.attachment_name
  else if (newest && newest.message_type && newest.message_type !== 'text') preview = 'Pièce jointe'
  else preview = String(newest?.body ?? '').replace(/\s+/g, ' ').trim()
  const unread = readable.filter(row =>
    !row.deleted_at
    && row.sender_id !== options.myId
    && (!options.lastReadAt || Date.parse(row.created_at ?? '') > Date.parse(options.lastReadAt)))
    .length
  return { preview, at: newest?.created_at ?? null, unread, truncated: Boolean(options.truncated) }
}

/** Badge de non-lus façon Messenger : le nombre, sinon « 9+ » si la lecture était bornée. */
export function unreadBadge(unread: number, truncated = false): string {
  if (!(unread > 0)) return ''
  if (truncated || unread > 9) return '9+'
  return String(unread)
}

/** Heure d'une ligne de liste : l'heure du jour même, « Hier », le jour de la semaine, sinon la date. */
export function formatRowTime(value: string | null | undefined, now = new Date()): string {
  if (!value) return ''
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return ''
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.floor((midnight.getTime() - new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()) / 86400000)
  if (days <= 0) return at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Hier'
  // Messenger abrège le jour de la semaine sur trois lettres et le capitalise ; la liste
  // de gauche est étroite, « mercredi » y tiendrait mal.
  if (days < 7) {
    const weekday = at.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')
    return (weekday.charAt(0).toUpperCase() + weekday.slice(1)).slice(0, 3)
  }
  return at.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** Compteur de messages du fil : le nombre réellement chargé, majoré si l'historique continue. */
export function threadCountLabel(loaded: number, hasOlder: boolean): string {
  const unit = loaded > 1 ? 'messages' : 'message'
  return hasOlder ? `${loaded}+ ${unit} dans ce fil` : `${loaded} ${unit} dans ce fil`
}

/** Réactions reçues, de la plus nombreuse à la moins nombreuse (pastilles hors bulle). */
export function topMessageReactions<K extends string>(counts: Partial<Record<K, number>> | undefined, limit = 3): Array<[K, number]> {
  if (!counts) return []
  return (Object.entries(counts) as Array<[K, number]>)
    .filter(([, count]) => (count ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0) || a[0].localeCompare(b[0]))
    .slice(0, limit)
}

export function reactionTotal(counts: Record<string, number> | undefined): number {
  if (!counts) return 0
  return Object.values(counts).reduce((total, count) => total + (count || 0), 0)
}

/** Count people, not browser tabs, from the conversation's Realtime presence. */
export function onlineConversationUserIds(state: Record<string, readonly { userId?: unknown }[]>): string[] {
  const users = new Set<string>()
  for (const sessions of Object.values(state)) {
    for (const session of sessions) {
      if (typeof session.userId === 'string' && session.userId.trim()) users.add(session.userId)
    }
  }
  return [...users]
}

export type ReadMarker = { user_id: string; last_read_at: string | null }
export function messageWasRead(createdAt: string, markers: ReadMarker[], myId: string) {
  const recipients = markers.filter(marker => marker.user_id !== myId)
  return recipients.length > 0 && recipients.every(marker => marker.last_read_at && Date.parse(marker.last_read_at) >= Date.parse(createdAt))
}
export function mergeReadMarkers(previous: ReadMarker[], incoming: ReadMarker[]): ReadMarker[] {
  const known = new Map(previous.map(row => [row.user_id, row.last_read_at]))
  return incoming.map(row => {
    const before = known.get(row.user_id)
    return before && (!row.last_read_at || Date.parse(before) > Date.parse(row.last_read_at)) ? { ...row, last_read_at: before } : row
  })
}
