import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import './App.css'
import { AuthModal } from './components/AuthModal'
import { AdminPanel, ExplorePanel, GroupsPanel, PagesPanel, ProfilePanel } from './components/FeaturePanels'
import { MessagesPanel } from './components/MessagesPanel'
import { createPost, getMyProfile, type ProfileRecord } from './lib/api'
import { createComment, uploadPrivateFile } from './lib/socialApi'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { useNotifications } from './lib/useNotifications'

type NavKey = 'feed' | 'explore' | 'messages' | 'groups' | 'pages' | 'profile' | 'admin'
type Post = { id: string | number; name: string; handle: string; role: string; avatar: string; time: string; body: string; tags: string[]; stats: { likes: number; comments: number; shares: number }; kind: string; liked?: boolean }

const postsSeed: Post[] = [
  { id: 1, name: 'Maya Chen', handle: '@mayachen', role: 'Product strategist · Paris', avatar: 'MC', time: '12 min', body: 'La meilleure roadmap n’est pas celle qui contient le plus de features. C’est celle qui rend la prochaine décision évidente. ✦', tags: ['#product', '#leadership'], stats: { likes: 248, comments: 31, shares: 18 }, kind: 'thought' },
  { id: 2, name: 'Nexa Studio', handle: '@nexastudio', role: 'Creative technology · Page', avatar: 'NS', time: '48 min', body: 'Nous ouvrons 3 places pour notre prochain sprint de prototypage IA. Partagez votre projet et construisons quelque chose d’utile, ensemble.', tags: ['#buildinpublic', '#ai'], stats: { likes: 189, comments: 24, shares: 42 }, kind: 'image' },
  { id: 3, name: 'Thomas Leroy', handle: '@thomasl', role: 'Founder · Lyon', avatar: 'TL', time: '2 h', body: 'Nouveau chapitre : Avani Pro me rappelle que les communautés fortes commencent souvent par une conversation honnête.', tags: ['#founders', '#community'], stats: { likes: 96, comments: 12, shares: 7 }, kind: 'link' },
]

const suggestions = [
  { name: 'Sofia Alvarez', role: 'UX Researcher', avatar: 'SA', mutual: '8 relations en commun' },
  { name: 'Kofi Mensah', role: 'Founder, Orbital', avatar: 'KM', mutual: '5 relations en commun' },
  { name: 'Le Lab Product', role: 'Communauté · 4.2k membres', avatar: 'LP', mutual: 'Tendance cette semaine' },
]

