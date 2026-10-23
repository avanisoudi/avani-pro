/** The reference shows one large photo and two thumbnails, with +N on the last. */
export function albumPreview(total: number) {
  const visibleCount = Math.min(Math.max(0, Math.floor(total)), 3)
  return { visibleCount, overflow: Math.max(0, total - visibleCount) }
}

export function albumIndex(current: number, direction: number, total: number) {
  return total > 0 ? ((current + direction) % total + total) % total : 0
}
