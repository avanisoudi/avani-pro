export function mentionAtCursor(text: string, cursor: number): { start: number; end: number; query: string } | null {
  const end = Math.max(0, Math.min(cursor, text.length))
  const match = /(?:^|\s)@([a-zA-Z0-9_]*)$/.exec(text.slice(0, end))
  if (!match) return null
  return { start: end - match[1].length - 1, end, query: match[1] }
}

export function insertMention(text: string, start: number, end: number, username: string) {
  const token = `@${username} `
  return { text: text.slice(0, start) + token + text.slice(end), cursor: start + token.length }
}
