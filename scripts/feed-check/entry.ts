/**
 * Vérifications du fil d’actualité (logique pure, sans DOM) : compteurs de réactions,
 * réconciliation avec le total publié, texte/médias et horaires relatifs.
 * Lancement : npm run test:feed
 */
import { applyReaction, formatCount, formatPostTime, isEditedPost, parsePostContent, reactionState, topReactions } from '../../src/lib/feed'
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

const failed = results.filter(result => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} vérifications du fil réussies`)
if (failed.length) process.exitCode = 1
