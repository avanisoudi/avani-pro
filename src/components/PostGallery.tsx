import { useEffect, useRef, useState } from 'react'
import { albumIndex } from '../lib/postAlbum'

type Media = { type: 'image' | 'video'; url: string }

/** Native modal: focus trap, Escape, background inert, and original-resolution media. */
export function PostGallery({ media, author, initialIndex, onClose }: { media: Media[]; author: string; initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex)
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const dialog = useRef<HTMLDialogElement>(null)
  const item = media[index]
  const move = (direction: number) => setIndex(current => albumIndex(current, direction, media.length))
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    dialog.current?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])
  return <dialog ref={dialog} className="post-gallery" aria-label="Album de la publication" onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }} onKeyDown={event => {
    if ((event.target as HTMLElement).tagName === 'VIDEO') return
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1) }
  }}>
    <div className="post-gallery-shell">
      <header className="post-gallery-head"><div><strong>{author}</strong><span className="post-gallery-counter" aria-live="polite">{index + 1} / {media.length}</span></div><button type="button" onClick={onClose} aria-label="Fermer l’album" autoFocus>×</button></header>
      <div className="post-gallery-stage">
        {media.length > 1 && <button type="button" className="post-gallery-prev" aria-label="Média précédent" onClick={() => move(-1)}>‹</button>}
        {failed[item.url] ? <div className="post-gallery-error" role="status">Lecture indisponible. <a href={item.url} target="_blank" rel="noreferrer">Ouvrir le fichier original</a></div> : item.type === 'video' ? <video key={item.url} src={item.url} controls playsInline onError={() => setFailed(current => ({ ...current, [item.url]: true }))} /> : <img src={item.url} alt={`Photo ${index + 1} sur ${media.length}, publication de ${author}`} onError={() => setFailed(current => ({ ...current, [item.url]: true }))} />}
        {media.length > 1 && <button type="button" className="post-gallery-next" aria-label="Média suivant" onClick={() => move(1)}>›</button>}
      </div>
      <nav className="post-gallery-thumbnails" aria-label="Médias de l’album">{media.map((entry, i) => <button key={`${entry.url}-${i}`} type="button" aria-label={`Afficher le média ${i + 1}`} aria-current={index === i ? 'true' : undefined} onClick={() => setIndex(i)}>{entry.type === 'image' ? <img src={entry.url} alt="" /> : <span>▶ {i + 1}</span>}</button>)}</nav>
    </div>
  </dialog>
}
