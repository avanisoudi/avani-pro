/**
 * Surfaces média d'Avani Pro : Vidéos, Reels, Stories, et les écrans d'état des
 * fonctionnalités non ouvertes (Marketplace, Live) ou coupées par un drapeau.
 *
 * Règle commune à ces quatre panneaux : rien n'est simulé. Les compteurs viennent de
 * la base, une mesure impossible à lire est annoncée comme indisponible (avec le nom du
 * fichier de migration qui manque), et une erreur réelle reste à l'écran avec Réessayer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createDirectConversation, listFeedPosts, togglePostLike } from '../lib/api'
import { toFeedPost, type Post } from '../lib/feed'
import {
  createStory,
  deleteStory,
  listActiveStories,
  listFollowingIds,
  listMyStoryArchive,
  listMyStoryViews,
  listStoryViewCounts,
  toggleFollow,
  viewStory,
} from '../lib/socialApi'
import type { StoryRecord } from '../lib/socialApi'
import { describeAccessError, isMissingRelationError } from '../lib/postgres'
import type { QueryError } from '../lib/postgres'
import {
  clipsFromPosts,
  countLabel,
  hashtagCloud,
  initialsOf,
  isStoryLive,
  postsWithTag,
  sortByEngagement,
  storyRings,
  storyStats,
  type MediaClip,
} from '../lib/mediaFeed'
import '../media.css'

type Status = 'loading' | 'ready' | 'error'

/**
 * Charge les publications et n'en garde que les vidéos. La relecture au retour d'onglet
 * suit la même discipline que le panneau Groupes : un onglet dormeur ne doit pas rester
 * sur un état périmé.
 */
function useVideoPosts(userId: string | null) {
  const [posts, setPosts] = useState<Post[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const rows = await listFeedPosts(userId)
      setPosts(rows.map(toFeedPost))
      setStatus('ready')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Le fil des vidéos n’a pas pu être chargé.')
      setStatus('error')
    }
  }, [userId])
  useEffect(() => {
    void reload()
    const onVisible = () => { if (document.visibilityState === 'visible') void reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])
  return { posts, status, error, reload }
}

function PanelHeader({ eyebrow, title, text, onReload }: { eyebrow: string; title: string; text: string; onReload: () => void }) {
  return (
    <div className="feature-header">
      <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{text}</p></div>
      <button type="button" className="message-button" onClick={onReload}>Recharger</button>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="media-state media-state-error" role="alert">
      <strong>Chargement impossible</strong>
      <p>{message}</p>
      <button type="button" className="primary-button" onClick={onRetry}>Réessayer</button>
    </div>
  )
}

function TagChips({ cloud, active, onPick }: { cloud: Array<{ tag: string; count: number }>; active: string | null; onPick: (tag: string | null) => void }) {
  if (cloud.length === 0) return null
  return (
    <div className="media-tags" role="group" aria-label="Filtrer par hashtag">
      <button type="button" className={active === null ? 'on' : ''} onClick={() => onPick(null)}>Tout</button>
      {cloud.map(item => (
        <button type="button" key={item.tag} className={active === item.tag ? 'on' : ''} onClick={() => onPick(active === item.tag ? null : item.tag)}>
          {item.tag}<small>{item.count}</small>
        </button>
      ))}
    </div>
  )
}

/** Aimant de like : le compteur affiché est recalculé localement, puis confirmé par la base. */
function useLikeToggle(userId: string | null, onAction: (message: string) => void) {
  const [pending, setPending] = useState<string | null>(null)
  const toggle = async (post: Post) => {
    if (!userId) { onAction('Connectez-vous pour réagir à une vidéo.'); return }
    const postId = String(post.id)
    setPending(postId)
    try {
      await togglePostLike(postId, userId, Boolean(post.liked))
      return true
    } catch (caught) {
      onAction(caught instanceof Error ? caught.message : 'Réaction non enregistrée.')
      return false
    } finally {
      setPending(null)
    }
  }
  return { toggle, pending }
}

