import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import './App.css'
import './mobile.css'
import './desktop.css'
import './landing.css'
import './reactions.css'
import './feed.css'
import { AuthModal } from './components/AuthModal'
import { ResetPasswordPanel } from './components/ResetPasswordPanel'
import { AdminPanel, ExplorePanel, GroupsPanel, PagesPanel, ProfilePanel, SettingsPanel } from './components/FeaturePanels'
import { MessagesPanel } from './components/MessagesPanel'
import { FilesPanel, NotificationsPanel, PublicProfilePanel, SavedPanel, SearchPanel } from './components/AdvancedPanels'
import { createPost, deletePost as deletePostRecord, getMyProfile, listFeedPosts, listReactionUsers, recordPostShare, setPostReaction, toggleSavedPost, updatePost as updatePostRecord, type ProfileRecord, type ReactionType } from './lib/api'
import { createComment, createStory, deleteComment, listActiveStories, listComments, listDiscoverableProfiles, listFollowingIds, listMyGroups, toggleFollow, updateComment, type CommentRecord, type StoryRecord } from './lib/socialApi'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { uploadPostImage } from './lib/socialApi'

type NavKey = 'feed' | 'explore' | 'messages' | 'groups' | 'pages' | 'profile' | 'admin' | 'settings' | 'files' | 'saved' | 'notifications'
type Post = { id: string | number; authorId?: string; name: string; handle: string; role: string; avatar: string; time: string; body: string; tags: string[]; stats: { likes: number; comments: number; shares: number }; kind: string; liked?: boolean; reaction?: ReactionType; reactionCounts?: Record<ReactionType, number>; saved?: boolean; verifiedType?: string | null; avatarUrl?: string | null }

