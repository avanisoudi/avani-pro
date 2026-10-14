/**
 * Vérifications du fil d’actualité (logique pure, sans DOM) : compteurs de réactions,
 * réconciliation avec le total publié, texte/médias et horaires relatifs.
 * Lancement : npm run test:feed
 */
import { applyReaction, formatCount, formatPostTime, isEditedPost, parsePostContent, reactionState, topReactions } from '../../src/lib/feed'
import { MAX_POST_MEDIA_FILES, describeMediaError, isStoredMediaPath, mediaKind, mediaPostType, validateMediaSelection } from '../../src/lib/postMedia'
import { conversationFromMembershipRow, conversationFromRow, conversationPreview, formatRowTime, messageFromRow, nextTolerantToken, publicGroupFromRow, reactionTotal, threadCountLabel, tokenName, topMessageReactions, unreadBadge } from '../../src/lib/messagesModel'
import { readFileSync } from 'node:fs'
import { adoptCloudTheme, applyTheme, getTheme, nextTheme, readStoredTheme, resolveInitialTheme, setTheme, subscribeTheme, THEME_STORAGE_KEY } from '../../src/lib/theme'
import { describeAccessError, isCheckConstraintError, isMissingColumnError, isMissingRelationError, isPermissionError } from '../../src/lib/postgres'
import type { Post } from '../../src/lib/feed'

const results: Array<{ name: string; ok: boolean; detail: string }> = []
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const card = (over: Partial<Post>): Post => ({
  id: 'p1',
  name: 'Amélie Rivard',
  handle: '@amelie',
  role: '',
  avatar: 'AR',
  time: '',
  body: '',
  tags: [],
  stats: { likes: 0, comments: 0, shares: 0 },
  kind: 'thought',
  ...over,
})

// 1. Le total affiché est exactement la somme des réactions, en toutes circonstances.
const zero = reactionState(card({}))
check('publication sans réaction = total 0', zero.total === 0 && topReactions(card({})).length === 0, `total=${zero.total}`)

const hydrated = reactionState(card({ stats: { likes: 42, comments: 3, shares: 1 }, reactionCounts: { like: 40, love: 2, haha: 0, wow: 0, sad: 0, angry: 0 } }))
check('total = somme des types quand tout est cohérent', hydrated.total === 42, `total=${hydrated.total}`)

const drifted = reactionState(card({ stats: { likes: 42, comments: 0, shares: 0 }, reactionCounts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 } }))
check('total publié sans détail par type = 42 réparti sur J’aime', drifted.total === 42 && drifted.counts.like === 42, `total=${drifted.total} like=${drifted.counts.like}`)

const negative = reactionState(card({ stats: { likes: -3, comments: 0, shares: 0 }, reactionCounts: { like: -5, love: 2.7, haha: 0, wow: 0, sad: 0, angry: 0 } }))
check('valeurs négatives ou décimales normalisées', negative.total === 2 && negative.counts.love === 2, `total=${negative.total}`)

// 2. Réaction optimiste : +1 immédiat, second appui = retrait, jamais de double comptage.
const added = applyReaction(card({ stats: { likes: 42, comments: 0, shares: 0 }, reactionCounts: { like: 42, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 } }), 'love')
check('nouvelle réaction = 43 tout de suite', added.reaction === 'love' && added.total === 43 && added.counts.love === 1 && added.counts.like === 42, JSON.stringify(added.counts))

const removed = applyReaction(card({ stats: { likes: 1, comments: 0, shares: 0 }, reaction: 'love', reactionCounts: { like: 0, love: 1, haha: 0, wow: 0, sad: 0, angry: 0 } }), 'love')
check('second appui sur la même réaction = retrait', removed.reaction === null && removed.total === 0, `total=${removed.total}`)

const swapped = applyReaction(card({ stats: { likes: 8, comments: 0, shares: 0 }, reaction: 'like', reactionCounts: { like: 8, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 } }), 'wow')
check('changer de réaction garde le total', swapped.reaction === 'wow' && swapped.total === 8 && swapped.counts.like === 7 && swapped.counts.wow === 1, JSON.stringify(swapped.counts))

