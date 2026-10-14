import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { ProfileRecord } from '../lib/api'
import { createDirectConversation, joinPublicGroup, listPublicGroups, type PublicGroupRecord } from '../lib/api'
import { supabase } from '../lib/supabase'
import { addGroupMember, createGroup, createPage, getAdminStats, getMySettings, isAdmin, listAuditLogs, listDiscoverableProfiles, listMyGroups, listMyPages, listOpenReports, saveMySettings, toggleFollow, togglePageFollow, updateMyProfile, uploadProfilePhoto, type PageRecord } from '../lib/socialApi'

type PersonCard = { id: string; name: string; role: string; avatar: string; mutual: string }

// Navigation interne sans rechargement (même mécanisme que le reste de l'application).
function goTo(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

async function copyInviteLink(notify: (message: string) => void) {
  const link = `${window.location.origin}/groups`
  try {
    await navigator.clipboard.writeText(link)
    notify('Lien de la page Groupes copié. Partagez-le avec votre communauté.')
  } catch {
    notify(`Copiez ce lien : ${link}`)
  }
}

export function ProfilePanel({ user, profile, onProfile }: { user: User | null; profile: ProfileRecord | null; onProfile: (profile: ProfileRecord) => void }) {
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [message, setMessage] = useState('')
  if (!user) return <FeatureEmpty title="Votre identité professionnelle" text="Connectez-vous pour créer et modifier votre profil Avani Pro." action="Se connecter" />
  const save = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setMessage(''); try { const saved = await updateMyProfile(user.id, { full_name: fullName.trim(), username: username.toLowerCase().trim(), bio: bio.trim() }); onProfile(saved); setMessage('Profil mis à jour avec succès.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Impossible de mettre à jour le profil.') } finally { setBusy(false) } }
  const changePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setPhotoBusy(true); setMessage(''); try { const saved = await uploadProfilePhoto(user.id, file); onProfile(saved); setMessage('Photo de profil mise à jour.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Impossible d’envoyer la photo.') } finally { setPhotoBusy(false) } }
  const initials = (fullName || 'AV').split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase()
  return <section className="feature-panel profile-page">
    <div className="profile-cover">
      <div className="profile-cover-orb profile-cover-orb-one" />
      <div className="profile-cover-orb profile-cover-orb-two" />
      <span className="profile-cover-brand">AVANI <b>PRO</b></span>
      <span className="profile-cover-caption">VOTRE ESPACE · VOTRE HISTOIRE</span>
    </div>
    <div className="profile-identity">
      <label className="profile-avatar-upload" title="Changer la photo de profil">
        {profile?.avatar_url ? <img src={profile.avatar_url} alt="Photo de profil" /> : <span>{initials}</span>}
        <i aria-hidden="true">＋</i>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={changePhoto} disabled={photoBusy} />
      </label>
      <div className="profile-identity-copy">
        <span className="eyebrow">PROFIL PERSONNEL</span>
        <h2>{fullName.trim() || 'Votre nom'} {profile?.verified_type && <VerifiedBadge type={profile.verified_type} />}</h2>
        <p className="profile-handle">{username ? `@${username}` : '@votre-identifiant'}</p>
        <p className="profile-bio-preview">{bio.trim() || 'Ajoutez une présentation pour aider votre réseau à découvrir qui vous êtes et ce que vous faites.'}</p>
      </div>
      <button type="button" className="profile-edit-jump" onClick={() => document.getElementById('profile-edit-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>✎ Modifier le profil</button>
    </div>
    <div className="profile-section-divider" />
    <div className="profile-workspace">
      <div className="profile-workspace-heading"><div><span className="eyebrow">PERSONNALISATION</span><h3>Construisez votre identité</h3><p>Ces informations sont enregistrées sur votre compte Avani Pro.</p></div><span className={message.includes('succès') || message.includes('mise à jour') ? 'profile-save-state is-saved' : 'profile-save-state'}>{photoBusy ? 'Photo en cours…' : message || 'Modifications à enregistrer'}</span></div>
      <form id="profile-edit-form" className="profile-form profile-form-modern" onSubmit={save}>
        <label><span>Nom complet</span><input value={fullName} onChange={event => setFullName(event.target.value)} required placeholder="Votre nom et prénom" /></label>
        <label><span>Nom d’utilisateur</span><div className="profile-input-prefix"><b>@</b><input value={username} onChange={event => setUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} minLength={3} required placeholder="identifiant" /></div><small>3 caractères minimum · lettres, chiffres et _</small></label>
        <label className="profile-bio-field"><span>Présentation</span><textarea value={bio} onChange={event => setBio(event.target.value)} maxLength={500} rows={4} placeholder="Votre expertise, vos projets, vos centres d’intérêt…" /><small>{bio.length}/500 caractères</small></label>
        <div className="profile-form-footer"><span className="form-status" role="status">{message}</span><button className="primary-button" disabled={busy || photoBusy}>{busy ? 'Enregistrement…' : 'Enregistrer les modifications ↗'}</button></div>
      </form>
    </div>
  </section>
}

export function ExplorePanel({ user, onAction, onMessage }: { user: User | null; onAction: (message: string) => void; onMessage: (conversationId: string) => void }) {
  const [followed, setFollowed] = useState<string[]>([])
  const [visiblePeople, setVisiblePeople] = useState<PersonCard[]>([])
  useEffect(() => { if (user) listDiscoverableProfiles(user.id).then(items => { if (items.length) setVisiblePeople(items.map(item => ({ id: item.id, name: item.full_name, role: item.bio || '', avatar: item.full_name.split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(), mutual: item.verified_type ? `Compte vérifié · ${item.username}` : `@${item.username}` }))) }).catch(() => undefined) }, [user])
  const follow = async (person: PersonCard) => { if (!user) { onAction('Connectez-vous pour suivre des profils.'); return }; const isFollowing = followed.includes(person.id); try { const next = await toggleFollow(user.id, person.id, isFollowing); setFollowed(current => next ? [...current, person.id] : current.filter(id => id !== person.id)); onAction(next ? `Vous suivez maintenant ${person.name}.` : `Vous ne suivez plus ${person.name}.`) } catch { onAction('Impossible de modifier cet abonnement.') } }
  const message = async (person: PersonCard) => { if (!user) { onAction('Connectez-vous pour démarrer une conversation.'); return }; try { const conversation = await createDirectConversation(user.id, person.id, person.name); onMessage(conversation.id) } catch { onAction('Le profil doit exister dans Supabase avant de démarrer une conversation.') } }
  return <section className="feature-panel"><div className="feature-header"><div><span className="eyebrow">EXPLORER LE SIGNAL</span><h2>Trouvez votre prochaine connexion</h2><p>Découvrez des profils et des idées qui font avancer votre secteur.</p></div><span className="feature-count">{visiblePeople.length} profils</span></div><div className="people-grid">{visiblePeople.map(person => <article className="person-card" key={person.id}><div className="avatar avatar-lg avatar-soft">{person.avatar}</div><strong>{person.name}{person.id === 'kofi' && <span className="verified">✓</span>}</strong><span>{person.role}</span><small>{person.mutual}</small><div className="person-actions"><button className={followed.includes(person.id) ? 'follow-button following' : 'follow-button'} onClick={() => void follow(person)}>{followed.includes(person.id) ? '✓ Suivi' : '+ Suivre'}</button><button className="message-button" onClick={() => void message(person)}>Message</button></div></article>)}</div></section>
}

export function GroupsPanel({ user, onAction, onOpenMessages }: { user: User | null; onAction: (message: string) => void; onOpenMessages: (conversationId?: string) => void }) {
  const [groups, setGroups] = useState<any[]>([]); const [publicGroups, setPublicGroups] = useState<PublicGroupRecord[]>([]); const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [visibility, setVisibility] = useState<'private' | 'public'>('private'); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [joiningPublic, setJoiningPublic] = useState<string | null>(null); const [groupsError, setGroupsError] = useState(''); const [publicsError, setPublicsError] = useState(''); const [reloadToken, setReloadToken] = useState(0); const [inviteGroup, setInviteGroup] = useState<any | null>(null); const [inviteUser, setInviteUser] = useState(''); const [people, setPeople] = useState<ProfileRecord[]>([]); const [groupFilter, setGroupFilter] = useState<'all' | 'private' | 'public'>('all'); const [search, setSearch] = useState('')
  /** Message réel de la base, jamais un texte générique qui masquerait la cause. */
  const messageFrom = (caught: unknown, fallback: string) => caught instanceof Error && caught.message ? caught.message : fallback
  const reload = () => setReloadToken(value => value + 1)

  // Mes groupes et les groupes publics sont lus séparément : un souci de règle d’accès
  // sur l’un ne doit pas laisser l’autre liste vide et muette.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setGroupsError('')
    setPublicsError('')
    listMyGroups(user.id)
      .then(rows => { if (!cancelled) setGroups(rows) })
      .catch(caught => { if (!cancelled) setGroupsError(messageFrom(caught, 'Impossible de charger tes groupes.')) })
    listPublicGroups()
      .then(rows => { if (!cancelled) setPublicGroups(rows) })
      .catch(caught => { if (!cancelled) setPublicsError(messageFrom(caught, 'Impossible de charger les groupes publics.')) })
    return () => { cancelled = true }
  }, [user, reloadToken])

  // En direct : la liste bouge dès qu’un groupe apparaît ou qu’une adhésion me concerne.
  const bumpTimer = useRef<number | null>(null)
  useEffect(() => {
    const client = supabase
    if (!client) return
    const bump = () => {
      if (bumpTimer.current) window.clearTimeout(bumpTimer.current)
      bumpTimer.current = window.setTimeout(() => { bumpTimer.current = null; reload() }, 900)
    }
    const channel = client
      .channel('groups-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'groups' }, () => bump())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'groups' }, () => bump())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_members', filter: user ? `user_id=eq.${user.id}` : undefined }, () => bump())
      .subscribe()
    return () => {
      if (bumpTimer.current) window.clearTimeout(bumpTimer.current)
      void client.removeChannel(channel)
    }
  }, [user])
  useEffect(() => { if (user) listDiscoverableProfiles(user.id).then(setPeople).catch(() => undefined) }, [user])
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!user) { onAction('Connectez-vous pour créer un groupe.'); return }; setBusy(true); try { const group = await createGroup(user.id, name, description, visibility); setGroups(current => [group, ...current]); setName(''); setDescription(''); setOpen(false); onAction(group.chat_note ? `Groupe créé. ${group.chat_note}` : visibility === 'public' ? `Groupe « ${name} » créé. Les groupes publics apparaissent dans la liste d'à côté.` : `Groupe « ${name} » créé, chat prêt.`) } catch (error) { onAction(error instanceof Error ? error.message : 'Impossible de créer le groupe.') } finally { setBusy(false) } }
  const invite = async () => { if (!inviteGroup?.conversation_id || !inviteUser) return; try { const result = await addGroupMember(inviteGroup.id, inviteGroup.conversation_id, inviteUser); onAction(result.chatJoined ? 'Membre ajouté au groupe et à la conversation.' : result.note || 'Le membre a rejoint le groupe, pas la conversation.'); setInviteGroup(null); setInviteUser('') } catch (error) { onAction(error instanceof Error ? error.message : 'Impossible d’ajouter ce membre.') } }
  const handleJoinPublicGroup = async (group: PublicGroupRecord) => { if (!user) { onAction('Connectez-vous pour rejoindre un groupe.'); return }; setJoiningPublic(group.id); try { const result = await joinPublicGroup(user.id, group.id); setPublicGroups(current => current.map(item => item.id === result.group.id ? result.group : item)); reload(); onAction(result.note || `Tu es dans « ${result.group.name} ».`); if (result.conversation) onOpenMessages(result.conversation.id) } catch (error) { onAction(error instanceof Error ? error.message : 'Impossible de rejoindre le groupe public.') } finally { setJoiningPublic(null) } }
  if (!user) return <FeatureEmpty title="Les communautés font le mouvement" text="Connectez-vous pour créer ou rejoindre des groupes professionnels." action="Se connecter" />
  return (
    <section className="feature-panel">
      <div className="feature-header">
        <div>
          <span className="eyebrow">COMMUNAUTÉS · MESSAGERIE</span>
          <h2>Vos groupes Avani Pro</h2>
          <p>Rejoignez facilement des espaces publics ou privés, avec un chat dédié et un historique en temps réel.</p>
        </div>
        <button className="primary-button" onClick={() => setOpen(!open)}>＋ Créer un groupe</button>
      </div>

      {(groupsError || publicsError) && (
        <article className="public-group-card" role="alert">
          <div className="public-group-icon">!</div>
          <div className="public-group-copy">
            <span className="eyebrow">ACCÈS DONNÉES</span>
            <h3>La liste des groupes est partielle.</h3>
            <p>{groupsError || publicsError}</p>
            <div className="public-group-meta"><span>Les groupes publics viennent de <code>groups</code> et <code>group_members</code></span><span>Un <code>UPDATE</code> de <code>conversations</code> et le <code>INSERT</code> dans <code>conversation_members</code> sont requis pour ouvrir le chat</span></div>
          </div>
          <button className="primary-button" onClick={reload}>Réessayer</button>
        </article>
      )}

      {publicGroups.map(group => {
        const joined = groups.some(item => item.id === group.id)
        return <article className="public-group-card" key={group.id}>
          <div className="public-group-icon">{group.name.slice(0, 1).toUpperCase() || 'G'}</div>
          <div className="public-group-copy">
            <span className="eyebrow">GROUPE PUBLIC</span>
            <h3>{group.name}</h3>
            <p>{group.description || 'Groupe ouvert à tous les membres Avani Pro.'}</p>
            <div className="public-group-meta">
              <span>{group.member_count === null ? 'Membres · comptage indisponible' : `${group.member_count} membre${group.member_count > 1 ? 's' : ''}`}</span>
              <span>{group.conversation_id ? 'Chat de groupe rattaché' : 'Chat non rattaché (migration 006)'}</span>
              {joined && <span>✓ Tu es membre</span>}
            </div>
          </div>
          <button className="primary-button" disabled={joiningPublic === group.id} onClick={() => void (joined && group.conversation_id ? onOpenMessages(group.conversation_id) : handleJoinPublicGroup(group))}>
            {joiningPublic === group.id ? '…' : joined ? 'Ouvrir le chat' : 'Rejoindre'}
          </button>
        </article>
      })}


      {open && (
        <form className="inline-form" onSubmit={submit}>
          <label>Nom du groupe<input value={name} onChange={event => setName(event.target.value)} required placeholder="Design systems France" /></label>
          <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} rows={2} /></label>
          <label>Visibilité<select value={visibility} onChange={event => setVisibility(event.target.value as 'private' | 'public')}><option value="private">Privé</option><option value="public">Public</option></select></label>
          <button className="primary-button" disabled={busy}>{busy ? 'Création…' : 'Créer le groupe ↗'}</button>
        </form>
      )}

      {inviteGroup && (
        <div className="invite-strip">
          <strong>Inviter dans {inviteGroup.name}</strong>
          <select value={inviteUser} onChange={event => setInviteUser(event.target.value)}>
            <option value="">Choisir un membre…</option>
            {people.map(person => <option value={person.id} key={person.id}>{person.full_name} · @{person.username}</option>)}
          </select>
          <button className="primary-button" onClick={() => void invite()}>Ajouter</button>
          <button className="message-button" onClick={() => setInviteGroup(null)}>Annuler</button>
        </div>
      )}

      <div className="group-tools">
        <div className="group-search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher dans vos groupes" aria-label="Rechercher un groupe" /></div>
        <div className="group-filters">
          <button type="button" className={groupFilter === 'all' ? 'active' : ''} onClick={() => setGroupFilter('all')}>Tous</button>
          <button type="button" className={groupFilter === 'private' ? 'active' : ''} onClick={() => setGroupFilter('private')}>Privés</button>
          <button type="button" className={groupFilter === 'public' ? 'active' : ''} onClick={() => setGroupFilter('public')}>Publics</button>
        </div>
      </div>

      <div className="group-shortcuts">
        <button type="button" onClick={() => goTo('/notifications')}>⌁ Notifications</button>
        <button type="button" onClick={() => void copyInviteLink(onAction)}>↗ Lien d’invitation</button>
        <button type="button" onClick={() => setOpen(true)}>＋ Nouveau groupe</button>
      </div>

      <div className="group-list">
        {groups.length === 0 && <div className="empty-state">Aucun groupe pour le moment. Créez votre première communauté.</div>}
        {groups
          .filter(group => (groupFilter === 'all' || group.visibility === groupFilter) && (!search.trim() || group.name.toLowerCase().includes(search.toLowerCase())))
          .map(group => (
            <article className="group-card whatsapp-group-card" key={group.id}>
              <div className="group-icon"><img src="/group-chat-icon.svg" alt="" /></div>
              <div>
                <strong>{group.name}</strong>
                <span>{group.description || 'Communauté Avani Pro'}</span>
                <small>{group.visibility === 'public' ? 'Public' : 'Privé'} · Chat temps réel · Vous êtes propriétaire</small>
              </div>
              <div className="group-card-actions">
                <button type="button" onClick={() => setInviteGroup(group)}>Inviter</button>
                <button type="button" onClick={() => { onOpenMessages(group.conversation_id); onAction(`Chat de ${group.name} ouvert dans Messages.`) }}>Ouvrir le chat ↗</button>
              </div>
            </article>
          ))}
      </div>
    </section>
  )
}
export function PagesPanel({ user, onAction }: { user: User | null; onAction: (message: string) => void }) {
  const [pages, setPages] = useState<PageRecord[]>([]); const [name, setName] = useState(''); const [slug, setSlug] = useState(''); const [category, setCategory] = useState('company'); const [description, setDescription] = useState(''); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [followed, setFollowed] = useState<string[]>([])
  useEffect(() => { if (user) listMyPages(user.id).then(setPages).catch(() => undefined) }, [user])
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!user) { onAction('Connectez-vous pour créer une page.'); return }; setBusy(true); try { const page = await createPage(user.id, { name, slug, category, description }); setPages(current => [page, ...current]); setName(''); setSlug(''); setDescription(''); setOpen(false); onAction('Page créée avec succès.') } catch (error) { onAction(error instanceof Error ? error.message : 'Impossible de créer la page.') } finally { setBusy(false) } }
  if (!user) return <FeatureEmpty title="Vos pages professionnelles" text="Connectez-vous pour créer une page d’entreprise, de créateur, de communauté ou de marque." action="Se connecter" />
  return <section className="feature-panel"><div className="feature-header"><div><span className="eyebrow">PAGES PROFESSIONNELLES</span><h2>Vos pages</h2><p>Construisez une présence officielle et publiez au nom de votre organisation.</p></div><button className="primary-button" onClick={() => setOpen(!open)}>＋ Créer une page</button></div>{open && <form className="inline-form" onSubmit={submit}><label>Nom de la page<input value={name} onChange={event => setName(event.target.value)} required placeholder="Avani Studio" /></label><label>Slug public<input value={slug} onChange={event => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} required placeholder="avani-studio" /></label><label>Catégorie<select value={category} onChange={event => setCategory(event.target.value)}><option value="company">Entreprise</option><option value="creator">Créateur</option><option value="community">Communauté</option><option value="brand">Marque</option></select></label><label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} rows={2} /></label><button className="primary-button" disabled={busy}>{busy ? 'Création…' : 'Créer la page ↗'}</button></form>}<div className="group-list">{pages.length === 0 && <div className="empty-state">Aucune page créée. Lancez votre première présence officielle.</div>}{pages.map(page => <article className="group-card" key={page.id}><div className="group-icon">◆</div><div><strong>{page.name}{page.verified && <span className="verified">✓</span>}</strong><span>/{page.slug} · {page.description || 'Page Avani Pro'}</span><small>{page.category} · {page.followers_count} abonnés</small></div><button onClick={async () => { try { const next = await togglePageFollow(page.id, user.id, followed.includes(page.id)); setFollowed(current => next ? [...current, page.id] : current.filter(id => id !== page.id)); onAction(next ? `Vous suivez ${page.name}.` : `Vous ne suivez plus ${page.name}.`) } catch { onAction('Impossible de modifier cet abonnement.') } }}>{followed.includes(page.id) ? 'Suivi' : 'Suivre'} ↗</button></article>)}</div></section>
}

