export const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000
const draftKey = (owner: string) => `avani:post-draft:v1:${owner}`
export function readComposerDraft(storage: Pick<Storage, 'getItem'> | null, owner: string, now = Date.now()): string {
  if (!storage || !owner) return ''
  try {
    const value = JSON.parse(storage.getItem(draftKey(owner)) || 'null')
    return value?.version === 1 && typeof value.body === 'string' && value.body.length <= 5000 && Number.isFinite(value.savedAt) && now - value.savedAt >= 0 && now - value.savedAt < DRAFT_LIFETIME_MS ? value.body : ''
  } catch { return '' }
}
export function saveComposerDraft(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, owner: string, body: string, now = Date.now()): boolean {
  if (!storage || !owner) return false
  try {
    if (body) storage.setItem(draftKey(owner), JSON.stringify({ version: 1, body: body.slice(0, 5000), savedAt: now }))
    else storage.removeItem(draftKey(owner))
    return true
  } catch { return false }
}
export function tabDraftStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage } catch { return null }
}
export function moveComposerItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items]
  const result = [...items]
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item)
  return result
}
