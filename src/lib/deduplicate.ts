/** Keep first occurrence and input order; never deduplicate different database IDs by text. */
export function uniqueById<T extends { id: string | number }>(items: readonly T[]): T[] {
  const seen = new Set<string | number>()
  return items.filter(item => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

/** File-picker identity, not a content hash: different files with the same name remain allowed. */
export function uniqueSelectedFiles(incoming: readonly File[], existing: readonly File[]) {
  const key = (file: File) => JSON.stringify([file.name, file.size, file.type, file.lastModified])
  const seen = new Set(existing.map(key))
  const files = incoming.filter(file => {
    const identity = key(file)
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
  return { files, skipped: incoming.length - files.length }
}
