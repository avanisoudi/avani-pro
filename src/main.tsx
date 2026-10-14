import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, prefersDarkScheme, readStoredTheme, resolveInitialTheme } from './lib/theme'

// Thème posé avant le premier rendu : sans ça, l'écran s'affiche dans un thème puis saute
// dans l'autre une fois l'application montée.
applyTheme(resolveInitialTheme(readStoredTheme(), prefersDarkScheme()))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
