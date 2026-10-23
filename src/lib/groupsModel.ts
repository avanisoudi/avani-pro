import type { PublicGroupRecord } from './api'
export type GroupCard = { id: string; name: string; description: string | null; visibility: 'public' | 'private'; conversation_id: string | null; owner_id?: string; joined: boolean; owner: boolean; member_count: number | null }
/** Membership and discovery rows share one identity: never concatenate both lists. */
export function unifiedGroups(memberships: Array<Record<string, any>>, discoverable: PublicGroupRecord[], userId: string, counts: Record<string, number> = {}): GroupCard[] {
  const byId = new Map<string, GroupCard>()
  for (const row of discoverable) byId.set(row.id, { ...row, visibility: 'public', joined: false, owner: false, member_count: counts[row.id] ?? null })
  for (const row of memberships) {
    if (!row.id) continue
    const existing = byId.get(row.id)
    byId.set(row.id, { id: row.id, name: row.name || existing?.name || 'Groupe', description: row.description ?? existing?.description ?? null,
      visibility: row.visibility === 'public' ? 'public' : 'private', conversation_id: row.conversation_id ?? existing?.conversation_id ?? null,
      owner_id: row.owner_id, owner: row.owner_id === userId, joined: true, member_count: counts[row.id] ?? null })
  }
  return [...byId.values()].sort((a, b) => Number(b.joined) - Number(a.joined) || a.name.localeCompare(b.name, 'fr'))
}