export function AdminPanel({ user, onAction }: { user: User | null; onAction: (message: string) => void }) {
  const [role, setRole] = useState<string | null>(null); const [stats, setStats] = useState({ users: 0, pages: 0, posts: 0, reports: 0 }); const [reports, setReports] = useState<any[]>([]); const [logs, setLogs] = useState<any[]>([]); const [error, setError] = useState('')
  useEffect(() => { if (!user) return; isAdmin(user.id).then(result => { setRole(result?.role ?? null); if (result) Promise.all([getAdminStats().then(setStats), listOpenReports().then(setReports), listAuditLogs().then(setLogs)]).catch(() => undefined) }).catch(error => setError(error instanceof Error ? error.message : 'Accès admin indisponible.')) }, [user])
  if (!user) return <FeatureEmpty title="Administration Avani Pro" text="Connectez-vous avec un compte administrateur pour accéder au tableau de bord." action="Se connecter" />
  if (error || !role) return <FeatureEmpty title="Accès administrateur requis" text={error || 'Votre compte ne possède pas encore de rôle admin dans admin_roles.'} action="Retour au feed" />
  return <section className="feature-panel admin-panel"><div className="feature-header"><div><span className="eyebrow">CONSOLE ADMIN · {role.toUpperCase()}</span><h2>Vue plateforme</h2><p>Supervision, modération et santé de la communauté.</p></div><span className="admin-shield">✓</span></div><div className="admin-network-summary" aria-label="Résumé réel de la plateforme"><div><span>UTILISATEURS</span><strong>{stats.users}</strong><small>profils enregistrés</small></div><div><span>PAGES</span><strong>{stats.pages}</strong><small>pages enregistrées</small></div><div><span>PUBLICATIONS</span><strong>{stats.posts}</strong><small>publications enregistrées</small></div><button onClick={() => onAction('Ouvrez Groupes pour gérer vos communautés.')}>Ouvrir mes groupes <span>↗</span></button></div><div className="admin-stats"><div><strong>{stats.users}</strong><span>utilisateurs</span></div><div><strong>{stats.pages}</strong><span>pages</span></div><div><strong>{stats.posts}</strong><span>publications</span></div><div className={stats.reports ? 'attention' : ''}><strong>{stats.reports}</strong><span>signalements ouverts</span></div></div><div className="admin-grid"><div><h3>Modération</h3>{reports.length === 0 ? <p className="empty-copy">Aucun signalement ouvert.</p> : reports.map(report => <div className="admin-row" key={report.id}><span>{report.reason}</span><small>{report.status} · {new Date(report.created_at).toLocaleDateString('fr-FR')}</small><button onClick={() => onAction(`Signalement ${report.id.slice(0, 8)} sélectionné.`)}>Ouvrir</button></div>)}</div><div><h3>Audit logs</h3>{logs.length === 0 ? <p className="empty-copy">Aucun événement d’audit.</p> : logs.slice(0, 5).map(log => <div className="admin-row" key={log.id}><span>{log.action}</span><small>{log.entity_type} · {new Date(log.created_at).toLocaleDateString('fr-FR')}</small></div>)}</div></div></section>
}

