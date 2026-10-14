/** Utilitaires d’erreurs PostgREST : le schéma en production peut avoir quelques colonnes en avance ou en retard sur les migrations du dépôt. */

export type QueryError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined

/**
 * Vrai quand Postgres/PostgREST signale une colonne absente
 * (« column comments.parent_id does not exist », code 42703 ou PGRST204).
 * Permet de retenter la requête sans cette colonne plutôt que de casser l’écran.
 */
export function isMissingColumnError(error: QueryError, column: string) {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()
  return text.includes(column.toLowerCase()) && /(does not exist|doesn.t exist|not found|unknown column|no such column|could not find)/.test(text)
}

/**
 * Vrai quand la table (ou la vue) elle-même manque : `message_reactions` n’est
 * créée par aucune migration historique du dépôt.
 */
export function isMissingRelationError(error: QueryError, relation: string) {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()
  return text.includes(relation.toLowerCase()) && /(does not exist|doesn.t exist|not found|could not find the relation|undefined table)/.test(text)
}

/** Vrai sur une violation de contrainte `check` nommée (ex. messages_body_check). */
export function isCheckConstraintError(error: QueryError, constraint: string) {
  if (!error) return false
  if (error.code === '23514') return true
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return text.includes(constraint.toLowerCase()) && /check constraint|violates/.test(text)
}

/** Vrai quand RLS refuse l’opération : le message doit rester explicite pour l’utilisateur. */
export function isPermissionError(error: QueryError) {
  if (!error) return false
  if (error.code === '42501' || error.code === 'PGRST301') return true
  const text = `${error.message ?? ''} ${error.hint ?? ''}`.toLowerCase()
  return text.includes('row-level security') || text.includes('permission denied') || text.includes('failed to authorize')
}


/**
 * Traduit un refus de la base en consigne compréhensible : RLS non installée,
 * contrainte trop stricte, table absente. `null` si ce n’est pas lisible ici :
 * l’appelant garde alors le message d’origine.
 */
export function describeAccessError(error: QueryError, action: string, migration = '009_messages_live.sql'): string | null {
  if (!error) return null
  const file = `supabase/migrations/${migration}`
  if (isPermissionError(error)) return `${action} est refusé par les règles d’accès (RLS) de la base. Exécute ${file} dans le SQL Editor de Supabase.`
  if (isCheckConstraintError(error, 'messages_body_check')) return `${action} est refusé par la contrainte « messages_body_check » (corps de message non vide autorisé). Exécute ${file} pour l’assouplir.`
  if (isMissingRelationError(error, 'message_reactions')) return `${action} est impossible : la table public.message_reactions n’existe pas. Exécute ${file} dans le SQL Editor.`
  if (isMissingColumnError(error, 'conversation_id')) return `${action} est impossible : la colonne groups.conversation_id manque (migration 006 du dépôt).`
  return null
}
