import { useState } from 'react'
import { requireSupabase } from '../lib/supabase'

type AuthMode = 'login' | 'signup' | 'reset'

export function AuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (message: string) => void }) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const client = requireSupabase()
      if (mode === 'reset') {
        await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
        onSuccess('Un lien de réinitialisation a été envoyé à votre adresse email.'); onClose(); return
      }
      if (mode === 'signup') {
        const { data, error: signUpError } = await client.auth.signUp({ email, password, options: { data: { full_name: fullName, username: username.toLowerCase().replace(/[^a-z0-9_]/g, ''), phone } } })
        if (signUpError) throw signUpError
        onSuccess(data.session ? '🎉 Bienvenue sur Avani Pro ! Votre compte a été créé avec succès.' : 'Compte créé. Vérifiez votre email pour confirmer votre inscription.'); onClose(); return
      }
      const { error: signInError } = await client.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
      onSuccess('Connexion réussie. Bon retour sur Avani Pro !'); onClose()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Une erreur est survenue.') } finally { setBusy(false) }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="auth-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={onClose} aria-label="Fermer">×</button><div className="auth-logo">AV</div><span className="eyebrow">AVANI PRO · ESPACE SÉCURISÉ</span><h2>{mode === 'login' ? 'Ravi de vous revoir.' : mode === 'signup' ? 'Construisez votre signal.' : 'Réinitialiser le mot de passe'}</h2><p className="auth-intro">{mode === 'login' ? 'Connectez-vous pour retrouver votre réseau.' : mode === 'signup' ? 'Créez votre identité professionnelle en quelques secondes.' : 'Nous vous enverrons un lien sécurisé.'}</p><form onSubmit={submit}>{mode === 'signup' && <div className="form-grid"><label>Nom complet<input value={fullName} onChange={event => setFullName(event.target.value)} required placeholder="Alex Morgan" /></label><label>Username<input value={username} onChange={event => setUsername(event.target.value)} required placeholder="alexmorgan" /></label></div>}{mode === 'signup' && <label>Téléphone <span className="optional">optionnel</span><input value={phone} onChange={event => setPhone(event.target.value)} placeholder="+33 6 00 00 00 00" /></label>}<label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="vous@entreprise.com" /></label>{mode !== 'reset' && <label>Mot de passe<input type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} placeholder="8 caractères minimum" /></label>}{error && <div className="auth-error">{error}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy ? 'Veuillez patienter…' : mode === 'login' ? 'Se connecter ↗' : mode === 'signup' ? 'Créer mon compte ↗' : 'Envoyer le lien ↗'}</button></form><div className="auth-links">{mode === 'login' && <><button onClick={() => setMode('reset')}>Mot de passe oublié ?</button><span>·</span><button onClick={() => setMode('signup')}>Créer un compte</button></>}{mode !== 'login' && <button onClick={() => setMode('login')}>Retour à la connexion</button>}</div></section></div>
}
