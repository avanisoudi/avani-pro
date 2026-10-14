/**
 * Logique des surfaces média (Vidéos, Reels, Stories).
 *
 * Aucune de ces fonctions n'invente de donnée : elles dérivent le visible des publications
 * déjà en base (`posts` + `media_paths`) et des stories actives. Ce qui ne peut pas être lu
 * — un compteur de vues sans table `story_views`, par exemple — est renvoyé à `null` et
 * affiché comme tel par les panneaux, plutôt que rempli par un zéro rassurant.
 */
import type { Post } from './feed'
import type { StoryRecord } from './socialApi'

/** Un média est une vidéo si son type déclaré l'indique ou si son extension le prouve. */
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|ogv|avi)(\?|#|$)/i

export function isVideoMedia(url: string) {
  return VIDEO_EXT.test(url)
}

export function videoUrlsOf(post: Pick<Post, 'kind' | 'media'>): string[] {
  return (post.media ?? []).filter(url => isVideoMedia(url))
}

export function imageUrlsOf(post: Pick<Post, 'kind' | 'media'>): string[] {
  return (post.media ?? []).filter(url => url && !isVideoMedia(url))
}

/**
 * Publication « vidéo » : soit typée `video` à l'écriture, soit porteuse d'un média dont
 * l'extension est vidéo. Les deux chemins existent dans la base (le composer tape la
 * publication, l'import d'un poste plus ancien peut ne pas l'avoir fait).
 */
export function isVideoPost(post: Pick<Post, 'kind' | 'media'>) {
  return post.kind === 'video' || videoUrlsOf(post).length > 0
}

export type MediaClip = {
  postId: Post['id']
  post: Post
  src: string
  poster: string | null
  /** Nombre de vues : inconnu tant que la base ne le porte pas, donc `null`. */
  views: number | null
}

function clipOf(post: Post): MediaClip | null {
  const sources = videoUrlsOf(post)
  if (sources.length === 0) return null
  return { postId: post.id, post, src: sources[0], poster: imageUrlsOf(post)[0] ?? null, views: null }
}

/** Toutes les vidéos du fil, dans l'ordre de publication (le fil arrive déjà trié). */
export function clipsFromPosts(posts: Post[]): MediaClip[] {
  return posts.map(clipOf).filter((clip): clip is MediaClip => clip !== null)
}

/** Sélection par hashtag, comparée sans casse ni accents : `#Noël` trouve `#noël`. */
function normalizeTag(tag: string) {
  return tag.replace(/^#/, '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export function postsWithTag(posts: Post[], tag: string): Post[] {
  const wanted = normalizeTag(tag)
  if (!wanted) return posts
  return posts.filter(post => (post.tags ?? []).some(value => normalizeTag(value) === wanted))
}

/** Nuage de hashtags réellement utilisés, le plus employé en premier. */
export function hashtagCloud(posts: Post[], limit = 12): Array<{ tag: string; count: number }> {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const post of posts) {
    for (const raw of post.tags ?? []) {
      const key = normalizeTag(raw)
      if (!key) continue
      const seen = counts.get(key)
      if (seen) seen.count += 1
      else counts.set(key, { tag: raw.startsWith('#') ? raw : `#${raw}`, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, limit)
}

/** Tri « les plus réactifs d'abord », à compteurs réels égaux on garde l'ordre chronologique. */
export function sortByEngagement(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => engagementOf(b) - engagementOf(a))
}

export function engagementOf(post: Pick<Post, 'stats'>) {
  const stats = post.stats ?? { likes: 0, comments: 0, shares: 0 }
  return (stats.likes ?? 0) + (stats.comments ?? 0) + (stats.shares ?? 0)
}

export type StoryRing = {
  authorId: string
  authorName: string
  avatarUrl: string | null
  initials: string
  stories: StoryRecord[]
  /** `true` quand le groupe, c'est mes propres stories : l'archive est séparée du fil. */
  mine: boolean
  /** Une vue « non lue » = story publiée depuis moins de 24 h et pas encore vue par moi. */
  unseen: boolean
}

/**
 * Regroupement par auteur, comme le fil du haut de page : les stories d'un même compte
 * forment une bague, ordonnée de la plus ancienne à la plus récente (lecture chronologique).
 */
export function storyRings(stories: StoryRecord[], myId: string | null, seenIds: string[] = []): StoryRing[] {
  const seen = new Set(seenIds)
  const byAuthor = new Map<string, StoryRing>()
  for (const story of [...stories].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const authorId = story.author_id
    const ring = byAuthor.get(authorId)
    if (ring) {
      ring.stories.push(story)
      if (!seen.has(story.id)) ring.unseen = true
      continue
    }
    const name = story.author?.full_name || (authorId === myId ? 'Votre story' : 'Membre Avani Pro')
    byAuthor.set(authorId, {
      authorId,
      authorName: name,
      avatarUrl: story.author?.avatar_url ?? null,
      initials: initialsOf(name),
      stories: [story],
      mine: authorId === myId,
      unseen: !seen.has(story.id),
    })
  }
  const rings = [...byAuthor.values()]
  // Mon groupe en tête (c'est là qu'on publie), puis les non vus, puis le reste.
  return rings.sort((a, b) => Number(b.mine) - Number(a.mine) || Number(b.unseen) - Number(a.unseen) || a.authorName.localeCompare(b.authorName))
}

export function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

/** Une story est expirée si `expires_at` est passé — la base filtre déjà, on ne fait pas confiance à l'aveugle. */
export function isStoryLive(story: Pick<StoryRecord, 'expires_at'>, now = new Date()) {
  const until = Date.parse(story.expires_at ?? '')
  return Number.isFinite(until) ? until > now.getTime() : false
}

/**
 * Statistiques du créateur : seulement ce qui est mesurable, rien d'estimé.
 * `now` est injectable — sans ce paramètre, la fonction dépendrait de l'horloge murale et
 * ne serait pas vérifiable (c'est exactement ce qu'un test doit pouvoir figer).
 */
export function storyStats(stories: StoryRecord[], myId: string | null, now = new Date()) {
  const mine = stories.filter(story => story.author_id === myId)
  const liveCount = mine.filter(story => isStoryLive(story, now)).length
  return {
    live: liveCount,
    expired: mine.length - liveCount,
    withCaption: mine.filter(story => Boolean(story.caption?.trim())).length,
    videos: mine.filter(story => story.media_type === 'video').length,
  }
}

/** Libellé d'un compteur qui peut rester inconnu (pas de 0 mensonger). */
export function countLabel(value: number | null, unit: string) {
  if (value === null || !Number.isFinite(value)) return `vues indisponibles`
  return `${value.toLocaleString('fr-FR')} ${unit}`
}
