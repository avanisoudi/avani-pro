import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { createDirectConversation } from '../lib/api'
import { fetchListings, formatListingPrice, listingPayload, MARKET_CATEGORIES, publishListing, setListingStatus, validateListingPhoto, type Listing, type ListingInput } from '../lib/marketplace'

function MarketDialog({ title, children, busy, close }: { title: string; children: ReactNode; busy: boolean; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    dialog?.showModal()
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus() }
  }, [])
  return <dialog className="market-dialog" ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) close() }}>
    <div className="market-dialog-head"><h2>{title}</h2><button type="button" aria-label="Fermer" disabled={busy} onClick={close}>×</button></div>{children}
  </dialog>
}
const emptyInput: ListingInput = { title: '', description: '', price: '', currency: 'EUR', category: 'Autres', condition: 'Bon état', location: '' }
export function MarketplacePanel({ user, onMessage }: { user: User | null; onMessage: (id: string) => void }) {
  const [query, setQuery] = useState(''), [city, setCity] = useState(''), [category, setCategory] = useState('')
  const [mine, setMine] = useState(false), [rows, setRows] = useState<Listing[]>([]), [loading, setLoading] = useState(true)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [revision, setRevision] = useState(0)
  const [offset, setOffset] = useState(0), [hasMore, setHasMore] = useState(false)
  const [createOpen, setCreateOpen] = useState(false), [detail, setDetail] = useState<Listing | null>(null)
  const [input, setInput] = useState<ListingInput>(emptyInput), [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState(''), [busy, setBusy] = useState(false), [dialogError, setDialogError] = useState('')
  const mutation = useRef(false)
  useEffect(() => {
    if (!photo) { setPreview(''); return }
    const url = URL.createObjectURL(photo); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])
  useEffect(() => {
    if (!user) { setLoading(false); return }
    let active = true
    setLoading(true); setError('')
    const timer = window.setTimeout(() => {
      void fetchListings({ mine, userId: user.id, query, category, city, offset }).then(items => {
        if (!active) return
        setRows(current => offset ? [...new Map([...current, ...items].map(item => [item.id, item])).values()] : items)
        setHasMore(items.length === 24)
      }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Impossible de charger les annonces.') })
        .finally(() => { if (active) setLoading(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [user, mine, query, category, city, offset, revision])
  const resetResults = () => { setRows([]); setOffset(0); setHasMore(false); setNotice('') }
  const publish = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user || mutation.current) return
    setDialogError('')
    try { listingPayload(input); if (!photo) throw new Error('Ajoutez une photo de votre article.'); validateListingPhoto(photo) }
    catch (caught) { setDialogError((caught as Error).message); return }
    mutation.current = true; setBusy(true)
    try {
      await publishListing(user.id, input, photo!)
      setCreateOpen(false); setPhoto(null); setInput(emptyInput)
      setMine(true); setQuery(''); setCity(''); setCategory(''); setOffset(0); setRows([]); setRevision(n => n + 1)
      setNotice('Votre annonce est publiée.')
    } catch (caught) { setDialogError((caught as Error).message) }
    finally { mutation.current = false; setBusy(false) }
  }
  const changeStatus = async (status: 'active' | 'sold' | 'removed') => {
    if (!detail || !user || detail.seller_id !== user.id || mutation.current) return
    if (status === 'removed' && !window.confirm('Retirer cette annonce de la Marketplace ?')) return
    mutation.current = true; setBusy(true); setDialogError('')
    try {
      await setListingStatus(detail.id, user.id, status)
      setDetail(null); setRows([]); setOffset(0); setRevision(n => n + 1)
      setNotice(status === 'sold' ? 'Annonce marquée comme vendue.' : status === 'removed' ? 'Annonce retirée.' : 'Annonce remise en vente.')
    } catch (caught) { setDialogError((caught as Error).message) }
    finally { mutation.current = false; setBusy(false) }
  }
  const contact = async () => {
    if (!detail || !user || detail.seller_id === user.id || mutation.current || detail.status !== 'active') return
    mutation.current = true; setBusy(true); setDialogError('')
    try {
      const chat = await createDirectConversation(user.id, detail.seller_id, detail.seller?.full_name || 'Vendeur')
      setDetail(null); onMessage(chat.id)
    } catch (caught) { setDialogError((caught as Error).message) }
    finally { mutation.current = false; setBusy(false) }
  }
  const field = (key: keyof ListingInput, value: string) => setInput(current => ({ ...current, [key]: value }))
  if (!user) return <section className="marketplace"><h1>Marketplace</h1><p>Connectez-vous pour consulter les annonces et contacter les vendeurs.</p></section>
  return <section className="marketplace" aria-label="Marketplace">
    <header className="market-header"><div><span className="market-kicker">ACHETER ET VENDRE ENTRE MEMBRES</span><h1>Marketplace</h1><p>Trouvez votre prochain coup de cœur.</p></div><button className="market-primary" onClick={() => { setDialogError(''); setCreateOpen(true) }}>+ Vendre un article</button></header>
    <div className="market-tabs" aria-label="Annonces"><button aria-pressed={!mine} onClick={() => { if (mine) { resetResults(); setMine(false) } }}>Parcourir</button><button aria-pressed={mine} onClick={() => { if (!mine) { resetResults(); setMine(true) } }}>Mes annonces</button></div>
    <div className="market-filters"><label>Rechercher<input type="search" value={query} maxLength={100} onChange={event => { resetResults(); setQuery(event.target.value) }} placeholder="Que recherchez-vous ?" /></label><label>Catégorie<select value={category} onChange={event => { resetResults(); setCategory(event.target.value) }}><option value="">Toutes les catégories</option>{MARKET_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label><label>Ville<input value={city} maxLength={100} onChange={event => { resetResults(); setCity(event.target.value) }} placeholder="Toutes les villes" /></label><button type="button" onClick={() => { resetResults(); setQuery(''); setCity(''); setCategory(''); setRevision(n => n + 1) }}>Réinitialiser</button></div>
    {notice && <p className="market-notice" role="status">{notice}</p>}
    {error && <div className="market-error" role="alert"><p>{error}</p><button onClick={() => setRevision(n => n + 1)}>Réessayer</button></div>}
    {loading && <p role="status">Chargement des annonces…</p>}
    {!loading && !error && rows.length === 0 && <div className="market-empty"><span aria-hidden="true">▧</span><h2>{query || city || category ? 'Aucun résultat' : mine ? 'Vous n’avez pas encore d’annonce' : 'Les premières annonces arrivent bientôt'}</h2><p>{query || city || category ? 'Essayez une autre recherche ou réinitialisez les filtres.' : 'Publiez un article pour le proposer aux membres Avani Pro.'}</p></div>}
    <div className="market-grid" aria-busy={loading}>{rows.map(item => <button type="button" className="market-card" key={item.id} onClick={() => { setDialogError(''); setDetail(item) }}>
      <div className="market-card-photo">{item.photo_url ? <img src={item.photo_url} alt={item.title} loading="lazy" onError={event => { event.currentTarget.style.visibility = 'hidden' }} /> : <span>Photo indisponible</span>}{item.status === 'sold' && <b>Vendu</b>}</div><div className="market-card-copy"><strong>{formatListingPrice(item.price, item.currency)}</strong><h2>{item.title}</h2><p>{item.location || 'Lieu non renseigné'}</p><small>{item.category}</small></div>
    </button>)}</div>
    {hasMore && !error && <button className="market-more" disabled={loading} onClick={() => setOffset(rows.length)}>Voir plus d’annonces</button>}
    <p className="market-safety">Échangez dans la messagerie. Ne partagez jamais de code de connexion et vérifiez l’article avant de payer. Avani Pro ne gère pas les paiements ni la livraison.</p>
    {createOpen && <MarketDialog title="Vendre un article" busy={busy} close={() => setCreateOpen(false)}><form className="market-form" onSubmit={event => void publish(event)}>
      <p>Une photo, un prix et une ville suffisent pour commencer. Ne publiez pas votre adresse personnelle.</p>
      <label>Photo de l’article<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { validateListingPhoto(file); setPhoto(file); setDialogError('') } catch (caught) { setPhoto(null); setDialogError((caught as Error).message) } }} /></label><small>JPEG, PNG ou WebP · 5 Mo maximum</small>
      {preview && <img className="market-preview" src={preview} alt="Aperçu de l’article" />}
      <label>Titre<input value={input.title} required minLength={2} maxLength={160} disabled={busy} onChange={event => field('title', event.target.value)} /></label>
      <div className="market-price-fields"><label>Prix<input type="text" inputMode="decimal" value={input.price} required maxLength={13} disabled={busy} onChange={event => field('price', event.target.value)} placeholder="0 pour un don" /></label><label>Devise<select value={input.currency} disabled={busy} onChange={event => field('currency', event.target.value)}><option>EUR</option><option>XAF</option><option>USD</option></select></label></div>
      <label>Catégorie<select value={input.category} disabled={busy} onChange={event => field('category', event.target.value)}>{MARKET_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>État<select value={input.condition} disabled={busy} onChange={event => field('condition', event.target.value)}>{['Neuf', 'Comme neuf', 'Bon état', 'À rénover'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Ville<input value={input.location} required maxLength={120} disabled={busy} onChange={event => field('location', event.target.value)} placeholder="Ville uniquement" /></label>
      <label>Description<textarea value={input.description} maxLength={3000} disabled={busy} onChange={event => field('description', event.target.value)} rows={4} /></label>
      {dialogError && <p className="market-error" role="alert">{dialogError}</p>}
      {busy && <p role="status">Publication en cours…</p>}
      <button className="market-primary" disabled={busy} type="submit">{busy ? 'Publication…' : 'Publier l’annonce'}</button>
    </form></MarketDialog>}
    {detail && <MarketDialog title={detail.title} busy={busy} close={() => setDetail(null)}>
      {detail.photo_url ? <img className="market-detail-photo" src={detail.photo_url} alt={detail.title} /> : <p>Photo indisponible</p>}
      <div className="market-detail-copy"><strong className="market-detail-price">{formatListingPrice(detail.price, detail.currency)}</strong><p>{detail.category} · {detail.condition || 'État non renseigné'}</p><p>{detail.location || 'Lieu non renseigné'}</p><p className="market-description">{detail.description || 'Aucune description.'}</p><p>Vendeur : <strong>{detail.seller?.full_name || detail.seller?.username || 'Membre Avani Pro'}</strong></p><p>Publié le {new Date(detail.created_at).toLocaleDateString('fr-FR')}</p>
      {detail.seller_id === user.id ? <div className="market-owner-actions"><button disabled={busy} onClick={() => void changeStatus(detail.status === 'sold' ? 'active' : 'sold')}>{detail.status === 'sold' ? 'Remettre en vente' : 'Marquer comme vendu'}</button><button disabled={busy} onClick={() => void changeStatus('removed')}>Retirer l’annonce</button></div> : <button className="market-primary" disabled={busy || detail.status !== 'active'} onClick={() => void contact()}>{busy ? 'Ouverture…' : 'Contacter le vendeur'}</button>}
      {dialogError && <p role="alert" className="market-error">{dialogError}</p>}</div>
    </MarketDialog>}
  </section>
}
