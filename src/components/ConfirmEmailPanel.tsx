import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'

type ConfirmEmailPanelProps = {
  onDone: (message: string) => void
  onBack: () => void
}

// Page d'arrivée du lien de confirmation d'email envoyé par Supabase.
export function ConfirmEmailPanel({ onDone, onBack }: ConfirmEmailPanelProps) {
  const [status, setStatus] = useState<'checking' | 'confirmed' | 'invalid'>('checking')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStatus('invalid')
      return
    }
    const client = requireSupabase()
    let active = true

    const params = new URLSearchParams(
      window.location.search + window.location.hash.replace(/^#/, '?'),
    )
    const urlError = params.get('error_description') || params.get('error')
    if (urlError) {
      setError(decodeURIComponent(urlError.replace(/\+/g, ' ')))
      setStatus('invalid')
      return
    }

    client.auth.getSession().then(({ data }) => {
      if (active && data.session) setStatus('confirmed')
    })

    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (active && session && (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED')) {
        setStatus('confirmed')
      }
    })

    const timer = window.setTimeout(() => {
      if (active) setStatus((current) => (current === 'checking' ? 'invalid' : current))
    }, 6000)

    return () => {
      active = false
      subscription.subscription.unsubscribe()
      window.clearTimeout(timer)
    }
  }, [])

  const resend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setResent(false)
    if (!email.trim()) {
      setError('Renseignez l’adresse email à confirmer.')
      return
    }
    setResending(true)
    try {
      const { error: resendError } = await requireSupabase().auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/confirm` },
      })
      if (resendError) throw resendError
      setResent(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’email n’a pas pu être renvoyé.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="auth-logo">AV</div>
        <span className="eyebrow">AVANI PRO · ESPACE SÉCURISÉ</span>
        <h2 id="confirm-title">Confirmation de votre email</h2>

        {status === 'checking' && <p className="auth-intro">Vérification de votre lien de confirmation…</p>}

        {status === 'confirmed' && (
          <>
            <p className="auth-intro">
              Votre adresse email est confirmée. Votre compte Avani Pro est maintenant actif.
            </p>
            <button className="primary-button auth-submit" type="button" onClick={() => onDone('Email confirmé. Bienvenue sur Avani Pro !')}>
              Continuer vers Avani Pro ↗
            </button>
          </>
        )}

        {status === 'invalid' && (
          <>
            <p className="auth-intro">
              {error
                ? `Ce lien n’a pas pu être validé : ${error}`
                : 'Ce lien a expiré ou a déjà été utilisé. Vous pouvez demander un nouvel email de confirmation.'}
            </p>
            <form onSubmit={resend}>
              <label className="field">
                <span>Adresse email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="vous@exemple.com"
                  autoComplete="email"
                />
              </label>
              {resent && <p className="auth-intro">Un nouvel email de confirmation a été envoyé.</p>}
              {error && status === 'invalid' && !resent && null}
              <button className="primary-button auth-submit" disabled={resending} type="submit">
                {resending ? 'Veuillez patienter…' : 'Renvoyer l’email de confirmation ↗'}
              </button>
            </form>
            <button className="ghost-button auth-submit" type="button" onClick={onBack}>
              Retour à l’accueil
            </button>
          </>
        )}
      </section>
    </div>
  )
}
