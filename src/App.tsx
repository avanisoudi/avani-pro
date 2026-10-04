import { useMemo, useState } from 'react'
import './App.css'

type NavKey = 'feed' | 'explore' | 'messages' | 'groups' | 'profile'
type Post = { id: number; name: string; handle: string; role: string; avatar: string; time: string; body: string; tags: string[]; stats: { likes: number; comments: number; shares: number }; kind: string; liked?: boolean }

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

  const sectionTitle = useMemo(() => ({ feed: 'Votre signal', explore: 'Explorer', messages: 'Messages', groups: 'Vos communautés', profile: 'Votre profil' }[active]), [active])
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2400) }
  const toggleLike = (id: number) => setPosts(current => current.map(post => post.id === id ? { ...post, liked: !post.liked, stats: { ...post.stats, likes: post.stats.likes + (post.liked ? -1 : 1) } } : post))
  const publish = () => { if (!composer.trim()) return; setPosts(current => [{ id: Date.now(), name: 'Alex Morgan', handle: '@alexmorgan', role: 'Product builder · Avani Pro', avatar: 'AM', time: 'à l’instant', body: composer.trim(), tags: ['#nouveau'], stats: { likes: 0, comments: 0, shares: 0 }, kind: 'thought' }, ...current]); setComposer(''); flash('Publication partagée avec votre réseau') }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">AV</span><span>AVANI<span className="brand-pro">PRO</span></span></div>
        <div className="profile-mini"><div className="avatar avatar-xl avatar-gradient">AM</div><div><strong>Alex Morgan</strong><span>@alexmorgan</span></div><span className="verified">✓</span></div>
        <nav className="nav-stack" aria-label="Navigation principale">
          <NavButton active={active === 'feed'} onClick={() => setActive('feed')} icon="⌂" label="Feed" badge="12" />
          <NavButton active={active === 'explore'} onClick={() => setActive('explore')} icon="⌕" label="Explorer" />
          <NavButton active={active === 'messages'} onClick={() => setActive('messages')} icon="◌" label="Messages" badge="3" />
          <NavButton active={active === 'groups'} onClick={() => setActive('groups')} icon="◒" label="Groupes" />
          <NavButton active={active === 'profile'} onClick={() => setActive('profile')} icon="◎" label="Mon profil" />
        </nav>
        <div className="sidebar-bottom"><button className="nav-button muted" onClick={() => flash('Les réglages seront disponibles avec votre espace sécurisé')}><span>⚙</span> Réglages</button><div className="security-note"><span className="pulse-dot" /> Espace sécurisé<br /><small>Chiffrement actif</small></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><span className="eyebrow">JEUDI · 04 OCTOBRE 2026</span><h1>{sectionTitle}</h1></div><div className="top-actions"><label className="search"><span>⌕</span><input placeholder="Rechercher une idée, une personne…" /></label><button className="icon-button notification-trigger" aria-label="Notifications" onClick={() => setNotificationsOpen(!notificationsOpen)}>♢<i /></button><div className="avatar avatar-sm avatar-gradient">AM</div></div>{notificationsOpen && <div className="notification-popover"><div className="popover-head"><strong>Notifications</strong><span>Tout marquer lu</span></div><div className="notification-row"><span className="notif-icon violet">♥</span><div><strong>Maya Chen</strong> a aimé votre publication.<small>Il y a 8 min</small></div></div><div className="notification-row"><span className="notif-icon cyan">↗</span><div><strong>Kofi Mensah</strong> vous suit désormais.<small>Il y a 28 min</small></div></div><div className="notification-row"><span className="notif-icon blue">✦</span><div>Bienvenue sur <strong>Avani Pro</strong>.<small>Aujourd’hui</small></div></div></div>}</header>

        {active === 'feed' && <>
          <section className="signal-banner"><div className="signal-orb"><span>✦</span></div><div><span className="eyebrow">VOTRE IMPACT CETTE SEMAINE</span><strong>Votre signal progresse de 24%</strong><p>Continuez à partager les idées qui font avancer votre communauté.</p></div><button className="ghost-button" onClick={() => flash('Rapport d’impact bientôt disponible')}>Voir le rapport <span>↗</span></button></section>
          <section className="composer-card"><div className="avatar avatar-md avatar-gradient">AM</div><div className="composer-body"><textarea value={composer} onChange={event => setComposer(event.target.value)} placeholder="Qu’est-ce qui mérite d’être partagé aujourd’hui ?" rows={2} /><div className="composer-footer"><div className="composer-tools"><button onClick={() => flash('Ajoutez une image depuis votre appareil')}>▧ <span>Image</span></button><button onClick={() => flash('Ajoutez un document à votre publication')}>▤ <span>Fichier</span></button><button onClick={() => flash('Ajoutez un lien à votre publication')}>↗ <span>Lien</span></button></div><button className="primary-button" onClick={publish}>Publier <span>↗</span></button></div></div></section>
          <div className="feed-filter"><div><button className="filter-active">Pour vous</button><button>Abonnements</button><button>Tendances</button></div><button className="sort-button">Les plus récents ↕</button></div>
          <section className="post-list">{posts.map(post => <PostCard key={post.id} post={post} onLike={() => toggleLike(post.id)} onShare={() => flash('Lien de publication copié')} onComment={() => flash('Les commentaires arrivent dans la prochaine version')} />)}</section>
        </>}
        {active !== 'feed' && <PlaceholderSection active={active} onAction={flash} />}
      </main>

      <aside className="right-rail"><section className="rail-card network-card"><div className="card-heading"><span>Votre réseau</span><button onClick={() => setActive('explore')}>Voir tout ↗</button></div><div className="network-stat"><strong>2,849</strong><span>connexions actives</span><div className="mini-avatars"><span>MC</span><span>SA</span><span>KM</span><b>+2.8k</b></div></div><div className="network-progress"><div><span>Force du réseau</span><strong>78%</strong></div><div className="progress-track"><i /></div></div></section><section className="rail-card"><div className="card-heading"><span>À découvrir</span><button onClick={() => setActive('explore')}>Actualiser ↻</button></div><div className="suggestion-list">{suggestions.map(person => <div className="suggestion" key={person.name}><div className="avatar avatar-md avatar-soft">{person.avatar}</div><div className="suggestion-copy"><strong>{person.name}{person.name === 'Kofi Mensah' && <span className="verified">✓</span>}</strong><span>{person.role}</span><small>{person.mutual}</small></div><button className={followed.includes(person.name) ? 'follow-button following' : 'follow-button'} onClick={() => { setFollowed(current => current.includes(person.name) ? current.filter(name => name !== person.name) : [...current, person.name]); flash(followed.includes(person.name) ? `Vous ne suivez plus ${person.name}` : `Vous suivez maintenant ${person.name}`) }}>{followed.includes(person.name) ? '✓' : '+'}</button></div>)}</div></section><section className="rail-card trends"><div className="card-heading"><span>Conversations en vue</span><span className="live-label"><i /> LIVE</span></div>{['Design systems', 'Build in public', 'Future of work'].map((trend, index) => <button className="trend-row" key={trend} onClick={() => flash(`Exploration de #${trend.toLowerCase().replaceAll(' ', '')}`)}><span>0{index + 1}</span><div><strong>#{trend}</strong><small>{[1240, 842, 634][index].toLocaleString('fr-FR')} conversations</small></div><b>↗</b></button>)}</section><footer className="footer-links">À propos · Règles · Confidentialité · Aide<br /><span>© 2026 Avani Pro, Inc.</span></footer></aside>
      {toast && <div className="toast"><span>✦</span>{toast}</div>}
    </div>
  )
}

