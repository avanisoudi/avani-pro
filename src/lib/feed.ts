import type { FeedPostRecord, ProfileRecord, ReactionCounts, ReactionType } from './api'

/**
 * Modèle et helpers purs du fil d'actualité.
 * Tout ce qui touche à l'affichage d'une publication (compteurs de réactions,
 * texte, médias, horaires relatifs) est centralisé ici pour que la carte,
 * la barre d'actions et la liste des réactions affichent exactement les mêmes chiffres.
 */

export type Post = {
  id: string | number
  authorId?: string
  name: string
  handle: string
  role: string
  avatar: string
  time: string
  createdAt?: string | null
  editedAt?: string | null
  body: string
  tags: string[]
  stats: { likes: number; comments: number; shares: number }
  kind: string
  liked?: boolean
  reaction?: ReactionType
  reactionCounts?: Partial<ReactionCounts>
  saved?: boolean
  verifiedType?: string | null
  avatarUrl?: string | null
  /** URLs des médias rattachés à la publication (photos, vidéos). */
  media?: string[]
}

export const REACTION_KEYS: ReactionType[] = ['like', 'love', 'haha', 'wow', 'sad', 'angry']

export const REACTION_META: Record<ReactionType, { label: string; icon: string; color: string }> = {
  like: { label: 'J’aime', icon: '/assets/reactions/like.svg', color: '#1877f2' },
  love: { label: 'J’adore', icon: '/assets/reactions/love.svg', color: '#f33e58' },
  haha: { label: 'Haha', icon: '/assets/reactions/haha.svg', color: '#f7b125' },
  wow: { label: 'Wouah', icon: '/assets/reactions/wow.svg', color: '#f7b125' },
  sad: { label: 'Triste', icon: '/assets/reactions/sad.svg', color: '#f7b125' },
  angry: { label: 'Grrr', icon: '/assets/reactions/angry.svg', color: '#e9710f' },
}

export const REACTION_EMOJI: Record<ReactionType, string> = {
  like: '👍',
  love: '❤️',
  haha: '😂',
  wow: '😮',
  sad: '😢',
  angry: '😡',
}

export function emptyReactionCounts(): ReactionCounts {
  return { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }
}

function sanitizeCount(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Math.trunc(parsed)
}

export type ReactionState = { counts: ReactionCounts; total: number; unknown: number }

/**
 * Réconcilie les compteurs par type avec le total connu de la publication.
 * `posts.likes` (compté côté SQL) et `reactionCounts` (détaillé par type) viennent
 * du même tableau mais peuvent arriver désynchronisés lors d'un ajout optimiste :
 * l'écart est imputé à « J’aime » pour que le total affiché soit toujours exact.
 */
export function reactionState(post: Pick<Post, 'stats' | 'reactionCounts'>): ReactionState {
  const counts = emptyReactionCounts()
  let unknown = 0
  for (const [key, value] of Object.entries(post.reactionCounts ?? {})) {
    const count = sanitizeCount(value)
    if (!count) continue
    if (REACTION_KEYS.includes(key as ReactionType)) counts[key as ReactionType] += count
    else unknown += count
  }
  const declared = sanitizeCount(post.stats?.likes)
  let total = REACTION_KEYS.reduce((sum, key) => sum + counts[key], 0) + unknown
  if (declared > total) counts.like += declared - total
  total = Math.max(total, declared)
  return { counts, total, unknown }
}

/** Prochaine réaction attendue : un nouvel appui sur la même réaction la retire. */
export function nextReaction(current: ReactionType | undefined, tapped: ReactionType): ReactionType | null {
  return current === tapped ? null : tapped
}

/** Applique une réaction aux compteurs et renvoie l'état exact à afficher. */
export function applyReaction(post: Post, tapped: ReactionType): { reaction: ReactionType | null; counts: ReactionCounts; total: number } {
  const { counts, unknown } = reactionState(post)
  const next = nextReaction(post.reaction, tapped)
  if (post.reaction) counts[post.reaction] = Math.max(0, counts[post.reaction] - 1)
  if (next) counts[next] += 1
  const total = REACTION_KEYS.reduce((sum, key) => sum + counts[key], 0) + unknown
  return { reaction: next, counts, total }
}

/**
 * Icônes superposées de la ligne d'engagement : la réaction de la personne
 * connectée passe en premier, puis les types les plus nombreux (max 3).
 */
export function topReactions(post: Post, limit = 3): ReactionType[] {
  const { counts } = reactionState(post)
  const ranked = (Object.keys(counts) as ReactionType[])
    .filter(key => counts[key] > 0)
    .sort((a, b) => counts[b] - counts[a] || REACTION_KEYS.indexOf(a) - REACTION_KEYS.indexOf(b))
  if (post.reaction && counts[post.reaction] > 0) {
    const rest = ranked.filter(key => key !== post.reaction)
    return [post.reaction, ...rest].slice(0, limit)
  }
  return ranked.slice(0, limit)
}

const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })
const standard = new Intl.NumberFormat('fr-FR')

/** Compteurs à la Facebook : 987, puis 1,2 k. */
export function formatCount(value: number) {
  const count = sanitizeCount(value)
  return count >= 1000 ? compact.format(count).replace('\u202f', ' ') : standard.format(count)
}

