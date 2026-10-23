/**
 * Thème de l'application. Le choix est local (localStorage) et, quand l'utilisateur
 * n'a rien choisi, il suit la préférence du système. Le compte peut aussi porter une
 * préférence `appearance` (table `user_settings`), appliquée par le panneau Réglages
 * uniquement au premier branchement : un choix pris sur l'appareil est plus récent.
 */
export type ThemeName = 'light' | 'dark' | 'neon' | 'blue'
export const THEME_STORAGE_KEY = '***'

/** Valeur enregistrée, sinon `null` : ne jamais devancer un vrai choix de l'utilisateur. */
export function readStoredTheme(storage?: Pick<Storage, 'getItem'> | null): string | null {
  const store = storage ?? (typeof window === 'undefined' ? null : window.localStorage)
  if (!store) return null
  try {
    const value = store.getItem(THEME_STORAGE_KEY)
    return value === 'dark' || value === 'light' || value === 'neon' || value === 'blue' ? value : null
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

/**
 * Écrit le thème là où le CSS le regarde : attribut sur `<html>` et préférence de rendu
 * native. `persist: false` sert au démarrage, quand le thème vient du système et non d'un
 * choix : sans ça, le premier rendu inscrirait « l'utilisateur a choisi » et la préférence
 * système ne serait plus jamais suivie.
 */
export function applyTheme(theme: ThemeName, options: { persist?: boolean } = {}) {
  if (typeof document === 'undefined') return
  const baseTheme = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = baseTheme
  document.documentElement.dataset.avaniTheme = theme
  document.documentElement.style.colorScheme = baseTheme
  document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-neon', 'theme-blue')
  document.documentElement.classList.add(`theme-${theme}`)
  if (options.persist === false) return
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

/* ---------------------------------------------------------------------------
 * Magasin unique du thème.
 *
 * Un seul endroit qui applique le CSS, un seul qui écrit dans localStorage, un seul
 * qui écoute le système. Le panneau Réglages est le seul contrôle visible de
 * l'application : la barre du haut n'affiche plus de bascule dupliquée, et l'écriture
 * de `user_settings.appearance` n'existe que dans ce panneau (une seule fois).
 * ------------------------------------------------------------------------- */
let currentTheme: ThemeName | null = null
const themeListeners = new Set<() => void>()

/** Thème courant ; calculé une seule fois si personne ne l'a encore posé. */
export function getTheme(): ThemeName {
  if (!currentTheme) currentTheme = resolveInitialTheme(readStoredTheme(), prefersDarkScheme())
  return currentTheme
}

/** Abonnement, taillé pour `useSyncExternalStore`. Renvoie le désabonnement. */
export function subscribeTheme(listener: () => void) {
  themeListeners.add(listener)
  return () => { themeListeners.delete(listener) }
}

/** Applique, persiste et prévient les abonnés. Ne pas rejouer `applyTheme` à côté. */
export function setTheme(theme: ThemeName, options: { persist?: boolean } = {}) {
  currentTheme = theme
  applyTheme(theme, options)
  for (const listener of themeListeners) listener()
}

/** À appeler une fois, avant le premier rendu : pose le thème et écoute le système. */
export function initTheme(): ThemeName {
  const initial = getTheme()
  // Le choix enregistré est un vrai choix : on le confirme en base de locale. Ce qui vient
  // de `prefers-color-scheme` ne doit surtout pas être enregistré comme un choix.
  setTheme(initial, { persist: Boolean(readStoredTheme()) })
  watchSystemTheme(next => setTheme(next, { persist: false }))
  return initial
}

/**
 * Reprise de la préférence du compte (`user_settings.appearance`), seulement si cet appareil
 * n'a encore rien choisi : un choix pris localement est plus récent que la ligne en base.
 * Renvoie `true` quand la valeur du compte a été retenue.
 */
export function adoptCloudTheme(appearance: unknown): boolean {
  if (readStoredTheme()) return false
  if (appearance !== 'dark' && appearance !== 'light' && appearance !== 'neon' && appearance !== 'blue') return false
  setTheme(appearance)
  return true
}
