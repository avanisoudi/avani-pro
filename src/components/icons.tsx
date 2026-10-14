/** Icônes partagées de l’interface : sprite officiel Avani Pro + badge de vérification. */

export function SvgIcon({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={className ? `svg-icon ${className}` : 'svg-icon'} aria-hidden="true">
      <use href={`/social-icons.svg#${name}`} />
    </svg>
  )
}

export function VerifiedBadge({ type = 'verified' }: { type?: string | null }) {
  const label = type === 'professional' ? 'Compte professionnel vérifié' : type === 'creator' ? 'Créateur vérifié' : 'Compte vérifié'
  return (
    <span className="verified-badge" role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 1.5 12.1 3l2.55-.08 1.02 2.34 2.08 1.5-.72 2.45.72 2.45-2.08 1.5-1.02 2.34-2.55-.08L10 17.5l-2.1-1.5-2.55.08-1.02-2.34-2.08-1.5.72-2.45-.72-2.45 2.08-1.5 1.02-2.34L7.9 3 10 1.5Z" />
        <path className="verified-badge-check" d="m6.3 10.2 2.25 2.2 5.1-5.05" />
      </svg>
    </span>
  )
}

/** Planète « publication publique », affichée à côté de l’heure comme sur Facebook. */
export function GlobeIcon() {
  return (
    <svg className="fpost-globe" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" />
      <ellipse cx="8" cy="8" rx="3" ry="6.4" />
      <path d="M1.9 5.9h12.2M1.9 10.1h12.2" />
    </svg>
  )
}

/** Croix de fermeture (masquer la publication, replier les commentaires). */
export function CloseIcon() {
  return (
    <svg className="fpost-x" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.6 3.6 12.4 12.4M12.4 3.6 3.6 12.4" />
    </svg>
  )
}

/** Horloge affichée devant l’heure de publication. */
export function ClockIcon() {
  return (
    <svg className="fpost-clock" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 4.4V8l2.6 1.6" />
    </svg>
  )
}

/** Entrée de navigation latérale (barre de gauche, barre supérieure, onglets mobiles). */
export function NavButton({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: string; label: string; badge?: string }) {
  return (
    <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>
      <SvgIcon name={icon} />
      {label}
      {badge && <b>{badge}</b>}
    </button>
  )
}