const relativeFormatter = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** « à l’instant », « 5 min », « Hier à 18:32 » — comme sur Facebook. */
export function formatPostTime(value: string | number | null | undefined, fallback = 'à l’instant') {
  if (value === null || value === undefined) return fallback
  const date = typeof value === 'number' ? new Date(value) : new Date(/^\d+$/.test(value) ? Number(value) : value)
  if (Number.isNaN(date.getTime())) return typeof value === 'string' && value.trim() ? value : fallback
  const delta = date.getTime() - Date.now()
  const distance = Math.abs(delta)
  if (distance < 45_000) return 'à l’instant'
  if (distance < HOUR) return relativeFormatter.format(Math.round(delta / MINUTE), 'minute')
  if (distance < DAY) return relativeFormatter.format(Math.round(delta / HOUR), 'hour')
  if (distance < 7 * DAY) return relativeFormatter.format(Math.round(delta / DAY), 'day')
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('fr-FR', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' })
}

/** « Modifié » n’apparaît que si l’édition est postérieure à la publication. */
export function isEditedPost(createdAt?: string | null, editedAt?: string | null) {
  if (!editedAt) return false
  const edited = new Date(editedAt).getTime()
  const created = createdAt ? new Date(createdAt).getTime() : 0
  return Number.isFinite(edited) && edited > created + 1000
}

const IMAGE_TOKEN = /\[image\]([\s\S]*?)\[\/image\]/g
const VIDEO_TOKEN = /\[video\]([\s\S]*?)\[\/video\]/g
const URL_TOKEN = /(https?:\/\/[^\s<>"]+)/g

function collectTokens(body: string, pattern: RegExp) {
  const found: string[] = []
  pattern.lastIndex = 0
  let match = pattern.exec(body)
  while (match) {
    const url = match[1].trim()
    if (url) found.push(url)
    match = pattern.exec(body)
  }
  return found
}

export type PostContent = { text: string; media: Array<{ type: 'image' | 'video'; url: string }>; links: string[] }

/**
 * Sépare le texte des médias. Les publications déjà en stock utilisaient la
 * syntaxe [image]…[/image] insérée par l’ancien bouton de démonstration : elle
 * reste lue ici, et les URLs nues du message sont proposées comme images.
 */
export function parsePostContent(body: string, attached: string[] = []): PostContent {
  let text = body ?? ''
  const images = collectTokens(text, IMAGE_TOKEN)
  const videos = collectTokens(text, VIDEO_TOKEN)
  text = text
    .replace(IMAGE_TOKEN, '')
    .replace(VIDEO_TOKEN, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
  const bareUrls = (text.match(URL_TOKEN) ?? []).filter(url => !url.includes('avani-pro'))
  const media: PostContent['media'] = []
  const push = (type: 'image' | 'video', url: string) => {
    if (!media.some(item => item.url === url)) media.push({ type, url })
  }
  attached.forEach(url => push(/\.(mp4|webm|mov|m4v|ogv|avi)(\?|#|$)/i.test(url) ? 'video' : 'image', url))
  images.forEach(url => push(/\.(mp4|webm|mov|m4v|ogv|avi)(\?|#|$)/i.test(url) ? 'video' : 'image', url))
  videos.forEach(url => push('video', url))
  return { text: text.trim(), media, links: [...new Set(bareUrls)] }
}

/** Hashtags cliquables, comme sur Facebook. */
export function extractTags(body: string) {
  return body.match(/#[\w-]{2,40}/g) ?? []
}

/** Le texte est replié au-delà de 6 lignes ou 280 caractères. */
export function isLongPost(text: string) {
  return text.length > 280 || text.split('\n').length > 6
}

/** Enregistrement du fil tel que renvoyé par `listFeedPosts`, complété pour l’aperçu local. */
export type FeedRecord = FeedPostRecord & { updated_at?: string | null; media?: string[] }

function authorInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

const POST_KIND: Record<string, string> = { image: 'image', video: 'video', link: 'link', document: 'file' }

/**
 * Source unique de conversion enregistrement SQL → carte de publication.
 * Le fil hydraté et la publication que l’on vient de créer passent par le même
 * chemin : mêmes horaires relatifs, mêmes compteurs, même tri des médias.
 */
export function toFeedPost(record: FeedRecord): Post {
  const author = record.author ?? ({} as ProfileRecord)
  const name = author.full_name || 'Membre Avani Pro'
  const body = record.body ?? ''
  const media = Array.isArray(record.media) ? record.media.filter(Boolean) : []
  return {
    id: record.id,
    authorId: author.id,
    name,
    handle: author.username ? `@${author.username}` : '',
    role: author.bio || '',
    avatar: authorInitials(name),
    avatarUrl: author.avatar_url ?? null,
    verifiedType: author.verified_type ?? null,
    time: formatPostTime(record.created_at),
    createdAt: record.created_at ?? null,
    editedAt: isEditedPost(record.created_at, record.updated_at) ? record.updated_at ?? null : null,
    body,
    tags: extractTags(body),
    stats: { likes: sanitizeCount(record.likes), comments: sanitizeCount(record.comments), shares: sanitizeCount(record.shares) },
    kind: POST_KIND[record.post_type] ?? 'thought',
    liked: Boolean(record.liked),
    reaction: record.reaction ?? undefined,
    reactionCounts: record.reactionCounts ?? emptyReactionCounts(),
    saved: Boolean(record.saved),
    media: media.length ? media : collectTokens(body, IMAGE_TOKEN),
  }
}
