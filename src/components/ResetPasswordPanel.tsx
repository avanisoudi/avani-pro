import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import { isAcceptablePassword, MIN_PASSWORD_LENGTH } from '../lib/passwordStrength'
import { PasswordField } from './PasswordField'

type ResetPasswordPanelProps = {
  onDone: (message: string) => void
  onBack: () => void
}

// Page d'arrivée du lien « mot de passe oublié » envoyé par email.
export function ResetPasswordPanel({ onDone, onBack }: ResetPasswordPanelProps) {
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStatus('invalid')
      return
    }
    const client = requireSupabase()
    let active = true
    client.auth.getSession().then(({ data }) => {
      if (active && data.session) setStatus('ready')
    })
    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (active && session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) setStatus('ready')
    })
    // Sans session après quelques secondes, le lien est expiré ou déjà utilisé.
    const timer = window.setTimeout(() => {
      if (active) setStatus(current => (current === 'checking' ? 'invalid' : current))
    }, 4000)
    return () => {
      active = false
      subscription.subscription.unsubscribe()
      window.clearTimeout(timer)
    }
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!isAcceptablePassword(password)) {
      setError(`Ce mot de passe est trop faible. Utilisez ${MIN_PASSWORD_LENGTH} caractères minimum, avec des majuscules, des chiffres ou des symboles.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setBusy(true)
    try {
      const { error: updateError } = await requireSupabase().auth.updateUser({ password })
      if (updateError) throw updateError
      onDone('Votre mot de passe a été mis à jour. Bienvenue sur Avani Pro !')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Le mot de passe n’a pas pu être modifié. Réessayez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <div className="auth-logo">AV</div>
        <span className="eyebrow">AVANI PRO · ESPACE SÉCURISÉ</span>
        <h2 id="reset-title">Nouveau mot de passe</h2>

        {status === 'checking' && <p className="auth-intro">Vérification de votre lien…</p>}

        {status === 'invalid' && (
          <>
            <p className="auth-intro">Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien depuis la page de connexion.</p>
            <button className="primary-button auth-submit" type="button" onClick={onBack}>Retour à l’accueil</button>
          </>
        )}

        {status === 'ready' && (
          <>
            <p className="auth-intro">Choisissez un mot de passe solide. Vous pourrez ensuite vous connecter avec.</p>
            <form onSubmit={submit}>
              <PasswordField
                label="Nouveau mot de passe"
                value={password}
                onChange={setPassword}
                showStrength
                placeholder={`${MIN_PASSWORD_LENGTH} caractères minimum`}
                autoComplete="new-password"
              />
              <PasswordField
                label="Confirmer le nouveau mot de passe"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Répétez le mot de passe"
                autoComplete="new-password"
                matchWith={password}
              />

              {error && (
                <div className="auth-error" role="alert">
                  <strong>Impossible de continuer</strong>
                  <span>{error}</span>
                </div>
              )}

              <button className="primary-button auth-submit" disabled={busy}>
                {busy ? 'Veuillez patienter…' : 'Enregistrer le mot de passe ↗'}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  )
}
