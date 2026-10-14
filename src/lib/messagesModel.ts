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

export type ConversationModel = { id: string; title: string | null; is_group: boolean; updated_at: string; conversation_members?: { user_id: string; profile: unknown }[] }

/** Ligne `conversation_members` avec sa conversation embarquée -> conversation du modèle client. */
export function conversationFromMembershipRow(row: any): ConversationModel | null {
  const embedded = Array.isArray(row?.conversation) ? row.conversation[0] : row?.conversation
  if (!embedded || typeof embedded.id !== 'string') return null
  return {
    ...embedded,
    title: embedded.title ?? null,
    is_group: Boolean(embedded.is_group),
    updated_at: embedded.updated_at ?? new Date(0).toISOString(),
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