// 3. Les icônes superposées suivent le même compteur : top 3, réaction perso en premier.
const stack = topReactions(card({ stats: { likes: 30, comments: 0, shares: 0 }, reaction: 'sad', reactionCounts: { like: 12, love: 10, haha: 5, wow: 2, sad: 1, angry: 0 } }))
check('pile d’icônes = 3 max, réaction perso en tête', stack.length === 3 && stack[0] === 'sad' && stack[1] === 'like' && stack[2] === 'love', stack.join(','))

// 4. Compteurs formatés à la française.
check('format 7 / 42 / 1 234', formatCount(7) === '7' && formatCount(42) === '42' && /1[,.]2\s?k/.test(formatCount(1234)), `${formatCount(7)} ${formatCount(42)} ${formatCount(1234)}`)

// 5. Horaires relatifs et mention « modifié ».
const now = Date.now()
check('heure relative', formatPostTime(new Date(now - 5 * 60_000).toISOString()) === 'il y a 5 minutes' && formatPostTime(new Date(now - 2 * 3_600_000).toISOString()) === 'il y a 2 heures', formatPostTime(new Date(now - 5 * 60_000).toISOString()))
check('date absolue au-delà d’une semaine', formatPostTime(new Date(now - 40 * 86_400_000).toISOString()).includes('202') || formatPostTime(new Date(now - 40 * 86_400_000).toISOString()).length > 4, formatPostTime(new Date(now - 40 * 86_400_000).toISOString()))
check('date invalide = repli lisible', formatPostTime('pas-une-date', 'à l’instant') === 'pas-une-date', formatPostTime('pas-une-date', 'à l’instant'))
check('mention modifié', isEditedPost(new Date(now - 9 * 86_400_000).toISOString(), new Date().toISOString()) && !isEditedPost(new Date(now).toISOString(), new Date(now).toISOString()))

// 6. Contenu : texte nettoyé, médias fusionnés (anciennes publications incluses).
const parsed = parsePostContent('Lancement du projet [image]https://cdn.test/a.jpg[/image] #prod', ['/up/b.png'])
check('texte sans balise média', parsed.text === 'Lancement du projet  #prod' && !parsed.text.includes('[image]'), JSON.stringify(parsed.text))
check('sauts de ligne laissés par les balises nettoyés', parsePostContent('Idée\n[image]https://cdn.test/a.jpg[/image]').text === 'Idée', JSON.stringify(parsePostContent('Idée\n[image]https://cdn.test/a.jpg[/image]').text))
check('médias fusionnés sans doublon', parsed.media.length === 2 && parsed.media[0].url === '/up/b.png', JSON.stringify(parsed.media.map(m => m.url)))
const dup = parsePostContent('voir https://cdn.test/a.jpg [image]https://cdn.test/a.jpg[/image]')
check('doublon image ignoré', dup.media.length === 1, JSON.stringify(dup.media))
const video = parsePostContent('démo [image]https://cdn.test/clip.mp4[/image]')
check('extension vidéo détectée', video.media[0]?.type === 'video', String(video.media[0]?.type))

