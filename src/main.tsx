import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTheme } from './lib/theme'

// Thème posé avant le premier rendu : sans ça, l'écran s'affiche dans un thème puis saute
// dans l'autre une fois l'application montée. C'est aussi ici que le magasin du thème se
// branche sur `prefers-color-scheme` — un seul point de départ, aucun doublon dans App.
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
