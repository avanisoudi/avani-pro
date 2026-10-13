// Évaluation de la force d'un mot de passe. Pure logique, sans dépendance.

export type PasswordLevel = 0 | 1 | 2 | 3 | 4

export type PasswordEvaluation = {
  score: PasswordLevel
  label: string
  checks: {
    length: boolean
    lower: boolean
    upper: boolean
    digit: boolean
    symbol: boolean
  }
}

export const MIN_PASSWORD_LENGTH = 8

// Score minimum accepté pour créer un compte ou changer de mot de passe.
export const MIN_ACCEPTED_SCORE: PasswordLevel = 2

const LABELS: Record<PasswordLevel, string> = {
  0: 'Très faible',
  1: 'Faible',
  2: 'Moyen',
  3: 'Bon',
  4: 'Fort',
}

export function evaluatePassword(password: string): PasswordEvaluation {
  const length = password.length
  const checks = {
    length: length >= MIN_PASSWORD_LENGTH,
    lower: /\p{Ll}/u.test(password),
    upper: /\p{Lu}/u.test(password),
    digit: /\p{Nd}/u.test(password),
    symbol: /[^\p{L}\p{N}]/u.test(password),
  }
  const classes = [checks.lower, checks.upper, checks.digit, checks.symbol].filter(Boolean).length

  let points = 0
  if (checks.length) points++
  if (length >= 12) points++
  if (classes >= 3) points++
  if (classes === 4 || length >= 16) points++

  // Sous 8 caractères, le mot de passe reste faible quel que soit son contenu.
  if (!checks.length) points = Math.min(points, 1)

  const score = Math.min(points, 4) as PasswordLevel
  return { score, label: password ? LABELS[score] : '', checks }
}

export function isAcceptablePassword(password: string): boolean {
  const result = evaluatePassword(password)
  return result.checks.length && result.score >= MIN_ACCEPTED_SCORE
}