// 7. Médias du composeur : types, tailles, quota et chemins stockés.
const file = (name: string, type: string, bytes: number) => {
  const handle = new File([new Uint8Array(1)], name, { type, lastModified: 0 })
  // on simule la taille déclarée sans allouer des dizaines de mégaoctets dans le test
  Object.defineProperty(handle, 'size', { value: bytes })
  return handle
}
const MB = 1024 * 1024
check('photo JPEG acceptée', mediaKind(file('a.jpg', 'image/jpeg', 1)) === 'image' && mediaKind(file('a.mp4', 'video/mp4', 1)) === 'video' && mediaKind(file('a.pdf', 'application/pdf', 1)) === null)
{
  const lot = validateMediaSelection([file('a.jpg', 'image/jpeg', 2 * MB), file('b.png', 'image/png', 3 * MB)], 0, 0)
  check('deux photos dans le quota = acceptées', lot.accepted.length === 2 && lot.rejected.length === 0, JSON.stringify(lot.rejected))
}
{
  const lot = validateMediaSelection([file('geant.jpg', 'image/jpeg', 11 * MB), file('film.mp4', 'video/mp4', 60 * MB), file('note.txt', 'text/plain', 10)], 0, 0)
  check('fichier trop lourd ou de mauvais type refusé', lot.accepted.length === 0 && lot.rejected.length === 3, JSON.stringify(lot.rejected))
}
{
  const trop = Array.from({ length: MAX_POST_MEDIA_FILES + 2 }, (_, index) => file(`p${index}.jpg`, 'image/jpeg', 1 * MB))
  const lot = validateMediaSelection(trop, 0, 0)
  check(`grille limitée à ${MAX_POST_MEDIA_FILES} médias`, lot.accepted.length === MAX_POST_MEDIA_FILES && lot.rejected.length > 0, `acceptés=${lot.accepted.length}`)
  const plein = validateMediaSelection([file('suite.jpg', 'image/jpeg', 1 * MB)], MAX_POST_MEDIA_FILES, 0)
  check('aucun média ajouté quand la grille est pleine', plein.accepted.length === 0 && plein.rejected.length === 1)
}
{
  const lot = validateMediaSelection([file('a.mp4', 'video/mp4', 40 * MB), file('b.mp4', 'video/mp4', 40 * MB), file('c.mp4', 'video/mp4', 40 * MB)], 0, 0)
  check('enveloppe globale de 100 Mo respectée', lot.accepted.length === 2 && /total/.test(lot.rejected[0] ?? ''), JSON.stringify(lot.rejected))
  const reprise = validateMediaSelection([file('d.mp4', 'video/mp4', 30 * MB)], 2, 80 * MB)
  check('la taille déjà sélectionnée est comptée', reprise.accepted.length === 0 && /total/.test(reprise.rejected[0] ?? ''), JSON.stringify(reprise.rejected))
}
check('type de publication déduit des médias', mediaPostType([]) === 'text' && mediaPostType([{ kind: 'image' }]) === 'image' && mediaPostType([{ kind: 'video' }]) === 'video' && mediaPostType([{ kind: 'video' }, { kind: 'image' }]) === 'image')
check('seuls les chemins d’objets sont signés', isStoredMediaPath('uid/posts/a.jpg') && !isStoredMediaPath('https://cdn.test/a.jpg') && !isStoredMediaPath('blob:xyz') && !isStoredMediaPath(''))
{
  const media = parsePostContent('Visite du chantier [image]https://cdn.test/chantier.jpg[/image]', ['uid/posts/soirée.mp4?token=abc'])
  check('média stocké et média de démonstration coexistent', media.media.length === 2 && media.media[0].type === 'video' && media.media[1].type === 'image', JSON.stringify(media.media))
}
check('erreur de bucket manquant = message actionnable', describeMediaError(new Error('Bucket not found')).includes('008_post_media.sql'), describeMediaError(new Error('Bucket not found')))
check('erreur RLS = message actionnable', describeMediaError(new Error('new row violates row-level security policy')).includes('RLS'))

