import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { listReactionUsers } from '../lib/api'
import type { ProfileRecord, ReactionType } from '../lib/api'
import { createComment, deleteComment, listComments, updateComment } from '../lib/socialApi'
import type { CommentRecord } from '../lib/socialApi'
import {
  REACTION_EMOJI,
  REACTION_KEYS,
  REACTION_META,
  formatCount,
  formatPostTime,
  isEditedPost,
  isLongPost,
  parsePostContent,
  reactionState,
  topReactions,
} from '../lib/feed'
import type { Post } from '../lib/feed'
import { CloseIcon, ClockIcon, GlobeIcon, SvgIcon, VerifiedBadge } from './icons'

export type CurrentUser = { name: string; handle: string; initials: string; avatarUrl: string | null }

type PostCardProps = {
  post: Post
  user: User | null
  me: CurrentUser
  onReact: (reaction: ReactionType) => void
  onShare: () => void
  onSave: () => void
  onCommentTotalChange: (total: number) => void
  onNotify: (message: string) => void
  onEdit: () => void
  onDelete: () => void
  editing: boolean
  onCancelEdit: () => void
  onSaveEdit: (body: string) => void
}

const HIDDEN_KEY = 'avani:hidden-posts'

function readHidden(postId: string | number) {
  try {
    return (JSON.parse(window.localStorage.getItem(HIDDEN_KEY) || '[]') as string[]).includes(String(postId))
  } catch {
    return false
  }
}

function writeHidden(postId: string | number, value: boolean) {
  try {
    const list = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) || '[]') as string[]
    const next = value ? [...new Set([...list, String(postId)])] : list.filter(id => id !== String(postId))
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(next))
  } catch {
    /* stockage indisponible : le masquage reste valable pour la session */
  }
}

function initialsOf(name: string, fallback = 'AV') {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || fallback
}

/**
 * Carte de publication alignée sur le fil Facebook :
 * en-tête (avatar, nom, heure + audience, menu ⋯), texte, médias pleine largeur,
 * ligne d’engagement (icônes superposées + total, commentaires, partages),
 * barre d’actions J’aime / Commenter / Partager / Enregistrer, puis commentaires.
 */
