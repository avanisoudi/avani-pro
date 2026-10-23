import { uniqueById } from './lib/deduplicate'
import { useAppPresence } from './lib/onlinePresence'
import { version } from '../package.json'
import './version.css'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { User } from '@supabase/supabase-js'
import './App.css'
import './mobile.css'
import './desktop.css'
import './landing.css'
import './reactions.css'
import './feed.css'
import './themes.css'
import './feed-reference.css'
import './professional.css'
import './avani-neon.css'
import { AuthModal } from './components/AuthModal'
import { ConfirmEmailPanel } from './components/ConfirmEmailPanel'
import { ResetPasswordPanel } from './components/ResetPasswordPanel'
import { AdminPanel, ExplorePanel, GroupsPanel, PagesPanel, ProfilePanel, SettingsPanel } from './components/FeaturePanels'
import { MessagesPanel } from './components/MessagesPanel'
import { FilesPanel, NotificationsPanel, PublicProfilePanel, SavedPanel, SearchPanel } from './components/AdvancedPanels'
import { ReelsPanel, SoonPanel, StoriesPanel, VideosPanel } from './components/MediaPanels'
import { readFeatureFlags } from './lib/socialApi'
import { createPost, deletePost as deletePostRecord, getMyProfile, listFeedPosts, recordPostShare, setPostReaction, toggleSavedPost, updatePost as updatePostRecord, type ProfileRecord, type ReactionType } from './lib/api'
import { createStory, listActiveStories, listDiscoverableProfiles, listFollowingIds, listMyGroups, toggleFollow, type StoryRecord } from './lib/socialApi'
import { getTheme, subscribeTheme } from './lib/theme'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { REACTION_KEYS, applyReaction, emptyReactionCounts, extractTags, toFeedPost } from './lib/feed'
import type { Post } from './lib/feed'
import { PostCard } from './components/PostCard'
import { PostComposer } from './components/PostComposer'
import { mediaPostType, removePostMedia, resolvePostMediaPaths, uploadPostMedia } from './lib/postMedia'
import type { ComposerMedia } from './lib/postMedia'
import { NavButton, SvgIcon, VerifiedBadge } from './components/icons'

/** Le type Post et les helpers du fil vivent dans src/lib/feed.ts. */
type NavKey = 'feed' | 'explore' | 'messages' | 'groups' | 'pages' | 'profile' | 'admin' | 'settings' | 'files' | 'saved' | 'notifications' | 'videos' | 'reels' | 'stories' | 'marketplace' | 'live'

/**
 * Table de routage unique : la valeur d'ouverture et le bouton précédent du navigateur
 * passent par la même fonction, sinon les deux listes finissent par se contredire
 * (c'était le cas quand chaque route avait sa chaîne de `startsWith` en double).
 */
function navForPath(path: string): NavKey {
  if (path.startsWith('/videos')) return 'videos'
  if (path.startsWith('/reels')) return 'reels'
  if (path.startsWith('/stories')) return 'stories'
  if (path.startsWith('/marketplace')) return 'marketplace'
  if (path.startsWith('/live')) return 'live'
  if (path.startsWith('/groups')) return 'groups'
  if (path.startsWith('/pages')) return 'pages'
  if (path.startsWith('/messages')) return 'messages'
  if (path.startsWith('/notifications')) return 'notifications'
  if (path.startsWith('/files')) return 'files'
  if (path.startsWith('/saved')) return 'saved'
  if (path.startsWith('/admin')) return 'admin'
  if (path.startsWith('/settings/compte')) return 'settings'
  if (path.startsWith('/settings') || path.startsWith('/u/')) return 'profile'
  if (path.startsWith('/search')) return 'explore'
  return 'feed'
}
function PublicHome({ onAuth }: { onAuth: () => void }) {
  return <div className="lp">
    <header className="lp-nav">
      <a className="lp-brand" href="/" aria-label="Avani Pro, accueil"><picture className="navbar-brand-picture"><img className="navbar-wordmark" src="/assets/avani-navbar.svg" alt="AVANI PRO" /></picture><span className="app-version" aria-label={`Version ${version}`}>v{version}</span></a>
      <nav className="lp-links" aria-label="Sections"><a href="#vision">Pourquoi Avani Pro</a><a href="#features">Fonctionnalités</a></nav>
      <div className="lp-actions"><button type="button" className="lp-login" onClick={onAuth}>Se connecter</button><button type="button" className="lp-cta" onClick={onAuth}>Créer un compte</button></div>
    </header>
    <section className="lp-hero">
      <div className="lp-copy">
        <span className="lp-eyebrow">LE RÉSEAU PROFESSIONNEL POUR FAIRE AVANCER VOS IDÉES</span>
        <h1>Vos idées méritent <em>les bonnes connexions.</em></h1>
        <p>Avani Pro réunit professionnels, créateurs et entreprises pour partager des projets, rejoindre des communautés pertinentes et poursuivre les échanges au même endroit.</p>
        <div className="lp-hero-actions"><button type="button" className="lp-cta lp-cta-large" onClick={onAuth}>Rejoindre Avani Pro</button><a className="lp-link" href="#vision">Découvrir la plateforme ↓</a></div>
        <p className="lp-proof">Publiez. Échangez. <strong>Faites avancer vos projets.</strong></p>
      </div>
      <div className="lp-preview" aria-label="Exemple de fil Avani Pro, démonstration visuelle">
        <article className="lp-post">
          <div className="lp-post-head"><span className="lp-avatar">AV</span><div><strong>Exemple de publication</strong><small>Démonstration · Public</small></div></div>
          <p>Partagez une idée, une actualité ou un projet avec votre réseau.</p>
          <div className="lp-post-tags"><span>#Motivation</span><span>#Projets</span></div>
          <div className="lp-post-stats"><span>Réactions</span><span>Commentaires · partages</span></div>
          <div className="lp-post-actions"><span>J’aime</span><span>Commenter</span><span>Partager</span><span>Enregistrer</span></div>
        </article>
        <article className="lp-post lp-post-second">
          <div className="lp-post-head"><span className="lp-avatar lp-avatar-alt">CM</span><div><strong>Exemple de communauté</strong><small>Groupe · Démonstration</small></div></div>
          <p>Rejoignez des personnes qui partagent vos intérêts professionnels.</p>
        </article>
      </div>
    </section>
    <section id="vision" className="lp-section">
      <span className="lp-eyebrow">PLUS QU’UN FIL D’ACTUALITÉ</span>
      <h2>Un espace qui donne de la portée à vos idées.</h2>
      <p className="lp-lead">Publiez vos projets, découvrez des professionnels et retrouvez vos échanges dans un même réseau — du premier contact à la conversation qui fait avancer une idée.</p>
    </section>
    <section id="features" className="lp-features">
      <article><span className="lp-num">01</span><h3>Partagez vos projets</h3><p>Publiez vos réflexions, actualités et apprentissages auprès de votre réseau professionnel.</p></article>
      <article><span className="lp-num">02</span><h3>Trouvez votre communauté</h3><p>Rejoignez des groupes pour échanger avec des personnes qui partagent vos intérêts.</p></article>
      <article><span className="lp-num">03</span><h3>Poursuivez la conversation</h3><p>Discutez en direct, partagez des fichiers et retrouvez vos échanges dans la messagerie.</p></article>
    </section>
    <section className="lp-section lp-details">
      <div>
        <span className="lp-eyebrow">PENSÉ POUR VOTRE QUOTIDIEN</span>
        <h2>Tout ce qu’il faut pour faire avancer vos projets.</h2>
      </div>
      <div className="lp-detail-list">
        <article><strong>Un profil professionnel</strong><p>Présentez votre expérience, vos intérêts et les projets que vous souhaitez faire connaître.</p></article>
        <article><strong>Un fil à votre image</strong><p>Suivez les personnes et les communautés qui rendent votre réseau plus pertinent.</p></article>
        <article><strong>Vos choix de partage</strong><p>Choisissez l’audience de vos publications et gérez vos préférences depuis votre compte.</p></article>
      </div>
    </section>
    <section className="lp-band">
      <h2>Votre prochaine conversation peut tout changer.</h2>
      <p>Créez votre compte gratuitement et rejoignez les personnes qui construisent la suite.</p>
      <button type="button" className="lp-cta lp-cta-large" onClick={onAuth}>Créer mon compte gratuitement ↗</button>
    </section>
    <footer className="lp-footer"><span>© 2026 Avani Pro</span><a href="/confidentialite/">Politique de confidentialité</a><a href="mailto:avanisoudi@gmail.com">Contacter Avani Pro</a><span>Un réseau pensé pour avancer.</span></footer>
  </div>
}

