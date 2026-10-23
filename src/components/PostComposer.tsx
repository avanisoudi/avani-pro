import { useEffect, useRef, useState } from 'react'
import { MAX_POST_MEDIA_FILES, createComposerMedia, formatMediaSize, releaseComposerMedia, validateMediaSelection } from '../lib/postMedia'
import type { ComposerMedia } from '../lib/postMedia'
import { GlobeIcon } from './icons'

/** Icône « image » maison : cadre et soleil, aucun logo externe. */
function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M21 15.5 16.5 11 7 20" />
    </svg>
  )
}

type PostComposerProps = {
  displayName: string
  initials: string
  avatarUrl: string | null
  busy: boolean
  progress: { done: number; total: number } | null
  /** Renvoie false si la publication a échoué : le brouillon et les aperçus sont conservés. */
  onPublish: (body: string, media: ComposerMedia[]) => Promise<boolean>
  onNotify: (message: string) => void
  /** Demande d’ouverture du sélecteur depuis l’extérieur (bouton « Vidéos » de la barre supérieure). */
  request?: { id: number; kind: 'all' | 'video' } | null
}

/**
 * Composeur du fil : saisie, sélection de fichiers réels, aperçus retirables,
 * publication. Le bouton « Photo/vidéo » ouvre le sélecteur du système (plus
 * aucune image de démonstration) et le champ « Publier » s’active dès qu’il y a
 * un texte ou un média.
 */
