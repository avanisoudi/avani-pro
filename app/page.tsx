const services = [
  { number: '01', title: 'Stratégie & conseil', text: 'Clarifier votre vision, révéler vos priorités et tracer une feuille de route qui fait avancer votre activité.' },
  { number: '02', title: 'Identité de marque', text: 'Donner à votre entreprise une présence singulière, cohérente et mémorable sur tous vos supports.' },
  { number: '03', title: 'Expériences digitales', text: 'Concevoir des sites et outils élégants, utiles et pensés pour transformer chaque visite en opportunité.' },
]

export default function Page() {
  return (
    <main className="site-shell">
      <nav className="nav container" aria-label="Navigation principale">
        <a className="brand" href="#top" aria-label="Avani Pro, accueil"><span>avani</span><b>pro</b></a>
        <div className="nav-links">
          <a href="#expertise">Notre expertise</a>
          <a href="#methode">Notre méthode</a>
          <a href="#contact">Contact</a>
        </div>
        <a className="nav-cta" href="#contact">Parlons de votre projet <span aria-hidden="true">↗</span></a>
      </nav>

      <section className="hero container" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-line" /> Agence conseil & création</p>
          <h1>Donner de la <em>valeur</em><br />à vos ambitions.</h1>
          <p className="hero-text">Avani Pro accompagne les entreprises qui veulent faire mieux, avec plus de clarté, de sens et d&apos;impact.</p>
          <div className="hero-actions">
            <a className="button button-dark" href="#contact">Découvrir notre approche <span aria-hidden="true">↗</span></a>
            <a className="text-link" href="#expertise">Voir nos expertises <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <div className="hero-art" aria-label="Illustration abstraite représentant la croissance" role="img">
          <div className="sun" />
          <div className="arch arch-one" /><div className="arch arch-two" /><div className="arch arch-three" />
          <div className="art-note">La différence<br /><strong>se construit.</strong></div>
          <div className="art-number">01 <span>—</span> 03</div>
        </div>
      </section>

      <section className="trust-bar"><div className="container trust-inner"><span>Ils nous font confiance</span><strong>Maison Lune</strong><strong>atelier nord</strong><strong>ORIGIN</strong><strong>unéo</strong><strong>Studio 17</strong></div></section>

      <section className="expertise container" id="expertise">
        <div className="section-intro"><p className="eyebrow"><span className="eyebrow-line" /> Ce que nous faisons</p><h2>De l&apos;idée juste<br /><em>à l&apos;impact réel.</em></h2></div>
        <div className="service-list">{services.map((service) => <article className="service" key={service.number}><span className="service-number">{service.number}</span><div><h3>{service.title}</h3><p>{service.text}</p></div><span className="service-arrow" aria-hidden="true">↗</span></article>)}</div>
      </section>

      <section className="method" id="methode"><div className="container method-grid"><div><p className="eyebrow light"><span className="eyebrow-line" /> Notre conviction</p><h2>Les belles idées<br /><em>méritent d&apos;aller loin.</em></h2></div><div className="method-copy"><p>Nous croyons aux collaborations simples, aux choix audacieux et aux résultats qui durent. Chaque projet commence par une écoute attentive et se construit avec exigence.</p><a className="button button-light" href="#contact">En savoir plus <span aria-hidden="true">↗</span></a></div></div></section>

      <section className="contact container" id="contact"><div><p className="eyebrow"><span className="eyebrow-line" /> Un projet en tête ?</p><h2>Faisons quelque chose<br /><em>de remarquable.</em></h2></div><a className="contact-mail" href="mailto:bonjour@avanipro.fr">bonjour@avanipro.fr <span aria-hidden="true">↗</span></a></section>
      <footer className="footer container"><a className="brand" href="#top"><span>avani</span><b>pro</b></a><p>© 2026 Avani Pro. Tous droits réservés.</p><p>Paris · France</p></footer>
    </main>
  )
}