export function PostCard({ post, user, me, onReact, onShare, onSave, onCommentTotalChange, onNotify, onEdit, onDelete, editing, onCancelEdit, onSaveEdit }: PostCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hidden, setHidden] = useState(() => readHidden(post.id))
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [focusSignal, setFocusSignal] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [reactionModalOpen, setReactionModalOpen] = useState(false)
  const [draft, setDraft] = useState(post.body)
  const cardRef = useRef<HTMLElement>(null)

  const { total: reactionTotal } = reactionState(post)
  const stacked = topReactions(post)
  const { text, media } = parsePostContent(post.body, post.media ?? [])
  const long = isLongPost(text)
  const collapsed = long && !expanded
  const edited = isEditedPost(post.createdAt, post.editedAt)
  const absoluteDate = (value?: string | null) => (value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : undefined)

  const showEngagement = reactionTotal > 0 || post.stats.comments > 0 || post.stats.shares > 0
  const showComments = (focus: boolean) => {
    setCommentsOpen(true)
    if (focus) setFocusSignal(value => value + 1)
  }
  const scrollCommentsIntoView = () => {
    window.setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 40)
  }
  const copyLink = async () => {
    const link = `${window.location.origin}/#publication-${post.id}`
    try {
      await navigator.clipboard.writeText(link)
      onNotify('Lien de la publication copié.')
    } catch {
      onNotify(`Copiez ce lien : ${link}`)
    }
  }
  const submitEdit = (event: React.FormEvent) => {
    event.preventDefault()
    if (draft.trim()) onSaveEdit(draft.trim())
  }

  if (hidden)
    return (
      <article className="fpost-hidden">
        <p>Publication masquée. Vous ne la verrez plus dans votre fil.</p>
        <button
          type="button"
          onClick={() => {
            writeHidden(post.id, false)
            setHidden(false)
          }}
        >
          Annuler
        </button>
      </article>
    )

  return (
    <article className="fpost-card" id={`publication-${post.id}`} ref={cardRef}>
      <header className="fpost-head">
        <span className="fpost-avatar" aria-hidden="true">
          {post.avatarUrl ? <img src={post.avatarUrl} alt="" /> : post.avatar || initialsOf(post.name)}
        </span>
        <div className="fpost-id">
          <p className="fpost-author">
            <strong>{post.name || 'Membre Avani Pro'}</strong>
            {post.verifiedType ? <VerifiedBadge type={post.verifiedType} /> : null}
            {post.handle && post.handle !== `@${post.name.toLowerCase().replace(/\s+/g, '.')}` ? <span className="fpost-handle">{post.handle}</span> : null}
          </p>
          <p className="fpost-meta">
            <ClockIcon />
            <span title={absoluteDate(post.createdAt)}>{post.time}</span>
            {edited ? <span className="fpost-edited"> · modifié</span> : null}
            <span className="fpost-meta-sep" aria-hidden="true">
              ·
            </span>
            <span className="fpost-audience">
              <GlobeIcon /> Public
            </span>
          </p>
        </div>
        <div className="fpost-tools" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false) }}>
          <button
            type="button"
            className="fpost-icon-btn"
            aria-label="Masquer la publication"
            title="Masquer la publication"
            onClick={() => {
              writeHidden(post.id, true)
              setHidden(true)
            }}
          >
            <CloseIcon />
          </button>
          <button type="button" className="fpost-icon-btn" aria-label="Options de la publication" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>
            <span className="fpost-dots" aria-hidden="true">•••</span>
          </button>
          {menuOpen ? (
            <div className="fpost-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void onSave() }}>
                {post.saved ? 'Retirer des enregistrements' : 'Enregistrer la publication'}
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void copyLink() }}>
                Copier le lien
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); showComments(true) }}>
                Écrire un commentaire
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  writeHidden(post.id, true)
                  setHidden(true)
                }}
              >
                Masquer la publication
              </button>
              {user?.id === post.authorId ? (
                <>
                  <span className="fpost-menu-sep" />
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setDraft(post.body); onEdit() }}>
                    Modifier
                  </button>
                  <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuOpen(false); onDelete() }}>
                    Supprimer
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {editing ? (
        <form className="fpost-edit" onSubmit={submitEdit}>
          <textarea value={draft} onChange={event => setDraft(event.target.value)} aria-label="Modifier la publication" maxLength={5000} />
          <div>
            <button type="button" className="message-button" onClick={onCancelEdit}>
              Annuler
            </button>
            <button className="primary-button">Enregistrer</button>
          </div>
        </form>
      ) : (
        <>
          {text ? (
            <div className={collapsed ? 'fpost-text is-collapsed' : 'fpost-text'}>
              <p>{text}</p>
              {long ? (
                <button type="button" className="fpost-more-text" onClick={() => setExpanded(value => !value)}>
                  {expanded ? 'Voir moins' : 'Voir plus'}
                </button>
              ) : null}
            </div>
          ) : null}
          {post.role && !text ? <p className="fpost-subline">{post.role}</p> : null}
          {media.length ? <PostMedia media={media} author={post.name} /> : null}
          {post.tags.length ? (
            <p className="fpost-tags">
              {post.tags.map(tag => (
                <span key={tag}>{tag}</span>
              ))}
            </p>
          ) : null}
        </>
      )}

      {showEngagement ? (
        <div className="fpost-engagement">
          <button
            type="button"
            className="fpost-react-summary"
            onClick={() => setReactionModalOpen(true)}
            aria-label={reactionTotal ? `Voir les ${formatCount(reactionTotal)} réactions` : 'Soyez la première personne à réagir'}
            disabled={!reactionTotal}
          >
            {stacked.length ? (
              <span className="rx-stack" aria-hidden="true">
                {stacked.map(type => (
                  <img key={type} className="rx-stack-icon" src={REACTION_META[type].icon} alt="" />
                ))}
              </span>
            ) : null}
            <span className="rx-total">{formatCount(reactionTotal)}</span>
          </button>
          <div className="fpost-engagement-meta">
            <button type="button" onClick={() => { showComments(false); scrollCommentsIntoView() }}>
              {formatCount(post.stats.comments)} commentaire{post.stats.comments > 1 ? 's' : ''}
            </button>
            {post.stats.shares > 0 ? (
              <button type="button" onClick={onShare}>
                {formatCount(post.stats.shares)} partage{post.stats.shares > 1 ? 's' : ''}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="fpost-actions">
        <ReactionPicker reaction={post.reaction} onReact={onReact} />
        <button
          type="button"
          className={commentsOpen ? 'is-active' : ''}
          aria-expanded={commentsOpen}
          onClick={() => {
            if (commentsOpen) setCommentsOpen(false)
            else {
              showComments(true)
              scrollCommentsIntoView()
            }
          }}
        >
          <SvgIcon name="comment" /> <span>Commenter</span>
        </button>
        <button type="button" onClick={onShare}>
          <SvgIcon name="share" /> <span>Partager</span>
        </button>
        <button type="button" className={post.saved ? 'is-saved' : ''} aria-pressed={Boolean(post.saved)} onClick={onSave}>
          <SvgIcon name="save" /> <span>{post.saved ? 'Enregistrée' : 'Enregistrer'}</span>
        </button>
      </div>

      <CommentSection
        postId={post.id}
        user={user}
        me={me}
        visibleTotal={post.stats.comments}
        open={commentsOpen}
        focusSignal={focusSignal}
        onTotalChange={onCommentTotalChange}
        onNotify={onNotify}
        onClose={() => setCommentsOpen(false)}
      />
      {reactionModalOpen ? <ReactionModal post={post} onClose={() => setReactionModalOpen(false)} /> : null}
    </article>
  )
}

/** Médias d’une publication : 1 pleine largeur, 2 côte à côte, 3 en vedette + colonne, 4 en grille. */
function PostMedia({ media, author }: { media: Array<{ type: 'image' | 'video'; url: string }>; author: string }) {
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const shown = media.slice(0, 4)
  const overflow = media.length - shown.length
  const layout = overflow > 0 ? 4 : shown.length
  return (
    <div className={`fpost-media fpost-media-${layout}${overflow > 0 ? ' has-more' : ''}`}>
      {shown.map((item, index) => (
        <figure className="fpost-media-tile" key={`${item.url}-${index}`}>
          {failed[item.url] ? <div className="fpost-media-error" role="status"><p>Ce média ne peut pas être affiché. Rechargez la page ou ouvrez le fichier.</p><a href={item.url} target="_blank" rel="noreferrer">Ouvrir le fichier</a></div> : item.type === 'video' ? (
            <video src={item.url} controls playsInline preload="metadata" onError={() => setFailed(current => ({ ...current, [item.url]: true }))}><a href={item.url}>Ouvrir la vidéo</a></video>
          ) : (
            <a href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt={`Média publié par ${author}`} loading="lazy" onError={() => setFailed(current => ({ ...current, [item.url]: true }))} /></a>
          )}
          {index === shown.length - 1 && overflow > 0 ? (
            <span className="fpost-media-more">
              +{overflow} photo{overflow > 1 ? 's' : ''}
            </span>
          ) : null}
        </figure>
      ))}
    </div>
  )
}

/** Bouton J’aime avec barre de réactions au survol et appui long sur mobile. */
function ReactionPicker({ reaction, onReact }: { reaction?: ReactionType; onReact: (reaction: ReactionType) => void }) {
  const [open, setOpen] = useState(false)
  const hoverTimer = useRef<number | null>(null)
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const meta = reaction ? REACTION_META[reaction] : undefined
  const cancelHover = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = null
  }
  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current)
    pressTimer.current = null
  }
  useEffect(
    () => () => {
      cancelHover()
      cancelPress()
    },
    [],
  )
  return (
    <div
      className="rx"
      onPointerEnter={event => {
        if (event.pointerType === 'mouse') {
          cancelHover()
          setOpen(true)
        }
      }}
      onPointerLeave={event => {
        if (event.pointerType === 'mouse') {
          cancelHover()
          hoverTimer.current = window.setTimeout(() => setOpen(false), 250)
        }
      }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      {open ? (
        <div className="rx-picker" role="group" aria-label="Choisir une réaction">
          {REACTION_KEYS.map(key => (
            <button
              key={key}
              type="button"
              className={`rx-option${reaction === key ? ' is-selected' : ''}`}
              aria-label={REACTION_META[key].label}
              aria-pressed={reaction === key}
              style={{ color: REACTION_META[key].color }}
              onClick={() => {
                setOpen(false)
                onReact(key)
              }}
            >
              <img src={REACTION_META[key].icon} alt="" />
              <span>{REACTION_META[key].label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className={`rx-button${meta ? ' is-active' : ''}`}
        style={meta ? ({ ['--rx-active' as string]: meta.color } as React.CSSProperties) : undefined}
        aria-label={meta ? `Réaction : ${meta.label}. Appuyez pour modifier ou retirer` : 'J’aime'}
        aria-haspopup="true"
        aria-expanded={open}
        onPointerDown={event => {
          longPressed.current = false
          if (event.pointerType !== 'mouse') {
            cancelPress()
            pressTimer.current = window.setTimeout(() => {
              longPressed.current = true
              setOpen(true)
            }, 450)
          }
        }}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={event => {
          if (longPressed.current) event.preventDefault()
        }}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false
            return
          }
          setOpen(false)
          onReact(reaction ?? 'like')
        }}
      >
        {meta ? <img className="rx-icon" src={meta.icon} alt="" /> : <SvgIcon name="like" />}
        <span>{meta ? meta.label : 'J’aime'}</span>
      </button>
    </div>
  )
}

/** Liste des personnes qui ont réagi, avec un onglet par type. */
function ReactionModal({ post, onClose }: { post: Post; onClose: () => void }) {
  const [filter, setFilter] = useState<ReactionType | 'all'>('all')
  const [users, setUsers] = useState<Array<{ user_id: string; reaction_type: ReactionType; created_at: string; user: Pick<ProfileRecord, 'id' | 'username' | 'full_name' | 'avatar_url'> | null }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const { counts, total } = reactionState(post)

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) onClose()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    listReactionUsers(String(post.id), filter)
      .then(rows => {
        if (active) {
          setUsers(rows)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setUsers([])
          setLoading(false)
          setError('Impossible de charger les personnes qui ont réagi.')
        }
      })
    return () => {
      active = false
    }
  }, [post.id, filter])

  return (
    <div className="reaction-modal-backdrop" role="presentation">
      <div className="reaction-modal" role="dialog" aria-modal="true" aria-label="Réactions" ref={dialogRef}>
        <div className="reaction-modal-head">
          <div>
            <strong>Réactions</strong>
            <span>{formatCount(total)} au total</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="reaction-tabs">
          <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            Toutes <b>{formatCount(total)}</b>
          </button>
          {REACTION_KEYS.map(key => (
            <button type="button" key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
              {REACTION_EMOJI[key]} {REACTION_META[key].label} <b>{formatCount(counts[key])}</b>
            </button>
          ))}
        </div>
        <div className="reaction-user-list">
          {loading ? <p className="empty-copy">Chargement des réactions…</p> : null}
          {!loading && error ? <p className="empty-copy">{error}</p> : null}
          {!loading && !error && users.length === 0 ? <p className="empty-copy">Aucune réaction dans cette catégorie.</p> : null}
          {!loading && !error
            ? users.map(item => (
                <div className="reaction-user-row" key={`${item.user_id}-${item.reaction_type}`}>
                  <div className="avatar avatar-md avatar-soft">
                    {item.user?.avatar_url ? <img src={item.user.avatar_url} alt="" /> : initialsOf(item.user?.full_name || '', 'AV')}
                  </div>
                  <div>
                    <strong>{item.user?.full_name || ''}</strong>
                    <span>@{item.user?.username || ''}</span>
                  </div>
                  <span className={`reaction-user-type reaction-${item.reaction_type}`} aria-label={REACTION_META[item.reaction_type]?.label}>
                    {REACTION_EMOJI[item.reaction_type]}
                  </span>
                </div>
              ))
            : null}
        </div>
      </div>
    </div>
  )
}