function Stories({ onAction, ownAvatar, userId }: { onAction: (message: string) => void; ownAvatar: string | null; userId: string | null }) {
  const [stories, setStories] = useState<StoryRecord[]>([])
  const [storyPreview, setStoryPreview] = useState<string | null>(null)
  const [storyFile, setStoryFile] = useState<File | null>(null)
  const [storyCaption, setStoryCaption] = useState('')
  const [storyPrivacy, setStoryPrivacy] = useState<'public' | 'followers' | 'private'>('public')
  const [storyComposerOpen, setStoryComposerOpen] = useState(false)
  const [viewer, setViewer] = useState<StoryRecord | null>(null)
  const [progress, setProgress] = useState(0)
  const loadStories = async () => { if (!userId) { setStories([]); return }; try { setStories(await listActiveStories(userId)) } catch { onAction('Impossible de charger les stories.') } }
  useEffect(() => { void loadStories() }, [userId])
  useEffect(() => { if (!viewer) return; setProgress(0); const started = Date.now(); const timer = window.setInterval(() => { const value = Math.min(100, ((Date.now() - started) / 7000) * 100); setProgress(value); if (value >= 100) { const index = stories.findIndex(story => story.id === viewer.id); setViewer(stories[index + 1] ?? null) } }, 100); return () => window.clearInterval(timer) }, [viewer, stories])
  const addStory = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { onAction('Choisissez une photo ou une vidéo.'); return }; if (file.size > 50 * 1024 * 1024) { onAction('La story doit faire moins de 50 Mo.'); return }; setStoryFile(file); setStoryPreview(URL.createObjectURL(file)); setStoryComposerOpen(true) }
  const publishStory = async (event: React.FormEvent) => { event.preventDefault(); if (!userId || !storyFile) { onAction('Connectez-vous pour publier une story.'); return }; try { await createStory(userId, storyFile, storyCaption, storyPrivacy); setStoryComposerOpen(false); setStoryCaption(''); setStoryFile(null); if (storyPreview) URL.revokeObjectURL(storyPreview); setStoryPreview(null); await loadStories(); onAction('Story publiée pour 24 heures.') } catch (error) { onAction(error instanceof Error ? error.message : 'La story n’a pas pu être publiée.') } }
  const ownStories = stories.filter(story => story.author_id === userId)
  const ownStory = ownStories[0]
  const others = stories.filter(story => story.author_id !== userId)
  const authorName = (story: StoryRecord) => story.author?.full_name || ''
  return <section className="stories-section" aria-label="Stories">
    <div className="stories-heading"><div><span className="eyebrow">MOMENTS DU RÉSEAU</span><strong>Moments</strong><span>Photos et vidéos partagées par votre réseau</span></div><div className="stories-heading-actions"><b>{stories.length} active{stories.length === 1 ? '' : 's'}</b><button onClick={() => void loadStories()}>Actualiser ↻</button></div></div>
    <div className="stories-row">
      {ownStory ? <button className="story-card story-self story-live" onClick={() => setViewer(ownStory)} aria-label="Voir votre story"><span className="story-shade" />{ownStory.media_url ? <img className="story-media-preview" src={ownStory.media_url} alt="" /> : ownAvatar ? <img className="story-media-preview" src={ownAvatar} alt="" /> : <span className="story-avatar story-avatar-own">AV</span>}<strong>Votre story</strong><span className="story-card-label">{ownStories.length > 1 ? `${ownStories.length} stories` : 'Ajouter'}</span></button> : <label className="story-card story-self" htmlFor="story-upload" aria-label="Créer une story"><span className="story-shade" /><img className="story-media-preview" src={ownAvatar || "/assets/story-placeholder.svg"} alt="" /><span className="story-add-button" aria-hidden="true">+</span><strong>Créer une story</strong></label>}
      {storyComposerOpen && storyPreview && <div className="story-composer-backdrop" role="dialog" aria-modal="true" aria-label="Créer une story"><form className="story-composer" onSubmit={publishStory}><button type="button" className="story-close" onClick={() => setStoryComposerOpen(false)} aria-label="Fermer">×</button><span className="eyebrow">NOUVELLE STORY</span><h3>Aperçu de votre story</h3>{storyFile?.type.startsWith('video/') ? <video src={storyPreview} controls /> : <img src={storyPreview} alt="Aperçu de la story" />}<textarea value={storyCaption} onChange={event => setStoryCaption(event.target.value)} placeholder="Ajoutez une description…" aria-label="Description de la story" /><label className="story-privacy">Audience<select value={storyPrivacy} onChange={event => setStoryPrivacy(event.target.value as typeof storyPrivacy)}><option value="public">Tout le monde</option><option value="followers">Mes followers</option><option value="private">Moi uniquement</option></select></label><div className="story-composer-actions"><button type="button" className="message-button" onClick={() => setStoryComposerOpen(false)}>Annuler</button><button className="primary-button">Partager la story</button></div></form></div>}
      {others.map(story => <button className="story-card story-live" key={story.id} onClick={() => setViewer(story)} aria-label={`Voir la story de ${authorName(story)}`}><span className="story-shade" />{story.media_url ? <img className="story-media-preview" src={story.media_url} alt="" /> : <span className="story-avatar">{authorName(story).slice(0,2).toUpperCase()}</span>}<strong>{authorName(story)}</strong><span className="story-card-label">Voir maintenant</span></button>)}

      <input id="story-upload" className="visually-hidden" type="file" accept="image/*,video/*" onChange={addStory} />
    </div>
    {viewer && <div className="story-viewer" role="dialog" aria-modal="true" aria-label={`Story de ${authorName(viewer)}`} onClick={() => setViewer(null)}><div className="story-viewer-card" onClick={event => event.stopPropagation()}><div className="story-progress"><i style={{ width: `${progress}%` }} /></div><button className="story-close" onClick={() => setViewer(null)} aria-label="Fermer la story">×</button>{stories.findIndex(story => story.id === viewer.id) > 0 && <button type="button" className="story-nav story-nav-prev" onClick={() => setViewer(stories[stories.findIndex(story => story.id === viewer.id) - 1])} aria-label="Story précédente">‹</button>}<div className="story-viewer-media">{viewer.media_type === 'video' ? <video src={viewer.media_url} controls autoPlay /> : <img src={viewer.media_url} alt="" />}</div><strong>{authorName(viewer)}</strong>{viewer.caption && <p>{viewer.caption}</p>}<small>Expire dans 24 heures · audience {viewer.privacy}</small>{stories.findIndex(story => story.id === viewer.id) < stories.length - 1 && <button type="button" className="story-nav story-nav-next" onClick={() => setViewer(stories[stories.findIndex(story => story.id === viewer.id) + 1])} aria-label="Story suivante">›</button>}</div></div>}
  </section>
}
function App() {
  const initialPath = typeof window === 'undefined' ? '/' : window.location.pathname
  const initialNav: NavKey = navForPath(initialPath)
  const [active, setActive] = useState<NavKey>(initialNav)
  const [pathname, setPathname] = useState(initialPath)
  const [canModerate, setCanModerate] = useState(false)
  const [posts, setPosts] = useState<Post[]>([])
  const [toast, setToast] = useState('')
  const [followed, setFollowed] = useState<string[]>([])
  const [networkPeople, setNetworkPeople] = useState<ProfileRecord[]>([])
  const [networkGroups, setNetworkGroups] = useState<any[]>([])
  const [feedFilter, setFeedFilter] = useState<'all' | 'following' | 'trending'>('all')
  const [feedQuery, setFeedQuery] = useState('')
  const [editingPostId, setEditingPostId] = useState<string | number | null>(null)
  const [publishingPost, setPublishingPost] = useState(false)
  const [mediaProgress, setMediaProgress] = useState<{ done: number; total: number } | null>(null)
  const [composerRequest, setComposerRequest] = useState<{ id: number; kind: 'all' | 'video' } | null>(null)
  const [sessionUser, setSessionUser] = useState<User | null>(null)
  useEffect(() => { let active = true; setCanModerate(false); if (sessionUser && supabase) void supabase.rpc('avani_can_moderate').then(({ data }) => { if (active) setCanModerate(data === true) }); return () => { active = false } }, [sessionUser])
  useAppPresence(sessionUser?.id)
  const [profile, setProfile] = useState<ProfileRecord | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [initialConversationId, setInitialConversationId] = useState<string | undefined>()
  const [menuOpen, setMenuOpen] = useState(false)
  // Le thème n'a plus d'état ici : le magasin de src/lib/theme.ts est la seule source de
  // vérité (choix enregistré, sinon préférence du système). App.tsx ne fait que relayer la
  // classe de coquille, dont dépendent les 129 règles « .theme-light … » du rendu Facebook.
  // La bascule, elle, vit uniquement dans Réglages → Apparence.
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'light' as const)
  /**
   * Drapeaux de fonctionnalité (`feature_flags`). Un drapeau absent vaut « ouvert » : seule
   * une décision explicite de l'administration (`enabled = false`) masque une entrée du haut.
   * Une table qui manque n'est donc jamais lue comme « tout est coupé », et le motif est
   * affiché telle quelle par les panneaux.
   */
  const [flags, setFlags] = useState<{ values: Record<string, boolean>; note: string | null }>({ values: {}, note: null })
  const loadFlags = useCallback(async () => {
    try {
      const result = await readFeatureFlags()
      setFlags({ values: Object.fromEntries(result.flags.map(flag => [flag.key, flag.enabled])), note: result.note })
    } catch (caught) {
      setFlags(current => ({ ...current, note: caught instanceof Error ? caught.message : 'Les drapeaux de fonctionnalité n’ont pas pu être lus.' }))
    }
  }, [])
  useEffect(() => { void loadFlags() }, [loadFlags])
  const open = (key: string) => flags.values[key] !== false
  /** Écran d'état d'une fonction coupée : on dit qui l'a coupée et où la rouvrir. */
  const closedPanel = (label: string) => (
    <SoonPanel
      title={`${label} coupée par l’administration`}
      text="Le drapeau correspondant est enregistré désactivé dans `feature_flags`. Aucune interface n’est proposée en secours : la fonction est fermée, point."
      note={flags.note}
      actionLabel="Rouvrir dans Réglages"
      onAction={() => navigateTo('/settings/compte', 'settings')}
    />
  )
  const navigateTo = (path: string, screen: NavKey) => { window.history.pushState({}, '', path); setPathname(path); setActive(screen) }
  useEffect(() => { const onPopState = () => { const path = window.location.pathname; setPathname(path); setActive(navForPath(path)) }; window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState) }, [])

  useEffect(() => {
    const publicLanding = pathname === '/' && !sessionUser
    document.title = publicLanding ? 'Avani Pro — Réseau professionnel et communautés' : 'Avani Pro — Espace membre'
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (publicLanding) {
      if (!canonical) {
        canonical = document.createElement('link')
        canonical.rel = 'canonical'
        document.head.appendChild(canonical)
      }
      canonical.href = 'https://avani-pro.onrender.com/'
    } else {
      canonical?.remove()
      let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
      if (!robots) {
        robots = document.createElement('meta')
        robots.name = 'robots'
        document.head.appendChild(robots)
      }
      robots.content = 'noindex, nofollow'
    }
    if (publicLanding) document.head.querySelector('meta[name="robots"]')?.remove()
  }, [pathname, sessionUser])

  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 8000) }
  /**
   * Réaction optimistic : le nouvel état est dérivé du dernier rendu dans l’updater,
   * donc deux appuis rapprochés (survol de la barre puis clic) ne peuvent ni figer
   * le compteur sur une valeur antérieure ni le compter deux fois.
   */
  const reactToPost = async (id: string | number, reaction: ReactionType) => {
    if (!REACTION_KEYS.includes(reaction)) return
    if (!sessionUser) { flash('Connectez-vous pour réagir à une publication.'); return }
    const current = posts.find(post => post.id === id)
    if (!current) return
    const previous = current
    const rollback = { reaction: previous.reaction, reactionCounts: previous.reactionCounts, stats: previous.stats, liked: previous.liked }
    setPosts(items => items.map(post => {
      if (post.id !== id) return post
      const next = applyReaction(post, reaction)
      return { ...post, liked: Boolean(next.reaction), reaction: next.reaction ?? undefined, reactionCounts: next.counts, stats: { ...post.stats, likes: next.total } }
    }))
    if (typeof id !== 'string') { flash('Réaction conservée sur cet aperçu uniquement.'); return }
    try {
      await setPostReaction(id, sessionUser.id, current.reaction === reaction ? null : reaction)
    } catch {
      setPosts(items => items.map(post => (post.id === id ? { ...post, ...rollback } : post)))
      flash('La réaction n’a pas pu être synchronisée. Votre affichage a été restauré.')
    }
  }
  const displayName = profile?.full_name || sessionUser?.user_metadata?.full_name || ''
  const displayUsername = profile?.username ? `@${profile.username}` : sessionUser?.email ? `@${sessionUser.email.split('@')[0]}` : ''
  const displayAvatar = displayName.split(/\s+/).filter(Boolean).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase()
  const displayAvatarUrl = profile?.avatar_url ?? sessionUser?.user_metadata?.avatar_url ?? sessionUser?.user_metadata?.picture ?? null
  const visiblePosts = useMemo(() => {
    const query = feedQuery.trim().toLowerCase()
    return posts
      .filter(post => !/^test de nouvelle version$/i.test(post.body.trim()))
      .filter(post => feedFilter !== 'following' || Boolean(post.authorId && followed.includes(post.authorId)))
      .filter(post => feedFilter !== 'trending' || post.stats.likes >= 150)
      .filter(post => !query || `${post.name} ${post.body} ${post.tags.join(' ')}`.toLowerCase().includes(query))
  }, [feedFilter, feedQuery, followed, posts])
  /** Ouvre le sélecteur de fichiers du composeur (vidéo seule depuis la barre supérieure). */
  const pickVideoForPost = () => {
    if (active !== 'feed') navigateTo('/', 'feed')
    setComposerRequest(current => ({ id: (current?.id ?? 0) + 1, kind: 'video' }))
    flash('Choisis une vidéo à publier : MP4 ou WebM, 50 Mo maximum.')
  }

  /**
   * Publie le brouillon du composeur. Les fichiers sont d’abord téléversés dans le
   * bucket Storage `post-media` (seuls les chemins d’objets sont enregistrés en base) ;
   * si l’enregistrement échoue, les objets déjà envoyés sont supprimés.
   */
  const publishPost = async (body: string, media: ComposerMedia[]) => {
    const content = body.trim()
    if (!content && !media.length) {
      flash('Écris quelque chose ou ajoute une photo avant de publier.')
      return false
    }
    if (content.length > 5000) {
      flash('Garde ta publication sous 5000 caractères.')
      return false
    }
    if (!sessionUser) {
      flash('Reconnexion nécessaire : rouvre la session puis publie à nouveau.')
      return false
    }
    setPublishingPost(true)
    const uploaded: string[] = []
    try {
      setMediaProgress(media.length ? { done: 0, total: media.length } : null)
      for (const [index, item] of media.entries()) {
        uploaded.push(await uploadPostMedia(sessionUser.id, item.file))
        setMediaProgress({ done: index + 1, total: media.length })
      }
      const authorName: string = String(profile?.full_name || sessionUser.user_metadata?.full_name || 'Membre Avani Pro')
      const author = { id: sessionUser.id, username: profile?.username || (sessionUser.email ? sessionUser.email.split('@')[0] : ''), full_name: authorName, avatar_url: profile?.avatar_url ?? null, bio: profile?.bio ?? null, verified_type: profile?.verified_type ?? null }
      const postType = mediaPostType(media)
      const created = await createPost(sessionUser.id, content, postType, uploaded)
      const paths = Array.isArray(created.media_paths) && created.media_paths.length ? created.media_paths : uploaded
      const resolved = await resolvePostMediaPaths(paths)
      const nextPost = toFeedPost({ id: created.id, body: content, post_type: postType, created_at: created.created_at, author, media: paths.map(path => resolved.get(path) ?? path), likes: 0, comments: 0, shares: 0, liked: false, saved: false, reaction: null, reactionCounts: emptyReactionCounts() })
      setPosts(current => uniqueById([nextPost, ...current]))
      setFeedFilter('all')
      setFeedQuery('')
      flash(uploaded.length ? `Publication en ligne avec ${uploaded.length} média${uploaded.length > 1 ? 's' : ''}.` : 'Votre publication est en ligne.')
      return true
    } catch (error) {
      if (uploaded.length) await removePostMedia(uploaded)
      flash(error instanceof Error ? error.message : 'La publication a échoué.')
      return false
    } finally {
      setMediaProgress(null)
      setPublishingPost(false)
    }
  }
  const updatePost = async (id: string | number, body: string) => {
    if (typeof id !== 'string' || !sessionUser) { flash('Cette publication ne peut pas être modifiée hors connexion.'); return }
    try {
      const saved = await updatePostRecord(id, sessionUser.id, body)
      setPosts(current => current.map(post => post.id === id ? { ...post, body, tags: extractTags(body), editedAt: saved.updated_at } : post))
      setEditingPostId(null)
      flash('Publication modifiée.')
    } catch (error) { flash(error instanceof Error ? error.message : 'La publication n’a pas pu être modifiée.') }
  }
  const deletePost = async (id: string | number) => {
    if (typeof id !== 'string' || !sessionUser) { flash('Cette publication ne peut pas être supprimée hors connexion.'); return }
    try {
      if (!window.confirm('Supprimer définitivement cette publication et ses commentaires ?')) return
      await deletePostRecord(id, sessionUser.id)
      setPosts(current => current.filter(post => post.id !== id))
      flash('Publication supprimée.')
    } catch (error) { flash(error instanceof Error ? error.message : 'La publication n’a pas pu être supprimée.') }
  }
  useEffect(() => { if (!supabase) return; supabase.auth.getSession().then(({ data }) => { setSessionUser(data.session?.user ?? null); if (!data.session) setProfile(null) }); const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSessionUser(session?.user ?? null); if (!session) setProfile(null) }); return () => subscription.unsubscribe() }, [])
  useEffect(() => { if (!sessionUser) { setNetworkPeople([]); setNetworkGroups([]); setFollowed([]); return }; Promise.all([listDiscoverableProfiles(sessionUser.id), listMyGroups(sessionUser.id), listFollowingIds(sessionUser.id)]).then(([people, groups, followingIds]) => { setNetworkPeople(uniqueById(people)); setNetworkGroups(uniqueById(groups)); setFollowed(followingIds) }).catch(() => { setNetworkPeople([]); setNetworkGroups([]); setFollowed([]) }) }, [sessionUser])
  useEffect(() => { if (!supabase) return; listFeedPosts(sessionUser?.id).then(feed => { if (supabase) setPosts(uniqueById(feed.map(post => toFeedPost(post)))) }).catch(() => undefined) }, [sessionUser])
  useEffect(() => { if (!sessionUser || !supabase) return; getMyProfile(sessionUser).then(setProfile).catch(() => undefined) }, [sessionUser])
  const openAuth = () => { if (!isSupabaseConfigured) { flash('Ajoutez vos variables Supabase dans Render pour activer la connexion.'); return }; setAuthOpen(true) }
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); setProfile(null); flash('Vous êtes déconnecté de votre espace sécurisé.') }

  if (pathname.startsWith('/reset-password')) {
    const leaveResetPage = () => { window.history.replaceState({}, '', '/'); setPathname('/') }
    return <>
      <ResetPasswordPanel onDone={message => { leaveResetPage(); flash(message) }} onBack={leaveResetPage} />
      {toast && <div className="toast"><span>✦</span>{toast}</div>}
    </>
  }

  if (pathname.startsWith('/confirm')) {
    const leaveConfirmPage = () => { window.history.replaceState({}, '', '/'); setPathname('/') }
    return <>
      <ConfirmEmailPanel onDone={message => { leaveConfirmPage(); flash(message) }} onBack={leaveConfirmPage} />
      {toast && <div className="toast"><span>✦</span>{toast}</div>}
    </>
  }

  if (!sessionUser) return <><PublicHome onAuth={openAuth} />{authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={flash} />}{toast && <div className="toast"><span>✦</span>{toast}</div>}</>

  return (
    <div className={`app-shell theme-${theme} ${active === 'messages' ? 'messaging-workspace' : ''}`}>
      <header className="topbar av-navbar"><div className="topbar-brand"><button className="topbar-brand-button" aria-label="Accueil Avani Pro" onClick={() => navigateTo('/', 'feed')}><picture className="navbar-brand-picture"><img className="navbar-wordmark" src="/assets/avani-navbar.svg" alt="AVANI PRO" /></picture><span className="app-version" aria-label={`Version ${version}`}>v{version}</span></button><label className="search"><SvgIcon name="search" /><input value={feedQuery} onChange={event => setFeedQuery(event.target.value)} placeholder="Rechercher sur Avani Pro…" aria-label="Recherche globale" /></label></div><nav className="topbar-nav topbar-nav-pro" aria-label="Accès rapide"><button className={active === 'feed' ? 'active' : ''} onClick={() => navigateTo('/', 'feed')} aria-label="Accueil" title="Accueil"><SvgIcon name="home" /><span>Accueil</span></button><button className={active === 'explore' ? 'active' : ''} onClick={() => navigateTo('/search', 'explore')} aria-label="Réseau" title="Réseau"><SvgIcon name="friends" /><span>Réseau</span></button><button className={active === 'pages' ? 'active' : ''} onClick={() => navigateTo('/pages', 'pages')} aria-label="Pages" title="Pages"><SvgIcon name="pages" /><span>Pages</span></button><button className={active === 'groups' ? 'active' : ''} onClick={() => navigateTo('/groups', 'groups')} aria-label="Groupes" title="Groupes"><SvgIcon name="groups" /><span>Groupes</span></button>{open('videos') && <button className={active === 'videos' ? 'active' : ''} onClick={() => navigateTo('/videos', 'videos')} aria-label="Vidéos" title="Vidéos du réseau"><svg className="svg-icon av-play" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="3.5" /><path d="M10 9l5 3-5 3z" /></svg><span>Vidéos</span></button>}
            {open('reels') && <button className={active === 'reels' ? 'active' : ''} onClick={() => navigateTo('/reels', 'reels')} aria-label="Reels" title="Reels verticaux"><svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="3" /><path d="M10.5 9.5l4.5 2.5-4.5 2.5z" /></svg><span>Reels</span></button>}
            {open('stories') && <button className={active === 'stories' ? 'active' : ''} onClick={() => navigateTo('/stories', 'stories')} aria-label="Stories" title="Stories et archive"><svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" strokeDasharray="4 3" /><circle cx="12" cy="12" r="3.4" /></svg><span>Stories</span></button>}
            <button type="button" onClick={pickVideoForPost} aria-label="Publier une vidéo" title="Publier une vidéo"><svg className="svg-icon av-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button></nav><div className="topbar-status"><span className="pulse-dot" />En ligne</div><div className="top-actions"><button type="button" className="nav-bell" aria-label="Notifications" title="Notifications" onClick={() => navigateTo('/notifications', 'notifications')}><svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg><span className="nav-badge" aria-hidden="true" /></button><button className="profile-trigger" aria-label="Ouvrir mon profil" onClick={() => navigateTo('/settings', 'profile')}><span className="avatar avatar-sm avatar-gradient">{displayAvatarUrl ? <img src={displayAvatarUrl} alt="Photo de profil" /> : displayAvatar}</span><span className="profile-trigger-name">{displayName.split(' ')[0]}</span></button><button className="menu-trigger" aria-expanded={menuOpen} aria-label="Ouvrir le menu principal" onClick={() => setMenuOpen(value => !value)}>☰</button></div>{menuOpen && <div className="main-menu"><button onClick={() => { setMenuOpen(false); navigateTo('/settings/compte', 'settings') }}>Réglages</button><button onClick={() => { setMenuOpen(false); navigateTo('/marketplace', 'marketplace') }}>Marketplace</button><button onClick={() => { setMenuOpen(false); navigateTo('/live', 'live') }}>Live</button><button onClick={() => { setMenuOpen(false); navigateTo('/files', 'files') }}>Mes fichiers</button><button onClick={() => { setMenuOpen(false); navigateTo('/notifications', 'notifications') }}>Notifications</button><button className="menu-danger" onClick={() => { setMenuOpen(false); void signOut() }}>Se déconnecter</button></div>}</header>
      <aside className="sidebar sidebar-pro">
        <div className="profile-mini"><div className="avatar avatar-xl avatar-gradient">{displayAvatarUrl ? <img src={displayAvatarUrl} alt="Photo de profil" /> : displayAvatar}</div><div><strong>{displayName}{profile?.verified_type && <VerifiedBadge type={profile.verified_type} />}</strong><span>{displayUsername}</span></div></div>
        <nav className="nav-stack nav-stack-pro" aria-label="Navigation Avani Pro">
          <span className="nav-section-label">VOTRE ESPACE PRO</span>
          <NavButton active={active === 'feed'} onClick={() => navigateTo('/', 'feed')} icon="home" label="Fil d’actualité" />
          <NavButton active={active === 'explore'} onClick={() => navigateTo('/search', 'explore')} icon="friends" label="Amis" />
          <NavButton active={active === 'pages'} onClick={() => navigateTo('/pages', 'pages')} icon="pages" label="Pages" />
          <NavButton active={active === 'groups'} onClick={() => navigateTo('/groups', 'groups')} icon="groups" label="Groupes" />
          {open('videos') && <NavButton active={active === 'videos'} onClick={() => navigateTo('/videos', 'videos')} icon="video" label="Vidéos" />}
          {open('reels') && <NavButton active={active === 'reels'} onClick={() => navigateTo('/reels', 'reels')} icon="reels" label="Reels" />}
          {open('marketplace') && <NavButton active={active === 'marketplace'} onClick={() => navigateTo('/marketplace', 'marketplace')} icon="marketplace" label="Marketplace" />}
          <NavButton active={active === 'messages'} onClick={() => navigateTo('/messages', 'messages')} icon="messages" label="Messages" />
          <NavButton active={active === 'notifications'} onClick={() => navigateTo('/notifications', 'notifications')} icon="explore" label="Notifications" />
          <NavButton active={active === 'saved'} onClick={() => navigateTo('/saved', 'saved')} icon="save" label="Enregistrés" />
          <NavButton active={active === 'files'} onClick={() => navigateTo('/files', 'files')} icon="save" label="Fichiers" />
          <NavButton active={active === 'profile'} onClick={() => navigateTo('/settings', 'profile')} icon="profile" label="Profil professionnel" />
          <span className="nav-section-label nav-section-admin">ADMINISTRATION</span>
          <NavButton active={active === 'admin'} onClick={() => navigateTo('/admin', 'admin')} icon="admin" label="Administration" />
        </nav>
        {networkGroups.length > 0 && <section className="sidebar-shortcuts" aria-label="Vos raccourcis">
          <h2>Vos raccourcis</h2>
          {networkGroups.slice(0, 6).map(group => <button type="button" key={group.id} onClick={() => navigateTo('/groups', 'groups')}>
            <span className="shortcut-mark">{String(group.name || '#').slice(0, 1).toUpperCase()}</span>
            <strong>{group.name}</strong>
          </button>)}
        </section>}
        <div className="premium-card"><strong>Avani Pro Premium</strong><p>Découvrez plus de fonctionnalités et vivez une expérience unique !</p><button type="button" onClick={() => flash('Découvrez Avani Pro Premium.')}>En savoir plus</button></div>
        <div className="sidebar-bottom"><button className={`nav-button muted ${active === 'settings' ? 'active' : ''}`} onClick={() => navigateTo('/settings/compte', 'settings')}><SvgIcon name="settings" /> Réglages</button><div className="security-note"><span className="pulse-dot" /> Espace sécurisé<br /><small>Chiffrement actif</small></div></div>
      </aside>
      <nav className="mobile-tabbar mobile-tabbar-pro" aria-label="Navigation rapide"><NavButton active={active === 'feed'} onClick={() => navigateTo('/', 'feed')} icon="home" label="Flux" /><NavButton active={active === 'explore'} onClick={() => navigateTo('/search', 'explore')} icon="explore" label="Découvrir" /><NavButton active={active === 'messages'} onClick={() => navigateTo('/messages', 'messages')} icon="messages" label="Échanges" /><NavButton active={active === 'notifications'} onClick={() => navigateTo('/notifications', 'notifications')} icon="explore" label="Activité" /><NavButton active={active === 'profile'} onClick={() => navigateTo('/settings', 'profile')} icon="profile" label="Espace" /></nav>

      <main className="main-content">
        

        {active === 'feed' && <>
          <section className="feed-rebuild" aria-label="Fil d’actualité">
            <div className="feed-page-heading">
              <div><h1>Votre fil</h1><p>Les actualités et idées de votre réseau professionnel.</p></div>
              <button type="button" className="feed-refresh" onClick={() => { setFeedQuery(''); flash('Filtres réinitialisés.') }} aria-label="Réinitialiser les filtres">↻</button>
            </div>
            <Stories onAction={flash} ownAvatar={displayAvatarUrl} userId={sessionUser?.id ?? null} />
            <PostComposer
              key={sessionUser.id}
              draftOwnerId={sessionUser.id}
              displayName={displayName}
              initials={displayAvatar}
              avatarUrl={displayAvatarUrl}
              busy={publishingPost}
              progress={mediaProgress}
              onPublish={publishPost}
              onNotify={flash}
              request={composerRequest}
            />
            <div className="feed-controls">
              <div className="feed-filter-tabs" role="tablist" aria-label="Filtrer les publications">
                <button type="button" role="tab" aria-selected={feedFilter === 'all'} className={feedFilter === 'all' ? 'filter-active' : ''} onClick={() => setFeedFilter('all')}>Pour vous</button>
                <button type="button" role="tab" aria-selected={feedFilter === 'following'} className={feedFilter === 'following' ? 'filter-active' : ''} onClick={() => setFeedFilter('following')}>Abonnements</button>
                <button type="button" role="tab" aria-selected={feedFilter === 'trending'} className={feedFilter === 'trending' ? 'filter-active' : ''} onClick={() => setFeedFilter('trending')}>Tendances</button>
              </div>
              <span className="feed-count">{visiblePosts.length} publication{visiblePosts.length === 1 ? '' : 's'}</span>
            </div>
            <section className="post-list feed-post-list" aria-label="Publications">
              {visiblePosts.length === 0 ? <div className="empty-feed"><div className="empty-feed-icon">⌁</div><strong>Aucune publication pour le moment</strong><span>Les publications de votre réseau apparaîtront ici. Vous pouvez commencer par partager une idée.</span></div> : visiblePosts.map(post => (
              <PostCard
                canModerate={canModerate}
                key={post.id}
                post={post}
                user={sessionUser}
                me={{ name: displayName, handle: displayUsername, initials: displayAvatar, avatarUrl: displayAvatarUrl }}
                onReact={reaction => void reactToPost(post.id, reaction)}
                onCommentTotalChange={count => setPosts(current => current.map(item => item.id === post.id ? { ...item, stats: { ...item.stats, comments: count } } : item))}
                onNotify={flash}
                onShare={async () => { if (sessionUser && typeof post.id === 'string') { try { await recordPostShare(post.id, sessionUser.id); setPosts(current => current.map(item => item.id === post.id ? { ...item, stats: { ...item.stats, shares: item.stats.shares + 1 } } : item)) } catch { flash('Le partage n’a pas pu être enregistré.') } } else flash('Connectez-vous pour enregistrer ce partage.') }}
                onSave={async () => { if (!sessionUser || typeof post.id !== 'string') { flash('Connectez-vous pour sauvegarder cette publication.'); return }; try { const next = await toggleSavedPost(post.id, sessionUser.id, post.saved ?? false); setPosts(current => current.map(item => item.id === post.id ? { ...item, saved: next } : item)); flash(next ? 'Publication sauvegardée.' : 'Publication retirée des sauvegardes.') } catch { flash('La sauvegarde n’a pas pu être enregistrée.') } }}
                onEdit={() => setEditingPostId(post.id)}
                onDelete={() => void deletePost(post.id)}
                editing={editingPostId === post.id}
                onCancelEdit={() => setEditingPostId(null)}
                onSaveEdit={body => void updatePost(post.id, body)}
              />
            ))}
            </section>
          </section>
        </>}
        {active === 'messages' && <MessagesPanel user={sessionUser} onAction={flash} initialConversationId={pathname.match(/^\/messages\/([^/]+)/)?.[1] ?? initialConversationId} />}
        {active === 'explore' && (pathname.startsWith('/search') ? <SearchPanel user={sessionUser} onAction={flash} /> : <ExplorePanel user={sessionUser} onAction={flash} onMessage={conversationId => { setInitialConversationId(conversationId); navigateTo(`/messages/${conversationId}`, 'messages'); flash('Conversation créée. Ouvrez Messages pour écrire.') }} />)}
        {active === 'groups' && <GroupsPanel user={sessionUser} onAction={flash} onOpenMessages={conversationId => { setInitialConversationId(conversationId); navigateTo(`/messages/${conversationId}`, 'messages') }} />}
        {active === 'pages' && <PagesPanel user={sessionUser} onAction={flash} />}
        {active === 'profile' && (pathname.startsWith('/u/') ? <PublicProfilePanel user={sessionUser} username={decodeURIComponent(pathname.slice(3).split('/')[0])} onAction={flash} /> : <ProfilePanel key={`${profile?.id ?? 'profile'}-${profile?.full_name ?? ''}-${profile?.username ?? ''}`} user={sessionUser} profile={profile} onProfile={setProfile} />)}
        {active === 'admin' && <AdminPanel user={sessionUser} onAction={flash} />}
        {active === 'files' && <FilesPanel user={sessionUser} onAction={flash} />}
        {active === 'saved' && <SavedPanel user={sessionUser} onAction={flash} />}
        {active === 'notifications' && <NotificationsPanel user={sessionUser} />}
        {active === 'videos' && (open('videos') ? <VideosPanel user={sessionUser} onAction={flash} /> : closedPanel('Vidéos'))}
        {active === 'reels' && (open('reels') ? <ReelsPanel user={sessionUser} onAction={flash} /> : closedPanel('Reels'))}
        {active === 'stories' && (open('stories') ? <StoriesPanel user={sessionUser} onAction={flash} onMessage={conversationId => { setInitialConversationId(conversationId); navigateTo(`/messages/${conversationId}`, 'messages') }} /> : closedPanel('Stories'))}
        {active === 'marketplace' && (open('marketplace')
          ? <SoonPanel title="Marketplace non ouvert" text="Aucune petite annonce n’existe dans la base : ni table `listings`, ni vendeur à contacter. Cette page le déclare au lieu de singer un catalogue." note={flags.note} actionLabel="Retour au fil" onAction={() => navigateTo('/', 'feed')} />
          : closedPanel('Marketplace'))}
        {active === 'live' && (open('live')
          ? <SoonPanel title="Live non ouvert" text="Le direct demande un service de diffusion (signalisation + média). Rien de tout cela n’est branché : aucun compteur de spectateurs ne sera affiché pour faire nombre." note={flags.note} actionLabel="Retour au fil" onAction={() => navigateTo('/', 'feed')} />
          : closedPanel('Live'))}
        {active === 'settings' && <SettingsPanel user={sessionUser} onAction={flash} onFlagsChanged={loadFlags} />}
      </main>

      <aside className="right-rail"><section className="rail-card online-contacts"><div className="card-heading"><span>Contacts en ligne <i className="online-dot" /></span><button type="button" onClick={() => setActive('messages')}>Voir tout</button></div><div className="contact-list">{networkPeople.slice(0,7).map(person => <button type="button" className="contact-row" key={person.id} onClick={() => setActive('messages')}><span className="avatar avatar-sm avatar-soft">{person.avatar_url ? <img src={person.avatar_url} alt="" /> : person.full_name.slice(0,2).toUpperCase()}</span><strong>{person.full_name}</strong><i className="online-dot" /><span>•••</span></button>)}</div></section><details className="rail-card rail-detail friend-suggestions" open><summary className="card-heading"><span>Suggestions d’amis</span><button type="button" onClick={event => { event.preventDefault(); setActive('explore') }}>Voir tout ↗</button></summary><div className="suggestion-list">{networkPeople.filter(person => !followed.includes(person.id)).slice(0,4).map(person => <div className="suggestion" key={person.id}><div className="avatar avatar-md avatar-soft">{person.avatar_url ? <img src={person.avatar_url} alt="" /> : person.full_name.slice(0,2).toUpperCase()}</div><div className="suggestion-copy"><strong>{person.full_name}{person.verified_type && <VerifiedBadge type={person.verified_type} />}</strong><span>@{person.username}</span><small>{person.bio || ''}</small></div><button className={followed.includes(person.id) ? 'follow-button following' : 'follow-button'} onClick={async () => { if (!sessionUser) return; const isFollowing = followed.includes(person.id); try { const next = await toggleFollow(sessionUser.id, person.id, isFollowing); setFollowed(current => next ? [...current, person.id] : current.filter(id => id !== person.id)); flash(next ? 'Abonnement ajouté.' : 'Abonnement retiré.') } catch { flash('Impossible de modifier cet abonnement.') } }}>{followed.includes(person.id) ? 'Suivi' : 'Ajouter'}</button></div>)}</div></details><footer className="footer-links">À propos · Règles · <a href="/confidentialite/">Confidentialité</a> · Aide<br /><span>© 2026 Avani Pro, Inc.</span></footer></aside>
      {toast && <div className="toast"><span>✦</span>{toast}</div>}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={flash} />}
    </div>
  )
}

export default App