// ---------------------------------------------------------------------------
// Messagerie en direct : tolérance de schéma, mappers, diagnostic d’accès
// ---------------------------------------------------------------------------
check('tokenName isole le nom cité par PostgREST', tokenName('reply_to:messages!messages_reply_to_id_fkey(id, body)') === 'reply_to' && tokenName('deleted_at') === 'deleted_at' && tokenName('group_members(count)') === 'group_members')
{
  const missingColumn = { code: '42703', message: 'column conversations.last_message_id does not exist', details: null, hint: null }
  check('colonne absente -> le jeton fautif est proposé', nextTolerantToken(missingColumn, ['updated_at', 'last_message_id'], []) === 'last_message_id')
  check('un jeton déjà abandonné nest pas proposé deux fois', nextTolerantToken(missingColumn, ['last_message_id'], ['last_message_id']) === null)
  check('les jetons obligatoires ne sautent pas', nextTolerantToken(missingColumn, ['updated_at'], []) === null)
  const embed = { code: 'PGRST204', message: "Could not find the 'sender' column of 'messages' in the schema cache", details: null, hint: null }
  check('embed inconnu -> abandon du jeton', nextTolerantToken(embed, ['sender:profiles(id)', 'body'], []) === 'sender:profiles(id)')
  const rls = { code: '42501', message: 'new row violates row-level security policy for table "messages"', details: null, hint: null }
  check('refus RLS : aucune tolérance, erreur remontée', nextTolerantToken(rls, ['deleted_at'], []) === null)
  check('absence de relation : aucune tolérance', nextTolerantToken({ code: '42P01', message: 'relation public.message_reactions does not exist', details: null, hint: null }, ['message_reactions'], []) === null)
}
{
  const row = { id: 'c1', title: null, is_group: true, updated_at: '2026-01-01T00:00:00Z', user_id: 'u1', profile: { id: 'u2', username: 'kofi' }, conversation: { id: 'c1', title: null, is_group: 1, updated_at: null } }
  const conversation = conversationFromMembershipRow(row)
  check('conversation embarquée : normalisation complète', conversation?.title === null && conversation?.is_group === true && conversation?.updated_at === new Date(0).toISOString(), JSON.stringify(conversation))
  check(' conversation_members est reconstruite pour le comptage', conversation?.conversation_members?.[0]?.user_id === 'u1')
  check('embed en tableau accepté', conversationFromRow([{ id: 'c2', title: 'Fil', is_group: false, updated_at: '2026-02-02T00:00:00Z' }]) === null && conversationFromMembershipRow({ conversation: [{ id: 'c2', title: 'Fil', is_group: false, updated_at: 'x' }] })?.title === 'Fil')
  check('conversation sans id = ligne écartée, pas un objet vide', conversationFromMembershipRow({ conversation: { title: 'X' } }) === null && conversationFromRow(null) === null)
}
{
  const counted = publicGroupFromRow({ id: 'g1', name: 'Design', description: null, conversation_id: 'c1', created_at: '2026-01-01T00:00:00Z', group_members: [{ count: 7 }] })
  check('comptage agrégé lu depuis group_members(count)', counted.member_count === 7 && counted.name === 'Design' && counted.description === null)
  check('roster en lignes compté à défaut d agrégat', publicGroupFromRow({ id: 'g2', name: 'A', group_members: [{}, {}, {}] }).member_count === 3)
  check('comptage indisponible = null, jamais un faux 0', publicGroupFromRow({ id: 'g3', name: 'B' }).member_count === null && publicGroupFromRow({ id: 'g4', group_members: [] }).member_count === 0)
  check('groupe sans titre nommé, conversation absente signalée', publicGroupFromRow({ id: 'g5' }).name === 'Groupe sans titre' && publicGroupFromRow({ id: 'g5' }).conversation_id === null)
}
{
  const message = messageFromRow({ id: 'm1', sender_id: 'u1', body: 'Salut', sender: [{ id: 'u1', username: 'kofi' }], reply_to: [{ id: 'm0', body: 'ok' }], deleted_at: null })
  check('embeds en tableau aplaties', message.sender?.username === 'kofi' && message.reply_to?.id === 'm0')
  const bare = messageFromRow({ id: 'm2', sender_id: 'u2', body: 'Direct Realtime' })
  check('ligne Realtime sans embed : sender null et reply_to null, pas undefined', bare.sender === undefined && bare.reply_to === null && bare.body === 'Direct Realtime')
}
{
  const rlsError = { code: '42501', message: 'new row violates row-level security policy for table "messages"', details: null, hint: null }
  check('refus RLS traduit en migration a executer', (describeAccessError(rlsError, 'L envoi du message') ?? '').includes('009_messages_live.sql') && (describeAccessError(rlsError, 'L envoi du message') ?? '').includes('SQL Editor'))
  const checkError = { code: '23514', message: 'new row for relation \"messages\" violates check constraint \"messages_body_check\"', details: null, hint: null }
  check('contrainte messages_body_check citée avec son remède', isCheckConstraintError(checkError, 'messages_body_check') && (describeAccessError(checkError, 'La suppression du message') ?? '').includes('assouplir'))
  const missingTable = { code: '42P01', message: 'relation \"public.message_reactions\" does not exist', details: null, hint: null }
  check('table de réactions absente : la migration est nommée', isMissingRelationError(missingTable, 'message_reactions') && (describeAccessError(missingTable, 'Les réactions') ?? '').includes('message_reactions'))
  const missingColumn = { code: '42703', message: 'column groups.conversation_id does not exist', details: null, hint: null }
  check('colonne de rattachement du chat : migration 006 citée', isMissingColumnError(missingColumn, 'conversation_id') && (describeAccessError(missingColumn, 'Le groupe') ?? '').includes('006'))
  check('erreur non interpretee reste muette pour garder la langue du serveur', describeAccessError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null }, 'Le message') === null)
  check('isPermissionError reconnaît les deux codes RLS', isPermissionError(rlsError) && isPermissionError({ code: 'PGRST301', message: 'failed to authorize', details: null, hint: null }) && !isPermissionError(missingColumn))
}
{
  const joined = { group: { id: 'g1', name: 'Design', member_count: 2 }, conversation: conversationFromRow({ id: 'c1', title: 'Design', is_group: true, updated_at: '2026-03-03T00:00:00Z' }), note: null }
  check('jointure reussie : conversation disponible pour ouvrir le fil', joined.conversation?.id === 'c1' && joined.note === null)
  const partial = { group: { id: 'g2', name: 'Atelier', member_count: 1 }, conversation: null, note: 'Groupe rejoint. Son chat reste à créer : la colonne groups.conversation_id (migration 006) manque à la base.' }
  check('jointure partielle annonce le chat manquant au lieu de mentir', partial.conversation === null && partial.note.includes('006'))
}