type CommentSectionProps = {
  postId: string | number
  user: User | null
  me: CurrentUser
  visibleTotal: number
  open: boolean
  focusSignal: number
  onTotalChange: (total: number) => void
  onNotify: (message: string) => void
  onClose: () => void
}

/**
 * Zone de commentaires ouverte par le bouton « Commenter » : elle se charge à la
 * première ouverture, se referme sur le même bouton ou sur la croix, garde le focus
 * sur le champ de saisie et annonce un total exact à la carte.
 */
function CommentSection({ postId, user, me, visibleTotal, open, focusSignal, onTotalChange, onNotify, onClose }: CommentSectionProps) {
  const [comments, setComments] = useState<CommentRecord[]>([])
  const [loadedTotal, setLoadedTotal] = useState<number | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [visibleRoots, setVisibleRoots] = useState(3)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const loadedRef = useRef(false)
  const repliesSupportedRef = useRef(true)
  const handlers = useRef({ onTotalChange, onNotify })

  useEffect(() => {
    handlers.current = { onTotalChange, onNotify }
  })

  const load = useCallback(async () => {
    if (typeof postId !== 'string') {
      setStatus('ready')
      setError('Commentez depuis une publication enregistrée sur votre espace Avani Pro.')
      return
    }
    setStatus('loading')
    setError('')
    try {
      const result = await listComments(postId)
      repliesSupportedRef.current = result.repliesSupported
      setComments(result.comments)
      setLoadedTotal(result.total)
      setStatus('ready')
      loadedRef.current = true
      handlers.current.onTotalChange(result.total)
    } catch (cause) {
      setStatus('error')
      setError(cause instanceof Error ? cause.message : 'Les commentaires n’ont pas pu être chargés.')
    }
  }, [postId])

  // Une seule ouverture = un seul appel réseau : la relecture n’est déclenchée
  // ni par les rendus parent ni par les callbacks recréés à chaque rendu.
  useEffect(() => {
    if (!open || loadedRef.current) return
    void load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
    return () => window.clearTimeout(timer)
  }, [open, focusSignal])

  const total = loadedTotal ?? visibleTotal
  const loadedIds = new Set(comments.map(comment => comment.id))
  // Une réponse dont le message parent est absent de la liste reste visible telle quelle.
  const roots = comments.filter(comment => !comment.parent_id || !loadedIds.has(comment.parent_id))
  const repliesFor = (id: string) => comments.filter(comment => comment.parent_id === id)
  const authorName = (comment: CommentRecord) => comment.author?.full_name || (comment.author_id === user?.id ? me.name : '')
  const visible = roots.slice(0, visibleRoots)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    if (!user) {
      onNotify('Connectez-vous pour commenter.')
      return
    }
    setBusy(true)
    try {
      const created = await createComment(postId, user.id, body, replyTo && repliesSupportedRef.current ? replyTo : null)
      const next = [...comments, { ...created, parent_id: replyTo ?? null, author: { username: me.handle.replace('@', ''), full_name: me.name, avatar_url: me.avatarUrl, verified_type: null } }]
      const nextTotal = total + 1
      setComments(next)
      setLoadedTotal(nextTotal)
      onTotalChange(nextTotal)
      setDraft('')
      setReplyTo(null)
      setVisibleRoots(Math.max(visibleRoots, roots.length + 1))
    } catch (cause) {
      onNotify(cause instanceof Error ? cause.message : 'Votre commentaire n’a pas pu être publié.')
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const saveEdit = async (comment: CommentRecord) => {
    if (!user || comment.author_id !== user.id || !editingBody.trim()) return
    try {
      await updateComment(comment.id, user.id, editingBody)
      setComments(current => current.map(item => (item.id === comment.id ? { ...item, body: editingBody.trim() } : item)))
      setEditingId(null)
      setEditingBody('')
    } catch (cause) {
      onNotify(cause instanceof Error ? cause.message : 'Votre commentaire n’a pas pu être modifié.')
    }
  }

  const remove = async (comment: CommentRecord) => {
    if (!user || comment.author_id !== user.id) return
    try {
      await deleteComment(comment.id, user.id)
      const removed = comments.filter(item => item.id === comment.id || item.parent_id === comment.id).length
      const next = comments.filter(item => item.id !== comment.id && item.parent_id !== comment.id)
      const nextTotal = Math.max(0, total - removed)
      setComments(next)
      setLoadedTotal(nextTotal)
      onTotalChange(nextTotal)
    } catch (cause) {
      onNotify(cause instanceof Error ? cause.message : 'Votre commentaire n’a pas pu être supprimé.')
    }
  }

  return (
    <div className="fpost-comments" ref={wrapRef} hidden={!open}>
      <div className="fpost-comments-head">
        <strong>{total > 0 ? `${formatCount(total)} commentaire${total > 1 ? 's' : ''}` : 'Soyez le premier à commenter'}</strong>
        <button type="button" onClick={() => { setReplyTo(null); inputRef.current?.focus() }}>
          {user ? 'Écrire un commentaire' : 'Se connecter pour commenter'}
        </button>
        <button type="button" onClick={onClose} aria-label="Replier les commentaires">
          <CloseIcon />
        </button>
      </div>
      {status === 'loading' ? <p className="fpost-comments-note">Chargement des commentaires…</p> : null}
      {status === 'error' ? (
        <p className="fpost-comments-note is-error">
          {error}{' '}
          <button type="button" onClick={() => void load()}>
            Réessayer
          </button>
        </p>
      ) : null}
      {status === 'ready' && roots.length === 0 ? <p className="fpost-comments-note">Aucun commentaire pour l’instant. Lancez la conversation.</p> : null}
      {roots.length > visibleRoots ? (
        <button type="button" className="fpost-comments-more" onClick={() => setVisibleRoots(value => value + 5)}>
          Voir {Math.min(5, roots.length - visibleRoots)} commentaire{Math.min(5, roots.length - visibleRoots) > 1 ? 's' : ''} de plus
        </button>
      ) : null}
      {roots.length > 0 ? (
        <ul className="fpost-comment-list">
          {visible.map(comment => {
            const replies = repliesFor(comment.id)
            return (
              <li className="fpost-comment" key={comment.id}>
                <span className="fpost-comment-avatar" aria-hidden="true">
                  {comment.author?.avatar_url ? <img src={comment.author.avatar_url} alt="" /> : initialsOf(authorName(comment))}
                </span>
                <div className="fpost-comment-body">
                  {editingId === comment.id ? (
                    <div className="fpost-comment-edit">
                      <textarea value={editingBody} onChange={event => setEditingBody(event.target.value)} aria-label="Modifier le commentaire" />
                      <div>
                        <button type="button" className="message-button" onClick={() => setEditingId(null)}>
                          Annuler
                        </button>
                        <button type="button" className="primary-button" onClick={() => void saveEdit(comment)}>
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="fpost-bubble">
                      <strong>
                        {authorName(comment) || 'Membre Avani Pro'}
                        {comment.author?.verified_type ? <VerifiedBadge type={comment.author.verified_type} /> : null}
                      </strong>
                      <p>{comment.body}</p>
                    </div>
                  )}
                  <div className="fpost-comment-meta">
                    <span title={new Date(comment.created_at).toLocaleString('fr-FR')}>{formatPostTime(comment.created_at)}</span>
                    {user ? <button type="button" onClick={() => { setReplyTo(comment.id); inputRef.current?.focus() }}>Répondre</button> : null}
                    {user?.id === comment.author_id && editingId !== comment.id ? (
                      <>
                        <button type="button" onClick={() => { setEditingId(comment.id); setEditingBody(comment.body) }}>Modifier</button>
                        <button type="button" className="is-danger" onClick={() => void remove(comment)}>Supprimer</button>
                      </>
                    ) : null}
                  </div>
                  {replies.length ? (
                    <ul className="fpost-reply-list">
                      {replies.map(reply => (
                        <li key={reply.id}>
                          <span className="fpost-comment-avatar is-small" aria-hidden="true">
                            {reply.author?.avatar_url ? <img src={reply.author.avatar_url} alt="" /> : initialsOf(authorName(reply))}
                          </span>
                          <div>
                            {editingId === reply.id ? (
                              <div className="fpost-comment-edit">
                                <textarea value={editingBody} onChange={event => setEditingBody(event.target.value)} aria-label="Modifier la réponse" />
                                <div>
                                  <button type="button" className="message-button" onClick={() => setEditingId(null)}>Annuler</button>
                                  <button type="button" className="primary-button" onClick={() => void saveEdit(reply)}>Enregistrer</button>
                                </div>
                              </div>
                            ) : (
                              <div className="fpost-bubble">
                                <strong>{authorName(reply) || 'Membre Avani Pro'}</strong>
                                <p>{reply.body}</p>
                              </div>
                            )}
                            <div className="fpost-comment-meta">
                              <span title={new Date(reply.created_at).toLocaleString('fr-FR')}>{formatPostTime(reply.created_at)}</span>
                              {user?.id === reply.author_id ? (
                                <>
                                  <button type="button" onClick={() => { setEditingId(reply.id); setEditingBody(reply.body) }}>Modifier</button>
                                  <button type="button" className="is-danger" onClick={() => void remove(reply)}>Supprimer</button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
      <form className="fpost-comment-form" onSubmit={submit}>
        <span className="fpost-comment-avatar" aria-hidden="true">
          {me.avatarUrl ? <img src={me.avatarUrl} alt="" /> : me.initials || initialsOf(me.name, 'AV')}
        </span>
        <span className="fpost-comment-input">
          <input
            ref={inputRef}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') setReplyTo(null)
            }}
            placeholder={replyTo ? 'Écrivez votre réponse…' : 'Écrivez un commentaire…'}
            aria-label={replyTo ? 'Votre réponse' : 'Votre commentaire'}
            maxLength={2000}
          />
          <button type="submit" className="fpost-comment-send" disabled={busy || !draft.trim()} aria-label={replyTo ? 'Répondre' : 'Publier le commentaire'}>
            <SvgIcon name="share" />
          </button>
        </span>
      </form>
      {replyTo ? (
        <p className="fpost-comment-replying">
          Réponse en cours · <button type="button" onClick={() => setReplyTo(null)}>annuler</button>
        </p>
      ) : (
        <p className="fpost-comment-hint">Appuyez sur Entrée pour publier.</p>
      )}
    </div>
  )
}
