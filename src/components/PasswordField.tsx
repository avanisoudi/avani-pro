import { useId, useState } from 'react'
import '../password.css'
import { evaluatePassword, MIN_ACCEPTED_SCORE, MIN_PASSWORD_LENGTH } from '../lib/passwordStrength'

type PasswordFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  placeholder?: string
  required?: boolean
  // Affiche la jauge de force et la liste des critères (création de compte, nouveau mot de passe).
  showStrength?: boolean
  // Quand défini, affiche si la valeur correspond à ce mot de passe (champ de confirmation).
  matchWith?: string
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}

const LEVEL_CLASS = ['is-0', 'is-1', 'is-2', 'is-3', 'is-4']

export function PasswordField({ label, value, onChange, autoComplete, placeholder, required = true, showStrength = false, matchWith }: PasswordFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const [visible, setVisible] = useState(false)
  const evaluation = evaluatePassword(value)
  const matches = matchWith !== undefined && value.length > 0 && value === matchWith
  const mismatch = matchWith !== undefined && value.length > 0 && value !== matchWith

  const checks: { key: keyof typeof evaluation.checks; text: string }[] = [
    { key: 'length', text: `${MIN_PASSWORD_LENGTH} caractères minimum` },
    { key: 'upper', text: 'Une majuscule' },
    { key: 'lower', text: 'Une minuscule' },
    { key: 'digit', text: 'Un chiffre' },
    { key: 'symbol', text: 'Un symbole (ex. ! ? #)' },
  ]

  return (
    <div className="pw">
      <label htmlFor={id}>{label}</label>
      <div className="pw-field">
        <input
          id={id}
          className="pw-input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={event => onChange(event.target.value)}
          required={required}
          minLength={showStrength || matchWith !== undefined ? MIN_PASSWORD_LENGTH : undefined}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-describedby={showStrength || matchWith !== undefined ? hintId : undefined}
          aria-invalid={mismatch || undefined}
        />
        <button
          type="button"
          className="pw-eye"
          onClick={() => setVisible(current => !current)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={visible}
          title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>

      {showStrength && (
        <div className="pw-strength" id={hintId}>
          <div className="pw-meter" aria-hidden="true">
            {[1, 2, 3, 4].map(step => (
              <span key={step} className={`pw-seg${value && evaluation.score >= step ? ` ${LEVEL_CLASS[evaluation.score]}` : ''}`} />
            ))}
          </div>
          <p className="pw-level" aria-live="polite">
            {value ? (
              <>Force du mot de passe : <strong className={LEVEL_CLASS[evaluation.score]}>{evaluation.label}</strong></>
            ) : (
              <>Saisissez un mot de passe</>
            )}
          </p>
          <ul className="pw-checks">
            {checks.map(item => (
              <li key={item.key} className={evaluation.checks[item.key] ? 'is-ok' : ''}>
                <span aria-hidden="true">{evaluation.checks[item.key] ? '✓' : '○'}</span>
                {item.text}
              </li>
            ))}
          </ul>
          {value && evaluation.score < MIN_ACCEPTED_SCORE && (
            <p className="pw-warning">Ajoutez des majuscules, des chiffres ou des symboles pour le renforcer.</p>
          )}
        </div>
      )}

      {matchWith !== undefined && value.length > 0 && (
        <p id={hintId} className={`pw-match ${matches ? 'is-ok' : 'is-bad'}`} aria-live="polite">
          {matches ? '✓ Les mots de passe correspondent.' : 'Les mots de passe ne correspondent pas encore.'}
        </p>
      )}
    </div>
  )
}
