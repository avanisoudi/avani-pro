import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import './App.css'
import { AuthModal } from './components/AuthModal'
import { AdminPanel, ExplorePanel, GroupsPanel, PagesPanel, ProfilePanel, SettingsPanel } from './components/FeaturePanels'
import { MessagesPanel } from './components/MessagesPanel'
import { FilesPanel, NotificationsPanel, PublicProfilePanel, SavedPanel, SearchPanel } from './components/AdvancedPanels'
import { createPost, deletePost as deletePostRecord, getMyProfile, listFeedPosts, listReactionUsers, recordPostShare, setPostReaction, toggleSavedPost, updatePost as updatePostRecord, type ProfileRecord, type ReactionType } from './lib/api'
import { createComment, createStory, deleteComment, listActiveStories, listComments, listDiscoverableProfiles, listFollowingIds, listMyGroups, toggleFollow, updateComment, uploadPrivateFile, type CommentRecord, type StoryRecord } from './lib/socialApi'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type NavKey = 'feed' | 'explore' | 'messages' | 'groups' | 'pages' | 'profile' | 'admin' | 'settings' | 'files' | 'saved' | 'notifications'
type Post = { id: string | number; authorId?: string; name: string; handle: string; role: string; avatar: string; time: string; body: string; tags: string[]; stats: { likes: number; comments: number; shares: number }; kind: string; liked?: boolean; reaction?: ReactionType; reactionCounts?: Record<ReactionType, number>; saved?: boolean; verifiedType?: string | null; avatarUrl?: string | null }