function PublicHome({ onAuth }: { onAuth: () => void }) {
  return <div className="lp">
    <header className="lp-nav">
      <a className="lp-brand" href="/" aria-label="Avani Pro, accueil"><span className="brand-mark"><img src="/logo-icon.png" alt="" /></span><span className="brand-word">AVANI<span className="brand-pro">PRO</span></span></a>
      <nav className="lp-links" aria-label="Sections"><a href="#vision">Pourquoi Avani Pro</a><a href="#features">Fonctionnalités</a></nav>
      <div className="lp-actions"><button type="button" className="lp-login" onClick={onAuth}>Se connecter</button><button type="button" className="lp-cta" onClick={onAuth}>Créer un compte</button></div>
    </header>
    <section className="lp-hero">
      <div className="lp-copy">
        <span className="lp-eyebrow">LE RÉSEAU DES ESPRITS EN MOUVEMENT</span>
        <h1>Les bonnes idées méritent <em>un vrai réseau.</em></h1>
        <p>Avani Pro réunit professionnels, créateurs et communautés dans un espace conçu pour partager, échanger et transformer les conversations en projets concrets.</p>
        <div className="lp-hero-actions"><button type="button" className="lp-cta lp-cta-large" onClick={onAuth}>Rejoindre Avani Pro</button><a className="lp-link" href="#vision">Découvrir la plateforme ↓</a></div>
        <p className="lp-proof">Un réseau construit autour de vos conversations <strong>et de vos projets</strong></p>
      </div>
      <div className="lp-preview" aria-label="Aperçu du fil Avani Pro">
        <article className="lp-post">
          <div className="lp-post-head"><span className="lp-avatar">AV</span><div><strong>Votre publication</strong><small>À l’instant · Public</small></div></div>
          <p>Partagez une idée avec votre réseau. Les interactions réelles apparaîtront ici.</p>
          <div className="lp-post-tags"><span>#Motivation</span><span>#Projets</span></div>
          <div className="lp-post-stats"><span>👍 ❤️ 2</span><span>3 commentaires · 1 partage</span></div>
          <div className="lp-post-actions"><span>J’aime</span><span>Commenter</span><span>Partager</span><span>Enregistrer</span></div>
        </article>
        <article className="lp-post lp-post-second">
          <div className="lp-post-head"><span className="lp-avatar lp-avatar-alt">CM</span><div><strong>Votre communauté</strong><small>Groupe · Public</small></div></div>
          <p>Les conversations prennent vie avec de vraies personnes.</p>
        </article>
      </div>
    </section>
    <section id="vision" className="lp-section">
      <span className="lp-eyebrow">PLUS QU’UN FIL D’ACTUALITÉ</span>
      <h2>Un espace qui donne de la portée à vos idées.</h2>
      <p className="lp-lead">Pas de bruit inutile. Avani Pro est pensé pour les échanges qui comptent, les rencontres qui ouvrent des portes et les groupes qui font réellement avancer les projets.</p>
    </section>
    <section id="features" className="lp-features">
      <article><span className="lp-num">01</span><h3>Votre signal</h3><p>Publiez vos réflexions, projets et apprentissages auprès d’un réseau qui vous comprend.</p></article>
      <article><span className="lp-num">02</span><h3>Vos communautés</h3><p>Créez ou rejoignez des groupes privés pour discuter comme dans un espace de confiance.</p></article>
      <article><span className="lp-num">03</span><h3>Vos conversations</h3><p>Échangez en direct, partagez des fichiers et gardez les idées importantes au même endroit.</p></article>
    </section>
    <section className="lp-section lp-details">
      <div>
        <span className="lp-eyebrow">PENSÉ POUR VOTRE QUOTIDIEN</span>
        <h2>Tout ce qu’il faut pour faire avancer vos projets.</h2>
      </div>
      <div className="lp-detail-list">
        <article><strong>Un profil qui vous ressemble</strong><p>Présentez votre expertise, vos intérêts et vos réalisations à une communauté pertinente.</p></article>
        <article><strong>Des échanges qui restent utiles</strong><p>Publiez, commentez, répondez et retrouvez vos conversations sans perdre le fil.</p></article>
        <article><strong>Un espace fiable</strong><p>Votre compte et vos échanges sont protégés. Vous gardez le contrôle de ce que vous partagez.</p></article>
      </div>
    </section>
    <section className="lp-band">
      <h2>Votre prochaine conversation peut tout changer.</h2>
      <p>Créez votre compte gratuitement et rejoignez les personnes qui construisent la suite.</p>
      <button type="button" className="lp-cta lp-cta-large" onClick={onAuth}>Créer mon compte gratuitement ↗</button>
    </section>
    <footer className="lp-footer"><span>© 2026 Avani Pro</span><span>Un réseau pensé pour avancer.</span></footer>
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
  const ownStory = stories.find(story => story.author_id === userId)
  const others = stories.filter(story => story.author_id !== userId)
  const authorName = (story: StoryRecord) => story.author?.full_name || ''
  return <section className="stories-section" aria-label="Stories">
    <div className="stories-heading"><div><span className="eyebrow">MOMENTS DU RÉSEAU</span><strong>Moments</strong><span>Photos et vidéos partagées par votre réseau</span></div><div className="stories-heading-actions"><b>{stories.length} active{stories.length === 1 ? '' : 's'}</b><button onClick={() => void loadStories()}>Actualiser ↻</button></div></div>
    <div className="stories-row">
      {ownStory ? <button className="story-card story-self story-live" onClick={() => setViewer(ownStory)} aria-label="Voir votre story"><span className="story-shade" />{ownStory.media_url ? <img className="story-media-preview" src={ownStory.media_url} alt="" /> : ownAvatar ? <img className="story-media-preview" src={ownAvatar} alt="" /> : <span className="story-avatar story-avatar-own">AV</span>}<strong>Votre story</strong><span className="story-card-label">Ajouter</span></button> : <label className="story-card story-self" htmlFor="story-upload" aria-label="Créer une story"><span className="story-shade" />{ownAvatar ? <img className="story-media-preview" src={ownAvatar} alt="" /> : null}<span className="story-add-button" aria-hidden="true">+</span><strong>Créer une story</strong></label>}
      {storyComposerOpen && storyPreview && <div className="story-composer-backdrop" role="dialog" aria-modal="true" aria-label="Créer une story"><form className="story-composer" onSubmit={publishStory}><button type="button" className="story-close" onClick={() => setStoryComposerOpen(false)} aria-label="Fermer">×</button><span className="eyebrow">NOUVELLE STORY</span><h3>Aperçu de votre story</h3>{storyFile?.type.startsWith('video/') ? <video src={storyPreview} controls /> : <img src={storyPreview} alt="Aperçu de la story" />}<textarea value={storyCaption} onChange={event => setStoryCaption(event.target.value)} placeholder="Ajoutez une description…" aria-label="Description de la story" /><label className="story-privacy">Audience<select value={storyPrivacy} onChange={event => setStoryPrivacy(event.target.value as typeof storyPrivacy)}><option value="public">Tout le monde</option><option value="followers">Mes followers</option><option value="private">Moi uniquement</option></select></label><div className="story-composer-actions"><button type="button" className="message-button" onClick={() => setStoryComposerOpen(false)}>Annuler</button><button className="primary-button">Partager la story</button></div></form></div>}
      {others.map(story => <button className="story-card story-live" key={story.id} onClick={() => setViewer(story)} aria-label={`Voir la story de ${authorName(story)}`}><span className="story-shade" />{story.media_url ? <img className="story-media-preview" src={story.media_url} alt="" /> : <span className="story-avatar">{authorName(story).slice(0,2).toUpperCase()}</span>}<strong>{authorName(story)}</strong><span className="story-card-label">Voir maintenant</span></button>)}

      <input id="story-upload" className="visually-hidden" type="file" accept="image/*,video/*" onChange={addStory} />
    </div>
    {viewer && <div className="story-viewer" role="dialog" aria-modal="true" aria-label={`Story de ${authorName(viewer)}`} onClick={() => setViewer(null)}><div className="story-viewer-card" onClick={event => event.stopPropagation()}><div className="story-progress"><i style={{ width: `${progress}%` }} /></div><button className="story-close" onClick={() => setViewer(null)} aria-label="Fermer la story">×</button>{stories.findIndex(story => story.id === viewer.id) > 0 && <button type="button" className="story-nav story-nav-prev" onClick={() => setViewer(stories[stories.findIndex(story => story.id === viewer.id) - 1])} aria-label="Story précédente">‹</button>}<div className="story-viewer-media">{viewer.media_type === 'video' ? <video src={viewer.media_url} controls autoPlay /> : <img src={viewer.media_url} alt="" />}</div><strong>{authorName(viewer)}</strong>{viewer.caption && <p>{viewer.caption}</p>}<small>Expire dans 24 heures · audience {viewer.privacy}</small>{stories.findIndex(story => story.id === viewer.id) < stories.length - 1 && <button type="button" className="story-nav story-nav-next" onClick={() => setViewer(stories[stories.findIndex(story => story.id === viewer.id) + 1])} aria-label="Story suivante">›</button>}</div></div>}
  </section>
}
function App() {
  const initialPath = typeof window === 'undefined' ? '/' : window.location.pathname
  const initialNav: NavKey = initialPath.startsWith('/groups') ? 'groups' : initialPath.startsWith('/pages') ? 'pages' : initialPath.startsWith('/messages') ? 'messages' : initialPath.startsWith('/notifications') ? 'notifications' : initialPath.startsWith('/search') ? 'explore' : initialPath.startsWith('/files') ? 'files' : initialPath.startsWith('/saved') ? 'saved' : initialPath.startsWith('/admin') ? 'admin' : initialPath.startsWith('/settings') || initialPath.startsWith('/u/') ? 'profile' : 'feed'
  const [active, setActive] = useState<NavKey>(initialNav)
  const [pathname, setPathname] = useState(initialPath)
  const [posts, setPosts] = useState<Post[]>([])
  const [toast, setToast] = useState('')
  const [followed, setFollowed] = useState<string[]>([])
  const [networkPeople, setNetworkPeople] = useState<ProfileRecord[]>([])
  const [networkGroups, setNetworkGroups] = useState<any[]>([])
  const [feedFilter, setFeedFilter] = useState<'all' | 'following' | 'trending'>('all')
  const [feedQuery, setFeedQuery] = useState('')
  const [editingPostId, setEditingPostId] = useState<string | number | null>(null)
  const [postDraft, setPostDraft] = useState('')
  const [postImage, setPostImage] = useState<File | null>(null)
  const [placeOpen, setPlaceOpen] = useState(false)
  const [place, setPlace] = useState('')
  const addPlace = () => {
    const name = place.trim()
    if (name) setPostDraft(value => `${value}${value && !value.endsWith(' ') ? ' ' : ''}📍 ${name}`)
    setPlace('')
    setPlaceOpen(false)
  }
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const chooseImage = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { flash('Choisissez une image pour la publication.'); return }
    if (file.size > 10 * 1024 * 1024) { flash('L’image doit faire moins de 10 Mo.'); return }
    if (postImagePreview) URL.revokeObjectURL(postImagePreview)
    setPostImage(file)
    setPostImagePreview(URL.createObjectURL(file))
  }
  const clearImage = () => {
    if (postImagePreview) URL.revokeObjectURL(postImagePreview)
    setPostImage(null)
    setPostImagePreview(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }
  const [publishingPost, setPublishingPost] = useState(false)
  const [sessionUser, setSessionUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileRecord | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [initialConversationId, setInitialConversationId] = useState<string | undefined>()
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => { const saved = typeof window !== 'undefined' ? window.localStorage.getItem('avani:theme') : null; return saved === 'dark' ? 'dark' : 'light' })
  useEffect(() => { document.documentElement.dataset.theme = theme; window.localStorage.setItem('avani:theme', theme) }, [theme])
  const navigateTo = (path: string, screen: NavKey) => { window.history.pushState({}, '', path); setPathname(path); setActive(screen) }
  useEffect(() => { const onPopState = () => { const path = window.location.pathname; setPathname(path); if (path.startsWith('/groups')) setActive('groups'); else if (path.startsWith('/pages')) setActive('pages'); else if (path.startsWith('/messages')) setActive('messages'); else if (path.startsWith('/notifications')) setActive('notifications'); else if (path.startsWith('/files')) setActive('files'); else if (path.startsWith('/saved')) setActive('saved'); else if (path.startsWith('/admin')) setActive('admin'); else if (path.startsWith('/settings') || path.startsWith('/u/')) setActive('profile'); else if (path.startsWith('/search')) setActive('explore'); else setActive('feed') }; window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState) }, [])

  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 8000) }
  const reactToPost = async (id: string | number, reaction: ReactionType) => {
    const allowed: ReactionType[] = ['like', 'love', 'haha', 'wow', 'sad', 'angry']
    if (!allowed.includes(reaction)) return
    const current = posts.find(post => post.id === id)
    if (!current || !sessionUser || typeof id !== 'string') { if (!sessionUser) flash('Connectez-vous pour réagir à une publication.'); return }
    const previous = current
    const nextReaction = current.reaction === reaction ? null : reaction
    const counts = { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0, ...(current.reactionCounts ?? {}) } as Record<ReactionType, number>
    if (current.reaction) counts[current.reaction] = Math.max(0, counts[current.reaction] - 1)
    if (nextReaction) counts[nextReaction] += 1
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
    setPosts(items => items.map(post => post.id === id ? { ...post, liked: Boolean(nextReaction), reaction: nextReaction ?? undefined, reactionCounts: counts, stats: { ...post.stats, likes: total } } : post))
    try {
      await setPostReaction(id, sessionUser.id, nextReaction)
    } catch {
      setPosts(items => items.map(post => post.id === id ? previous : post))
      flash('La réaction n’a pas pu être synchronisée. Votre affichage a été restauré.')
    }
  }
  const displayName = profile?.full_name || sessionUser?.user_metadata?.full_name || ''
  const displayUsername = profile?.username ? `@${profile.username}` : sessionUser?.email ? `@${sessionUser.email.split('@')[0]}` : ''
  const displayAvatar = displayName.split(/\s+/).filter(Boolean).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase()
  const displayAvatarUrl = profile?.avatar_url ?? null
  const visiblePosts = useMemo(() => {
    const query = feedQuery.trim().toLowerCase()
    return posts
      .filter(post => !/^test de nouvelle version$/i.test(post.body.trim()))
      .filter(post => feedFilter !== 'following' || Boolean(post.authorId && followed.includes(post.authorId)))
      .filter(post => feedFilter !== 'trending' || post.stats.likes >= 150)
      .filter(post => !query || `${post.name} ${post.body} ${post.tags.join(' ')}`.toLowerCase().includes(query))
  }, [feedFilter, feedQuery, followed, posts])
  const publishPost = async (event: React.FormEvent) => {
    event.preventDefault()
    const content = postDraft.trim()
    if (!content && !postImage) { flash('Écrivez quelque chose ou ajoutez une photo avant de publier.'); return }
    if (!sessionUser) { flash('Connectez-vous pour publier.'); return }
    if (content.length > 5000) { flash('Votre publication dépasse la limite de 5 000 caractères.'); return }
    setPublishingPost(true)
    try {
      const imageUrl = postImage ? await uploadPostImage(sessionUser.id, postImage) : null
      const storedBody = imageUrl ? [content, `[image]${imageUrl}[/image]`].filter(Boolean).join('\n') : content
      const created = await createPost(sessionUser.id, storedBody, 'text')
      const authorName: string = String(profile?.full_name || sessionUser.user_metadata?.full_name || '')
      const nextPost: Post = {
        id: created.id, authorId: sessionUser.id, name: authorName,
        handle: profile?.username ? `@${profile.username}` : sessionUser.email ? `@${sessionUser.email.split('@')[0]}` : '',
        role: profile?.bio || '', avatar: authorName.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
        avatarUrl: profile?.avatar_url ?? null, time: 'à l’instant', body: storedBody,
        tags: content.match(/#[\w-]+/g) ?? [], stats: { likes: 0, comments: 0, shares: 0 },
        kind: 'thought', liked: false, saved: false, verifiedType: profile?.verified_type ?? null,
        reactionCounts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
      }
      setPosts(current => [nextPost, ...current])
      setPostDraft(''); clearImage()
      setFeedFilter('all')
      setFeedQuery('')
      flash('Votre publication est en ligne.')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'La publication n’a pas pu être créée.')
    } finally { setPublishingPost(false) }
  }
  const updatePost = async (id: string | number, body: string) => {
    if (typeof id !== 'string' || !sessionUser) { flash('Cette publication ne peut pas être modifiée hors connexion.'); return }
    try {
      await updatePostRecord(id, sessionUser.id, body)
      setPosts(current => current.map(post => post.id === id ? { ...post, body, time: 'modifié à l’instant' } : post))
      setEditingPostId(null)
      flash('Publication modifiée.')
    } catch (error) { flash(error instanceof Error ? error.message : 'La publication n’a pas pu être modifiée.') }
  }
  const deletePost = async (id: string | number) => {
    if (typeof id !== 'string' || !sessionUser) { flash('Cette publication ne peut pas être supprimée hors connexion.'); return }
    try {
      await deletePostRecord(id, sessionUser.id)
      setPosts(current => current.filter(post => post.id !== id))
      flash('Publication supprimée.')
    } catch (error) { flash(error instanceof Error ? error.message : 'La publication n’a pas pu être supprimée.') }
  }
  useEffect(() => { if (!supabase) return; supabase.auth.getSession().then(({ data }) => { setSessionUser(data.session?.user ?? null); if (!data.session) setProfile(null) }); const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSessionUser(session?.user ?? null); if (!session) setProfile(null) }); return () => subscription.unsubscribe() }, [])
  useEffect(() => { if (!sessionUser) { setNetworkPeople([]); setNetworkGroups([]); setFollowed([]); return }; Promise.all([listDiscoverableProfiles(sessionUser.id), listMyGroups(sessionUser.id), listFollowingIds(sessionUser.id)]).then(([people, groups, followingIds]) => { setNetworkPeople(people); setNetworkGroups(groups); setFollowed(followingIds) }).catch(() => { setNetworkPeople([]); setNetworkGroups([]); setFollowed([]) }) }, [sessionUser])
  useEffect(() => { if (!supabase) return; listFeedPosts(sessionUser?.id).then(feed => { if (supabase) setPosts(feed.map(post => ({ id: post.id, authorId: post.author?.id, name: post.author?.full_name || '', handle: post.author?.username ? `@${post.author.username}` : '', role: post.author?.bio || '', avatar: (post.author?.full_name || '').split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase(), avatarUrl: post.author?.avatar_url ?? null, time: formatRelativeTime(post.created_at), body: post.body, tags: post.body.match(/#[\w-]+/g) ?? [], stats: { likes: post.likes, comments: post.comments, shares: post.shares }, kind: post.post_type === 'image' ? 'image' : post.post_type === 'link' ? 'link' : 'thought', liked: post.liked, reaction: post.reaction ?? undefined, reactionCounts: post.reactionCounts, saved: post.saved, verifiedType: post.author?.verified_type }))) }).catch(() => undefined) }, [sessionUser])
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

  if (!sessionUser) return <><PublicHome onAuth={openAuth} />{authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={flash} />}{toast && <div className="toast"><span>✦</span>{toast}</div>}</>

  return (
    <div className={`app-shell theme-${theme}`}>
      <header className="topbar av-navbar"><div className="topbar-brand"><button className="topbar-brand-button" aria-label="Accueil Avani Pro" onClick={() => navigateTo('/', 'feed')}><span className="brand-mark"><img src="/logo-icon.png" alt="" /></span><span className="brand-word">AVANI<span className="brand-pro">PRO</span></span></button><label className="search"><SvgIcon name="search" /><input value={feedQuery} onChange={event => setFeedQuery(event.target.value)} placeholder="Rechercher sur Avani Pro…" aria-label="Recherche globale" /></label></div><nav className="topbar-nav topbar-nav-pro" aria-label="Accès rapide"><button className={active === 'feed' ? 'active' : ''} onClick={() => navigateTo('/', 'feed')} aria-label="Accueil" title="Accueil"><SvgIcon name="home" /><span>Accueil</span></button><button className={active === 'explore' ? 'active' : ''} onClick={() => navigateTo('/search', 'explore')} aria-label="Réseau" title="Réseau"><SvgIcon name="profile" /><span>Réseau</span></button><button className={active === 'pages' ? 'active' : ''} onClick={() => navigateTo('/pages', 'pages')} aria-label="Pages" title="Pages"><SvgIcon name="pages" /><span>Pages</span></button><button className={active === 'groups' ? 'active' : ''} onClick={() => navigateTo('/groups', 'groups')} aria-label="Groupes" title="Groupes"><SvgIcon name="groups" /><span>Groupes</span></button><button type="button" onClick={() => flash('Les vidéos arrivent bientôt.')} aria-label="Vidéos" title="Vidéos"><svg className="svg-icon av-play" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="3.5" /><path d="M10 9l5 3-5 3z" /></svg><span>Vidéos</span></button></nav><div className="topbar-status"><span className="pulse-dot" />En ligne</div><div className="top-actions"><button type="button" className="nav-bell" aria-label="Notifications" title="Notifications" onClick={() => navigateTo('/notifications', 'notifications')}><svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg><span className="nav-badge" aria-hidden="true" /></button><button className="profile-trigger" aria-label="Ouvrir mon profil" onClick={() => navigateTo('/settings', 'profile')}><span className="avatar avatar-sm avatar-gradient">{displayAvatarUrl ? <img src={displayAvatarUrl} alt="Photo de profil" /> : displayAvatar}</span><span className="profile-trigger-name">{displayName.split(' ')[0]}</span></button><button className="menu-trigger" aria-expanded={menuOpen} aria-label="Ouvrir le menu principal" onClick={() => setMenuOpen(value => !value)}>☰</button></div>{menuOpen && <div className="main-menu"><button onClick={() => { setMenuOpen(false); navigateTo('/settings', 'settings') }}>Réglages</button><button onClick={() => { setMenuOpen(false); navigateTo('/files', 'files') }}>Mes fichiers</button><button onClick={() => { setMenuOpen(false); navigateTo('/notifications', 'notifications') }}>Notifications</button><button className="menu-danger" onClick={() => { setMenuOpen(false); void signOut() }}>Se déconnecter</button></div>}</header>
      <aside className="sidebar sidebar-pro">
        <div className="brand"><span className="brand-mark"><img src="/assets/avani-mark.svg" alt="" /></span><span>AVANI<span className="brand-pro">PRO</span></span></div>
        <div className="profile-mini"><div className="avatar avatar-xl avatar-gradient">{displayAvatarUrl ? <img src={displayAvatarUrl} alt="Photo de profil" /> : displayAvatar}</div><div><strong>{displayName}{profile?.verified_type && <VerifiedBadge type={profile.verified_type} />}</strong><span>{displayUsername}</span></div></div>
        <nav className="nav-stack nav-stack-pro" aria-label="Navigation Avani Pro">
          <span className="nav-section-label">VOTRE ESPACE PRO</span>
          <NavButton active={active === 'feed'} onClick={() => navigateTo('/', 'feed')} icon="home" label="Actualités" />
          <NavButton active={active === 'explore'} onClick={() => navigateTo('/search', 'explore')} icon="explore" label="Découvrir" />
          <NavButton active={active === 'messages'} onClick={() => navigateTo('/messages', 'messages')} icon="messages" label="Messages" />
          <NavButton active={active === 'notifications'} onClick={() => navigateTo('/notifications', 'notifications')} icon="explore" label="Notifications" />
          <span className="nav-section-label">VOS COMMUNAUTÉS</span>
          <NavButton active={active === 'groups'} onClick={() => navigateTo('/groups', 'groups')} icon="groups" label="Groupes professionnels" />
          <NavButton active={active === 'pages'} onClick={() => navigateTo('/pages', 'pages')} icon="pages" label="Pages" />
          <span className="nav-section-label">VOTRE ESPACE</span>
          <NavButton active={active === 'profile'} onClick={() => navigateTo('/settings', 'profile')} icon="profile" label="Profil professionnel" />
          <NavButton active={active === 'files'} onClick={() => navigateTo('/files', 'files')} icon="save" label="Documents" />
          <NavButton active={active === 'saved'} onClick={() => navigateTo('/saved', 'saved')} icon="save" label="Enregistrés" />
          <span className="nav-section-label nav-section-admin">ADMINISTRATION</span>
          <NavButton active={active === 'admin'} onClick={() => navigateTo('/admin', 'admin')} icon="admin" label="Administration" />
        </nav>
          <div className="sidebar-bottom"><button className={`nav-button muted ${active === 'settings' ? 'active' : ''}`} onClick={() => navigateTo('/settings', 'settings')}><SvgIcon name="settings" /> Réglages</button><div className="security-note"><span className="pulse-dot" /> Espace sécurisé<br /><small>Chiffrement actif</small></div></div>
        <div className="premium-card"><strong>Avani Pro Premium</strong><p>Découvrez plus de fonctionnalités et vivez une expérience unique !</p><button type="button" onClick={() => flash('Découvrez Avani Pro Premium.')}>En savoir plus</button></div>
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
            <form className="pro-post-composer" onSubmit={publishPost}>
              <div className="pro-post-composer-top">
                <div className="avatar avatar-md avatar-gradient">{displayAvatarUrl ? <img src={displayAvatarUrl} alt="Votre photo de profil" /> : displayAvatar || 'AV'}</div>
                <label className="pro-post-input-wrap">
                  <span className="pro-post-label">Partager avec votre réseau</span>
                  <textarea value={postDraft} onChange={event => setPostDraft(event.target.value)} maxLength={5000} placeholder={`Quoi de neuf, ${displayName.split(' ')[0] || 'vous'} ?`} aria-label="Contenu de la publication" rows={3} />
                </label>
              </div>
              {postImagePreview && <div className="composer-preview"><img src={postImagePreview} alt="Aperçu de votre photo" /><button type="button" onClick={clearImage} aria-label="Retirer la photo">×</button></div>}
              <input ref={photoInputRef} className="visually-hidden" type="file" accept="image/*" onChange={event => chooseImage(event.target.files?.[0])} aria-hidden="true" tabIndex={-1} />
              {placeOpen && <div className="composer-place"><input value={place} onChange={event => setPlace(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addPlace() } }} placeholder="Où êtes-vous ?" aria-label="Lieu de la publication" maxLength={80} /><button type="button" className="primary-button" onClick={addPlace} disabled={!place.trim()}>Ajouter</button></div>}
              <div className="pro-post-composer-footer">
                <div className="pro-post-tools">
                  <button type="button" className="composer-tool-photo" onClick={() => photoInputRef.current?.click()} aria-label="Ajouter une photo"><span>▣</span> Photo/vidéo</button>
                  <button type="button" onClick={() => setPostDraft(value => value ? value + ' 😊' : '😊 ')} aria-label="Ajouter une humeur"><span>☺</span> Humeur/activité</button>
                  <button type="button" onClick={() => setPostDraft(value => value && !value.endsWith(' ') ? value + ' #' : value + '#')} aria-label="Ajouter un hashtag"><span>#</span> Hashtag</button>
                  <button type="button" onClick={() => setPlaceOpen(value => !value)} aria-expanded={placeOpen} aria-label="Ajouter un lieu"><span>⌖</span> Lieu</button>
                  <span className="pro-post-audience" title="Les publications sont visibles selon les règles d’accès configurées sur votre compte">🌐 Public</span>
                </div>
                <div className="pro-post-submit-group"><span className={postDraft.length > 4800 ? 'pro-post-counter near-limit' : 'pro-post-counter'}>{postDraft.length}/5000</span><button className="pro-post-submit" disabled={publishingPost || (!postDraft.trim() && !postImage)}>{publishingPost ? 'Publication…' : 'Publier'}</button></div>
              </div>
            </form>
            <div className="feed-controls">
              <div className="feed-filter-tabs" role="tablist" aria-label="Filtrer les publications">
                <button type="button" role="tab" aria-selected={feedFilter === 'all'} className={feedFilter === 'all' ? 'filter-active' : ''} onClick={() => setFeedFilter('all')}>Pour vous</button>
                <button type="button" role="tab" aria-selected={feedFilter === 'following'} className={feedFilter === 'following' ? 'filter-active' : ''} onClick={() => setFeedFilter('following')}>Abonnements</button>
                <button type="button" role="tab" aria-selected={feedFilter === 'trending'} className={feedFilter === 'trending' ? 'filter-active' : ''} onClick={() => setFeedFilter('trending')}>Tendances</button>
              </div>
              <span className="feed-count">{visiblePosts.length} publication{visiblePosts.length === 1 ? '' : 's'}</span>
            </div>
            <section className="post-list feed-post-list" aria-label="Publications">
              {visiblePosts.length === 0 ? <div className="empty-feed"><div className="empty-feed-icon">⌁</div><strong>Aucune publication pour le moment</strong><span>Les publications de votre réseau apparaîtront ici. Vous pouvez commencer par partager une idée.</span></div> : visiblePosts.map(post => <PostCard key={post.id} post={post} user={sessionUser} onNotify={flash} onReact={(reaction) => void reactToPost(post.id, reaction)} onCommentCountChange={(count) => setPosts(current => current.map(item => item.id === post.id ? { ...item, stats: { ...item.stats, comments: count } } : item))} onShare={async () => { if (sessionUser && typeof post.id === 'string') { try { await recordPostShare(post.id, sessionUser.id); setPosts(current => current.map(item => item.id === post.id ? { ...item, stats: { ...item.stats, shares: item.stats.shares + 1 } } : item)) } catch { flash('Le partage n’a pas pu être enregistré.') } } else flash('Connectez-vous pour enregistrer ce partage.') }} onSave={async () => { if (!sessionUser || typeof post.id !== 'string') { flash('Connectez-vous pour sauvegarder cette publication.'); return }; try { const next = await toggleSavedPost(post.id, sessionUser.id, post.saved ?? false); setPosts(current => current.map(item => item.id === post.id ? { ...item, saved: next } : item)); flash(next ? 'Publication sauvegardée.' : 'Publication retirée des sauvegardes.') } catch { flash('La sauvegarde n’a pas pu être enregistrée.') } }} onComment={() => flash('Impossible de charger ou d’enregistrer le commentaire.')} onEdit={() => setEditingPostId(post.id)} onDelete={() => void deletePost(post.id)} editing={editingPostId === post.id} onCancelEdit={() => setEditingPostId(null)} onSaveEdit={body => void updatePost(post.id, body)} />)}
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
        {active === 'settings' && <SettingsPanel user={sessionUser} theme={theme} onThemeChange={setTheme} onAction={flash} />}
      </main>

      <aside className="right-rail"><section className="rail-card online-contacts"><div className="card-heading"><span>Contacts en ligne <i className="online-dot" /></span><button type="button" onClick={() => setActive('messages')}>Voir tout</button></div><div className="contact-list">{networkPeople.slice(0,7).map(person => <button type="button" className="contact-row" key={person.id} onClick={() => setActive('messages')}><span className="avatar avatar-sm avatar-soft">{person.avatar_url ? <img src={person.avatar_url} alt="" /> : person.full_name.slice(0,2).toUpperCase()}</span><strong>{person.full_name}</strong><i className="online-dot" /><span>•••</span></button>)}</div></section><section className="rail-card sponsored-card"><div className="card-heading"><span>Sponsorisé</span><button type="button" onClick={() => flash('Découvrez Avani Pro Premium.')}>Voir plus</button></div><div className="sponsor-banner"><strong>Avani Pro Premium</strong><span>Plus de fonctionnalités, plus de liberté.</span><button type="button" onClick={() => flash('Avani Pro Premium sera bientôt disponible.')}>En savoir plus</button></div></section><details className="rail-card rail-detail network-card" open><summary className="card-heading"><span>Votre réseau</span><button type="button" onClick={event => { event.preventDefault(); setActive('explore') }}>Voir tout ↗</button></summary><div className="network-stat"><strong>{profile?.followers_count ?? 0}</strong><span>followers</span><div className="mini-avatars">{networkPeople.slice(0,3).map(person => <span key={person.id}>{person.full_name.slice(0,2).toUpperCase()}</span>)}<b>+{networkPeople.length}</b></div></div></details><details className="rail-card rail-detail" open><summary className="card-heading"><span>Suggestions d’amis</span><button type="button" onClick={event => { event.preventDefault(); setActive('explore') }}>Voir tout ↗</button></summary><div className="suggestion-list">{networkPeople.slice(0,4).map(person => <div className="suggestion" key={person.id}><div className="avatar avatar-md avatar-soft">{person.avatar_url ? <img src={person.avatar_url} alt="" /> : person.full_name.slice(0,2).toUpperCase()}</div><div className="suggestion-copy"><strong>{person.full_name}{person.verified_type && <VerifiedBadge type={person.verified_type} />}</strong><span>@{person.username}</span><small>{person.bio || ''}</small></div><button className={followed.includes(person.id) ? 'follow-button following' : 'follow-button'} onClick={async () => { if (!sessionUser) return; const isFollowing = followed.includes(person.id); try { const next = await toggleFollow(sessionUser.id, person.id, isFollowing); setFollowed(current => next ? [...current, person.id] : current.filter(id => id !== person.id)); flash(next ? 'Abonnement ajouté.' : 'Abonnement retiré.') } catch { flash('Impossible de modifier cet abonnement.') } }}>{followed.includes(person.id) ? '✓' : '+'}</button></div>)}</div></details><details className="rail-card rail-detail" open><summary className="card-heading"><span>Groupes populaires</span><button type="button" onClick={event => { event.preventDefault(); navigateTo('/groups', 'groups') }}>Voir tout ↗</button></summary><div className="suggestion-list">{networkGroups.slice(0,3).map(group => <div className="suggestion" key={group.id}><div className="group-suggestion-icon group-violet">#</div><div className="suggestion-copy"><strong>{group.name}</strong><span>{group.visibility === 'public' ? 'Public' : 'Privé'}</span><small>Communauté Avani Pro</small></div></div>)}{networkGroups.length === 0 && <p className="empty-copy">Aucun groupe rejoint.</p>}</div></details><footer className="footer-links">À propos · Règles · Confidentialité · Aide<br /><span>© 2026 Avani Pro, Inc.</span></footer></aside>
      {toast && <div className="toast"><span>✦</span>{toast}</div>}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={flash} />}
    </div>
  )
}

function VerifiedBadge({ type = 'verified' }: { type?: string | null }) { const label = type === 'professional' ? 'Compte professionnel v��rifié' : type === 'creator' ? 'Créateur vérifié' : 'Compte vérifié'; return <span className="verified-badge" role="img" aria-label={label} title={label}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5 12.1 3l2.55-.08 1.02 2.34 2.08 1.5-.72 2.45.72 2.45-2.08 1.5-1.02 2.34-2.55-.08L10 17.5l-2.1-1.5-2.55.08-1.02-2.34-2.08-1.5.72-2.45-.72-2.45 2.08-1.5 1.02-2.34L7.9 3 10 1.5Z"/><path className="verified-badge-check" d="m6.3 10.2 2.25 2.2 5.1-5.05"/></svg></span> }
function SvgIcon({ name }: { name: string }) { return <svg className="svg-icon" aria-hidden="true"><use href={`/social-icons.svg#${name}`} /></svg> }
function NavButton({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: string; label: string; badge?: string }) { return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}><SvgIcon name={icon} />{label}{badge && <b>{badge}</b>}</button> }
function formatRelativeTime(iso: string) {
  const minutes = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'À l’instant'
  if (minutes < 60) return `Il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Hier'
  if (days < 7) return `Il y a ${days} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: days > 300 ? 'numeric' : undefined })
}

function formatReactionCount(value: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.max(0, value))
}

const reactionMeta: Array<[ReactionType, string, string]> = [
  ['like', '👍', 'J’aime'],
  ['love', '❤️', 'J’adore'],
  ['haha', '😂', 'Haha'],
  ['wow', '😮', 'Wouah'],
  ['sad', '😢', 'Triste'],
  ['angry', '😡', 'Grrr'],
]

const rxKeys = ['like', 'love', 'haha', 'wow', 'sad', 'angry'] as const
const rxMeta: Record<string, { label: string; icon: string; color: string }> = {
  like: { label: 'J’aime', icon: '/assets/reactions/like.svg', color: '#1877f2' },
  love: { label: 'J’adore', icon: '/assets/reactions/love.svg', color: '#f33e58' },
  haha: { label: 'Haha', icon: '/assets/reactions/haha.svg', color: '#f7b125' },
  wow: { label: 'Wouah', icon: '/assets/reactions/wow.svg', color: '#f7b125' },
  sad: { label: 'Triste', icon: '/assets/reactions/sad.svg', color: '#f7b125' },
  angry: { label: 'Grrr', icon: '/assets/reactions/angry.svg', color: '#e9710f' },
}

function ReactionPicker({ reaction, onReact }: { reaction?: ReactionType; onReact: (reaction: ReactionType) => void }) {
  const [open, setOpen] = useState(false)
  const hoverTimer = useRef<number | null>(null)
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const meta = reaction ? rxMeta[reaction] : undefined
  const cancelHover = () => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current); hoverTimer.current = null }
  const cancelPress = () => { if (pressTimer.current) window.clearTimeout(pressTimer.current); pressTimer.current = null }
  useEffect(() => () => { cancelHover(); cancelPress() }, [])
  return <div
    className="rx"
    onPointerEnter={event => { if (event.pointerType === 'mouse') { cancelHover(); setOpen(true) } }}
    onPointerLeave={event => { if (event.pointerType === 'mouse') { cancelHover(); hoverTimer.current = window.setTimeout(() => setOpen(false), 250) } }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}
  >
    {open && <div className="rx-picker" role="group" aria-label="Choisir une réaction">
      {rxKeys.map(key => <button key={key} type="button" className={`rx-option${reaction === key ? ' is-selected' : ''}`} aria-label={rxMeta[key].label} aria-pressed={reaction === key} style={{ color: rxMeta[key].color }} onClick={() => { setOpen(false); onReact(key as ReactionType) }}>
        <img src={rxMeta[key].icon} alt="" /><span>{rxMeta[key].label}</span>
      </button>)}
    </div>}
    <button
      type="button"
      className={`rx-button${meta ? ' is-active' : ''}`}
      style={meta ? { ['--rx-active' as string]: meta.color } as React.CSSProperties : undefined}
      aria-label={meta ? `Réaction : ${meta.label}. Appuyez pour modifier ou retirer` : 'J’aime'}
      aria-haspopup="true"
      aria-expanded={open}
      onPointerDown={event => {
        longPressed.current = false
        if (event.pointerType !== 'mouse') {
          cancelPress()
          pressTimer.current = window.setTimeout(() => { longPressed.current = true; setOpen(true) }, 450)
        }
      }}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={event => { if (longPressed.current) event.preventDefault() }}
      onClick={() => {
        if (longPressed.current) { longPressed.current = false; return }
        setOpen(false)
        onReact(reaction ?? 'like')
      }}
    >
      {meta ? <img className="rx-icon" src={meta.icon} alt="" /> : <SvgIcon name="like" />}
      <span>{meta ? meta.label : 'J’aime'}</span>
    </button>
  </div>
}

function ReactionModal({ post, onClose }: { post: Post; onClose: () => void }) {
  const [filter, setFilter] = useState<ReactionType | 'all'>('all')
  const [users, setUsers] = useState<Array<{ user_id: string; reaction_type: ReactionType; created_at: string; user: Pick<ProfileRecord, 'id' | 'username' | 'full_name' | 'avatar_url'> | null }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const counts = post.reactionCounts ?? { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => { if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) onClose() }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [onClose])
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    listReactionUsers(String(post.id), filter).then(rows => { if (active) { setUsers(rows); setLoading(false) } }).catch(() => { if (active) { setUsers([]); setLoading(false); setError('Impossible de charger les personnes qui ont réagi.') } })
    return () => { active = false }
  }, [post.id, filter])
  return <div className="reaction-modal-backdrop" role="presentation">
    <div className="reaction-modal" role="dialog" aria-modal="true" aria-label="Réactions" ref={dialogRef}>
      <div className="reaction-modal-head"><div><strong>Réactions</strong><span>{formatReactionCount(total)} au total</span></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></div>
      <div className="reaction-tabs">
        <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Toutes <b>{formatReactionCount(total)}</b></button>
        {reactionMeta.map(([key, emoji, label]) => <button type="button" key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{emoji} {label} <b>{formatReactionCount(counts[key])}</b></button>)}
      </div>
      <div className="reaction-user-list">
        {loading && <p className="empty-copy">Chargement des réactions…</p>}
        {!loading && error && <p className="empty-copy">{error}</p>}
        {!loading && !error && users.length === 0 && <p className="empty-copy">Aucune réaction dans cette catégorie.</p>}
        {!loading && !error && users.map(item => <div className="reaction-user-row" key={`${item.user_id}-${item.reaction_type}`}>
          <div className="avatar avatar-md avatar-soft">{item.user?.avatar_url ? <img src={item.user.avatar_url} alt="" /> : (item.user?.full_name || 'AV').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</div>
          <div><strong>{item.user?.full_name || ''}</strong><span>@{item.user?.username || ''}</span></div>
          <span className={`reaction-user-type reaction-${item.reaction_type}`} aria-label={reactionMeta.find(meta => meta[0] === item.reaction_type)?.[2]}>{reactionMeta.find(meta => meta[0] === item.reaction_type)?.[1]}</span>
        </div>)}
      </div>
    </div>
  </div>
}

function PostCard({ post, user, onNotify, onReact, onShare, onSave, onComment, onCommentCountChange, onEdit, onDelete, editing, onCancelEdit, onSaveEdit }: { post: Post; user: User | null; onNotify: (message: string) => void; onReact: (reaction: ReactionType) => void; onShare: () => void; onSave: () => void; onComment: () => void; onCommentCountChange: (count: number) => void; onEdit: () => void; onDelete: () => void; editing: boolean; onCancelEdit: () => void; onSaveEdit: (body: string) => void }) {
  const [draft, setDraft] = useState(post.body)
  const [menuOpen, setMenuOpen] = useState(false)
  const [hidden, setHidden] = useState(() => { try { return JSON.parse(window.localStorage.getItem('avani:hidden-posts') || '[]').includes(String(post.id)) } catch { return false } })
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentFocus, setCommentFocus] = useState(0)
  const setHiddenPersisted = (value: boolean) => {
    setHidden(value)
    try {
      const list: string[] = JSON.parse(window.localStorage.getItem('avani:hidden-posts') || '[]')
      const next = value ? [...new Set([...list, String(post.id)])] : list.filter(id => id !== String(post.id))
      window.localStorage.setItem('avani:hidden-posts', JSON.stringify(next))
    } catch { /* stockage indisponible : le masquage reste pour cette session */ }
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
  const [reactionModalOpen, setReactionModalOpen] = useState(false)
  const submitEdit = (event: React.FormEvent) => { event.preventDefault(); if (draft.trim()) onSaveEdit(draft.trim()) }
  const openComments = () => { setCommentsOpen(true); setCommentFocus(value => value + 1) }
  const counts = post.reactionCounts ?? { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }
  const reactionTotal = Object.values(counts).reduce((sum, value) => sum + value, 0)
  const imageMatch = post.body.match(/\[image\](.*?)\[\/image\]/)
  const displayBody = post.body.replace(/\n?\[image\].*?\[\/image\]/, '').trim()
  if (hidden) return <article className="post-card post-card-hidden">
    <p>Publication masquée. Vous ne la verrez plus dans votre fil.</p>
    <button type="button" onClick={() => setHiddenPersisted(false)}>Annuler</button>
  </article>
  return <article className="post-card" id={`publication-${post.id}`}>
    <div className="post-header"><div className={`avatar avatar-md ${post.kind === 'image' ? 'avatar-cyan' : 'avatar-soft'}`}>{post.avatarUrl ? <img src={post.avatarUrl} alt={`Photo de profil de ${post.name}`} /> : post.avatar}</div><div className="post-author"><strong>{post.name}{post.verifiedType && <VerifiedBadge type={post.verifiedType} />}</strong><span className="post-meta-line" title={post.handle}>{post.time} · <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M1.5 8h13M8 1.5c2 2.2 2 10.8 0 13M8 1.5c-2 2.2-2 10.8 0 13" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg> Public</span></div><div className="post-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false) }}><button className="more-button" aria-label="Options de la publication" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>•••</button>{menuOpen && <div className="post-menu-popover" role="menu"><button role="menuitem" onClick={() => { setMenuOpen(false); void onSave() }}>{post.saved ? 'Retirer des enregistrements' : 'Enregistrer la publication'}</button><button role="menuitem" onClick={() => { setMenuOpen(false); void copyLink() }}>Copier le lien</button><button role="menuitem" onClick={() => { setMenuOpen(false); setHiddenPersisted(true) }}>Masquer la publication</button>{user?.id === post.authorId && <><span className="post-menu-sep" /><button role="menuitem" onClick={() => { setMenuOpen(false); onEdit() }}>Modifier</button><button role="menuitem" className="danger-action" onClick={() => { setMenuOpen(false); onDelete() }}>Supprimer</button></>}</div>}</div></div>
    {editing ? <form className="post-edit-form" onSubmit={submitEdit}><textarea value={draft} onChange={event => setDraft(event.target.value)} aria-label="Modifier la publication" /><div><button type="button" className="message-button" onClick={onCancelEdit}>Annuler</button><button className="primary-button">Enregistrer</button></div></form> : <>{displayBody && <p className="post-body">{displayBody}</p>}{imageMatch?.[1] && <img className="post-image" src={imageMatch[1]} alt={`Image publiée par ${post.name}`} />}</>}
    <div className="tag-row">{post.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
    <div className="rx-summary">
      <button type="button" className="rx-count" onClick={() => setReactionModalOpen(true)} aria-label={`Voir les ${formatReactionCount(reactionTotal)} réactions`}>
        {reactionTotal > 0 && <>
          <span className="rx-stack" aria-hidden="true">
            {Object.entries(counts).filter(([, count]) => count > 0).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([type]) => rxMeta[type] ? <img key={type} className="rx-stack-icon" src={rxMeta[type].icon} alt="" /> : null)}
          </span>
          <span className="rx-total">{formatReactionCount(reactionTotal)}</span>
        </>}
      </button>
      <div className="rx-meta">
        {post.stats.comments > 0 && <button type="button" onClick={openComments}>{formatReactionCount(post.stats.comments)} commentaire{post.stats.comments > 1 ? 's' : ''}</button>}
        {post.stats.shares > 0 && <button type="button" onClick={() => void onShare()}>{formatReactionCount(post.stats.shares)} partage{post.stats.shares > 1 ? 's' : ''}</button>}
      </div>
    </div>
    <div className="post-actions">
      <ReactionPicker reaction={post.reaction} onReact={onReact}/>
      <button type="button" onClick={openComments}><SvgIcon name="comment"/> Commenter</button>
      <button type="button" onClick={() => void onShare()}><SvgIcon name="share"/> Partager</button>
      
    </div>
    <CommentBox postId={post.id} user={user} focusSignal={commentFocus} initialCount={post.stats.comments} open={commentsOpen} onOpenChange={setCommentsOpen} onAction={onComment} onCountChange={onCommentCountChange}/>
    {reactionModalOpen && <ReactionModal post={post} onClose={() => setReactionModalOpen(false)}/>}
  </article>
}