export function PostComposer({ displayName, initials, avatarUrl, busy, progress, onPublish, onNotify, request }: PostComposerProps) {
  const [body, setBody] = useState('')
  const [media, setMedia] = useState<ComposerMedia[]>([])
  const [placeOpen, setPlaceOpen] = useState(false)
  const [place, setPlace] = useState('')
  const [acceptKind, setAcceptKind] = useState<'all' | 'video'>('all')
  const fileInput = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const mediaRef = useRef<ComposerMedia[]>([])

  useEffect(() => {
    mediaRef.current = media
  }, [media])
  useEffect(() => () => releaseComposerMedia(mediaRef.current), [])

  const totalBytes = media.reduce((sum, item) => sum + item.file.size, 0)
  const canPublish = Boolean(body.trim()) || media.length > 0
  const firstName = displayName.split(' ')[0] || 'vous'

  const openPicker = (kind: 'all' | 'video' = 'all') => {
    const input = fileInput.current
    if (!input) return
    setAcceptKind(kind)
    // Le filtre doit être appliqué avant l’ouverture du sélecteur, pas au rendu suivant.
    input.accept = kind === 'video' ? 'video/*' : 'image/*,video/*'
    formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    input.click()
  }

  // Demande venue d’un autre écran : on attend que le composeur soit monté.
  const handledRequest = useRef(0)
  useEffect(() => {
    if (!request || request.id === handledRequest.current) return
    handledRequest.current = request.id
    openPicker(request.kind)
  }, [request])

  const onFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!selected.length) return
    const { accepted, rejected } = validateMediaSelection(selected, media.length, totalBytes)
    if (rejected.length) onNotify(rejected.join(' '))
    if (accepted.length) setMedia(current => [...current, ...createComposerMedia(accepted)])
  }

  const addPlace = () => {
    const name = place.trim()
    if (name) setBody(value => `${value}${value && !value.endsWith(' ') ? ' ' : ''}📍 ${name}`)
    setPlace('')
    setPlaceOpen(false)
  }

  const removeMedia = (id: string) => {
    const item = media.find(entry => entry.id === id)
    if (item) releaseComposerMedia([item])
    setMedia(current => current.filter(entry => entry.id !== id))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!canPublish) {
      onNotify('Écris quelque chose ou ajoute une photo avant de publier.')
      return
    }
    const published = await onPublish(body, media)
    if (!published) return
    releaseComposerMedia(media)
    setMedia([])
    setBody('')
  }

  return (
    <form className="fcomposer" onSubmit={submit} ref={formRef}>
      <div className="fcomposer-top">
        <span className="fcomposer-avatar" aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : initials || 'AV'}
        </span>
        <label className="fcomposer-field">
          <span className="fcomposer-label">Partager avec votre réseau</span>
          <textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            maxLength={5000}
            placeholder={`Quoi de neuf, ${firstName} ?`}
            aria-label="Contenu de la publication"
            rows={3}
            disabled={busy}
          />
        </label>
      </div>

      {media.length > 0 ? (
        <ul className="fcomposer-media">
          {media.map((item, index) => (
            <li key={item.id}>
              {item.kind === 'video' ? (
                <video src={item.previewUrl} muted playsInline preload="metadata" />
              ) : (
                <img src={item.previewUrl} alt={`Aperçu ${index + 1} : ${item.file.name}`} />
              )}
              <span className="fcomposer-media-meta">
                {item.kind === 'video' ? 'Vidéo' : 'Photo'} · {formatMediaSize(item.file.size)}
              </span>
              <button type="button" onClick={() => removeMedia(item.id)} disabled={busy} aria-label={`Retirer ${item.file.name}`}>
                ×
              </button>
            </li>
          ))}
          {media.length < MAX_POST_MEDIA_FILES ? (
            <li>
              <button type="button" className="fcomposer-add" onClick={() => openPicker()} disabled={busy} aria-label="Ajouter une autre photo ou vidéo">
                +
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="fcomposer-footer">
        <div className="fcomposer-tools">
          <button type="button" className="fcomposer-tool is-photo" onClick={() => openPicker()} disabled={busy} aria-label="Ajouter une photo ou une vidéo">
            <PhotoIcon /> <span>Photo/vidéo{media.length ? ` (${media.length})` : ''}</span>
          </button>
          <button type="button" className="fcomposer-tool is-reel" onClick={() => openPicker('video')} disabled={busy} aria-label="Ajouter un Reel vidéo">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m10 9 5 3-5 3z" /></svg><span>Reel</span>
          </button>
          <button type="button" className="fcomposer-tool is-mood" onClick={() => setBody(value => (value ? `${value} 😊` : '😊 '))} disabled={busy} aria-label="Ajouter une humeur ou une activité">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M8 14q4 5 8 0M8 8v2m8-2v2" /></svg> <span>Humeur/activité</span>
          </button>
          <button type="button" className="fcomposer-tool is-place" onClick={() => setPlaceOpen(open => !open)} disabled={busy} aria-expanded={placeOpen} aria-label="Ajouter un lieu">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a8 8 0 0 0-8 8c0 6 8 13 8 13s8-7 8-13a8 8 0 0 0-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" /></svg> <span>Lieux</span>
          </button>
          <span className="fcomposer-audience" title="Visibilité selon les règles d’accès de ton compte">
            <GlobeIcon /> <span>Public</span>
          </span>
        </div>
        <div className="fcomposer-submit">
          <span className={body.length > 4800 ? 'fcomposer-counter near-limit' : 'fcomposer-counter'}>{body.length}/5000</span>
          <button type="submit" className="fcomposer-publish" disabled={busy || !canPublish}>
            {busy ? (progress ? `Envoi ${progress.done}/${progress.total}…` : 'Publication…') : 'Publier'}
          </button>
        </div>
      </div>
      {placeOpen ? (
        <div className="fcomposer-place">
          <input
            value={place}
            onChange={event => setPlace(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addPlace()
              }
            }}
            placeholder="Où êtes-vous ?"
            aria-label="Lieu de la publication"
            disabled={busy}
          />
          <button type="button" onClick={addPlace} disabled={busy}>Ajouter</button>
          <button type="button" className="fcomposer-place-cancel" onClick={() => { setPlace(''); setPlaceOpen(false) }} aria-label="Annuler le lieu">
            ×
          </button>
        </div>
      ) : null}
      <input ref={fileInput} className="fcomposer-file" type="file" accept={acceptKind === 'video' ? 'video/*' : 'image/*,video/*'} multiple onChange={onFilesSelected} tabIndex={-1} aria-hidden="true" />
      {media.length > 0 ? (
        <p className="fcomposer-hint">
          {media.length}/{MAX_POST_MEDIA_FILES} média{media.length > 1 ? 's' : ''} · {formatMediaSize(totalBytes)} · formats JPEG, PNG, WebP, GIF, MP4, WebM
        </p>
      ) : null}
    </form>
  )
}