export function SettingsPanel({ user, theme, onThemeChange, onAction }: { user: User | null; theme: 'light' | 'dark'; onThemeChange: (theme: 'light' | 'dark') => void; onAction: (message: string) => void }) {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [compactMode, setCompactMode] = useState(false)
  const [loading, setLoading] = useState(Boolean(user))
  useEffect(() => {
    if (!user) { setLoading(false); return }
    getMySettings(user.id).then(settings => {
      const prefs = (settings?.notification_preferences as Record<string, unknown> | null) ?? {}
      setEmailNotifications(prefs.email !== false)
      setCompactMode(Boolean(prefs.compact))
      if (settings?.appearance === 'dark' || settings?.appearance === 'light') onThemeChange(settings.appearance)
    }).catch(() => undefined).finally(() => setLoading(false))
  }, [user, onThemeChange])
  const save = async (next: { email?: boolean; compact?: boolean; appearance?: 'light' | 'dark' }) => {
    if (!user) { onAction('Connectez-vous pour synchroniser vos préférences.'); return }
    try {
      await saveMySettings(user.id, {
        appearance: next.appearance ?? theme,
        notification_preferences: { email: next.email ?? emailNotifications, compact: next.compact ?? compactMode },
      })
      onAction('Préférence enregistrée dans votre compte.')
    } catch (error) { onAction(error instanceof Error ? error.message : 'Impossible d’enregistrer cette préférence.') }
  }
  return <section className="feature-panel settings-panel"><div className="feature-header"><div><span className="eyebrow">ESPACE PERSONNEL</span><h2>Réglages</h2><p>{user ? 'Préférences synchronisées avec votre compte.' : 'Connectez-vous pour synchroniser vos préférences avec votre compte.'}</p></div><span className="admin-shield">⚙</span></div><div className="settings-list">
    <label><span><strong>Apparence</strong><small>Choisissez le thème d’Avani Pro.</small></span><select value={theme} disabled={loading} onChange={event => { const next = event.target.value as 'light' | 'dark'; onThemeChange(next); void save({ appearance: next }) }}><option value="light">Clair</option><option value="dark">Sombre</option></select></label>
    <label><span><strong>Notifications email</strong><small>Recevoir les alertes importantes de votre réseau.</small></span><input type="checkbox" checked={emailNotifications} disabled={loading || !user} onChange={event => { const value = event.target.checked; setEmailNotifications(value); void save({ email: value }) }} /></label>
    <label><span><strong>Mode compact</strong><small>Réduire l’espacement du feed pour afficher plus de contenu.</small></span><input type="checkbox" checked={compactMode} disabled={loading || !user} onChange={event => { const value = event.target.checked; setCompactMode(value); void save({ compact: value }) }} /></label>
  </div></section>
}
function FeatureEmpty({ title, text, action }: { title: string; text: string; action: string }) { return <section className="feature-panel feature-empty"><div className="placeholder-orb">✦</div><span className="eyebrow">AVANI PRO · ESPACE SÉCURISÉ</span><h2>{title}</h2><p>{text}</p><button className="primary-button" type="button" onClick={() => goTo('/')}>{action} ↗</button></section> }
