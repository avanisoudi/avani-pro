import { requireSupabase } from './supabase'

/**
 * Médias des publications (photos et vidéos).
 *
 * Le stockage est un bucket Supabase Storage nommé `post-media` (déclaré privé par la
 * migration 002 du dépôt). L’application ne crée et ne modifie aucun espace de stockage :
 * `supabase/migrations/008_post_media.sql` est fourni à cet effet et doit être exécuté
 * manuellement dans le SQL Editor par le propriétaire du projet.
 *
 * Les chemins stockés en base sont des chemins d’objet (`<userId>/posts/<uuid>-<nom>`),
 * jamais des URL : ils sont résolus à la lecture, en URL signée si le bucket est privé,
 * en URL publique sinon. Les publications qui contiennent déjà des URL absolues
 * (anciennes images de démonstration) continuent de s’afficher telles quelles.
 */

export const POST_MEDIA_BUCKET = ((import.meta.env.VITE_POST_MEDIA_BUCKET as string | undefined) ?? '').trim() || 'post-media'
export const MAX_POST_MEDIA_FILES = 4
export const MAX_POST_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_POST_VIDEO_BYTES = 50 * 1024 * 1024
export const MAX_POST_MEDIA_TOTAL_BYTES = 100 * 1024 * 1024

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']

export type MediaKind = 'image' | 'video'

export function mediaKind(file: File): MediaKind | null {
  if (file.type.startsWith('video/') || VIDEO_TYPES.includes(file.type)) return 'video'
  if (file.type.startsWith('image/') || IMAGE_TYPES.includes(file.type)) return 'image'
  return null
}