function PublicHome({ onAuth }: { onAuth: () => void }) {
  return <main className="public-home">
    <header className="public-nav"><div className="brand"><span className="brand-mark"><img src="/assets/avani-mark.svg" alt="" /></span><span>AVANI<span className="brand-pro">PRO</span></span></div><div className="public-nav-actions"><a href="#vision">Pourquoi Avani Pro</a><a href="#features">Fonctionnalités</a><button className="auth-button" onClick={onAuth}>Se connecter</button><button className="primary-button" onClick={onAuth}>Créer un compte <span>↗</span></button></div></header>
    <section className="public-hero"><div className="hero-copy"><span className="eyebrow">LE RÉSEAU DES ESPRITS EN MOUVEMENT</span><h1>Les bonnes idées méritent <em>un vrai réseau.</em></h1><p>Avani Pro réunit professionnels, créateurs et communautés dans un espace conçu pour partager, échanger et transformer les conversations en projets concrets.</p><div className="hero-actions"><button className="primary-button hero-cta" onClick={onAuth}>Rejoindre Avani Pro <span>↗</span></button><a className="hero-link" href="#vision">Découvrir la plateforme <span>↓</span></a></div><div className="hero-proof"><div className="proof-avatars"><span>MC</span><span>SA</span><span>KM</span><b>+2.8k</b></div><span>Une communauté active<br /><strong>qui avance ensemble</strong></span></div></div><div className="hero-visual" aria-label="Aperçu des conversations Avani Pro"><div className="visual-glow" /><div className="visual-window"><div className="visual-top"><span className="window-dots">● ● ●</span><span>votre signal</span><span>•••</span></div><div className="visual-stat"><span>IMPACT DE LA COMMUNAUTÉ</span><strong>+24.8%</strong><i /></div><div className="visual-message"><div className="avatar avatar-sm avatar-gradient">MC</div><div><strong>Maya Chen</strong><p>La prochaine décision devient évidente.</p><small>Il y a 12 min · 248 j’aime</small></div></div><div className="visual-message second"><div className="avatar avatar-sm avatar-soft">NS</div><div><strong>Nexa Studio</strong><p>Construisons quelque chose d’utile.</p><small>Il y a 48 min · 42 partages</small></div></div><div className="visual-composer">Partager une idée avec votre réseau <b>↗</b></div></div></div></section>
    <section id="vision" className="public-section"><div><span className="eyebrow">PLUS QU’UN FIL D’ACTUALITÉ</span><h2>Un espace qui donne de la portée à vos idées.</h2></div><p>Pas de bruit inutile. Avani Pro est pensé pour les échanges qui comptent, les rencontres qui ouvrent des portes et les groupes qui font réellement avancer les projets.</p></section>
    <section id="features" className="public-features"><article><span>01</span><h3>Votre signal</h3><p>Publiez vos réflexions, projets et apprentissages auprès d’un réseau qui vous comprend.</p></article><article><span>02</span><h3>Vos communautés</h3><p>Créez ou rejoignez des groupes privés pour discuter comme dans un espace de confiance.</p></article><article><span>03</span><h3>Vos conversations</h3><p>Échangez en direct, partagez des fichiers et gardez les idées importantes au même endroit.</p></article></section>
    <section className="public-details"><div><span className="eyebrow">PENSÉ POUR VOTRE QUOTIDIEN</span><h2>Tout ce qu’il faut pour faire avancer vos projets.</h2></div><div className="detail-list"><article><strong>Un profil qui vous ressemble</strong><p>Présentez votre expertise, vos intérêts et vos réalisations à une communauté pertinente.</p></article><article><strong>Des échanges qui restent utiles</strong><p>Publiez, commentez, répondez et retrouvez vos conversations sans perdre le fil.</p></article><article><strong>Un espace fiable</strong><p>Votre compte et vos échanges sont protégés. Vous gardez le contrôle de ce que vous partagez.</p></article></div></section>
    <section className="public-bottom"><h2>Votre prochaine conversation peut tout changer.</h2><p>Créez votre compte gratuitement et rejoignez les personnes qui construisent la suite.</p><button className="primary-button" onClick={onAuth}>Créer mon compte gratuitement <span>↗</span></button></section>
    <footer className="public-footer"><span>© 2026 Avani Pro</span><span>Un réseau pensé pour avancer.</span></footer>
  </main>
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
  useEffect(() => { if (!viewer) return; setProgress(0); const started = Date.now(); const timer = window.setInterval(() => { const value = Math.min(100, ((Date.now() - started) / 7000) * 100); setProgress(value); if (value >= 100) setViewer(null) }, 100); return () => window.clearInterval(timer) }, [viewer])
  const addStory = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { onAction('Choisissez une photo ou une vidéo.'); return }; if (file.size > 50 * 1024 * 1024) { onAction('La story doit faire moins de 50 Mo.'); return }; setStoryFile(file); setStoryPreview(URL.createObjectURL(file)); setStoryComposerOpen(true) }
  const publishStory = async (event: React.FormEvent) => { event.preventDefault(); if (!userId || !storyFile) { onAction('Connectez-vous pour publier une story.'); return }; try { await createStory(userId, storyFile, storyCaption, storyPrivacy); setStoryComposerOpen(false); setStoryCaption(''); setStoryFile(null); if (storyPreview) URL.revokeObjectURL(storyPreview); setStoryPreview(null); await loadStories(); onAction('Story publiée pour 24 heures.') } catch (error) { onAction(error instanceof Error ? error.message : 'La story n’a pas pu être publiée.') } }
  const ownStory = stories.find(story => story.author_id === userId)
  const others = stories.filter(story => story.author_id !== userId)
  const authorName = (story: StoryRecord) => story.author?.full_name || 'Nouveau membre'
  return <section className="stories-section" aria-label="Stories">
    <div className="stories-heading"><div><strong>Stories</strong><span>Photos et vidéos · 24 h</span></div><button onClick={() => void loadStories()}>Actualiser ↻</button></div>
    <div className="stories-row">
      {ownStory ? <button className="story-card story-self story-live" onClick={() => setViewer(ownStory)} aria-label="Voir votre story"><span className="story-shade" />{ownStory.media_url ? <img className="story-media-preview" src={ownStory.media_url} alt="" /> : ownAvatar ? <img className="story-media-preview" src={ownAvatar} alt="" /> : <span className="story-avatar story-avatar-own">AV</span>}<strong>Votre story</strong></button> : <label className="story-card story-self" htmlFor="story-upload" aria-label="Créer une story"><span className="story-shade" />{ownAvatar ? <img className="story-media-preview" src={ownAvatar} alt="" /> : null}<span className="story-add-button" aria-hidden="true">+</span><strong>Créer une story</strong></label>}
      {storyComposerOpen && storyPreview && <div className="story-composer-backdrop" role="dialog" aria-modal="true" aria-label="Créer une story"><form className="story-composer" onSubmit={publishStory}><button type="button" className="story-close" onClick={() => setStoryComposerOpen(false)} aria-label="Fermer">×</button><span className="eyebrow">NOUVELLE STORY</span><h3>Aperçu de votre story</h3>{storyFile?.type.startsWith('video/') ? <video src={storyPreview} controls /> : <img src={storyPreview} alt="Aperçu de la story" />}<textarea value={storyCaption} onChange={event => setStoryCaption(event.target.value)} placeholder="Ajoutez une description…" aria-label="Description de la story" /><label className="story-privacy">Audience<select value={storyPrivacy} onChange={event => setStoryPrivacy(event.target.value as typeof storyPrivacy)}><option value="public">Tout le monde</option><option value="followers">Mes followers</option><option value="private">Moi uniquement</option></select></label><div className="story-composer-actions"><button type="button" className="message-button" onClick={() => setStoryComposerOpen(false)}>Annuler</button><button className="primary-button">Partager la story</button></div></form></div>}
      {others.map(story => <button className="story-card story-live" key={story.id} onClick={() => setViewer(story)} aria-label={`Voir la story de ${authorName(story)}`}><span className="story-shade" />{story.media_url ? <img className="story-media-preview" src={story.media_url} alt="" /> : <span className="story-avatar">{authorName(story).slice(0,2).toUpperCase()}</span>}<strong>{authorName(story)}</strong></button>)}

      <input id="story-upload" className="visually-hidden" type="file" accept="image/*,video/*" onChange={addStory} />
    </div>
    {viewer && <div className="story-viewer" role="dialog" aria-modal="true" aria-label={`Story de ${authorName(viewer)}`} onClick={() => setViewer(null)}><div className="story-viewer-card" onClick={event => event.stopPropagation()}><div className="story-progress"><i style={{ width: `${progress}%` }} /></div><button className="story-close" onClick={() => setViewer(null)} aria-label="Fermer la story">×</button><div className="story-viewer-media">{viewer.media_type === 'video' ? <video src={viewer.media_url} controls autoPlay /> : <img src={viewer.media_url} alt="" />}</div><strong>{authorName(viewer)}</strong>{viewer.caption && <p>{viewer.caption}</p>}<small>Expire dans 24 heures · audience {viewer.privacy}</small></div></div>}
  </section>
}
function App() {
  const initialPath = typeof window === 'undefined' ? '/' : window.location.pathname
  const initialNav: NavKey = initialPath.startsWith('/groups') ? 'groups' : initialPath.startsWith('/pages') ? 'pages' : initialPath.startsWith('/messages') ? 'messages' : initialPath.startsWith('/notifications') ? 'notifications' : initialPath.startsWith('/search') ? 'explore' : initialPath.startsWith('/files') ? 'files' : initialPath.startsWith('/admin') ? 'admin' : initialPath.startsWith('/settings') || initialPath.startsWith('/u/') ? 'profile' : 'feed'
  const [active, setActive] = useState<NavKey>(initialNav)
  const [pathname, setPathname] = useState(initialPath)
  const [posts, setPosts] = useState<Post[]>([])
  const [composer, setComposer] = useState('')
  const [toast, setToast] = useState('')
  const [followed, setFollowed] = useState<string[]>([])
  const [networkPeople, setNetworkPeople] = useState<ProfileRecord[]>([])
  const [networkGroups, setNetworkGroups] = useState<any[]>([])
  const [feedFilter, setFeedFilter] = useState<'all' | 'following' | 'trending'>('all')
  const [feedQuery, setFeedQuery] = useState('')
  const [editingPostId, setEditingPostId] = useState<string | number | null>(null)
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
  const displayName = profile?.full_name || sessionUser?.user_metadata?.full_name || 'Alex Morgan'
  const displayUsername = profile?.username ? `@${profile.username}` : sessionUser?.email ? `@${sessionUser.email.split('@')[0]}` : '@alexmorgan'
  const displayAvatar = displayName.split(/\s+/).filter(Boolean).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase() || 'AV'
  const displayAvatarUrl = profile?.avatar_url ?? null
  const visiblePosts = useMemo(() => {
    const query = feedQuery.trim().toLowerCase()
    return posts
      .filter(post => feedFilter !== 'following' || Boolean(post.authorId && followed.includes(post.authorId)))
      .filter(post => feedFilter !== 'trending' || post.stats.likes >= 150)
      .filter(post => !query || `${post.name} ${post.body} ${post.tags.join(' ')}`.toLowerCase().includes(query))
  }, [feedFilter, feedQuery, followed, posts])
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
  const publish = async () => { if (!composer.trim()) return; if (isSupabaseConfigured && !sessionUser) { openAuth(); return }; const body = composer.trim(); try { const persisted = sessionUser ? await createPost(sessionUser.id, body) : null; setPosts(current => [{ id: persisted?.id ?? Date.now(), name: displayName, handle: displayUsername, role: 'Nouveau membre', avatar: displayAvatar, time: 'à l’instant', body, tags: ['#nouveau'], stats: { likes: 0, comments: 0, shares: 0 }, kind: 'thought' }, ...current]); setComposer(''); flash(sessionUser ? 'Publication enregistrée dans votre feed' : 'Publication partagée avec votre réseau') } catch (caught) { flash(caught instanceof Error ? caught.message : 'La publication n’a pas pu être enregistrée.') } }
  useEffect(() => { if (!supabase) return; supabase.auth.getSession().then(({ data }) => { setSessionUser(data.session?.user ?? null); if (!data.session) setProfile(null) }); const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSessionUser(session?.user ?? null); if (!session) setProfile(null) }); return () => subscription.unsubscribe() }, [])
  useEffect(() => { if (!sessionUser) { setNetworkPeople([]); setNetworkGroups([]); setFollowed([]); return }; Promise.all([listDiscoverableProfiles(sessionUser.id), listMyGroups(sessionUser.id), listFollowingIds(sessionUser.id)]).then(([people, groups, followingIds]) => { setNetworkPeople(people); setNetworkGroups(groups); setFollowed(followingIds) }).catch(() => { setNetworkPeople([]); setNetworkGroups([]); setFollowed([]) }) }, [sessionUser])
  useEffect(() => { if (!supabase) return; listFeedPosts(sessionUser?.id).then(feed => { if (supabase) setPosts(feed.map(post => ({ id: post.id, authorId: post.author?.id, name: post.author?.full_name || 'Nouveau membre', handle: post.author?.username ? `@${post.author.username}` : '@avani', role: post.author?.bio || 'Nouveau membre', avatar: (post.author?.full_name || 'AV').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(), avatarUrl: post.author?.avatar_url ?? null, time: new Date(post.created_at).toLocaleDateString('fr-FR'), body: post.body, tags: post.body.match(/#[\w-]+/g) ?? ['#avani-pro'], stats: { likes: post.likes, comments: post.comments, shares: post.shares }, kind: post.post_type === 'image' ? 'image' : post.post_type === 'link' ? 'link' : 'thought', liked: post.liked, reaction: post.reaction ?? undefined, reactionCounts: post.reactionCounts, saved: post.saved, verifiedType: post.author?.verified_type }))) }).catch(() => undefined) }, [sessionUser])
  useEffect(() => { if (!sessionUser || !supabase) return; getMyProfile(sessionUser).then(setProfile).catch(() => undefined) }, [sessionUser])
  const openAuth = () => { if (!isSupabaseConfigured) { flash('Ajoutez vos variables Supabase dans Render pour activer la connexion.'); return }; setAuthOpen(true) }
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); setProfile(null); flash('Vous êtes déconnecté de votre espace sécurisé.') }
  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (!sessionUser) { openAuth(); return }; try { await uploadPrivateFile(sessionUser.id, file); flash(`Fichier « ${file.name} » sécurisé dans votre espace.`) } catch (error) { flash(error instanceof Error ? error.message : 'Le fichier n’a pas pu être envoyé.') } }
 

  if (!sessionUser) return <><PublicHome onAuth={openAuth} />{authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={flash} />}{toast && <div className="toast"><span>✦</span>{toast}</div>}</>

  return (
    <div className={`app-shell theme-${theme}`}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><img src="/logo-icon.png" alt="" /></span><span>AVANI<span className="brand-pro">PRO</span></span></div>
        <div className="profile-mini"><div className="avatar avatar-xl avatar-gradient">{displayAvatarUrl ? <img src={displayAvatarUrl} alt="Photo de profil" /> : displayAvatar}</div><div><strong>{displayName}{profile?.verified_type && <VerifiedBadge type={profile.verified_type} />}</strong><span>{displayUsername}</span></div></div>
        <nav className="nav-stack" aria-label="Navigation principale">
                    <span className="nav-section-label">Principal</span>
          <NavButton active={active === 'feed'} onClick={() => navigateTo('/', 'feed')} icon="home" label="Accueil" />
          <NavButton active={active === 'explore'} onClick={() => navigateTo('/search', 'explore')} icon="explore" label="Réseau" />
          <NavButton active={active === 'messages'} onClick={() => navigateTo('/messages', 'messages')} icon="messages" label="Messenger" />
          <NavButton active={active === 'notifications'} onClick={() => navigateTo('/notifications', 'notifications')} icon="explore" label="Notifications" />
          <span className="nav-section-label">Communautés</span>
          <NavButton active={active === 'groups'} onClick={() => navigateTo('/groups', 'groups')} icon="groups" label="Groupes" />
          <NavButton active={active === 'pages'} onClick={() => navigateTo('/pages', 'pages')} icon="pages" label="Pages" />
          <NavButton active={active === 'profile'} onClick={() => navigateTo('/settings', 'profile')} icon="profile" label="Mon profil" />
          <NavButton active={active === 'files'} onClick={() => navigateTo('/files', 'files')} icon="save" label="Fichiers" /><NavButton active={active === 'saved'} onClick={() => navigateTo('/saved', 'saved')} icon="save" label="Enregistrés" />
          <span className="nav-section-label nav-section-admin">Gestion</span>
          <NavButton active={active === 'admin'} onClick={() => navigateTo('/admin', 'admin')} icon="admin" label="Administration" />
        </nav>
          <div className="sidebar-bottom"><button className={`nav-button muted ${active === 'settings' ? 'active' : ''}`} onClick={() => navigateTo('/settings', 'settings')}><SvgIcon name="settings" /> Réglages</button><div className="security-note"><span className="pulse-dot" /> Espace sécurisé<br /><small>Chiffrement actif</small></div></div>
      </aside>
      <nav className="mobile-tabbar" aria-label="Navigation mobile"><NavButton active={active === 'feed'} onClick={() => navigateTo('/', 'feed')} icon="home" label="Accueil" /><NavButton active={active === 'explore'} onClick={() => navigateTo('/search', 'explore')} icon="explore" label="Explorer" /><NavButton active={active === 'messages'} onClick={() => navigateTo('/messages', 'messages')} icon="messages" label="Messages" /><NavButton active={active === 'notifications'} onClick={() => navigateTo('/notifications', 'notifications')} icon="explore" label="Alertes" /><NavButton active={active === 'profile'} onClick={() => navigateTo('/settings', 'profile')} icon="profile" label="Profil" /></nav>

      <main className="main-content">
        <header className="topbar"><div className="topbar-brand"><button className="topbar-brand-button" aria-label="Accueil Avani Pro" onClick={() => navigateTo('/', 'feed')}><span className="brand-mark"><img src="/logo-icon.png" alt="" /></span><span>AVANI<span className="brand-pro">PRO</span></span></button><label className="search"><SvgIcon name="search" /><input value={feedQuery} onChange={event => setFeedQuery(event.target.value)} placeholder="Rechercher sur Avani Pro…" aria-label="Recherche globale" /></label></div><nav className="topbar-nav" aria-label="Navigation principale"><button className={active === 'feed' ? 'active' : ''} onClick={() => navigateTo('/', 'feed')}>Accueil</button><button className={active === 'explore' ? 'active' : ''} onClick={() => navigateTo('/search', 'explore')}>Réseau</button><button className={active === 'pages' ? 'active' : ''} onClick={() => navigateTo('/pages', 'pages')}>Pages</button><button className={active === 'groups' ? 'active' : ''} onClick={() => navigateTo('/groups', 'groups')}>Groupes</button><button className={active === 'messages' ? 'active' : ''} onClick={() => navigateTo('/messages', 'messages')}>Messenger</button></nav><div className="top-actions"><button className="create-top" onClick={() => document.querySelector<HTMLTextAreaElement>('.composer-card textarea')?.focus()}>＋ Créer</button><button className="profile-trigger" aria-label="Ouvrir mon profil" onClick={() => navigateTo('/settings', 'profile')}><span className="avatar avatar-sm avatar-gradient">{displayAvatarUrl ? <img src={displayAvatarUrl} alt="Photo de profil" /> : displayAvatar}</span><span className="profile-trigger-name">{displayName.split(' ')[0]}</span></button><button className="menu-trigger" aria-expanded={menuOpen} aria-label="Ouvrir le menu principal" onClick={() => setMenuOpen(value => !value)}>☰</button></div>{menuOpen && <div className="main-menu"><button onClick={() => { setMenuOpen(false); navigateTo('/settings', 'settings') }}>Réglages</button><button onClick={() => { setMenuOpen(false); navigateTo('/files', 'files') }}>Mes fichiers</button><button onClick={() => { setMenuOpen(false); navigateTo('/notifications', 'notifications') }}>Notifications</button><button className="menu-danger" onClick={() => { setMenuOpen(false); void signOut() }}>Se déconnecter</button></div>}</header>

        {active === 'feed' && <>
          <Stories onAction={flash} ownAvatar={displayAvatarUrl} userId={sessionUser?.id ?? null} />
                  <section className="composer-card"><div className="avatar avatar-md avatar-gradient">{displayAvatar}</div><div className="composer-body"><textarea value={composer} onChange={event => setComposer(event.target.value)} placeholder={sessionUser ? `Qu’est-ce qui mérite d’être partagé, ${displayName.split(' ')[0]} ?` : 'Qu’est-ce qui mérite d’être partagé aujourd’hui ?'} rows={2} /><div className="composer-footer"><div className="composer-tools"><label className="composer-action photo-action"><SvgIcon name="pages" /><span>Photo/vidéo</span><input className="composer-file-input" type="file" accept="image/*,video/*" onChange={handleFile} /></label><label className="composer-action file-action"><SvgIcon name="save" /><span>Fichier</span><input className="composer-file-input" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt" onChange={handleFile} /></label><button className="composer-action link-action" onClick={() => flash('Ajoutez un lien dans votre publication pour le partager.') }><SvgIcon name="share" /><span>Lien</span></button><button className="composer-action feeling-action" onClick={() => setComposer(current => `${current}${current ? ' ' : ''}😊`)}><span className="feeling-icon">☺</span><span>Humeur/activité</span></button></div><button className="primary-button composer-submit" onClick={publish}>Publier <span>↗</span></button></div></div></section>
          <div className="feed-filter"><div><button className={feedFilter === 'all' ? 'filter-active' : ''} onClick={() => setFeedFilter('all')}>Pour vous</button><button className={feedFilter === 'following' ? 'filter-active' : ''} onClick={() => setFeedFilter('following')}>Abonnements</button><button className={feedFilter === 'trending' ? 'filter-active' : ''} onClick={() => setFeedFilter('trending')}>Tendances</button></div><button className="sort-button" onClick={() => setFeedQuery('')}>Réinitialiser ↕</button></div>
          <section className="post-list">{visiblePosts.length === 0 ? <div className="empty-feed"><strong>Aucune publication trouvée</strong><span>Essayez un autre filtre ou une autre recherche.</span></div> : visiblePosts.map(post => <PostCard key={post.id} post={post} user={sessionUser} onReact={(reaction) => void reactToPost(post.id, reaction)} onCommentCountChange={(count) => setPosts(current => current.map(item => item.id === post.id ? { ...item, stats: { ...item.stats, comments: count } } : item))} onShare={async () => { if (sessionUser && typeof post.id === 'string') { try { await recordPostShare(post.id, sessionUser.id); setPosts(current => current.map(item => item.id === post.id ? { ...item, stats: { ...item.stats, shares: item.stats.shares + 1 } } : item)) } catch { flash('Le partage n’a pas pu être enregistré.') } } else flash('Connectez-vous pour enregistrer ce partage.') }} onSave={async () => { if (!sessionUser || typeof post.id !== 'string') { flash('Connectez-vous pour sauvegarder cette publication.'); return }; try { const next = await toggleSavedPost(post.id, sessionUser.id, post.saved ?? false); setPosts(current => current.map(item => item.id === post.id ? { ...item, saved: next } : item)); flash(next ? 'Publication sauvegardée.' : 'Publication retirée des sauvegardes.') } catch { flash('La sauvegarde n’a pas pu être enregistrée.') } }} onComment={() => flash('Ouvrez le fil de commentaires sous la publication.')} onEdit={() => setEditingPostId(post.id)} onDelete={() => void deletePost(post.id)} editing={editingPostId === post.id} onCancelEdit={() => setEditingPostId(null)} onSaveEdit={body => void updatePost(post.id, body)} />)}</section>
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

      <aside className="right-rail"><details className="rail-card rail-detail network-card" open><summary className="card-heading"><span>Votre réseau</span><button type="button" onClick={event => { event.preventDefault(); setActive('explore') }}>Voir tout ↗</button></summary><div className="network-stat"><strong>{profile?.followers_count ?? 0}</strong><span>followers</span><div className="mini-avatars">{networkPeople.slice(0,3).map(person => <span key={person.id}>{person.full_name.slice(0,2).toUpperCase()}</span>)}<b>+{networkPeople.length}</b></div></div></details><details className="rail-card rail-detail" open><summary className="card-heading"><span>À découvrir</span><button type="button" onClick={event => { event.preventDefault(); setActive('explore') }}>Voir tout ↗</button></summary><div className="suggestion-list">{networkPeople.slice(0,4).map(person => <div className="suggestion" key={person.id}><div className="avatar avatar-md avatar-soft">{person.avatar_url ? <img src={person.avatar_url} alt="" /> : person.full_name.slice(0,2).toUpperCase()}</div><div className="suggestion-copy"><strong>{person.full_name}{person.verified_type && <VerifiedBadge type={person.verified_type} />}</strong><span>@{person.username}</span><small>{person.bio || 'Nouveau membre'}</small></div><button className={followed.includes(person.id) ? 'follow-button following' : 'follow-button'} onClick={async () => { if (!sessionUser) return; const isFollowing = followed.includes(person.id); try { const next = await toggleFollow(sessionUser.id, person.id, isFollowing); setFollowed(current => next ? [...current, person.id] : current.filter(id => id !== person.id)); flash(next ? 'Abonnement ajouté.' : 'Abonnement retiré.') } catch { flash('Impossible de modifier cet abonnement.') } }}>{followed.includes(person.id) ? '✓' : '+'}</button></div>)}</div></details><details className="rail-card rail-detail" open><summary className="card-heading"><span>Vos groupes</span><button type="button" onClick={event => { event.preventDefault(); navigateTo('/groups', 'groups') }}>Voir tout ↗</button></summary><div className="suggestion-list">{networkGroups.slice(0,3).map(group => <div className="suggestion" key={group.id}><div className="group-suggestion-icon group-violet">#</div><div className="suggestion-copy"><strong>{group.name}</strong><span>{group.visibility === 'public' ? 'Public' : 'Privé'}</span><small>Communauté Avani Pro</small></div></div>)}{networkGroups.length === 0 && <p className="empty-copy">Aucun groupe rejoint.</p>}</div></details><footer className="footer-links">À propos · Règles · Confidentialité · Aide<br /><span>© 2026 Avani Pro, Inc.</span></footer></aside>
      {toast && <div className="toast"><span>✦</span>{toast}</div>}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={flash} />}
    </div>
  )
}

function VerifiedBadge({ type = 'verified' }: { type?: string | null }) { const label = type === 'professional' ? 'Compte professionnel v��rifié' : type === 'creator' ? 'Créateur vérifié' : 'Compte vérifié'; return <span className="verified-badge" role="img" aria-label={label} title={label}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5 12.1 3l2.55-.08 1.02 2.34 2.08 1.5-.72 2.45.72 2.45-2.08 1.5-1.02 2.34-2.55-.08L10 17.5l-2.1-1.5-2.55.08-1.02-2.34-2.08-1.5.72-2.45-.72-2.45 2.08-1.5 1.02-2.34L7.9 3 10 1.5Z"/><path className="verified-badge-check" d="m6.3 10.2 2.25 2.2 5.1-5.05"/></svg></span> }
function SvgIcon({ name }: { name: string }) { return <svg className="svg-icon" aria-hidden="true"><use href={`/social-icons.svg#${name}`} /></svg> }
function NavButton({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: string; label: string; badge?: string }) { return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}><SvgIcon name={icon} />{label}{badge && <b>{badge}</b>}</button> }
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

function ReactionPicker({ reaction, onReact }: { reaction?: ReactionType; onReact: (reaction: ReactionType) => void }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const current = reactionMeta.find(item => item[0] === reaction) ?? reactionMeta[0]
  const closeSoon = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 180)
  }
  const keepOpen = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    setOpen(true)
  }
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current) }, [])
  return <div
    className="reaction-action"
    onPointerEnter={keepOpen}
    onPointerLeave={closeSoon}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}
  >
    {open && <div className="reaction-picker" role="group" aria-label="Choisir une réaction">
      {reactionMeta.map(([key, emoji, label]) => <button type="button" key={key} className={reaction === key ? 'active' : ''} title={label} aria-label={label} onClick={() => { onReact(key); setOpen(false) }}>{emoji}</button>)}
    </div>}
    <button
      type="button"
      className={reaction ? `reaction-selected reaction-${current[0]}` : 'reaction-selected reaction-like'}
      aria-haspopup="true"
      aria-expanded={open}
      aria-label={reaction ? `Réaction actuelle : ${current[2]}. Modifier ou retirer la réaction` : 'J’aime. Ouvrir les réactions'}
      onClick={() => {
        onReact(reaction ?? 'like')
        setOpen(false)
      }}
      onPointerDown={event => {
        if (event.pointerType === 'touch') setOpen(true)
      }}
    >
      {current[0] === 'like' ? <img className="reaction-button-asset" src={reaction === 'like' ? '/assets/reaction-like-blue.svg' : '/assets/reaction-like.svg'} alt="" aria-hidden="true" style={{ width: '21px', height: '21px', objectFit: 'contain' }} /> : <span className="reaction-button-emoji" aria-hidden="true">{current[1]}</span>}
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
          <div><strong>{item.user?.full_name || 'Nouveau membre'}</strong><span>@{item.user?.username || 'membre'}</span></div>
          <span className={`reaction-user-type reaction-${item.reaction_type}`} aria-label={reactionMeta.find(meta => meta[0] === item.reaction_type)?.[2]}>{reactionMeta.find(meta => meta[0] === item.reaction_type)?.[1]}</span>
        </div>)}
      </div>
    </div>
  </div>
}

