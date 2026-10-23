import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getMySettings, saveMySettings, updateMyProfile, uploadProfilePhoto } from '../lib/socialApi'
import { getMyProfile } from '../lib/api'
import type { ProfileRecord } from '../lib/api'
import { getTheme, setTheme, subscribeTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'
import { SvgIcon } from './icons'
import './settings-page.css'

type Category = { id: string; label: string; icon: string; description: string }
type Preferences = Record<string, unknown>
const CATEGORIES: Category[] = [
  { id: 'general', label: 'Général', icon: 'settings', description: 'Vos préférences générales et votre expérience Avani Pro.' },
  { id: 'account', label: 'Compte', icon: 'profile', description: 'Les informations et coordonnées associées à votre compte.' },
  { id: 'profile', label: 'Profil', icon: 'profile', description: 'Personnalisez votre identité publique.' },
  { id: 'appearance', label: 'Apparence et thèmes', icon: 'settings', description: 'Personnalisez les couleurs et le confort visuel de toute l’interface.' },
  { id: 'privacy', label: 'Confidentialité', icon: 'admin', description: 'Choisissez les informations visibles et les interactions autorisées.' },
  { id: 'security', label: 'Sécurité et connexion', icon: 'admin', description: 'Protégez votre compte et gérez votre session.' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications', description: 'Choisissez les catégories de notifications que vous souhaitez recevoir.' },
  { id: 'messaging', label: 'Messagerie', icon: 'messages', description: 'Configurez le confort et la confidentialité de vos conversations.' },
  { id: 'content', label: 'Publications et contenu', icon: 'feed', description: 'Définissez vos préférences de publication et de lecture.' },
  { id: 'network', label: 'Amis et abonnés', icon: 'profile', description: 'Gérez vos préférences de réseau.' },
  { id: 'communities', label: 'Groupes et pages', icon: 'groups', description: 'Préférences liées à vos communautés.' },
  { id: 'apps', label: 'Autorisations et applications', icon: 'settings', description: 'Consultez les autorisations disponibles dans votre navigateur.' },
  { id: 'accessibility', label: 'Accessibilité', icon: 'settings', description: 'Adaptez l’interface à vos besoins.' },
  { id: 'language', label: 'Langue et région', icon: 'settings', description: 'Langue et formats régionaux.' },
  { id: 'data', label: 'Données et stockage', icon: 'files', description: 'Comprenez les données et le stockage utilisés par votre compte.' },
  { id: 'help', label: 'Aide et assistance', icon: 'notifications', description: 'Obtenez de l’aide et retrouvez les informations légales.' },
  { id: 'premium', label: 'Avani Pro Premium', icon: 'verified', description: 'État des fonctionnalités Premium disponibles.' },
  { id: 'danger', label: 'Désactivation et suppression', icon: 'admin', description: 'Informations sur les procédures de désactivation et de suppression.' },
]
const DEFAULTS: Preferences = {
  autoplayVideos: false, confirmActions: true, startPage: 'feed', compactMode: false,
  profileVisibility: 'public', messagePermission: 'everyone', mentionPermission: 'everyone', storyVisibility: 'public',
  showOnline: true, readReceipts: true, emailNotifications: false, browserNotifications: false,
  privateMessages: true, groupMessages: true, friendRequests: true, newFollowers: true, mentions: true,
  reactions: true, comments: true, commentReplies: true, groupActivity: true, pageActivity: true, securityAlerts: true,
  messagePreview: true, messageSounds: false, autoDownload: false, defaultAudience: 'public', allowTagging: true,
  savedContent: true, groupInvites: 'friends', pageUpdates: true, highContrast: false, reduceMotion: false,
  fontSize: 'normal', dateFormat: 'locale', timeFormat: '24h', timezone: 'local', language: 'fr',
}
const THEME_CHOICES = [
  { id: 'dark', label: 'AVANI DARK', note: 'Bleu nuit et surfaces sombres' },
  { id: 'neon', label: 'AVANI NEON', note: 'Noir profond et accents néon' },
  { id: 'blue', label: 'AVANI BLUE', note: 'Bleu professionnel' },
  { id: 'light', label: 'AVANI LIGHT', note: 'Interface claire' },
] as const
type AppTheme = typeof THEME_CHOICES[number]['id']
function asString(value: unknown, fallback: string) { return typeof value === 'string' ? value : fallback }
function asBoolean(value: unknown, fallback = false) { return typeof value === 'boolean' ? value : fallback }

export function SettingsPage({ user, onAction, onProfile }: { user: User | null; onAction: (message: string) => void; onProfile?: (profile: ProfileRecord) => void }) {
  const [active, setActive] = useState('general')
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS)
  const [profile, setProfile] = useState({ full_name: '', username: '', bio: '', avatar_url: '' })
  const [accountEmail, setAccountEmail] = useState(user?.email ?? '')
  const [newEmail, setNewEmail] = useState('')
  const [loading, setLoading] = useState(Boolean(user))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [theme, setCurrentTheme] = useState<string>(getTheme())
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const selected = CATEGORIES.find(category => category.id === active) ?? CATEGORIES[0]
  const prefsCount = useMemo(() => Object.keys(prefs).length, [prefs])

  useEffect(() => {
    if (!user) { setLoading(false); return }
    let cancelled = false
    setLoading(true); setError('')
    Promise.all([getMySettings(user.id), getMyProfile(user)]).then(([settings, found]) => {
      if (cancelled) return
      const stored = settings?.notification_preferences && typeof settings.notification_preferences === 'object' ? settings.notification_preferences as Preferences : {}
      setPrefs({ ...DEFAULTS, ...stored,
        profileVisibility: settings?.profile_visibility ?? stored.profileVisibility ?? DEFAULTS.profileVisibility,
        messagePermission: settings?.message_permission ?? stored.messagePermission ?? DEFAULTS.messagePermission,
        mentionPermission: settings?.mention_permission ?? stored.mentionPermission ?? DEFAULTS.mentionPermission,
        storyVisibility: settings?.story_visibility ?? stored.storyVisibility ?? DEFAULTS.storyVisibility,
      })
      if (settings?.appearance) {
        const cloudTheme = String(settings.appearance)
        if (THEME_CHOICES.some(choice => choice.id === cloudTheme)) { setCurrentTheme(cloudTheme); setTheme(cloudTheme as AppTheme) }
      }
      if (found) setProfile({ full_name: found.full_name ?? '', username: found.username ?? '', bio: found.bio ?? '', avatar_url: found.avatar_url ?? '' })
      setAccountEmail(user.email ?? '')
      setLoading(false)
    }).catch(caught => { if (!cancelled) { setError(caught instanceof Error ? caught.message : 'Impossible de charger les préférences depuis le compte.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    const sync = () => setCurrentTheme(getTheme())
    return subscribeTheme(sync)
  }, [])

  const update = (key: string, value: unknown) => {
    setPrefs(current => ({ ...current, [key]: value }))
    setDirty(true); setStatus('Modifications non enregistrées'); setError('')
  }
  const save = async () => {
    if (!user) { setStatus('Connectez-vous pour enregistrer ces préférences dans votre compte.'); return }
    setSaving(true); setStatus('Enregistrement en cours…'); setError('')
    try {
      await saveMySettings(user.id, {
        appearance: theme,
        profile_visibility: prefs.profileVisibility,
        message_permission: prefs.messagePermission,
        mention_permission: prefs.mentionPermission,
        story_visibility: prefs.storyVisibility,
        language: prefs.language,
        notification_preferences: prefs,
      })
      setDirty(false); setStatus('Préférences enregistrées dans votre compte.'); onAction('Réglages enregistrés.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La sauvegarde a échoué.')
      setStatus('Échec de l’enregistrement.'); onAction('La sauvegarde des réglages a échoué.')
    } finally { setSaving(false) }
  }
  const changeTheme = async (next: AppTheme) => {
    setTheme(next); setCurrentTheme(next); setDirty(true); setStatus('Thème appliqué sur cet appareil · en attente de sauvegarde')
    if (user) {
      setSaving(true); setError('')
      try {
        await saveMySettings(user.id, { appearance: next, profile_visibility: prefs.profileVisibility, message_permission: prefs.messagePermission, mention_permission: prefs.mentionPermission, story_visibility: prefs.storyVisibility, language: prefs.language, notification_preferences: prefs })
        setDirty(false); setStatus('Thème enregistré dans votre compte.'); onAction('Thème appliqué et enregistré.')
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Le thème est appliqué localement, mais sa synchronisation a échoué.')
        setStatus('Thème appliqué localement · synchronisation échouée')
      } finally { setSaving(false) }
    }
  }
  const changeProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return
    setProfileBusy(true); setError(''); setStatus('Mise à jour du profil…')
    try {
      const savedProfile = await updateMyProfile(user.id, { full_name: profile.full_name.trim(), username: profile.username.trim().toLowerCase(), bio: profile.bio.trim() })
      onProfile?.(savedProfile)
      setStatus('Profil mis à jour dans la base de données.'); onAction('Profil mis à jour.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Impossible de mettre à jour le profil.'); setStatus('Profil non enregistré.') }
    finally { setProfileBusy(false) }
  }
  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file || !user) return
    setProfileBusy(true); setError('')
    try {
      const updated = await uploadProfilePhoto(user.id, file)
      setProfile(current => ({ ...current, avatar_url: updated.avatar_url ?? '' }))
      onProfile?.(updated)
      setStatus('Photo de profil enregistrée.'); onAction('Photo de profil mise à jour.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Impossible de téléverser la photo.') }
    finally { setProfileBusy(false) }
  }
  const changeEmail = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase || !newEmail.trim()) return
    setSaving(true); setError(''); setStatus('Demande de changement d’adresse…')
    try {
      const { error: authError } = await supabase.auth.updateUser({ email: newEmail.trim() })
      if (authError) throw authError
      setStatus('Demande envoyée. Consultez votre boîte e-mail pour confirmer le changement.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Le changement d’adresse a échoué.'); setStatus('Adresse non modifiée.') }
    finally { setSaving(false) }
  }
  const requestPasswordReset = async () => {
    if (!supabase || !user?.email) { setError('Impossible de lancer la récupération du mot de passe.'); return }
    setSaving(true); setError('')
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: window.location.origin + '/reset-password' })
      if (resetError) throw resetError
      setStatus('Lien de récupération demandé. Vérifiez votre boîte e-mail.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Impossible de demander un lien de récupération.') }
    finally { setSaving(false) }
  }
  const signOutOtherSessions = async () => {
    if (!supabase || !window.confirm('Déconnecter toutes les autres sessions de votre compte ?')) return
    setSaving(true); setError('')
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
      if (signOutError) throw signOutError
      setStatus('Demande de déconnexion des autres sessions effectuée.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Impossible de fermer les autres sessions.') }
    finally { setSaving(false) }
  }

  const toggle = (key: string, label: string) => <label className="sp-toggle" key={key}><span><strong>{label}</strong></span><input type="checkbox" checked={asBoolean(prefs[key], Boolean(DEFAULTS[key]))} onChange={event => update(key, event.target.checked)} /><i aria-hidden="true" /></label>
  const select = (key: string, label: string, options: Array<[string, string]>) => <label className="sp-field" key={key}><span>{label}</span><select value={asString(prefs[key], String(DEFAULTS[key] ?? ''))} onChange={event => update(key, event.target.value)}>{options.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
  const textField = (key: 'full_name' | 'username', label: string, maxLength: number) => <label className="sp-field" key={key}><span>{label}</span><input value={profile[key]} maxLength={maxLength} onChange={event => setProfile(current => ({ ...current, [key]: event.target.value }))} /></label>

  return <section className="sp-layout" aria-label="Réglages Avani Pro">
    <header className="sp-header"><div><span className="sp-eyebrow">AVANI PRO · ESPACE PERSONNEL</span><h1>Réglages</h1><p>Configurez votre compte, votre confidentialité et votre expérience.</p></div><span className="sp-status-dot" aria-label="Paramètres du compte" /></header>
    <div className="sp-grid">
      <aside className={mobileMenuOpen ? 'sp-sidebar is-open' : 'sp-sidebar'} aria-label="Catégories des réglages">
        <div className="sp-sidebar-title">VOTRE ESPACE</div>
        {CATEGORIES.map(category => <button type="button" key={category.id} className={active === category.id ? 'sp-nav-item is-active' : 'sp-nav-item'} onClick={() => { if (dirty && !window.confirm('Vous avez des modifications non enregistrées. Continuer sans enregistrer ?')) return; setActive(category.id); setMobileMenuOpen(false); setStatus('') }}><SvgIcon name={category.icon} /><span>{category.label}</span><b aria-hidden="true">›</b></button>)}
      </aside>
      <div className="sp-mobile-category"><button type="button" onClick={() => setMobileMenuOpen(value => !value)} aria-expanded={mobileMenuOpen}><SvgIcon name={selected.icon} />{selected.label}<span>{mobileMenuOpen ? 'Fermer' : 'Changer'}</span></button></div>
      <main className="sp-content">
        <div className="sp-section-heading"><div><span className="sp-eyebrow">PARAMÈTRES</span><h2>{selected.label}</h2><p>{selected.description}</p></div><span className="sp-section-symbol"><SvgIcon name={selected.icon} /></span></div>
        {loading && <p className="sp-notice" role="status">Chargement des réglages du compte…</p>}
        {error && <p className="sp-error" role="alert">{error}</p>}
        {status && <p className={status.includes('échoué') || status.includes('Échec') || status.includes('non enregistré') ? 'sp-notice sp-notice-error' : 'sp-notice'} role="status">{status}</p>}
        {active === 'general' && <div className="sp-card"><h3>Expérience générale</h3>{select('startPage', 'Page affichée au démarrage', [['feed','Fil d’actualité'],['messages','Messagerie'],['groups','Groupes'],['profile','Mon profil']])}{toggle('autoplayVideos','Lecture automatique des vidéos')}{toggle('confirmActions','Demander confirmation avant les actions importantes')}{toggle('compactMode','Densité compacte de l’interface')}</div>}
        {active === 'account' && <><div className="sp-card"><h3>Adresse e-mail</h3><p>Adresse actuelle : <strong>{accountEmail || 'Non connecté'}</strong></p><form className="sp-inline-form" onSubmit={changeEmail}><label className="sp-field"><span>Nouvelle adresse e-mail</span><input type="email" value={newEmail} onChange={event => setNewEmail(event.target.value)} required /></label><button className="sp-primary" disabled={!user || saving}>{saving ? 'En cours…' : 'Demander le changement'}</button></form><small>Supabase peut demander une confirmation par e-mail avant d’appliquer le changement.</small></div><div className="sp-card"><h3>Informations du compte</h3><p>La date de naissance et le téléphone ne sont pas configurés dans le schéma actuel.</p></div></>}
        {active === 'profile' && <div className="sp-card"><h3>Identité publique</h3>{profile.avatar_url && <img className="sp-avatar-preview" src={profile.avatar_url} alt="Photo de profil actuelle" />}<label className="sp-upload">Changer la photo de profil<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={!user || profileBusy} /></label><form onSubmit={changeProfile} className="sp-form-grid">{textField('full_name','Nom affiché',100)}{textField('username','Nom d’utilisateur',30)}<label className="sp-field sp-field-wide"><span>Présentation</span><textarea value={profile.bio} maxLength={500} onChange={event => setProfile(current => ({ ...current, bio: event.target.value }))} rows={4} /></label><div className="sp-actions sp-field-wide"><button className="sp-primary" disabled={!user || profileBusy}>{profileBusy ? 'Enregistrement…' : 'Enregistrer le profil'}</button></div></form></div>}
        {active === 'appearance' && <div className="sp-card"><h3>Choisissez votre ambiance</h3><div className="sp-theme-grid">{THEME_CHOICES.map(choice => <button type="button" key={choice.id} className={theme === choice.id ? 'sp-theme-card is-selected' : 'sp-theme-card'} onClick={() => void changeTheme(choice.id)}><span className={'sp-theme-preview theme-preview-' + choice.id}><i /><i /><i /></span><strong>{choice.label}</strong><small>{choice.note}</small>{theme === choice.id && <b>✓ Sélectionné</b>}</button>)}</div>{select('fontSize','Taille du texte',[['small','Petite'],['normal','Normale'],['large','Grande'],['xlarge','Très grande']])}{toggle('reduceMotion','Réduire les animations')}{toggle('highContrast','Contraste renforcé')}</div>}
        {active === 'privacy' && <div className="sp-card"><h3>Visibilité et interactions</h3>{select('profileVisibility','Visibilité du profil',[['public','Tout le monde'],['friends','Amis uniquement'],['private','Moi uniquement']])}{select('storyVisibility','Audience des stories',[['public','Tout le monde'],['friends','Amis uniquement']])}{select('messagePermission','Qui peut vous envoyer un message ?',[['everyone','Tout le monde'],['friends','Amis uniquement'],['nobody','Personne']])}{select('mentionPermission','Qui peut vous mentionner ?',[['everyone','Tout le monde'],['friends','Amis uniquement'],['nobody','Personne']])}{toggle('showOnline','Afficher le statut en ligne')}{toggle('readReceipts','Accusés de lecture')}<p className="sp-muted">Les choix enregistrés ne remplacent pas les politiques d’autorisation serveur. Les options sans enforcement dédié ne sont que des préférences.</p></div>}
        {active === 'security' && <div className="sp-card"><h3>Protection du compte</h3><p>Compte connecté : <strong>{user?.email ?? 'Non connecté'}</strong></p><button type="button" className="sp-secondary" disabled={!user || saving} onClick={() => void requestPasswordReset()}>Demander un lien de réinitialisation du mot de passe</button><button type="button" className="sp-secondary" disabled={!user || saving} onClick={() => void signOutOtherSessions()}>Déconnecter les autres sessions</button><p className="sp-muted">La liste des appareils et l’authentification à deux facteurs ne sont pas exposées par l’implémentation actuelle. Elles ne sont pas simulées.</p></div>}
        {active === 'notifications' && <div className="sp-card"><h3>Préférences de notification</h3>{toggle('privateMessages','Messages privés')}{toggle('groupMessages','Messages de groupe')}{toggle('friendRequests','Demandes d’amis')}{toggle('newFollowers','Nouveaux abonnés')}{toggle('mentions','Mentions')}{toggle('reactions','Likes et réactions')}{toggle('comments','Commentaires')}{toggle('commentReplies','Réponses aux commentaires')}{toggle('groupActivity','Activités des groupes')}{toggle('pageActivity','Activités des pages')}{toggle('securityAlerts','Alertes de sécurité')}{toggle('emailNotifications','Notifications par e-mail')}{toggle('browserNotifications','Notifications du navigateur')}<p className="sp-muted">Ces choix sont enregistrés dans les préférences du compte. L’envoi effectif dépend des services de notification configurés.</p></div>}
        {active === 'messaging' && <div className="sp-card"><h3>Conversations</h3>{toggle('messagePreview','Afficher l’aperçu des messages')}{toggle('messageSounds','Sons de notification')}{toggle('readReceipts','Accusés de lecture')}{toggle('autoDownload','Téléchargement automatique des pièces jointes')}{select('groupInvites','Qui peut vous inviter dans un groupe ?',[['friends','Amis'],['everyone','Tout le monde'],['nobody','Personne']])}<p className="sp-muted">Les préférences sont sauvegardées. Leur application au comportement des conversations dépend des fonctions déjà branchées.</p></div>}
        {active === 'content' && <div className="sp-card"><h3>Publications et médias</h3>{select('defaultAudience','Audience par défaut',[['public','Public'],['friends','Amis'],['private','Moi uniquement']])}{toggle('allowTagging','Autoriser les identifications')}{toggle('savedContent','Afficher mes contenus enregistrés')}{toggle('autoplayVideos','Lecture automatique des vidéos')}</div>}
        {active === 'network' && <div className="sp-card"><h3>Réseau personnel</h3>{select('friendRequestsPermission','Qui peut vous envoyer une demande d’ami ?',[['everyone','Tout le monde'],['friendsOfFriends','Amis d’amis'],['nobody','Personne']])}{toggle('showOnline','Afficher le statut en ligne')}<p className="sp-muted">La gestion détaillée des listes de blocage et de restriction nécessite une API dédiée qui n’est pas exposée ici.</p></div>}
        {active === 'communities' && <div className="sp-card"><h3>Groupes et pages</h3>{select('groupInvites','Invitations aux groupes',[['friends','Amis uniquement'],['everyone','Tout le monde'],['nobody','Désactivées']])}{toggle('groupActivity','Notifications des groupes')}{toggle('pageActivity','Notifications des pages')}<p className="sp-muted">Ces réglages ne modifient aucun rôle ni droit d’administration.</p></div>}
        {active === 'apps' && <div className="sp-card"><h3>Autorisations du navigateur</h3>{[['Notifications','Notification API','Notification' in window],['Caméra et microphone','mediaDevices','mediaDevices' in navigator],['Sélecteur de fichiers','File API','File' in window]].map(([label,api,available]) => <div className="sp-info-row" key={String(label)}><span><strong>{String(label)}</strong><small>{String(api)}</small></span><b>{available ? 'API disponible' : 'Non disponible'}</b></div>)}<p className="sp-muted">Les autorisations du navigateur sont demandées au moment où une fonction les utilise. Cette page ne peut pas les accorder silencieusement.</p></div>}
        {active === 'accessibility' && <div className="sp-card"><h3>Confort de lecture</h3>{select('fontSize','Taille du texte',[['small','Petite'],['normal','Normale'],['large','Grande'],['xlarge','Très grande']])}{toggle('highContrast','Contraste renforcé')}{toggle('reduceMotion','Réduire les animations')}<p className="sp-muted">Les préférences sont sauvegardées. Les indicateurs de focus clavier restent visibles.</p></div>}
        {active === 'language' && <div className="sp-card"><h3>Langue et région</h3>{select('language','Langue de l’interface',[['fr','Français'],['en','English']])}{select('dateFormat','Format de date',[['locale','Format du navigateur'],['DD/MM/YYYY','JJ/MM/AAAA'],['MM/DD/YYYY','MM/JJ/AAAA'],['YYYY-MM-DD','AAAA-MM-JJ']])}{select('timeFormat','Format de l’heure',[['24h','24 heures'],['12h','12 heures']])}{select('timezone','Fuseau horaire',[['local','Fuseau de l’appareil'],['UTC','UTC']])}<p className="sp-muted">Le français est la langue principale. Le choix anglais est enregistré, mais tous les écrans ne sont pas encore traduits.</p></div>}
        {active === 'data' && <div className="sp-card"><h3>Données et stockage</h3><div className="sp-info-row"><span><strong>Préférences enregistrées</strong><small>Nombre de clés de préférence</small></span><b>{prefsCount}</b></div><div className="sp-info-row"><span><strong>Stockage local</strong><small>Cache et données locales gérés par le navigateur</small></span><b>Appareil</b></div><p className="sp-muted">L’export complet et la suppression automatisée des données ne sont pas encore implémentés. Aucune donnée n’est supprimée depuis cette page.</p></div>}
        {active === 'help' && <div className="sp-card"><h3>Aide et assistance</h3><a className="sp-link-row" href="https://github.com/avanisoudi/avani-pro" target="_blank" rel="noreferrer">Dépôt et signalement de problème ↗</a><a className="sp-link-row" href="/confidentialite/">Politique de confidentialité ↗</a><a className="sp-link-row" href="https://github.com/avanisoudi/avani-pro/blob/main/README.md" target="_blank" rel="noreferrer">Documentation du projet ↗</a><div className="sp-info-row"><span><strong>Version d’Avani Pro</strong><small>Version de l’application</small></span><b>1.4.0</b></div></div>}
        {active === 'premium' && <div className="sp-card"><h3>Avani Pro Premium</h3><p>Aucun abonnement Premium actif ou système de facturation vérifiable n’est exposé à cette page.</p><p className="sp-muted">Aucun faux statut d’abonnement ni paiement simulé n’est affiché.</p></div>}
        {active === 'danger' && <div className="sp-card sp-danger"><h3>Actions importantes sur le compte</h3><p>La désactivation et la suppression définitive ne disposent pas encore d’un flux serveur complet validé. Aucun bouton de suppression immédiate n’est proposé pour protéger vos données.</p><p className="sp-muted">Contactez l’assistance pour connaître les procédures disponibles.</p><a href="https://github.com/avanisoudi/avani-pro/issues" target="_blank" rel="noreferrer">Contacter l’assistance du projet ↗</a></div>}
        <footer className="sp-footer"><span>{dirty ? 'Modifications en attente' : 'Préférences synchronisées ou inchangées'}</span><button type="button" className="sp-secondary" onClick={() => { if (window.confirm('Réinitialiser les préférences locales de cette page ? Enregistrez ensuite pour modifier le compte.')) { setPrefs(DEFAULTS); setDirty(true); setStatus('Valeurs par défaut chargées localement. Enregistrez pour les appliquer au compte.') } }}>Réinitialiser cette section</button><button type="button" className="sp-primary" onClick={() => void save()} disabled={!user || saving || loading || !dirty}>{saving ? 'Enregistrement…' : 'Enregistrer les réglages'}</button></footer>
      </main>
      <aside className="sp-rail"><div className="sp-rail-card"><span className="sp-rail-icon">✦</span><h3>État du compte</h3><p>{user ? 'Connecté à Avani Pro' : 'Connexion requise pour synchroniser les préférences'}</p><div className="sp-rail-line"><span>Synchronisation</span><b>{user ? 'Compte' : 'Locale'}</b></div><div className="sp-rail-line"><span>État des réglages</span><b>{dirty ? 'À enregistrer' : loading ? 'Chargement' : 'À jour'}</b></div><div className="sp-rail-line"><span>Thème</span><b>{THEME_CHOICES.find(choice => choice.id === theme)?.label ?? theme}</b></div></div><div className="sp-rail-card sp-security-card"><h3>Conseil sécurité</h3><p>Utilisez un mot de passe unique et confirmez les changements d’adresse e-mail depuis votre boîte de réception.</p><button type="button" onClick={() => setActive('security')}>Vérifier la sécurité ↗</button></div></aside>
    </div>
  </section>
}