export function formatMediaSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ko`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
}

export type MediaSelection = { accepted: File[]; rejected: string[] }

/**
 * Contrôle du lot sélectionné : types acceptés, taille par fichier, quota total,
 * place restante dans la grille de la publication.
 */
export function validateMediaSelection(files: File[], alreadySelected = 0, previousTotalBytes = 0): MediaSelection {
  const rejected: string[] = []
  const accepted: File[] = []
  let total = previousTotalBytes
  const slots = MAX_POST_MEDIA_FILES - alreadySelected
  if (files.length > slots && slots >= 0) {
    rejected.push(`Une publication accepte ${MAX_POST_MEDIA_FILES} médias au maximum : ${files.length - Math.max(slots, 0)} fichier(s) ignoré(s).`)
  }
  for (const file of files.slice(0, Math.max(slots, 0))) {
    const kind = mediaKind(file)
    if (!kind) {
      rejected.push(`« ${file.name} » n’est ni une photo ni une vidéo acceptée (JPEG, PNG, WebP, GIF, MP4, WebM).`)
      continue
    }
    const limit = kind === 'video' ? MAX_POST_VIDEO_BYTES : MAX_POST_IMAGE_BYTES
    if (file.size <= 0) {
      rejected.push(`« ${file.name} » est vide.`)
      continue
    }
    if (file.size > limit) {
      rejected.push(`« ${file.name} » dépasse ${formatMediaSize(limit)} (max ${kind === 'video' ? 'vidéo' : 'photo'}).`)
      continue
    }
    if (total + file.size > MAX_POST_MEDIA_TOTAL_BYTES) {
      rejected.push(`Le lot dépasse ${formatMediaSize(MAX_POST_MEDIA_TOTAL_BYTES)} au total : « ${file.name} » ignoré.`)
      continue
    }
    total += file.size
    accepted.push(file)
  }
  return { accepted, rejected }
}

/** Nom de fichier rendu sûr pour une clé Storage : sans accents, sans espace, sans chemin. */
function safeName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(-72) || 'media'
}

export function buildMediaPath(userId: string, file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || (mediaKind(file) === 'video' ? 'mp4' : 'jpg')
  const base = safeName(file.name).replace(/\.[a-z0-9]+$/, '')
  return `${userId}/posts/${crypto.randomUUID()}-${base}.${extension}`
}

/** Messages d’erreur actionables : le bucket et ses policies vivent côté Supabase. */
export function describeMediaError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const lower = `${message} ${error instanceof Error && 'details' in error ? String((error as { details?: unknown }).details ?? '') : ''}`.toLowerCase()
  if (lower.includes('bucket not found') || (lower.includes('not found') && lower.includes(POST_MEDIA_BUCKET.toLowerCase())))
    return `L’espace de stockage « ${POST_MEDIA_BUCKET} » n’existe pas encore dans Supabase. Exécute supabase/migrations/008_post_media.sql dans le SQL Editor, puis recharge la page.`
  if (lower.includes('row-level security') || lower.includes('permission') || lower.includes('42501'))
    return `Les règles d’accès (RLS) du bucket « ${POST_MEDIA_BUCKET} » refusent l’envoi. La migration 008 les ajoute : exécute-la dans le SQL Editor.`
  if (lower.includes('too large') || lower.includes('size') || lower.includes('payload'))
    return `Média trop volumineux : maximum ${formatMediaSize(MAX_POST_IMAGE_BYTES)} par photo, ${formatMediaSize(MAX_POST_VIDEO_BYTES)} par vidéo.`
  if (lower.includes('failed to fetch') || lower.includes('network'))
    return 'Envoi impossible : vérifie ta connexion et les variables Supabase du déploiement.'
  return message || "Le média n’a pas pu être envoyé."
}

/** Téléverse un fichier et renvoie son chemin d’objet (à stocker en base, jamais l’URL). */
export async function uploadPostMedia(userId: string, file: File): Promise<string> {
  const kind = mediaKind(file)
  if (!kind) throw new Error('Choisis une photo (JPEG, PNG, WebP, GIF) ou une vidéo (MP4, WebM).')
  const limit = kind === 'video' ? MAX_POST_VIDEO_BYTES : MAX_POST_IMAGE_BYTES
  if (file.size > limit) throw new Error(`« ${file.name} » dépasse ${formatMediaSize(limit)}.`)
  const path = buildMediaPath(userId, file)
  const client = requireSupabase()
  const { error } = await client.storage.from(POST_MEDIA_BUCKET).upload(path, file, { upsert: false, contentType: file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'), cacheControl: '3600' })
  if (error) throw new Error(describeMediaError(error))
  return path
}

/** Propreté : on retire les objets déjà téléversés si l’enregistrement échoue. */
export async function removePostMedia(paths: string[]) {
  const objects = paths.filter(path => path && !/^https?:\/\//i.test(path))
  if (!objects.length) return
  try {
    await requireSupabase().storage.from(POST_MEDIA_BUCKET).remove(objects)
  } catch {
    /* rien de bloquant : un objet orphelin reste invisible dans le fil */
  }
}

export function isStoredMediaPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/^(https?:|data:|blob:)/i.test(value)
}

/**
 * Chemins d’objets -> URL affichables. Un seul appel `createSignedUrls` pour tout le fil ;
 * si le bucket est public (ou refuse la signature), on retombe sur l’URL publique.
 */
export async function resolvePostMediaPaths(paths: string[]): Promise<Map<string, string>> {
  const objects = [...new Set(paths.filter(isStoredMediaPath))]
  if (!objects.length) return new Map()
  const client = requireSupabase()
  const bucket = client.storage.from(POST_MEDIA_BUCKET)
  const publicUrl = (path: string) => bucket.getPublicUrl(path).data.publicUrl
  try {
    const { data, error } = await bucket.createSignedUrls(objects, 60 * 60 * 12)
    if (error || !data) return new Map(objects.map(path => [path, publicUrl(path)]))
    const signed = new Map<string, string>()
    objects.forEach((path, index) => {
      const entry = data[index] as { signedUrl?: string | null; error?: unknown } | undefined
      signed.set(path, entry?.signedUrl || publicUrl(path))
    })
    return signed
  } catch {
    return new Map(objects.map(path => [path, publicUrl(path)]))
  }
}

/** Média choisi dans le composeur : fichier, nature et aperçu local. */
export type ComposerMedia = { id: string; file: File; kind: MediaKind; previewUrl: string }

export function createComposerMedia(files: File[]): ComposerMedia[] {
  return files.map(file => ({
    id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
    file,
    kind: mediaKind(file) ?? 'image',
    previewUrl: URL.createObjectURL(file),
  }))
}

export function releaseComposerMedia(items: ComposerMedia[]) {
  items.forEach(item => {
    try {
      URL.revokeObjectURL(item.previewUrl)
    } catch {
      /* l’aperçu sera récupéré avec la page */
    }
  })
}

/** `post_type` enregistré : image, vidéo, ou texte si aucun média. */
export function mediaPostType(items: Array<{ kind: MediaKind }>): 'text' | 'image' | 'video' {
  if (!items.length) return 'text'
  return items.every(item => item.kind === 'video') ? 'video' : 'image'
}