function PostCard({ post, user, onReact, onShare, onSave, onComment, onCommentCountChange, onEdit, onDelete, editing, onCancelEdit, onSaveEdit }: { post: Post; user: User | null; onReact: (reaction: ReactionType) => void; onShare: () => void; onSave: () => void; onComment: () => void; onCommentCountChange: (count: number) => void; onEdit: () => void; onDelete: () => void; editing: boolean; onCancelEdit: () => void; onSaveEdit: (body: string) => void }) {
  const [draft, setDraft] = useState(post.body)
  const [menuOpen, setMenuOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [reactionModalOpen, setReactionModalOpen] = useState(false)
  const submitEdit = (event: React.FormEvent) => { event.preventDefault(); if (draft.trim()) onSaveEdit(draft.trim()) }
  const openComments = () => { setCommentsOpen(true); onComment() }
  const counts = post.reactionCounts ?? { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }
  const reactionTotal = Object.values(counts).reduce((sum, value) => sum + value, 0)
  return <article className="post-card">
    <div className="post-header"><div className={`avatar avatar-md ${post.kind === 'image' ? 'avatar-cyan' : 'avatar-soft'}`}>{post.avatarUrl ? <img src={post.avatarUrl} alt={`Photo de profil de ${post.name}`} /> : post.avatar}</div><div className="post-author"><strong>{post.name}{post.verifiedType && <VerifiedBadge type={post.verifiedType} />}</strong><span>{post.handle} · {post.time} · Public</span><small>{post.role}</small></div><div>{user?.id === post.authorId && <div className="post-menu"><button className="more-button" aria-label="Options de la publication" onClick={() => setMenuOpen(!menuOpen)}>•••</button>{menuOpen && <div className="post-menu-popover"><button onClick={() => { setMenuOpen(false); onEdit() }}>Modifier</button><button className="danger-action" onClick={() => { setMenuOpen(false); onDelete() }}>Supprimer</button></div>}</div>}</div></div>
    {editing ? <form className="post-edit-form" onSubmit={submitEdit}><textarea value={draft} onChange={event => setDraft(event.target.value)} aria-label="Modifier la publication" /><div><button type="button" className="message-button" onClick={onCancelEdit}>Annuler</button><button className="primary-button">Enregistrer</button></div></form> : <p className="post-body">{post.body}</p>}
    <div className="tag-row">{post.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
    <div className="post-social-summary">
      <div className="reaction-summary">
        <button type="button" className="reaction-total" onClick={() => setReactionModalOpen(true)} title={`${formatReactionCount(reactionTotal)} likes`}>
          {formatReactionCount(reactionTotal)} like{reactionTotal > 1 ? 's' : ''}
        </button>
      </div>
      <div className="social-summary-right">
        {post.stats.comments > 0 && <button type="button" onClick={openComments}>{formatReactionCount(post.stats.comments)} commentaire{post.stats.comments > 1 ? 's' : ''}</button>}
        {post.stats.shares > 0 && <span>{formatReactionCount(post.stats.shares)} partage{post.stats.shares > 1 ? 's' : ''}</span>}
      </div>
    </div>
    <div className="post-actions">
      <ReactionPicker reaction={post.reaction} onReact={onReact}/>
      <button type="button" onClick={openComments}><SvgIcon name="comment"/> Commenter</button>
      <button type="button" onClick={() => void onShare()}><SvgIcon name="share"/> Partager</button>
      <button type="button" className={post.saved ? 'save-action saved' : 'save-action'} onClick={() => void onSave()}><SvgIcon name="save"/> Enregistrer</button>
    </div>
    <CommentBox postId={post.id} user={user} initialCount={post.stats.comments} open={commentsOpen} onOpenChange={setCommentsOpen} onAction={onComment} onCountChange={onCommentCountChange}/>
    {reactionModalOpen && <ReactionModal post={post} onClose={() => setReactionModalOpen(false)}/>}
  </article>
}

function CommentBox({ postId, user, initialCount = 0, open, onOpenChange, onAction, onCountChange }: { postId: string | number; user: User | null; initialCount?: number; open: boolean; onOpenChange: (open: boolean) => void; onAction: () => void; onCountChange: (count: number) => void }) {
  const [comments, setComments] = useState<CommentRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')

  useEffect(() => {
    if (!open || typeof postId !== 'string') return
    const load = async () => {
      setLoading(true)
      try { setComments(await listComments(postId)); setLoaded(true) } catch { onAction() } finally { setLoading(false) }
    }
    void load()
  }, [open, postId, onAction])

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
  const authorName = (comment: CommentRecord) => comment.author?.full_name || (comment.author_id === user?.id ? 'Vous' : 'Nouveau membre')
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
      <form className="comment-form" onSubmit={submit}><div className="avatar avatar-xs avatar-gradient">{user ? 'VO' : '?'}</div><input value={body} onChange={event => setBody(event.target.value)} placeholder={replyTo ? 'Écrivez votre réponse…' : 'Écrivez un commentaire…'} aria-label={replyTo ? 'Votre réponse' : 'Votre commentaire'} /><button className="primary-button" disabled={busy}>{busy ? 'Envoi…' : replyTo ? 'Répondre' : 'Publier'}</button></form>
    </div>}
  </div>
}
export default App