function App() {
  const [active, setActive] = useState<NavKey>('feed')
  const [posts, setPosts] = useState(postsSeed)
  const [composer, setComposer] = useState('')
  const [toast, setToast] = useState('')
  const [followed, setFollowed] = useState<string[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [sessionUser, setSessionUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileRecord | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const { notifications, unreadCount, markAllRead } = useNotifications(sessionUser?.id ?? null)

  const sectionTitle = useMemo(() => ({ feed: 'Votre signal', explore: 'Explorer', messages: 'Messages', groups: 'Vos communautés', pages: 'Vos pages', profile: 'Votre profil', admin: 'Administration' }[active]), [active])
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2400) }
  const toggleLike = (id: string | number) => setPosts(current => current.map(post => post.id === id ? { ...post, liked: !post.liked, stats: { ...post.stats, likes: post.stats.likes + (post.liked ? -1 : 1) } } : post))
  const displayName = profile?.full_name || sessionUser?.user_metadata?.full_name || 'Alex Morgan'
  const displayUsername = profile?.username ? `@${profile.username}` : sessionUser?.email ? `@${sessionUser.email.split('@')[0]}` : '@alexmorgan'
  const displayAvatar = displayName.split(/\s+/).filter(Boolean).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase() || 'AV'
  const publish = async () => { if (!composer.trim()) return; if (isSupabaseConfigured && !sessionUser) { openAuth(); return }; const body = composer.trim(); try { const persisted = sessionUser ? await createPost(sessionUser.id, body) : null; setPosts(current => [{ id: persisted?.id ?? Date.now(), name: displayName, handle: displayUsername, role: 'Membre Avani Pro', avatar: displayAvatar, time: 'à l’instant', body, tags: ['#nouveau'], stats: { likes: 0, comments: 0, shares: 0 }, kind: 'thought' }, ...current]); setComposer(''); flash(sessionUser ? 'Publication enregistrée dans votre feed' : 'Publication partagée avec votre réseau') } catch (caught) { flash(caught instanceof Error ? caught.message : 'La publication n’a pas pu être enregistrée.') } }
  useEffect(() => { if (!supabase) return; supabase.auth.getSession().then(({ data }) => { setSessionUser(data.session?.user ?? null); if (!data.session) setProfile(null) }); const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSessionUser(session?.user ?? null); if (!session) setProfile(null) }); return () => subscription.unsubscribe() }, [])
  useEffect(() => { if (!sessionUser || !supabase) return; getMyProfile(sessionUser).then(setProfile).catch(() => undefined) }, [sessionUser])
  const openAuth = () => { if (!isSupabaseConfigured) { flash('Ajoutez vos variables Supabase dans Render pour activer la connexion.'); return }; setAuthOpen(true) }
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); setProfile(null); flash('Vous êtes déconnecté de votre espace sécurisé.') }
  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (!sessionUser) { openAuth(); return }; try { await uploadPrivateFile(sessionUser.id, file); flash(`Fichier « ${file.name} » sécurisé dans votre espace.`) } catch (error) { flash(error instanceof Error ? error.message : 'Le fichier n’a pas pu être envoyé.') } }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><img src="/logo-icon.png" alt="" /></span><span>AVANI<span className="brand-pro">PRO</span></span></div>
        <div className="profile-mini"><div className="avatar avatar-xl avatar-gradient">{displayAvatar}</div><div><strong>{displayName}</strong><span>{displayUsername}</span></div>{profile?.verified_type && <span className="verified">✓</span>}</div>
        <nav className="nav-stack" aria-label="Navigation principale">
          <NavButton active={active === 'feed'} onClick={() => setActive('feed')} icon="⌂" label="Feed" badge="12" />
          <NavButton active={active === 'explore'} onClick={() => setActive('explore')} icon="⌕" label="Explorer" />
          <NavButton active={active === 'messages'} onClick={() => setActive('messages')} icon="◌" label="Messages" badge="3" />
          <NavButton active={active === 'groups'} onClick={() => setActive('groups')} icon="◒" label="Groupes" />
          <NavButton active={active === 'pages'} onClick={() => setActive('pages')} icon="◆" label="Pages" />
          <NavButton active={active === 'profile'} onClick={() => setActive('profile')} icon="◎" label="Mon profil" />
          <NavButton active={active === 'admin'} onClick={() => setActive('admin')} icon="◆" label="Admin" />
        </nav>
        <div className="sidebar-bottom"><button className="nav-button muted" onClick={() => flash('Les réglages seront disponibles avec votre espace sécurisé')}><span>⚙</span> Réglages</button><div className="security-note"><span className="pulse-dot" /> Espace sécurisé<br /><small>Chiffrement actif</small></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><span className="eyebrow">JEUDI · 04 OCTOBRE 2026</span><h1>{sectionTitle}</h1></div><div className="top-actions"><label className="search"><span>⌕</span><input placeholder="Rechercher une idée, une personne…" /></label><button className="icon-button notification-trigger" aria-label="Notifications" onClick={() => { setNotificationsOpen(!notificationsOpen); if (!notificationsOpen) void markAllRead() }}><img className="notification-bell-icon" src="/notification-bell.svg" alt="Notifications" />{unreadCount > 0 && <b className="notification-count">{unreadCount > 9 ? '9+' : unreadCount}</b>}<i /></button>{sessionUser ? <button className="auth-button" onClick={signOut}>Se déconnecter</button> : <button className="auth-button" onClick={openAuth}>Se connecter</button>}<div className="avatar avatar-sm avatar-gradient">{displayAvatar}</div></div>{notificationsOpen && <div className="notification-popover"><div className="popover-head"><strong>Notifications en temps réel</strong><button onClick={() => void markAllRead()}>Tout marquer lu</button></div>{notifications.length === 0 ? <p className="empty-copy">Aucune notification pour le moment.</p> : notifications.slice(0, 8).map(notification => <div className="notification-row" key={notification.id}><span className={`notif-icon ${notification.type === 'new_like' ? 'violet' : notification.type === 'new_message' ? 'cyan' : 'blue'}`}>{notification.type === 'new_like' ? '♥' : notification.type === 'new_message' ? '↗' : '✦'}</span><div>{notification.payload.message || 'Nouvelle activité sur Avani Pro.'}<small>{new Date(notification.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</small></div></div>)}</div>}</header>

        {active === 'feed' && <>
          <section className="signal-banner"><div className="signal-orb"><span>✦</span></div><div><span className="eyebrow">VOTRE IMPACT CETTE SEMAINE</span><strong>Votre signal progresse de 24%</strong><p>Continuez à partager les idées qui font avancer votre communauté.</p></div><button className="ghost-button" onClick={() => flash('Votre impact est calculé à partir de vos publications et interactions.')}>Voir le rapport <span>↗</span></button></section>
          <section className="composer-card"><div className="avatar avatar-md avatar-gradient">{displayAvatar}</div><div className="composer-body"><textarea value={composer} onChange={event => setComposer(event.target.value)} placeholder={sessionUser ? `Qu’est-ce qui mérite d’être partagé, ${displayName.split(' ')[0]} ?` : 'Qu’est-ce qui mérite d’être partagé aujourd’hui ?'} rows={2} /><div className="composer-footer"><div className="composer-tools"><label className="upload-control">▧ <span>Image</span><input type="file" accept="image/*,video/*" onChange={handleFile} /></label><label className="upload-control">▤ <span>Fichier</span><input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt" onChange={handleFile} /></label><button onClick={() => flash('Collez une URL dans le texte de votre publication pour la partager.')}>↗ <span>Lien</span></button></div><button className="primary-button" onClick={publish}>Publier <span>↗</span></button></div></div></section>
          <div className="feed-filter"><div><button className="filter-active">Pour vous</button><button>Abonnements</button><button>Tendances</button></div><button className="sort-button">Les plus récents ↕</button></div>
          <section className="post-list">{posts.map(post => <PostCard key={post.id} post={post} user={sessionUser} onLike={() => toggleLike(post.id)} onShare={() => flash('Lien de publication copié')} onComment={() => flash('Ouvrez le fil de commentaires sous la publication.')} />)}</section>
        </>}
        {active === 'messages' && <MessagesPanel user={sessionUser} onAction={flash} />}
        {active === 'explore' && <ExplorePanel user={sessionUser} onAction={flash} onMessage={() => { setActive('messages'); flash('Conversation créée. Ouvrez Messages pour écrire.') }} />}
        {active === 'groups' && <GroupsPanel user={sessionUser} onAction={flash} />}
        {active === 'pages' && <PagesPanel user={sessionUser} onAction={flash} />}
        {active === 'profile' && <ProfilePanel key={`${profile?.id ?? 'profile'}-${profile?.full_name ?? ''}-${profile?.username ?? ''}`} user={sessionUser} profile={profile} onProfile={setProfile} />}
        {active === 'admin' && <AdminPanel user={sessionUser} onAction={flash} />}
      </main>

      <aside className="right-rail"><details className="rail-card rail-detail network-card" open><summary className="card-heading"><span>Votre réseau</span><button type="button" onClick={event => { event.preventDefault(); setActive('explore') }}>Voir tout ↗</button></summary><div className="network-stat"><strong>2,849</strong><span>connexions actives</span><div className="mini-avatars"><span>MC</span><span>SA</span><span>KM</span><b>+2.8k</b></div></div><div className="network-progress"><div><span>Force du réseau</span><strong>78%</strong></div><div className="progress-track"><i /></div></div></details><details className="rail-card rail-detail" open><summary className="card-heading"><span>À découvrir</span><button type="button" onClick={event => { event.preventDefault(); setActive('explore') }}>Actualiser ↻</button></summary><div className="suggestion-list">{suggestions.map(person => <div className="suggestion" key={person.name}><div className="avatar avatar-md avatar-soft">{person.avatar}</div><div className="suggestion-copy"><strong>{person.name}{person.name === 'Kofi Mensah' && <span className="verified">✓</span>}</strong><span>{person.role}</span><small>{person.mutual}</small></div><button className={followed.includes(person.name) ? 'follow-button following' : 'follow-button'} onClick={() => { setFollowed(current => current.includes(person.name) ? current.filter(name => name !== person.name) : [...current, person.name]); flash(followed.includes(person.name) ? `Vous ne suivez plus ${person.name}` : `Vous suivez maintenant ${person.name}`) }}>{followed.includes(person.name) ? '✓' : '+'}</button></div>)}</div></details><details className="rail-card rail-detail trends" open><summary className="card-heading"><span>Conversations en vue</span><span className="live-label"><i /> LIVE</span></summary>{['Design systems', 'Build in public', 'Future of work'].map((trend, index) => <button className="trend-row" key={trend} onClick={() => flash(`Exploration de #${trend.toLowerCase().replaceAll(' ', '')}`)}><span>0{index + 1}</span><div><strong>#{trend}</strong><small>{[1240, 842, 634][index].toLocaleString('fr-FR')} conversations</small></div><b>↗</b></button>)}</details><footer className="footer-links">À propos · Règles · Confidentialité · Aide<br /><span>© 2026 Avani Pro, Inc.</span></footer></aside>
      {toast && <div className="toast"><span>✦</span>{toast}</div>}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={flash} />}
    </div>
  )
}

function NavButton({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: string; label: string; badge?: string }) { return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-icon">{icon}</span>{label}{badge && <b>{badge}</b>}</button> }
function PostCard({ post, user, onLike, onShare, onComment }: { post: Post; user: User | null; onLike: () => void; onShare: () => void; onComment: () => void }) { return <article className="post-card"><div className="post-header"><div className={`avatar avatar-md ${post.kind === 'image' ? 'avatar-cyan' : 'avatar-soft'}`}>{post.avatar}</div><div className="post-author"><strong>{post.name}{post.name === 'Maya Chen' && <span className="verified">✓</span>}</strong><span>{post.handle} · {post.time}</span><small>{post.role}</small></div><button className="more-button">•••</button></div><p className="post-body">{post.body}</p>{post.kind === 'image' && <div className="post-visual"><div className="visual-grid"><span>NX</span><span>STUDIO</span></div><div><strong>Prototype the future.</strong><small>nexa.studio / sprint-03</small></div></div>}{post.kind === 'link' && <div className="link-preview"><span>AV</span><div><strong>La communauté avant la plateforme</strong><small>avani.pro · 4 min de lecture</small></div><b>↗</b></div>}<div className="tag-row">{post.tags.map(tag => <span key={tag}>{tag}</span>)}</div><div className="post-actions"><button className={post.liked ? 'liked' : ''} onClick={onLike}><span>♥</span> {post.stats.likes}</button><button onClick={onComment}><span>◌</span> {post.stats.comments}</button><button onClick={onShare}><span>↗</span> {post.stats.shares}</button><button className="save-action" onClick={() => onShare()}><span>⌑</span></button></div><CommentBox postId={post.id} user={user} onAction={onComment} /></article> }
function CommentBox({ postId, user, onAction }: { postId: string | number; user: User | null; onAction: () => void }) { const [body, setBody] = useState(''); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!body.trim()) return; if (!user) { onAction(); return }; setBusy(true); try { await createComment(postId, user.id, body); setBody(''); setOpen(false); onAction() } catch { onAction() } finally { setBusy(false) } }; return <div className="comment-box"><button className="comment-toggle" onClick={() => setOpen(!open)}>{open ? 'Fermer' : 'Écrire un commentaire'}</button>{open && <form onSubmit={submit}><input value={body} onChange={event => setBody(event.target.value)} placeholder="Votre point de vue…" /><button className="primary-button" disabled={busy}>↗</button></form>}</div> }
export default App
