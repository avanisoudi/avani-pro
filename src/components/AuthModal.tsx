import { useState } from 'react'
import type { FormEvent } from 'react'
import { requireSupabase } from '../lib/supabase'

type AuthMode = 'login' | 'signup' | 'reset'
type AuthModalProps = { onClose: () => void; onSuccess: (message: string) => void }

export function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setError('')
    setPassword('')
    setConfirmPassword('')
  }

  const googleSignIn = async () => {
    setError('')
    setBusy(true)
    try {
      const { error: oauthError } = await requireSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (oauthError) throw oauthError
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La connexion Google n’est pas disponible pour le moment.')
    } finally {
      setBusy(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    if (mode === 'signup') {
      if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
        setError('Renseignez votre prénom, votre nom et votre téléphone.')
        return
      }
      if (password.length < 8) {
        setError('Choisissez un mot de passe de 8 caractères minimum.')
        return
      }
      if (password !== confirmPassword) {
        setError('Les deux mots de passe ne correspondent pas.')
        return
      }
    }

    setBusy(true)
    try {
      const client = requireSupabase()

      if (mode === 'reset') {
        const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (resetError) throw resetError
        onSuccess('Si cette adresse possède un compte, vous recevrez un lien de réinitialisation.')
        onClose()
        return
      }

      if (mode === 'signup') {
        const fullName = `${firstName.trim()} ${lastName.trim()}`
        const username = `${firstName}${lastName}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9_]/g, '')
          .slice(0, 24) || undefined
        const { data, error: signUpError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, username, phone: phone.trim() },
          },
        })
        if (signUpError) throw signUpError
        onSuccess(data.session
          ? 'Votre compte Avani Pro est créé. Bienvenue !'
          : 'Compte créé. Consultez votre email et confirmez votre adresse pour activer votre compte.')
        onClose()
        return
      }

      const { error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) throw signInError
      onSuccess('Connexion réussie. Bon retour sur Avani Pro !')
      onClose()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Une erreur est survenue.'
      if (message.includes('User already registered')) {
        setError('Cette adresse email possède déjà un compte. Connectez-vous ou utilisez une autre adresse.')
      } else if (message.includes('Invalid login credentials')) {
        setError('Email ou mot de passe incorrect. Vérifiez vos informations puis réessayez.')
      } else if (message.includes('Supabase n’est pas configuré')) {
        setError('La connexion au service de comptes n’est pas configurée. Réessayez plus tard ou contactez l’administrateur.')
      } else {
        setError(message)
      }
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'login'
    ? 'Ravi de vous revoir.'
    : mode === 'signup'
      ? 'Rejoignez Avani Pro.'
      : 'Réinitialiser le mot de passe'
  const intro = mode === 'login'
    ? 'Connectez-vous pour retrouver votre réseau.'
    : mode === 'signup'
      ? 'Créez votre compte et commencez à développer votre réseau.'
      : 'Entrez votre email pour recevoir un lien sécurisé.'

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" onClick={onClose} aria-label="Fermer" disabled={busy}>×</button>
        <div className="auth-logo">AV</div>
        <span className="eyebrow">AVANI PRO · ESPACE SÉCURISÉ</span>
        <h2 id="auth-title">{title}</h2>
        <p className="auth-intro">{intro}</p>

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <div className="form-grid">
              <label>
                Prénom
                <input value={firstName} onChange={event => setFirstName(event.target.value)} required placeholder="Alex" autoComplete="given-name" />
              </label>
              <label>
                Nom
                <input value={lastName} onChange={event => setLastName(event.target.value)} required placeholder="Morgan" autoComplete="family-name" />
              </label>
            </div>
          )}

          {mode === 'signup' && (
            <label>
              Téléphone
              <input value={phone} onChange={event => setPhone(event.target.value)} required placeholder="+1 555 123 4567" autoComplete="tel" />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
              placeholder="vous@entreprise.com"
              autoComplete="email"
            />
          </label>

          {mode !== 'reset' && (
            <label>
              Mot de passe
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                  minLength={8}
                  placeholder={mode === 'signup' ? '8 caractères minimum' : 'Votre mot de passe'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(value => !value)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </label>
          )}

          {mode === 'signup' && (
            <label>
              Confirmer le mot de passe
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                placeholder="Répétez le mot de passe"
                autoComplete="new-password"
              />
            </label>
          )}

          {error && (
            <div className="auth-error" role="alert">
              <strong>Impossible de continuer</strong>
              <span>{error}</span>
            </div>
          )}

          <button className="primary-button auth-submit" disabled={busy}>
            {busy
              ? 'Veuillez patienter…'
              : mode === 'login'
                ? 'Se connecter ↗'
                : mode === 'signup'
                  ? 'Créer mon compte ↗'
                  : 'Envoyer le lien ↗'}
          </button>
        </form>

        {mode !== 'reset' && (
          <>
            <div className="auth-divider"><span>ou</span></div>
            <button className="google-button" onClick={() => void googleSignIn()} disabled={busy}>
              <span className="google-mark">G</span> Continuer avec Google
            </button>
          </>
        )}

        <div className="auth-links">
          {mode === 'login' && (
            <>
              <button onClick={() => switchMode('reset')}>Mot de passe oublié ?</button>
              <span>·</span>
              <button onClick={() => switchMode('signup')}>Créer un compte</button>
            </>
          )}
          {mode === 'signup' && <button onClick={() => switchMode('login')}>Déjà inscrit ? Se connecter</button>}
          {mode === 'reset' && <button onClick={() => switchMode('login')}>Retour à la connexion</button>}
        </div>
      </section>
    </div>
  )
}