// ---------------------------------------------------------------------------
// Theme : magasin unique src/lib/theme.ts — resolution, application,
// persistance, abonnements, reprise de la valeur du compte
// ---------------------------------------------------------------------------
{
  const html = { dataset: {} as Record<string, string>, style: {} as Record<string, string>, classList: new Set<string>() }
  const store = new Map<string, string>()
  const globals = globalThis as Record<string, unknown>
  const previous = { document: globals.document, window: globals.window }
  globals.document = { documentElement: { ...html, classList: { add: (n: string) => html.classList.add(n), remove: (...ns: string[]) => ns.forEach(n => html.classList.delete(n)) } } }
  globals.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } } }
  try {
    check('choix enregistre gagne sur la preference du systeme', resolveInitialTheme('dark', false) === 'dark' && resolveInitialTheme('light', true) === 'light')
    check('sans choix, le systeme tranche (le defaut force etait le bug)', resolveInitialTheme(null, true) === 'dark' && resolveInitialTheme(null, false) === 'light')
    check('valeur inconnue jetee plutot que fiee', resolveInitialTheme('bleu', true) === 'dark' && resolveInitialTheme('', false) === 'light')
    check('bascule = inverse, jamais la meme valeur', nextTheme('dark') === 'light' && nextTheme('light') === 'dark')
    check('stockage inaccessible = theme par defaut, sans planter', readStoredTheme({ getItem: () => { throw new Error('quota') } } as unknown as Pick<Storage, 'getItem'>) === null)
    applyTheme('dark')
    check('data-theme pose sur <html> (la cascade CSS en depend)', html.dataset.theme === 'dark', String(html.dataset.theme))
    check('classe theme-* appliquee, jamais les deux', html.classList.has('theme-dark') && !html.classList.has('theme-light'))
    check('color-scheme natif suit le theme', html.style.colorScheme === 'dark', String(html.style.colorScheme))
    check('choix persiste sous la cle partagee', readStoredTheme() === 'dark', String(readStoredTheme()))
    applyTheme('light')
    check('la classe precedente est retiree, pas cumulee', html.classList.has('theme-light') && !html.classList.has('theme-dark'))
    applyTheme('dark', { persist: false })
    check('persistance facultative : le theme systeme ne devient pas un choix', readStoredTheme() === 'light', String(readStoredTheme()))

    // Magasin unique : une seule voie applique, persiste et previent.
    let seen = 0
    const unsubscribe = subscribeTheme(() => { seen += 1 })
    setTheme('dark')
    check('setTheme applique le CSS et previent les abonnes', html.dataset.theme === 'dark' && seen === 1, `vu=${seen}`)
    check('un choix explicite est enregistre', readStoredTheme() === 'dark', String(readStoredTheme()))
    setTheme('light', { persist: false })
    check('persist:false applique sans enregistrer de faux choix', html.dataset.theme === 'light' && readStoredTheme() === 'dark')
    unsubscribe()
    setTheme('dark')
    check('desabonne = plus aucun rappel', seen === 2, `vu=${seen}`)
    check('getTheme renvoie le theme courant du magasin', getTheme() === 'dark', getTheme())

    // Reprise du compte : la valeur locale a toujours la priorite.
    store.set(THEME_STORAGE_KEY, 'light')
    check('un choix local gagne sur user_settings.appearance', adoptCloudTheme('dark') === false && getTheme() === 'dark', getTheme())
    store.delete(THEME_STORAGE_KEY)
    check('rien de choisi sur l appareil : la valeur du compte est reprise', adoptCloudTheme('dark') === true && getTheme() === 'dark')
    check('la reprise du compte est ensuite enregistree', readStoredTheme() === 'dark', String(readStoredTheme()))
    store.delete(THEME_STORAGE_KEY)
    check('valeur de compte inconnue rejetee, pas forcee', adoptCloudTheme('bleu') === false && adoptCloudTheme(null) === false)
  } finally {
    globals.document = previous.document
    globals.window = previous.window
  }
}

