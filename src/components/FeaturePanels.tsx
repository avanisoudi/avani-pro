import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { User } from '@supabase/supabase-js'
import type { ProfileRecord } from '../lib/api'
import { createDirectConversation, joinPublicGroup, listPublicGroups, type PublicGroupRecord } from '../lib/api'
import { adoptCloudTheme, getTheme, setTheme, subscribeTheme } from '../lib/theme'
import { readFeatureFlags, setFeatureFlag, type FeatureFlag } from '../lib/socialApi'
import { VerifiedBadge } from './icons'
import { supabase } from '../lib/supabase'
import { addGroupMember, createGroup, createPage, getMySettings, isAdmin, listDiscoverableProfiles, listMyGroups, listMyPages, saveMySettings, toggleFollow, togglePageFollow, updateMyProfile, uploadProfilePhoto, type PageRecord } from '../lib/socialApi'

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
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountMessage, setAccountMessage] = useState('')
  if (!user) return <FeatureEmpty title="Votre identité professionnelle" text="Connectez-vous pour créer et modifier votre profil Avani Pro." action="Se connecter" />
  const save = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setMessage(''); try { const saved = await updateMyProfile(user.id, { full_name: fullName.trim(), username: username.toLowerCase().trim(), bio: bio.trim() }); onProfile(saved); setMessage('Profil mis à jour avec succès.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Impossible de mettre à jour le profil.') } finally { setBusy(false) } }
  const changePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setPhotoBusy(true); setMessage(''); try { const saved = await uploadProfilePhoto(user.id, file); onProfile(saved); setMessage('Photo de profil mise à jour.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Impossible d’envoyer la photo.') } finally { setPhotoBusy(false) } }
  const signOut = async () => {
    if (accountBusy) return
    if (!supabase) {
      setAccountMessage('Le service de connexion est indisponible. Réessayez plus tard.')
      return
    }
    if (!window.confirm('Voulez-vous vraiment vous déconnecter de votre compte Avani Pro ?')) return
    setAccountBusy(true)
    setAccountMessage('')
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      window.location.replace('/')
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : 'Impossible de se déconnecter pour le moment.')
    } finally {
      setAccountBusy(false)
    }
  }
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
        <span className="profile-avatar-frame">{profile?.avatar_url ? <img src={profile.avatar_url} alt="Photo de profil" /> : <span>{initials}</span>}</span>
        <i aria-hidden="true">＋</i>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={changePhoto} disabled={photoBusy} />
      </label>
      <div className="profile-identity-copy">
        <span className="eyebrow">PROFIL PERSONNEL</span>
        <h2>{fullName.trim() || 'Votre nom'} {profile?.verified_type && <VerifiedBadge type={profile.verified_type} />}</h2>
        <p className="profile-handle">{username ? `@${username}` : '@votre-identifiant'}</p>
        {bio.trim() && <p className="profile-bio-preview">{bio.trim()}</p>}
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
    <div className="profile-section-divider" />
    <div className="profile-workspace">
      <div className="profile-workspace-heading"><div><span className="eyebrow">COMPTE</span><h3>Déconnexion du compte</h3><p>Fermez votre session sur cet appareil. Votre profil et vos données restent conservés ; vos autres appareils restent connectés.</p></div><span className="profile-save-state">{accountBusy ? 'Déconnexion…' : 'Session active'}</span></div>
      <div className="profile-form profile-form-modern">
        <div className="profile-form-footer">
          <span className="form-status" role="status">{accountMessage}</span>
          <button type="button" className="account-signout" disabled={accountBusy} onClick={() => void signOut()}>
            {accountBusy ? 'Déconnexion…' : 'Se déconnecter ↗'}
          </button>
        </div>
      </div>
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
  const reload = useCallback(() => setReloadToken(value => value + 1), [])

  // Un onglet réveillé après une longue pause doit se reconcilier avec la base : la
  // connexion Realtime a pu etre coupee entre-temps, et aucun evenement n'est rattrape.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

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
      // Pas de filtre sur user_id ici : le comptage de membres d'un groupe public change
      // quand d'autres personnes adhèrent. C'est RLS qui borne la portée des événements reçus.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_members' }, () => bump())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_members' }, () => bump())
      .subscribe()
    return () => {
      if (bumpTimer.current) window.clearTimeout(bumpTimer.current)
      void client.removeChannel(channel)
    }
  // `reload` est memoise (useCallback sans dependance) : le citer honore la regle des
  // dependances sans reabonner le canal a chaque rendu.
  }, [user, reload])
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
  const [pages, setPages] = useState<PageRecord[]>([])
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [category, setCategory] = useState('company')
  const [description, setDescription] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [followed, setFollowed] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  useEffect(() => { if (user) listMyPages(user.id).then(setPages).catch(() => undefined) }, [user])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) { onAction('Connectez-vous pour créer une page.'); return }
    setBusy(true)
    try {
      const page = await createPage(user.id, { name: name.trim(), slug: slug.trim(), category, description: description.trim() })
      setPages(current => [page, ...current])
      setName(''); setSlug(''); setDescription(''); setCategory('company'); setOpen(false)
      onAction('Votre page professionnelle a été créée.')
    } catch (error) { onAction(error instanceof Error ? error.message : 'Impossible de créer la page.') }
    finally { setBusy(false) }
  }
  const visiblePages = pages.filter(page => {
    const matchesQuery = `${page.name} ${page.slug} ${page.description ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    return matchesQuery && (filter === 'all' || page.category === filter)
  })
  const categoryLabel = (value: string) => ({ company: 'Entreprise', creator: 'Créateur', community: 'Communauté', brand: 'Marque' }[value] ?? 'Page professionnelle')
  const copyPageLink = async (page: PageRecord) => {
    const link = `${window.location.origin}/pages/${page.slug}`
    try { await navigator.clipboard.writeText(link); onAction('Lien de la page copié.') }
    catch { onAction(`Lien de la page : ${link}`) }
  }
  if (!user) return <FeatureEmpty title="Vos pages professionnelles" text="Connectez-vous pour créer une page d’entreprise, de créateur, de communauté ou de marque." action="Se connecter" />
  return <section className="feature-panel professional-pages-panel">
    <div className="feature-header professional-pages-header">
      <div><span className="eyebrow">PAGES PROFESSIONNELLES</span><h2>Vos pages</h2><p>Développez votre présence officielle, rassemblez votre communauté et publiez au nom de votre organisation.</p></div>
      <button type="button" className="primary-button" onClick={() => setOpen(value => !value)}>{open ? '✕ Fermer' : '＋ Créer une page'}</button>
    </div>
    <div className="professional-pages-stats">
      <div><span className="professional-pages-stat-icon">▣</span><div><strong>{pages.length}</strong><small>{pages.length > 1 ? 'Pages gérées' : 'Page gérée'}</small></div></div>
      <div><span className="professional-pages-stat-icon">♧</span><div><strong>{pages.reduce((total, page) => total + (page.followers_count || 0), 0)}</strong><small>Abonnés au total</small></div></div>
      <div><span className="professional-pages-stat-icon">✓</span><div><strong>{pages.filter(page => page.verified).length}</strong><small>Pages vérifiées</small></div></div>
    </div>
    {open && <form className="inline-form professional-page-form" onSubmit={submit}>
      <div className="professional-form-intro"><span className="eyebrow">NOUVELLE PAGE</span><h3>Créez votre présence officielle</h3><p>Choisissez un nom clair et un identifiant facile à partager.</p></div>
      <label>Nom de la page<input value={name} onChange={event => setName(event.target.value)} required maxLength={80} placeholder="Ex. Avani Studio" /></label>
      <label>Identifiant public<div className="professional-slug-input"><span>/</span><input value={slug} onChange={event => setSlug(event.target.value.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-'))} required minLength={3} maxLength={50} pattern="[a-z0-9-]+" placeholder="avani-studio" /></div><small>3 caractères minimum · lettres minuscules, chiffres et tirets.</small></label>
      <label>Catégorie<select value={category} onChange={event => setCategory(event.target.value)}><option value="company">Entreprise</option><option value="creator">Créateur ou créatrice</option><option value="community">Communauté</option><option value="brand">Marque</option></select></label>
      <label className="professional-description-field">Présentation<textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} maxLength={300} placeholder="Présentez votre activité en quelques mots…" /><small>{description.length}/300 caractères</small></label>
      <div className="professional-form-actions"><button type="button" className="message-button" onClick={() => setOpen(false)}>Annuler</button><button type="submit" className="primary-button" disabled={busy || !name.trim() || slug.trim().length < 3}>{busy ? 'Création en cours…' : 'Créer ma page ↗'}</button></div>
    </form>}
    <div className="professional-pages-toolbar">
      <div><h3>Pages que vous gérez</h3><p>Retrouvez vos pages et suivez leur audience.</p></div>
      <label className="professional-pages-search"><span aria-hidden="true">⌕</span><input aria-label="Rechercher une page" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher une page…" /></label>
    </div>
    <div className="professional-page-filters" aria-label="Filtrer les pages">
      {[['all', 'Toutes'], ['company', 'Entreprise'], ['creator', 'Créateur'], ['brand', 'Marque'], ['community', 'Communauté']].map(([value, label]) => <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}{value === 'all' ? ` · ${pages.length}` : ''}</button>)}
    </div>
    <div className="professional-pages-list">
      {visiblePages.length === 0 ? <div className="professional-pages-empty"><span className="professional-pages-empty-icon">▣</span><h3>{pages.length === 0 ? 'Votre présence commence ici' : 'Aucune page trouvée'}</h3><p>{pages.length === 0 ? 'Créez une page pour représenter votre entreprise, votre marque ou votre communauté sur Avani Pro.' : 'Essayez un autre terme de recherche ou changez le filtre.'}</p>{pages.length === 0 && <button type="button" className="primary-button" onClick={() => setOpen(true)}>＋ Créer ma première page</button>}</div> : visiblePages.map(page => <article className="professional-page-card" key={page.id}>
        <div className="professional-page-avatar">{page.name.trim().charAt(0).toLocaleUpperCase() || '◆'}</div>
        <div className="professional-page-info"><div className="professional-page-title"><strong>{page.name}</strong>{page.verified && <span className="verified" title="Page vérifiée" aria-label="Page vérifiée">✓</span>}</div><span className="professional-page-handle">/{page.slug}</span><p>{page.description || `Page officielle ${page.name} sur Avani Pro.`}</p><div className="professional-page-meta"><span>{categoryLabel(page.category)}</span><span>·</span><span>{page.followers_count || 0} abonnés</span></div></div>
        <div className="professional-page-actions"><button type="button" className={followed.includes(page.id) ? 'follow-button following' : 'follow-button'} onClick={async () => { try { const next = await togglePageFollow(page.id, user.id, followed.includes(page.id)); setFollowed(current => next ? [...current, page.id] : current.filter(id => id !== page.id)); onAction(next ? `Vous suivez ${page.name}.` : `Vous ne suivez plus ${page.name}.`) } catch { onAction('Impossible de modifier cet abonnement.') } }}>{followed.includes(page.id) ? '✓ Suivi' : '+ Suivre'}</button><button type="button" className="professional-page-share" onClick={() => void copyPageLink(page)} aria-label={`Copier le lien de ${page.name}`} title="Copier le lien">↗</button></div>
      </article>)}
    </div>
    <p className="professional-pages-footnote">Les pages professionnelles vous permettent de distinguer votre présence publique de votre profil personnel.</p>
  </section>
}
export { AdminPanel } from './AdminConsole'

const FLAG_KEYS: Array<{ key: string; label: string; help: string }> = [
  { key: 'stories', label: 'Stories', help: 'Fil du haut de page, publication 24 h et archive.' },
  { key: 'videos', label: 'Vidéos', help: 'Page /videos, alimentée par les publications vidéo du réseau.' },
  { key: 'reels', label: 'Reels', help: 'Flux vertical /reels, lecture automatique de la vidéo visible.' },
  { key: 'marketplace', label: 'Marketplace', help: 'Petites annonces, photos, recherche et contact du vendeur.' },
  { key: 'live', label: 'Live', help: 'Aucune diffusion temps réel branchée : l’écran reste un état, pas un lecteur.' },
  { key: 'messages', label: 'Messages', help: 'Fils privés et de groupe, Realtime, pièces jointes.' },
  { key: 'groups', label: 'Groupes', help: 'Groupes publics et privés, chat de groupe.' },
  { key: 'pages', label: 'Pages', help: 'Pages, abonnés et rôles.' },
]

export function SettingsPanel({ user, onAction, onFlagsChanged }: { user: User | null; onAction: (message: string) => void; onFlagsChanged?: () => void }) {
  const storedPreferences = useRef<Record<string, unknown>>({})
  const [settingsError, setSettingsError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(Boolean(user))
  // Le thème se lit et se écrit dans le magasin de src/lib/theme.ts : ce panneau est le seul
  // contrôle de l'application, il n'y a plus de bascule dans la barre du haut à garder synchrone.
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'light' as const)
  // Drapeaux de fonctionnalité : lecture pour tout le monde, écriture réservée à
  // l'administration (policy RLS de `feature_flags`). Un refus est dit, pas tu.
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [flagsNote, setFlagsNote] = useState<string | null>(null)
  const [flagBusy, setFlagBusy] = useState<string | null>(null)
  const [mayManageFlags, setMayManageFlags] = useState(false)
  const loadFlags = useCallback(async () => {
    const result = await readFeatureFlags()
    setFlags(result.flags)
    setFlagsNote(result.note)
  }, [])
  useEffect(() => {
    void loadFlags().catch(() => setFlagsNote('Les drapeaux n’ont pas pu être relus.'))
    if (!user) { setMayManageFlags(false); return }
    isAdmin(user.id).then(admin => setMayManageFlags(admin?.role === 'admin' || admin?.role === 'super_admin')).catch(() => setMayManageFlags(false))
  }, [user, loadFlags])
  const toggleFlag = async (flag: FeatureFlag) => {
    setFlagBusy(flag.key)
    const result = await setFeatureFlag(flag.key, !flag.enabled)
    setFlagBusy(null)
    if (result.error) { onAction(result.error); return }
    await loadFlags().catch(() => undefined)
    onFlagsChanged?.()
    onAction(`Fonctionnalité « ${flag.key} » ${flag.enabled ? 'désactivée' : 'activée'} pour tout le monde.`)
  }
  useEffect(() => {
    if (!user) { setLoading(false); return }
    getMySettings(user.id).then(settings => {
      const prefs = (settings?.notification_preferences as Record<string, unknown> | null) ?? {}
      storedPreferences.current = prefs
      // La valeur du compte n'est retenue que si cet appareil n'a encore rien choisi : un choix
      // local est plus récent, sinon ce panneau annulerait la bascule à chaque rechargement.
      adoptCloudTheme(settings?.appearance)
    }).catch(error => setSettingsError(error instanceof Error ? error.message : 'Réglages non relus depuis votre compte.'))
      .finally(() => setLoading(false))
  }, [user])
  const save = async (next: { appearance?: 'light' | 'dark' }) => {
    if (!user) { onAction('Connectez-vous pour synchroniser vos préférences.'); return }
    setSaving(true)
    try {
      await saveMySettings(user.id, {
        appearance: next.appearance ?? theme,
        notification_preferences: storedPreferences.current,
      })
      onAction('Préférence enregistrée dans votre compte.')
    } catch (error) { onAction(error instanceof Error ? error.message : 'Thème appliqué localement, synchronisation impossible.') }
    finally { setSaving(false) }
  }
  return <section className="professional-panel settings-panel"><div className="feature-header"><div><span className="eyebrow">ESPACE PERSONNEL</span><h2>Préférences & compte</h2><p>{user ? 'Préférences synchronisées avec votre compte.' : 'Connectez-vous pour synchroniser vos préférences avec votre compte.'}</p></div><span className="admin-shield">⚙</span></div><div className="settings-list">
    {settingsError && <p role="alert">{settingsError}</p>}
    {saving && <p role="status">Synchronisation en cours…</p>}
    <label><span><strong>Apparence</strong><small>Seul réglage de thème de l’application — appliqué immédiatement, enregistré sur cet appareil et sur votre compte.</small></span><select value={theme} disabled={loading || saving} onChange={event => { const next = event.target.value === 'dark' ? 'dark' : 'light'; setTheme(next); void save({ appearance: next }) }}><option value="light">Clair</option><option value="dark">Sombre</option></select></label>
    <section className="professional-section"><h3>Identité professionnelle</h3><p>Votre nom, identifiant, présentation et photo sont gérés dans un seul espace.</p><button type="button" className="professional-secondary" onClick={() => goTo('/settings')}>Modifier mon profil</button></section>
    <section className="professional-section"><h3>Confidentialité & session</h3><p>Compte connecté : {user?.email || 'Non connecté'}. La déconnexion de cet appareil se trouve dans votre profil professionnel.</p><a href="/confidentialite/">Consulter la politique de confidentialité</a><p>Les préférences email ne constituent pas un service d’envoi d’alertes. Aucun service de notification email n’est annoncé ici.</p></section>
    {mayManageFlags && <div className="settings-flags professional-section">
      <strong>Fonctionnalités de la plateforme</strong>
      <small>{mayManageFlags ? 'Ces interrupteurs écrivent dans `feature_flags` et s’appliquent à tous les comptes.' : 'Lecture seule : seuls les administrateurs peuvent activer ou couper une fonctionnalité (policy RLS).'}</small>
      {flagsNote && <p className="settings-flags-note">{flagsNote}</p>}
      <ul>
        {FLAG_KEYS.map(meta => {
          const stored = flags.find(flag => flag.key === meta.key)
          const enabled = stored ? stored.enabled : true
          return (
            <li key={meta.key}>
              <span><strong>{meta.label}</strong><small>{meta.help}</small></span>
              <button type="button" role="switch" aria-checked={enabled} disabled={!mayManageFlags || flagBusy !== null} title={stored ? undefined : 'Aucune ligne pour cette clé : l’interrupteur la créera.'} onClick={() => void toggleFlag(stored ?? { key: meta.key, enabled: true, description: null })}>
                {flagBusy === meta.key ? '…' : enabled ? 'Ouverte' : 'Coupée'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>}
  </div></section>
}
function FeatureEmpty({ title, text, action }: { title: string; text: string; action: string }) { return <section className="feature-panel feature-empty"><div className="placeholder-orb">✦</div><span className="eyebrow">AVANI PRO · ESPACE SÉCURISÉ</span><h2>{title}</h2><p>{text}</p><button className="primary-button" type="button" onClick={() => goTo('/')}>{action} ↗</button></section> }
