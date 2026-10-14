/**
 * Thème de l'application. Le choix est local (localStorage) et, quand l'utilisateur
 * n'a rien choisi, il suit la préférence du système. Le compte peut aussi porter une
 * préférence `appearance` (table `user_settings`), appliquée par le panneau Réglages
 * uniquement au premier branchement : un choix pris sur l'appareil est plus récent.
 */
export type ThemeName = 'light' | 'dark'
export const THEME_STORAGE_KEY = '***'

/** Valeur enregistrée, sinon `null` : ne jamais devancer un vrai choix de l'utilisateur. */
export function readStoredTheme(storage?: Pick<Storage, 'getItem'> | null): string | null {
  const store = storage ?? (typeof window === 'undefined' ? null : window.localStorage)
  if (!store) return null
  try {
    const value = store.getItem(THEME_STORAGE_KEY)
    return value === 'dark' || value === 'light' ? value : null
  } catch {
    return null
  }
}

export function prefersDarkScheme(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

/**
 * Thème initial : le choix enregistré gagne toujours ; à défaut on suit le système.
 * C'est ce qui manquait : l'application démarrait figée sur `light`, même en système sombre.
 */
export function resolveInitialTheme(stored: string | null, prefersDark: boolean): ThemeName {
  if (stored === 'dark' || stored === 'light') return stored
  return prefersDark ? 'dark' : 'light'
}

/** Bascule simple, pour ne pas dupliquer le ternaire à chaque bouton. */
export function nextTheme(current: ThemeName): ThemeName {
  return current === 'dark' ? 'light' : 'dark'
}

/** Écrit le thème là où le CSS le regarde : attribut sur `<html>` et préférence de rendu native. */
export function applyTheme(theme: ThemeName) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.documentElement.classList.remove('theme-light', 'theme-dark')
  document.documentElement.classList.add(`theme-${theme}`)
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* navigation privée ou quota : le choix tient au moins pour la session */
  }
}

/** Suit le système tant qu'aucun choix n'a été enregistré. Renvoie le désabonnement. */
export function watchSystemTheme(onChange: (theme: ThemeName) => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  let media: MediaQueryList
  try {
    media = window.matchMedia('(prefers-color-scheme: dark)')
  } catch {
    return () => {}
  }
  const listener = (event: MediaQueryListEvent) => {
    if (readStoredTheme()) return
    onChange(event.matches ? 'dark' : 'light')
  }
  if (typeof media.addEventListener === 'function') media.addEventListener('change', listener)
  return () => {
    if (typeof media.removeEventListener === 'function') media.removeEventListener('change', listener)
  }
}