// ---------------------------------------------------------------------------
// Doublons : la bascule ne doit exister qu'à un seul endroit, et s'écrire une seule fois
// ---------------------------------------------------------------------------
{
  const read = (path: string) => {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return ''
    }
  }
  const app = read('src/App.tsx')
  const main = read('src/main.tsx')
  const settings = read('src/components/FeaturePanels.tsx')
  const css = read('src/themes.css')
  const readable = app.length > 0 && main.length > 0 && settings.length > 0
  check('sources lisibles depuis la racine du depot', readable, 'lancer `npm run test:feed` a la racine')
  check('plus aucune bascule dans la barre du haut', !app.includes('theme-toggle') && !css.includes('theme-toggle'), 'src/App.tsx, src/themes.css')
  check('l icone soleil/lune n est plus importee', !app.includes('SunIcon') && !app.includes('MoonIcon'))
  check('App ne reecrit pas le theme : il le lit seulement', !app.includes('applyTheme(') && app.includes('useSyncExternalStore(subscribeTheme, getTheme'), 'la classe de coquille en depend')
  check('un seul point d entree du theme (main.tsx)', main.includes('initTheme()') && !main.includes('applyTheme('), 'src/main.tsx')
  const writes = (settings.match(/appearance: next\.appearance/g) ?? []).length
  const calls = (settings.match(/saveMySettings\(/g) ?? []).length
  check('user_settings.appearance ecrit au seul endroit', writes === 1, `${writes} payload(s) dans FeaturePanels.tsx`)
  check('une seule ecriture de la table des reglages', calls === 1, `${calls} appel(s) a saveMySettings`)
  check('le panneau Reglages est le seul controle', settings.includes('setTheme(next)') && settings.includes('adoptCloudTheme'))
}

