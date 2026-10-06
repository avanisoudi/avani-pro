import { useState } from 'react'
import { requireSupabase } from '../lib/supabase'

type AuthMode = 'login' | 'signup' | 'reset'

type AuthModalProps = { onClose: () => void; onSuccess: (message: string) => void }

export function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [signupStep, setSignupStep] = useState<1 | 2>(1)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const switchMode = (nextMode: AuthMode) => { setMode(nextMode); setSignupStep(1); setError('') }
  const googleSignIn = async () => { setError(''); setBusy(true); try { const { error: oauthError } = await requireSupabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }); if (oauthError) throw oauthError } catch (caught) { setError(caught instanceof Error ? caught.message : 'Google OAuth n’est pas encore activé dans Supabase.') } finally { setBusy(false) } }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('')
    if (mode === 'signup' && signupStep === 1) { if (!firstName.trim() || !lastName.trim() || password.length < 8) { setError('Indiquez votre prénom, votre nom et un mot de passe de 8 caractères minimum.'); return }; setSignupStep(2); return }
    setBusy(true)
    try {
      const client = requireSupabase()
      if (mode === 'reset') { await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }); onSuccess('Un lien de réinitialisation a été envoyé à votre adresse email.'); onClose(); return }
      if (mode === 'signup') {
        const fullName = `${firstName.trim()} ${lastName.trim()}`
        const username = `${firstName}${lastName}`.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24) || undefined
        const { data, error: signUpError } = await client.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName, username } } })
        if (signUpError) throw signUpError
        onSuccess(data.session ? '🎉 Bienvenue sur Avani Pro ! Votre compte a été créé avec succès.' : 'Compte créé. Vérifiez votre email pour confirmer votre inscription.'); onClose(); return
      }
      const { error: signInError } = await client.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) throw signInError
      onSuccess('Connexion réussie. Bon retour sur Avani Pro !'); onClose()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Une erreur est survenue.') } finally { setBusy(false) }
  }

  const title = mode === 'login' ? 'Ravi de vous revoir.' : mode === 'signup' ? signupStep === 1 ? 'Commençons par vous.' : 'Finalisons votre accès.' : 'Réinitialiser le mot de passe'
  const intro = mode === 'login' ? 'Connectez-vous pour retrouver votre réseau.' : mode === 'signup' ? signupStep === 1 ? 'Votre identité et votre mot de passe d’abord.' : 'Ajoutez votre email pour sécuriser votre compte.' : 'Nous vous enverrons un lien sécurisé.'
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="auth-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={onClose} aria-label="Fermer">×</button><div className="auth-logo">AV</div><span className="eyebrow">AVANI PRO · ESPACE SÉCURISÉ</span><h2>{title}</h2><p className="auth-intro">{intro}</p>{mode === 'signup' && <div className="auth-steps"><span className={signupStep === 1 ? 'active' : 'done'}>01 Identité</span><i /><span className={signupStep === 2 ? 'active' : ''}>02 Email</span></div>}<form onSubmit={submit}>{mode === 'signup' && signupStep === 1 && <div className="form-grid"><label>Prénom<input value={firstName} onChange={event => setFirstName(event.target.value)} required placeholder="Alex" autoComplete="given-name" /></label><label>Nom<input value={lastName} onChange={event => setLastName(event.target.value)} required placeholder="Morgan" autoComplete="family-name" /></label></div>}{mode === 'signup' && signupStep === 1 && <label>Mot de passe<input type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} placeholder="8 caractères minimum" autoComplete="new-password" /></label>}{(mode !== 'signup' || signupStep === 2) && <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="vous@entreprise.com" autoComplete="email" /></label>}{mode === 'login' && <label>Mot de passe<input type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} placeholder="Votre mot de passe" autoComplete="current-password" /></label>}{error && <div className="auth-error">{error}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy ? 'Veuillez patienter…' : mode === 'login' ? 'Se connecter ↗' : mode === 'signup' && signupStep === 1 ? 'Continuer ↗' : mode === 'signup' ? 'Créer mon compte ↗' : 'Envoyer le lien ↗'}</button></form>{mode !== 'reset' && (mode === 'login' || signupStep === 2) && <><div className="auth-divider"><span>ou</span></div><button className="google-button" onClick={() => void googleSignIn()} disabled={busy}><span className="google-mark">G</span> Continuer avec Google</button></>}<div className="auth-links">{mode === 'login' && <><button onClick={() => switchMode('reset')}>Mot de passe oublié ?</button><span>·</span><button onClick={() => switchMode('signup')}>Créer un compte</button></>}{mode === 'signup' && signupStep === 2 && <button onClick={() => setSignupStep(1)}>← Modifier mon identité</button>}{mode !== 'login' && mode !== 'signup' && <button onClick={() => switchMode('login')}>Retour à la connexion</button>}</div></section></div>
}