function CommentBox({ postId, user, initialCount = 0, open, onOpenChange, onAction, onCountChange, focusSignal = 0 }: { postId: string | number; user: User | null; initialCount?: number; open: boolean; onOpenChange: (open: boolean) => void; onAction: () => void; onCountChange: (count: number) => void; focusSignal?: number }) {
  const [comments, setComments] = useState<CommentRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction

  // Le bouton « Commenter » place le curseur dans le champ, comme sur Facebook.
  useEffect(() => {
    if (focusSignal > 0 && open) {
      inputRef.current?.focus()
      inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [focusSignal])

  useEffect(() => {
    if (!open || typeof postId !== 'string') return
    const load = async () => {
      setLoading(true)
      try { setComments(await listComments(postId)); setLoaded(true) } catch { onActionRef.current() } finally { setLoading(false) }
    }
    void load()
  }, [open, postId])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!body.trim()) return
    if (!user) { onAction(); return }
    setBusy(true)
    try {
      const created = await createComment(postId, user.id, body, replyTo)
      setComments(current => { const next = [...current, { ...created, author: { username: user.user_metadata?.username ?? '', full_name: user.user_metadata?.full_name ?? 'Vous', avatar_url: null, verified_type: null } }]; onCountChange(next.length); return next })
      setBody('')
      setReplyTo(null)
      onOpenChange(true)
    } catch { onAction() } finally { setBusy(false) }
  }

  const saveEdit = async (comment: CommentRecord) => {
    if (!user || comment.author_id !== user.id || !editingBody.trim()) return
    try {
      await updateComment(comment.id, user.id, editingBody)
      setComments(current => current.map(item => item.id === comment.id ? { ...item, body: editingBody.trim() } : item))
      setEditingId(null); setEditingBody('')
    } catch { onAction() }
  }

  const remove = async (comment: CommentRecord) => {
    if (!user || comment.author_id !== user.id) return
    try {
      await deleteComment(comment.id, user.id)
      setComments(current => { const next = current.filter(item => item.id !== comment.id && item.parent_id !== comment.id); onCountChange(Math.max(0, next.length)); return next })
    } catch { onAction() }
  }

  const roots = comments.filter(comment => !comment.parent_id)
  const repliesFor = (id: string) => comments.filter(comment => comment.parent_id === id)
  const authorName = (comment: CommentRecord) => comment.author?.full_name || (comment.author_id === user?.id ? 'Vous' : '')
  const initials = (comment: CommentRecord) => authorName(comment).split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'AV'

  return <div className="comment-box">
    <div className="comment-summary"><button className="comment-toggle" onClick={() => onOpenChange(!open)} aria-expanded={open}><span className="comment-icon">◌</span>{open ? 'Masquer les commentaires' : `${loaded ? comments.length : initialCount} commentaire${(loaded ? comments.length : initialCount) > 1 ? 's' : ''}`}</button></div>
    {open && <div className="comment-list">
      {loading && <p className="empty-copy">Chargement des commentaires…</p>}
      {!loading && roots.length === 0 && <p className="empty-copy">Aucun commentaire. Soyez le premier à répondre.</p>}
      {!loading && roots.map(comment => <div className="comment-thread" key={comment.id}>
        <div className="comment-row"><div className="avatar avatar-xs avatar-soft">{comment.author?.avatar_url ? <img src={comment.author.avatar_url} alt="" /> : initials(comment)}</div><div className="comment-content">
          {editingId === comment.id ? <div className="comment-edit"><textarea value={editingBody} onChange={event => setEditingBody(event.target.value)} aria-label="Modifier le commentaire" /><div><button className="message-button" type="button" onClick={() => setEditingId(null)}>Annuler</button><button className="primary-button" type="button" onClick={() => void saveEdit(comment)}>Enregistrer</button></div></div> : <div className="comment-bubble"><strong>{authorName(comment)}{comment.author?.verified_type && <span className="verified">✓</span>}</strong><p>{comment.body}</p></div>}
          <div className="comment-meta"><small>{new Date(comment.created_at).toLocaleString('fr-FR')}</small>{user && <button onClick={() => { setReplyTo(comment.id); setBody(''); onOpenChange(true) }}>Répondre</button>}{user?.id === comment.author_id && <><button onClick={() => { setEditingId(comment.id); setEditingBody(comment.body) }}>Modifier</button><button onClick={() => void remove(comment)}>Supprimer</button></>}</div>
          {repliesFor(comment.id).map(reply => <div className="reply-row" key={reply.id}><div className="avatar avatar-xs avatar-gradient">{reply.author?.avatar_url ? <img src={reply.author.avatar_url} alt="" /> : initials(reply)}</div><div><div className="comment-bubble"><strong>{authorName(reply)}{reply.author?.verified_type && <span className="verified">✓</span>}</strong><p>{reply.body}</p></div><div className="comment-meta"><small>{new Date(reply.created_at).toLocaleString('fr-FR')}</small>{user?.id === reply.author_id && <><button onClick={() => { setEditingId(reply.id); setEditingBody(reply.body) }}>Modifier</button><button onClick={() => void remove(reply)}>Supprimer</button></>}</div></div></div>)}
        </div></div>
      </div>)}
      <form className="comment-form" onSubmit={submit}><div className="avatar avatar-xs avatar-gradient">{user ? 'VO' : '?'}</div><input ref={inputRef} value={body} onChange={event => setBody(event.target.value)} placeholder={replyTo ? 'Écrivez votre réponse…' : 'Écrivez un commentaire…'} aria-label={replyTo ? 'Votre réponse' : 'Votre commentaire'} /><button className="primary-button" disabled={busy}>{busy ? 'Envoi…' : replyTo ? 'Répondre' : 'Publier'}</button></form>
    </div>}
  </div>
}
export default App
