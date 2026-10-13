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
