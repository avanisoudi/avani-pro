import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { requireSupabase } from '../lib/supabase'
import { deletePost } from '../lib/api'

type Overview = { users: number; pages: number; posts: number; reports: number; publications: { id: string; body: string; author: string; created_at: string }[]; signals: { id: string; reason: string; status: string; post_id: string | null }[]; logs: { id: string; action: string; entity_type: string; created_at: string }[] }
export function AdminPanel({ user, onAction }: { user: User | null; onAction: (message: string) => void }) {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'publications' | 'reports' | 'audit'>('publications')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      if (!user) throw new Error('Connectez-vous avec un compte administrateur.')
      const result = await requireSupabase().rpc('avani_admin_overview')
      if (result.error) throw result.error
      setData(result.data as Overview)
    } catch (e) { setError(e instanceof Error ? e.message : (e as { message?: string }).message || 'Console indisponible.'); setData(null) }
    finally { setLoading(false) }
  }, [user])
  useEffect(() => { void load() }, [load])
  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    try { await action(); await load(); onAction('Action enregistrée dans le journal de modération.') }
    catch (e) { onAction(e instanceof Error ? e.message : 'Action refusée par le serveur.') }
    finally { setBusy(false) }
  }
  return <section className="professional-panel admin-console">
    <header className="professional-heading"><div><span className="eyebrow">AVANI PRO · GOUVERNANCE</span><h2>Administration</h2><p>Une vue claire. Des décisions traçables.</p></div><button type="button" className="professional-secondary" disabled={loading || busy} onClick={() => void load()}>Actualiser</button></header>
    {loading && <p role="status">Vérification des droits et lecture des données…</p>}
    {error && <div className="professional-notice" role="alert"><strong>Console non accessible</strong><p>{error}</p><small>Accès réservé aux rôles admin et super_admin. Aucun droit n’est accordé depuis cette interface.</small></div>}
    {data && <>
      <div className="console-metrics">{([['Profils', data.users], ['Pages', data.pages], ['Publications', data.posts], ['À examiner', data.reports]] as const).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value.toLocaleString('fr-FR')}</strong></div>)}</div>
      <nav className="professional-tabs" aria-label="Sections d’administration">{([['publications', 'Publications'], ['reports', 'Signalements'], ['audit', 'Journal des actions']] as const).map(([key, title]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{title}</button>)}</nav>
      {tab === 'publications' && <section className="professional-section"><h3>Modérer les publications</h3><p>Les 50 publications les plus récentes. La suppression est définitive et journalisée.</p><label className="console-search">Rechercher dans cette liste<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Auteur ou texte…" /></label>{data.publications.filter(post => `${post.author} ${post.body}`.toLowerCase().includes(query.toLowerCase())).map(post => <article className="console-row" key={post.id}><div><strong>{post.author || 'Membre'}</strong><small>{new Date(post.created_at).toLocaleString('fr-FR')}</small><p>{post.body.trim() || 'Publication avec médias'}</p></div><button className="professional-delete" type="button" disabled={busy} onClick={() => { if (window.confirm('Supprimer définitivement cette publication et ses commentaires ?')) void act(() => deletePost(post.id, user!.id)) }}>Supprimer</button></article>)}{!data.publications.length && <p>Aucune publication.</p>}</section>}
      {tab === 'reports' && <section className="professional-section"><h3>File de modération</h3>{!data.signals.length && <p>Aucun signalement en attente.</p>}{data.signals.map(signal => <article className="console-row" key={signal.id}><div><strong>{signal.reason}</strong><small>{signal.status}</small>{signal.post_id && <a href={`/?post=${signal.post_id}`}>Ouvrir le fil</a>}</div><button disabled={busy} className="professional-secondary" onClick={() => void act(async () => { const { error } = await requireSupabase().rpc('avani_resolve_report', { p_report: signal.id }); if (error) throw error })}>Marquer traité</button></article>)}</section>}
      {tab === 'audit' && <section className="professional-section"><h3>Journal de traçabilité</h3><p>Les 20 actions les plus récentes, enregistrées côté serveur.</p>{!data.logs.length && <p>Aucune action enregistrée.</p>}{data.logs.map(log => <div className="console-row" key={log.id}><strong>{log.action}</strong><span>{log.entity_type}</span><time>{new Date(log.created_at).toLocaleString('fr-FR')}</time></div>)}</section>}
    </>}
  </section>
}