function NavButton({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: string; label: string; badge?: string }) { return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-icon">{icon}</span>{label}{badge && <b>{badge}</b>}</button> }
function PostCard({ post, onLike, onShare, onComment }: { post: Post; onLike: () => void; onShare: () => void; onComment: () => void }) { return <article className="post-card"><div className="post-header"><div className={`avatar avatar-md ${post.kind === 'image' ? 'avatar-cyan' : 'avatar-soft'}`}>{post.avatar}</div><div className="post-author"><strong>{post.name}{post.name === 'Maya Chen' && <span className="verified">✓</span>}</strong><span>{post.handle} · {post.time}</span><small>{post.role}</small></div><button className="more-button">•••</button></div><p className="post-body">{post.body}</p>{post.kind === 'image' && <div className="post-visual"><div className="visual-grid"><span>NX</span><span>STUDIO</span></div><div><strong>Prototype the future.</strong><small>nexa.studio / sprint-03</small></div></div>}{post.kind === 'link' && <div className="link-preview"><span>AV</span><div><strong>La communauté avant la plateforme</strong><small>avani.pro · 4 min de lecture</small></div><b>↗</b></div>}<div className="tag-row">{post.tags.map(tag => <span key={tag}>{tag}</span>)}</div><div className="post-actions"><button className={post.liked ? 'liked' : ''} onClick={onLike}><span>♥</span> {post.stats.likes}</button><button onClick={onComment}><span>◌</span> {post.stats.comments}</button><button onClick={onShare}><span>↗</span> {post.stats.shares}</button><button className="save-action" onClick={() => onShare()}><span>⌑</span></button></div></article> }
function PlaceholderSection({ active, onAction }: { active: NavKey; onAction: (message: string) => void }) { const key = active === 'feed' ? 'explore' : active; const content = { explore: { icon: '⌕', title: 'Trouvez votre prochaine connexion', text: 'Explorez les idées, les profils et les communautés qui font avancer votre secteur.', action: 'Lancer l’exploration' }, messages: { icon: '◌', title: 'Vos conversations, au même endroit', text: 'La messagerie sécurisée, les groupes et les fichiers partagés arrivent dans votre espace.', action: 'Démarrer une conversation' }, groups: { icon: '◒', title: 'Les communautés font le mouvement', text: 'Créez un groupe, rassemblez les bons profils et donnez une nouvelle énergie à vos idées.', action: 'Créer un groupe' }, profile: { icon: '◎', title: 'Votre identité professionnelle', text: 'Présentez votre expertise, vos projets et les conversations qui comptent pour vous.', action: 'Modifier le profil' } }[key] || { icon: '✦', title: '', text: '', action: '' }; return <section className="placeholder"><div className="placeholder-orb">{content.icon}</div><span className="eyebrow">AVANI PRO · BIENTÔT</span><h2>{content.title}</h2><p>{content.text}</p><button className="primary-button" onClick={() => onAction(`${content.action} sera disponible dans la prochaine version`)}>{content.action} <span>↗</span></button></section> }
export default App