/* ------------------------------------------------------------------ Vidéos */

export function VideosPanel({ user, onAction }: { user: User | null; onAction: (message: string) => void }) {
  const { posts, status, error, reload } = useVideoPosts(user?.id ?? null)
  const [tag, setTag] = useState<string | null>(null)
  const [sort, setSort] = useState<'recent' | 'top'>('recent')
  const { toggle, pending } = useLikeToggle(user?.id ?? null, onAction)

  const clips = useMemo<MediaClip[]>(() => {
    const scoped = tag ? postsWithTag(posts, tag) : posts
    const ordered = sort === 'top' ? sortByEngagement(scoped) : scoped
    return clipsFromPosts(ordered)
  }, [posts, tag, sort])

  const cloud = useMemo(() => hashtagCloud(posts), [posts])

  // Après une réaction, on relit la base : le compteur affiché est celui du serveur,
  // pas un simulacre optimiste qui resterait faux si l'insertion avait été refusée.
  const react = async (clip: MediaClip) => {
    if (await toggle(clip.post)) void reload()
  }

  return (
    <section className="feature-panel media-panel">
      <PanelHeader eyebrow="AVANI PRO · VIDÉOS" title="Vidéos du réseau" text="Toutes les publications porteuses d’une vidéo, triées par date ou par réactions reçues." onReload={() => void reload()} />
      <div className="media-toolbar">
        <TagChips cloud={cloud} active={tag} onPick={setTag} />
        <button type="button" className={sort === 'top' ? 'on' : ''} onClick={() => setSort(current => (current === 'top' ? 'recent' : 'top'))}>{sort === 'top' ? 'Les plus réactives' : 'Les plus récentes'}</button>
      </div>
      {status === 'loading' && <div className="media-state">Chargement des publications vidéo…</div>}
      {status === 'error' && error && <ErrorState message={error} onRetry={() => void reload()} />}
      {status === 'ready' && clips.length === 0 && (
        <div className="media-state">
          <strong>Aucune vidéo {tag ? `avec ${tag}` : ''} pour l’instant.</strong>
          <p>Le bouton « Vidéos » du composeur publie un fichier mp4, mov, webm ou ogv — il apparaît ici dès l’insertion en base.</p>
        </div>
      )}
      {clips.length > 0 && (
        <div className="media-grid">
          {clips.map(clip => {
            const post = clip.post
            return (
              <article className="media-card" key={String(post.id)}>
                <video src={clip.src} poster={clip.poster ?? undefined} controls preload="metadata" playsInline />
                <div className="media-card-head">
                  <span className="avatar avatar-sm">{post.avatarUrl ? <img src={post.avatarUrl} alt="" /> : (post.avatar || initialsOf(post.name))}</span>
                  <div><strong>{post.name}</strong><small>{post.time}</small></div>
                </div>
                {post.body && <p className="media-card-body">{post.body}</p>}
                <div className="media-card-foot">
                  <button type="button" className={post.liked ? 'on' : ''} disabled={pending === String(post.id)} onClick={() => void react(clip)}>♥ {formatStat(post.stats.likes)}</button>
                  <span>💬 {formatStat(post.stats.comments)}</span>
                  <span>↗ {formatStat(post.stats.shares)}</span>
                  {clip.views !== null && <span>{countLabel(clip.views, 'vues')}</span>}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function formatStat(value: number) {
  return Number.isFinite(value) && value > 0 ? value.toLocaleString('fr-FR') : '0'
}

/* ------------------------------------------------------------------- Reels */

export function ReelsPanel({ user, onAction }: { user: User | null; onAction: (message: string) => void }) {
  const { posts, status, error, reload } = useVideoPosts(user?.id ?? null)
  const [muted, setMuted] = useState(true)
  const [tag, setTag] = useState<string | null>(null)
  const [following, setFollowing] = useState<string[]>([])
  const { toggle, pending } = useLikeToggle(user?.id ?? null, onAction)
  const container = useRef<HTMLDivElement | null>(null)
  const items = useRef<Array<HTMLElement | null>>([])

  const clips = useMemo<MediaClip[]>(() => clipsFromPosts(tag ? postsWithTag(posts, tag) : posts), [posts, tag])
  const cloud = useMemo(() => hashtagCloud(posts), [posts])

  useEffect(() => {
    if (!user?.id) return
    listFollowingIds(user.id).then(setFollowing).catch(() => setFollowing([]))
  }, [user?.id])

  // Lecture automatique de la reel visible, mise en pause des autres : c'est le
  // comportement attendu d'un scroll vertical, et il ne demande aucun timer maison.
  useEffect(() => {
    if (clips.length === 0 || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const video = (entry.target as HTMLElement).querySelector('video')
        if (!video) continue
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          video.muted = muted
          void video.play().catch(() => undefined)
        } else {
          video.pause()
        }
      }
    }, { root: container.current, threshold: [0, 0.6, 1] })
    for (const node of items.current) if (node) observer.observe(node)
    return () => observer.disconnect()
  }, [clips.length, muted])

  const react = async (clip: MediaClip) => {
    if (await toggle(clip.post)) void reload()
  }

  return (
    <section className="feature-panel media-panel reels-panel">
      <PanelHeader eyebrow="AVANI PRO · REELS" title="Format vertical" text="Déroulez : la vidéo à l’écran se lance, les autres se mettent en pause. Le son est coupé par défaut." onReload={() => void reload()} />
      {status === 'loading' && <div className="media-state">Préparation des reels…</div>}
      {status === 'error' && error && <ErrorState message={error} onRetry={() => void reload()} />}
      {status === 'ready' && clips.length === 0 && <div className="media-state"><strong>Pas encore de vidéo verticale.</strong><p>Les reels réutilisent les publications vidéo du réseau : publiez-en une pour remplir ce flux.</p></div>}
      {clips.length > 0 && (
        <>
          <div className="media-toolbar">
            <TagChips cloud={cloud} active={tag} onPick={setTag} />
            <button type="button" onClick={() => setMuted(value => !value)} aria-pressed={!muted}>{muted ? 'Activer le son' : 'Couper le son'}</button>
          </div>
          <div className="reels-stack" ref={container}>
            {clips.map((clip, index) => {
              const post = clip.post
              const isFollowing = Boolean(post.authorId && following.includes(post.authorId))
              return (
                <div
                  className="reel-item"
                  key={String(post.id)}
                  ref={node => { items.current[index] = node }}
                  onClick={event => {
                    const video = (event.currentTarget as HTMLElement).querySelector('video')
                    if (!video) return
                    if (video.paused) void video.play().catch(() => undefined)
                    else video.pause()
                  }}
                >
                  <video src={clip.src} poster={clip.poster ?? undefined} muted={muted} loop playsInline preload="metadata" />
                  <div className="reel-meta">
                    <strong>{post.name}</strong>
                    <p>{post.body}</p>
                    <span>{post.tags.join(' · ') || 'sans hashtag'}</span>
                  </div>
                  <div className="reel-actions">
                    <button type="button" className={post.liked ? 'on' : ''} disabled={pending === String(post.id)} onClick={event => { event.stopPropagation(); void react(clip) }}>♥ {formatStat(post.stats.likes)}</button>
                    <button type="button" disabled={Boolean(pending)} onClick={event => { event.stopPropagation(); onAction('Commentaires : ouvrez la publication dans le fil pour y répondre.') }}>💬 {formatStat(post.stats.comments)}</button>
                    {post.authorId && post.authorId !== user?.id && (
                      <button
                        type="button"
                        className={isFollowing ? 'on' : ''}
                        onClick={async event => {
                          event.stopPropagation()
                          if (!user?.id) { onAction('Connectez-vous pour suivre un créateur.'); return }
                          try {
                            await toggleFollow(user.id, post.authorId as string, isFollowing)
                            setFollowing(current => (isFollowing ? current.filter(id => id !== post.authorId) : [...current, post.authorId as string]))
                            onAction(isFollowing ? `Vous ne suivez plus ${post.name}.` : `Vous suivez désormais ${post.name}.`)
                          } catch (caught) {
                            onAction(caught instanceof Error ? caught.message : 'Abonnement non enregistré.')
                          }
                        }}
                      >
                        {isFollowing ? 'Abonné' : 'Suivre'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

/* ----------------------------------------------------------------- Stories */

const STORY_DURATION_MS = 5000

export function StoriesPanel({ user, onAction, onMessage }: { user: User | null; onAction: (message: string) => void; onMessage?: (conversationId: string) => void }) {
  // Identifiant extrait une seule fois : dépendre de `user?.id` partout embrouille le
  // compilateur React (il infère `user`, plus large que `user?.id`) et la memoïsation
  // manuelle est alors abandonnée — d'où l'avertissement preserve-manual-memoization.
  const userId = user?.id ?? null
  const [stories, setStories] = useState<StoryRecord[]>([])
  const [archive, setArchive] = useState<StoryRecord[]>([])
  const [views, setViews] = useState<Record<string, number>>({})
  const [seen, setSeen] = useState<string[]>([])
  const [viewsNote, setViewsNote] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [openRing, setOpenRing] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [privacy, setPrivacy] = useState<'public' | 'followers' | 'private'>('public')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!userId) {
      // Sans session, `stories` n'est pas interrogeable (les policies lisent auth.uid()).
      setStories([])
      setArchive([])
      setViewsNote(null)
      setStatus('ready')
      return
    }
    setStatus('loading')
    setError(null)
    try {
      const [active, mine] = await Promise.all([listActiveStories(userId), listMyStoryArchive(userId)])
      setStories(active)
      setArchive(mine)
      const [engagement, mine2] = await Promise.all([listStoryViewCounts(active.map(item => item.id)), listMyStoryViews(userId, active.map(item => item.id))])
      setViews(engagement.counts)
      setSeen(mine2.seen)
      setViewsNote(engagement.note ?? mine2.note)
      setStatus('ready')
    } catch (caught) {
      // Table absente ou RLS : on nomme le fichier de migration plutôt que de traduire
      // soi-même un message PostgreSQL brut.
      if (isMissingRelationError(caught as QueryError, 'stories')) {
        setError('Aucune story lisible : la table public.stories n’existe pas encore dans ce projet. Exécutez supabase/migrations/010_stories.sql dans le SQL Editor, puis Réessayez.')
      } else {
        const note = describeAccessError(caught as QueryError, 'Les stories n’ont pas pu être lues', '010_stories.sql')
        setError(note ?? (caught instanceof Error ? caught.message : 'Les stories n’ont pas pu être lues.'))
      }
      setStatus('error')
    }
  }, [userId])

  useEffect(() => {
    void reload()
    const onVisible = () => { if (document.visibilityState === 'visible') void reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  // Deux mémoïsations plutôt qu'une : la liste filtrée doit être une valeur stable pour que
  // le regroupement en bagues ne soit pas recalculé à chaque rendu (l'avertissement
  // « memoization could not be preserved » vient exactement de ce filtre écrit en ligne).
  const liveStories = useMemo(() => stories.filter(story => isStoryLive(story)), [stories])
  const rings = useMemo(() => storyRings(liveStories, userId, seen), [liveStories, userId, seen])
  const current = rings.find(ring => ring.authorId === openRing) ?? null
  const shown = current ? current.stories : []
  const story = shown[index] ?? null

  // Vues réelles, lues à l'ouverture de la bague : un compteur figé serait un mensonge.
  useEffect(() => {
    if (!current) return
    const ids = current.stories.map(item => item.id)
    let cancelled = false
    listStoryViewCounts(ids)
      .then(result => {
        if (cancelled) return
        setViews(previous => ({ ...previous, ...result.counts }))
        setViewsNote(result.note)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [current])

  // Le beacon de vue ne doit pas faire échouer la lecture, mais son échec se dit :
  // « compteur hors service » est une information, pas une erreur avalée.
  useEffect(() => {
    if (!story || !userId) return
    viewStory(story.id, userId)
      .then(recorded => { if (!recorded) setViewsNote('Compteur de vues hors service : la table `story_views` est créée par `supabase/migrations/010_stories.sql`.') })
      .catch(() => setViewsNote('Vue non comptée : la base a refusé l’écriture dans `story_views`.'))
  }, [story, userId])

  // Avance automatique : 5 s sur une photo, la durée réelle sur une vidéo.
  useEffect(() => {
    if (!current || !story) return
    const isVideo = story.media_type === 'video'
    const timer = window.setTimeout(() => {
      if (index + 1 < shown.length) setIndex(value => value + 1)
      else setOpenRing(null)
    }, isVideo ? 20000 : STORY_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [current, story, index, shown.length])

  const publish = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!userId) { onAction('Connectez-vous pour publier une story.'); return }
    if (!file) { onAction('Choisissez une photo ou une vidéo.'); return }
    setBusy(true)
    try {
      await createStory(userId, file, caption, privacy)
      setFile(null)
      setCaption('')
      await reload()
      onAction('Story publiée pour 24 heures.')
    } catch (caught) {
      onAction(caught instanceof Error ? caught.message : 'La story n’a pas pu être publiée.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (storyId: string) => {
    if (!userId) return
    setBusy(true)
    try {
      await deleteStory(storyId, userId)
      await reload()
      onAction('Story retirée.')
    } catch (caught) {
      onAction(caught instanceof Error ? caught.message : 'Suppression impossible.')
    } finally {
      setBusy(false)
    }
  }

  const answer = async () => {
    if (!story || !userId || story.author_id === userId) return
    if (!onMessage) { onAction('Réponse privée indisponible hors messagerie.'); return }
    try {
      const conversation = await createDirectConversation(userId, story.author_id, story.author?.full_name || 'Membre Avani Pro')
      const id = (conversation as { id?: string } | null)?.id ?? ''
      if (!id) throw new Error('Conversation indisponible pour cette réponse.')
      setIndex(0)
      setOpenRing(null)
      onMessage(id)
    } catch (caught) {
      onAction(caught instanceof Error ? caught.message : 'Réponse impossible.')
    }
  }

  const stats = storyStats(stories, userId)
  const expired = archive.filter(item => !isStoryLive(item))

  return (
    <section className="feature-panel media-panel stories-panel">
      <PanelHeader eyebrow="AVANI PRO · STORIES" title="Stories et archive" text="24 heures en avant, puis dans votre archive personnelle. Les vues viennent de `story_views`, jamais d’un estimatif." onReload={() => void reload()} />

      <form className="inline-form story-form" onSubmit={publish}>
        <label><span>Photo ou vidéo</span><input type="file" accept="image/*,video/*" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        <label><span>Légende</span><input value={caption} onChange={event => setCaption(event.target.value)} placeholder="Une ligne, si vous voulez" /></label>
        <label><span>Visibilité</span><select value={privacy} onChange={event => setPrivacy(event.target.value as typeof privacy)}><option value="public">Publique</option><option value="followers">Abonnés</option><option value="private">Moi uniquement</option></select></label>
        <button className="primary-button" type="submit" disabled={busy || !file}>{busy ? 'Publication…' : 'Publier 24 h'}</button>
      </form>

      {status === 'loading' && <div className="media-state">Lecture des stories actives…</div>}
      {status === 'error' && error && <ErrorState message={error} onRetry={() => void reload()} />}
      {status === 'ready' && !userId && <div className="media-state"><strong>Stories non lisibles hors session.</strong><p>Les règles d’accès de `stories` filtrent sur le compte connecté : connectez-vous pour voir le fil et publier.</p></div>}

      {status === 'ready' && Boolean(userId) && (
        <>
          <div className="story-rings">
            {rings.map(ring => (
              <button type="button" key={ring.authorId} className={ring.unseen ? 'unseen' : ''} onClick={() => { setOpenRing(ring.authorId); setIndex(0) }}>
                <span className="story-ring-avatar">{ring.avatarUrl ? <img src={ring.avatarUrl} alt="" /> : ring.initials}</span>
                <small>{ring.mine ? 'Votre story' : ring.authorName}</small>
                <em>{ring.stories.length}</em>
              </button>
            ))}
            {rings.length === 0 && <div className="media-state"><strong>Aucune story active.</strong><p>Publiez la première avec le formulaire ci-dessus.</p></div>}
          </div>

          <div className="story-stats">
            <span><strong>{stats.live}</strong> en ligne</span>
            <span><strong>{stats.videos}</strong> vidéos</span>
            <span><strong>{stats.withCaption}</strong> légendées</span>
            <span><strong>{expired.length}</strong> à l’archive</span>
            {viewsNote && <span className="story-stats-note">{viewsNote}</span>}
          </div>

          {expired.length > 0 && (
            <div className="story-archive">
              <h3>Mon archive</h3>
              <div>{expired.slice(0, 12).map(item => <span key={item.id} title={item.caption ?? ''}>{new Date(item.created_at).toLocaleDateString('fr-FR')}</span>)}</div>
            </div>
          )}
        </>
      )}

      {current && story && (
        <div className="story-viewer" role="dialog" aria-modal="true" aria-label={`Stories de ${current.mine ? 'vous' : current.authorName}`}>
          <div className="story-viewer-progress">{shown.map((item, position) => <i key={item.id} className={position <= index ? 'on' : ''} />)}</div>
          <div className="story-viewer-head">
            <strong>{current.mine ? 'Votre story' : current.authorName}</strong>
            <span>{new Date(story.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
            <button type="button" onClick={() => setOpenRing(null)} aria-label="Fermer">✕</button>
          </div>
          {story.media_url
            ? (story.media_type === 'video'
              ? <video className="story-media" src={story.media_url} controls autoPlay playsInline />
              : <img className="story-media" src={story.media_url} alt={story.caption ?? 'Story'} />)
            : <div className="media-state">Média indisponible : lien de stockage expiré, rechargez la page.</div>}
          {story.caption && <p className="story-caption">{story.caption}</p>}
          <div className="story-viewer-foot">
            <span>{countLabel(viewsNote ? null : (views[story.id] ?? 0), 'vues')}</span>
            <div>
              <button type="button" disabled={index === 0} onClick={() => setIndex(value => Math.max(0, value - 1))}>Précédente</button>
              <button type="button" disabled={index + 1 >= shown.length} onClick={() => setIndex(value => value + 1)}>Suivante</button>
              {!current.mine && <button type="button" onClick={() => void answer()}>Répondre en privé</button>}
              {current.mine && <button type="button" disabled={busy} onClick={() => void remove(story.id)}>Retirer</button>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/* ---------------------------------------------------- Écrans d'état honnêtes */

/**
 * Marketplace, Live, et toute fonction coupée par un drapeau : aucun catalogue factice,
 * aucun lecteur simulé. L'écran dit l'état réel et, si l'interruption vient d'une table
 * absente, nomme le fichier de migration à exécuter.
 */
export function SoonPanel({ title, text, note, actionLabel, onAction }: { title: string; text: string; note?: string | null; actionLabel?: string; onAction?: () => void }) {
  return (
    <section className="feature-panel media-panel soon-panel">
      <div className="feature-header"><div><span className="eyebrow">AVANI PRO · ÉTAT DE LA FONCTION</span><h2>{title}</h2><p>{text}</p></div></div>
      {note && <div className="media-state media-state-note">{note}</div>}
      {actionLabel && onAction && <div className="soon-actions"><button type="button" className="primary-button" onClick={onAction}>{actionLabel}</button></div>}
    </section>
  )
}
