// Isolated server-state fixtures: persistence across actual page reloads, no production writes.
import { chromium } from 'playwright-core'
import bundled from '@sparticuz/chromium'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
await mkdir('.arena/groups-unread', { recursive: true })
const browser = await chromium.launch({ executablePath: await bundled.executablePath(), args: bundled.args.filter(arg => arg !== '--single-process'), headless: true })
const base = process.env.BROWSER_TEST_URL || 'http://localhost:5173'
const me = '00000000-0000-4000-8000-000000000001', otherId = 'other'
const user = { id: me, email: 'read@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: 'Compte de recette' } }
const profile = { id: me, full_name: 'Compte de recette', username: 'recette', avatar_url: null }
const other = { id: otherId, full_name: 'Autre membre', username: 'autre', avatar_url: null }
const chats = ['c1','c2','c3'].map((id, i) => ({ id, title: ['À lire','Déjà lue','Ancienne non lue'][i], is_group: true, created_by: me, updated_at: '2020-01-01T00:00:00Z' }))
const group = (id, name, visibility, owner_id, conversation_id) => ({ id, name, visibility, owner_id, conversation_id, description: 'Une description courte', created_at: '2020-01-01' })
const groups = [group('g1','Avani Pro Officiel','public',me,'c1'),group('g2','À découvrir','public',otherId,'c2'),group('g3','Groupe privé','private',otherId,'c3')]
const marker = { c1: null, c2: '2020-01-01T00:00:09Z', c3: null }
const make = (id, chat, sender, time, body) => ({ id, conversation_id: chat, sender_id: sender, sender: sender === me ? profile : other, created_at: time, body, deleted_at: null })
const messages = [make('r1','c1',otherId,'2020-01-01T00:00:01Z','Premier à lire'),make('r2','c1',otherId,'2020-01-01T00:00:02Z','Dernier à lire'),make('sent','c2',me,'2020-01-01T00:00:01Z','Déjà lu par le destinataire'),...Array.from({ length: 20 }, (_, i) => make(`old-${i}`,'c1',me,`2019-01-01T00:00:${String(i).padStart(2,'0')}Z`,`Historique ${i}`))]
let readCalls = 0, failRead = false
const page = await browser.newPage({ viewport: { width: 1214, height: 900 } })
const errors = []; page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(user => {
  localStorage.setItem('sb-avani-test-auth-token', JSON.stringify({ user, access_token: 'fixture', refresh_token: 'fixture', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer' }))
  document.hasFocus = () => window.__focused !== false
  window.__hidden = sessionStorage.getItem('test-hidden') === 'true'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__hidden ? 'hidden' : 'visible' })
}, user)
await page.route('https://avani-test.supabase.co/**', async route => {
  const req = route.request(), url = new URL(req.url()); let data = []
  if (url.pathname.includes('/auth/')) data = { user }
  else if (url.pathname.endsWith('/rpc/avani_group_member_counts')) data = [{ group_id: 'g1', member_count: 3 },{ group_id: 'g2', member_count: 8 },{ group_id: 'g3', member_count: 2 }]
  else if (url.pathname.endsWith('/rpc/avani_unread_counts')) data = chats.map(chat => ({ conversation_id: chat.id, unread_count: chat.id === 'c3' ? 17 : messages.filter(m => m.conversation_id === chat.id && m.sender_id !== me && (!marker[chat.id] || Date.parse(m.created_at) > Date.parse(marker[chat.id]))).length }))
  else if (url.pathname.endsWith('/rpc/avani_mark_chat_read')) {
    readCalls++
    if (failRead) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Lecture non enregistrée' }) })
    const body = req.postDataJSON(), message = messages.find(m => m.id === body.p_message && m.conversation_id === body.p_chat)
    assert.ok(message)
    if (!marker[body.p_chat] || Date.parse(message.created_at) > Date.parse(marker[body.p_chat])) marker[body.p_chat] = message.created_at
    data = marker[body.p_chat]
  } else if (url.pathname.endsWith('/group_members')) data = [{ role: 'owner', group: groups[0] },{ role: 'member', group: groups[2] }]
  else if (url.pathname.endsWith('/groups')) data = groups.filter(g => g.visibility === 'public').map(g => ({ ...g, group_members: [{ count: g.id === 'g1' ? 3 : 8 }] }))
  else if (url.pathname.endsWith('/conversation_members')) {
    const id = url.searchParams.get('conversation_id')?.slice(3)
    data = url.searchParams.get('select')?.includes('conversation:') ? chats.map(chat => ({ user_id: me, last_read_at: marker[chat.id], conversation: chat, profile })) : [{ user_id: me, last_read_at: marker[id] },{ user_id: otherId, last_read_at: id === 'c2' ? '2020-01-01T00:00:09Z' : null }]
  } else if (url.pathname.endsWith('/profiles')) data = url.searchParams.get('id')?.startsWith('eq.') ? profile : [profile, other]
  else if (url.pathname.endsWith('/messages')) {
    const id = url.searchParams.get('conversation_id')?.slice(3)
    data = messages.filter(m => !id || m.conversation_id === id).sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  }
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
})
const row = title => page.locator('.conversation-row').filter({ has: page.getByText(title, { exact: true }) })
try {
  await page.goto(`${base}/groups`)
  await page.getByText('3 membres', { exact: false }).waitFor()
  assert.equal(await page.locator('.compact-group-card').count(), 3)
  assert.equal(await page.getByRole('heading', { name: 'Avani Pro Officiel', exact: true }).count(), 1)
  assert.equal(await page.getByRole('button', { name: /Créer un groupe/ }).count(), 1)
  assert.equal(await page.locator('.group-shortcuts').count(), 0)
  assert.equal(await page.locator('.compact-group-card').filter({ hasText: 'Groupe privé' }).getByRole('button', { name: 'Inviter', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Privés (1)', exact: true }).click()
  assert.equal(await page.locator('.compact-group-card').count(), 1)
  await page.getByRole('button', { name: 'Publics (2)', exact: true }).click()
  assert.equal(await page.locator('.compact-group-card').count(), 2)
  await page.getByRole('button', { name: 'Tous (3)', exact: true }).click()
  await page.getByRole('textbox', { name: 'Rechercher un groupe', exact: true }).fill('  officiel ')
  assert.equal(await page.locator('.compact-group-card').count(), 1)
  await page.getByRole('textbox', { name: 'Rechercher un groupe', exact: true }).fill('')
  await page.screenshot({ path: '.arena/groups-unread/groups-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: '.arena/groups-unread/groups-mobile.png' })
  await page.setViewportSize({ width: 1214, height: 900 })
  await page.goto(`${base}/messages`)
  await row('À lire').getByLabel('2 messages non lus').waitFor()
  await row('Ancienne non lue').getByLabel('17 messages non lus').waitFor()
  assert.equal(readCalls, 0, 'Inbox must not auto-open/mark the first desktop conversation')
  await page.evaluate(() => sessionStorage.setItem('test-hidden', 'true'))
  await page.goto(`${base}/messages/c1`)
  await page.getByText('Dernier à lire', { exact: true }).waitFor()
  await page.locator('.message-scroll').evaluate(el => el.scrollTop = el.scrollHeight)
  assert.equal(readCalls, 0, 'Hidden thread is not read')
  await page.evaluate(async () => { window.__hidden = false; window.__focused = false; sessionStorage.setItem('test-hidden', 'false'); document.dispatchEvent(new Event('visibilitychange')); await new Promise(requestAnimationFrame) })
  assert.equal(readCalls, 0, 'Visible but unfocused thread is not read')
  await page.evaluate(() => { window.__focused = true; window.dispatchEvent(new Event('focus')) })
  await page.waitForFunction(() => !document.querySelector('.conversation-row.selected .unread-pill'))
  assert.equal(marker.c1, '2020-01-01T00:00:02Z')
  const afterRead = readCalls
  await page.goto(`${base}/messages`)
  await row('Ancienne non lue').getByLabel('17 messages non lus').waitFor()
  assert.equal(await row('À lire').locator('.unread-pill').count(), 0, 'Read persists after reload')
  assert.equal(readCalls, afterRead)
  messages.push(make('new','c1',otherId,'2020-01-01T00:00:03Z','Nouveau à lire'))
  await page.reload()
  await row('À lire').getByLabel('1 messages non lus').waitFor()
  assert.equal(readCalls, afterRead, 'New unread message remains unread until opening')
  await page.goto(`${base}/messages/c2`)
  await page.locator('.message-read-status.is-read[aria-label="Lu"]').waitFor()
  await page.reload()
  await page.locator('.message-read-status.is-read[aria-label="Lu"]').waitFor()
  await page.goto(`${base}/messages/c1`)
  await page.locator('#message-new .message-bubble').waitFor()
  await page.locator('.message-scroll').evaluate(async el => { await new Promise(requestAnimationFrame); el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')) })
  await page.waitForFunction(() => !document.querySelector('.conversation-row.selected .unread-pill'))
  const beforeScroll = readCalls
  await page.locator('.message-scroll').evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')) })
  messages.push(make('scrolled','c1',otherId,'2020-01-01T00:00:04Z','Arrivé pendant lecture historique'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.locator('#message-scrolled .message-bubble').waitFor({ state: 'attached' })
  assert.equal(readCalls, beforeScroll, 'Looking at older messages does not read a new offscreen message')
  await page.locator('.message-scroll').evaluate(async el => { await new Promise(requestAnimationFrame); el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')) })
  await page.waitForFunction(() => !document.querySelector('.conversation-row.selected .unread-pill'))
  assert.equal(marker.c1, '2020-01-01T00:00:04Z')
  messages.push(make('failure','c1',otherId,'2020-01-01T00:00:05Z','Échec à réessayer'))
  failRead = true
  await page.reload()
  await page.locator('#message-failure .message-bubble').waitFor()
  await page.locator('.message-scroll').evaluate(async el => { await new Promise(requestAnimationFrame); el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')) })
  await page.getByRole('alert').filter({ hasText: 'Lecture non enregistrée' }).waitFor()
  assert.equal(marker.c1, '2020-01-01T00:00:04Z', 'Failure does not invent a read marker')
  failRead = false
  await page.evaluate(() => document.querySelector('.messages-note[role=alert] button')?.click())
  await page.waitForFunction(() => !document.querySelector('.conversation-row.selected .unread-pill'))
  assert.equal(marker.c1, '2020-01-01T00:00:05Z')
  assert.deepEqual(errors, [])
  console.log('PASS unified groups/counts/roles and persisted unread/read receipts, hidden/scrolled threads, server failure/retry')
} catch (error) { console.log({ marker, readCalls, errors }); console.log((await page.locator('body').innerText()).slice(-2500)); await page.screenshot({ path: '.arena/groups-unread/failure.png' }); throw error } finally { await browser.close() }