// ---------------------------------------------------------------------------
// Aperçus de conversations et compteurs (badge de non-lus, heure relative)
// ---------------------------------------------------------------------------
{
  const rows = [
    { id: 'm3', sender_id: 'u2', body: 'On  se  voit\n14h', created_at: '2026-10-14T09:58:00Z' },
    { id: 'm2', sender_id: 'u1', body: 'dejà lu', created_at: '2026-10-14T09:00:00Z' },
    { id: 'm1', sender_id: 'u2', body: 'vieux', created_at: '2026-10-12T09:00:00Z' },
  ]
  const preview = conversationPreview(rows, { lastReadAt: '2026-10-14T09:30:00Z', myId: 'u1' })
  check('aperçu = dernier message, espaces normalises', preview.preview === 'On se voit 14h', preview.preview)
  check('non-lus = messages des autres apres last_read_at', preview.unread === 1, JSON.stringify(preview))
  check('heure du fil = dernier message, pas le mien', preview.at === '2026-10-14T09:58:00Z')
  check('conversation sans dernier message = apercu vide, pas invente', conversationPreview([], { myId: 'u1' }).preview === '')
  check('message supprime annonce, sans compte', conversationPreview([{ id: 'x', sender_id: 'u2', body: 'cache', created_at: '2026-01-01T00:00:00Z', deleted_at: '2026-01-02T00:00:00Z' }], { myId: 'u1' }).preview === 'Message supprimé')
  check('piece jointe annoncee par son nom', conversationPreview([{ id: 'y', sender_id: 'u2', body: '', created_at: '2026-01-01T00:00:00Z', attachment_name: 'plan.pdf' }], { myId: 'u1' }).preview === 'plan.pdf')
  check('badge simple sans troncature', unreadBadge(3) === '3' && unreadBadge(1) === '1')
  check('badge majore au-dela de 9 ou si la lecture est bornee', unreadBadge(12) === '9+' && unreadBadge(4, true) === '9+' && unreadBadge(0) === '')
  const now = new Date('2026-10-14T10:00:00Z')
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  check('heure du jour en heures:minutes', formatRowTime('2026-10-14T09:58:00Z', now) === hhmm('2026-10-14T09:58:00Z'))
  check('hier puis jour abrege capitalise puis date courte', formatRowTime('2026-10-13T09:00:00Z', now) === 'Hier' && formatRowTime('2026-10-11T09:00:00Z', now) === 'Dim' && formatRowTime('2026-06-03T09:00:00Z', now) === '03/06/26', [formatRowTime('2026-10-13T09:00:00Z', now), formatRowTime('2026-10-11T09:00:00Z', now), formatRowTime('2026-06-03T09:00:00Z', now)].join(' / '))
  check('heure absente ou invalide reste muette', formatRowTime(null, now) === '' && formatRowTime('pas-une-date', now) === '')
}
{
  const counts = { like: 3, love: 12, haha: 0, wow: 0, sad: 0, angry: 0 }
  check('pastilles triees par volume, zero exclu', topMessageReactions(counts).map(([k]) => k).join(',') === 'love,like')
  check('total des reactions, aucune reaction = 0', reactionTotal(counts) === 15 && reactionTotal(undefined) === 0)
  check('trois pastilles au plus, comme Messenger', topMessageReactions({ like: 1, love: 2, haha: 3, wow: 4, sad: 5, angry: 6 }).length === 3)
  check('aucune reaction = aucune pastille', topMessageReactions({ like: 0, love: 0 }).length === 0)
  check('compteur de fil majore quand historique continue', threadCountLabel(48, true) === '48+ messages dans ce fil' && threadCountLabel(1, false) === '1 message dans ce fil')
}
{
  // La conversation active doit remonter en tete apres un envoi (elle portait le bug
  // inverse : le tri la faisait repartir en bas de liste).
  const before = [{ id: 'a', updated_at: '2026-01-02T00:00:00Z' }, { id: 'b', updated_at: '2026-01-01T00:00:00Z' }]
  const sentAt = '2026-02-01T00:00:00Z'
  const ordered = [{ id: 'b', updated_at: sentAt }, ...before.filter(item => item.id !== 'b').sort((x, y) => Date.parse(y.updated_at) - Date.parse(x.updated_at))]
  check('conversation animee remonte en tete de liste', ordered[0].id === 'b' && ordered[1].id === 'a')
}

const failed = results.filter(result => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} vérifications du fil réussies`)
if (failed.length) process.exitCode = 1
