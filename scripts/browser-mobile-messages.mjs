// Real React layout with isolated Supabase fixtures; no production writes.
import { chromium } from 'playwright-core'
import bundled from '@sparticuz/chromium'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
await mkdir('.arena/mobile-messages', { recursive: true })
const browser = await chromium.launch({ executablePath: await bundled.executablePath(), args: bundled.args.filter(arg => arg !== '--single-process'), headless: true })
const base = process.env.BROWSER_TEST_URL || 'http://localhost:5173'
const me = '00000000-0000-4000-8000-000000000001'
const user = { id: me, email: 'mobile@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: 'Compte de recette' } }
const profile = { id: me, full_name: 'Compte de recette', username: 'recette', avatar_url: null }
const other = { id: 'other', full_name: 'EMMANUEL Agah LOUMACK VONDOU', username: 'emmanuel', avatar_url: null }
const chat = { id: 'mobile-chat', title: 'Avani Pro Officiel', is_group: true, created_by: me, updated_at: new Date().toISOString() }
const messages = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, conversation_id: chat.id, sender_id: i % 2 ? me : other.id, sender: i % 2 ? profile : other, body: i === 18 ? 'Un message très long avec un lien sans espaces : ' + 'https://exemple.test/'.repeat(14) : i % 2 ? 'Salut' : 'Bonjour les amis', created_at: new Date(Date.now() - (20 - i) * 60000).toISOString(), deleted_at: null }))
const page = await browser.newPage()
const errors = []; page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(user => localStorage.setItem('sb-avani-test-auth-token', JSON.stringify({ user, access_token: 'fixture', refresh_token: 'fixture', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer' })), user)
await page.route('https://avani-test.supabase.co/**', async route => {
  const req = route.request(), url = new URL(req.url()); let data = []
  if (url.pathname.includes('/auth/')) data = { user }
  else if (url.pathname.endsWith('/rpc/avani_mark_chat_read')) data = messages.find(message => message.id === req.postDataJSON().p_message)?.created_at
  else if (url.pathname.endsWith('/profiles')) data = url.searchParams.get('id')?.startsWith('eq.') ? profile : [profile, other]
  else if (url.pathname.endsWith('/conversation_members')) {
    if (req.method() !== 'GET') data = null
    else if (url.searchParams.get('select')?.includes('conversation:')) data = [{ user_id: me, conversation: chat, profile }]
    else data = [{ user_id: me, last_read_at: null }, { user_id: other.id, last_read_at: null }]
  } else if (url.pathname.endsWith('/messages')) {
    if (req.method() === 'POST') { const row = { ...req.postDataJSON(), id: 'sent-mobile', created_at: new Date().toISOString(), sender: profile }; messages.push(row); data = row }
    else data = [...messages].reverse()
  }
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
})
try {
  for (const [width, height] of [[360,640],[390,844],[658,604],[740,390],[390,420]]) {
    await page.setViewportSize({ width, height })
    await page.goto(`${base}/messages/mobile-chat`)
    await page.locator('#message-m19').waitFor()
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; const shell = document.querySelector('.app-shell'); shell.classList.remove('theme-light','theme-dark'); shell.classList.add(`theme-${theme}`) }, theme)
      const measure = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON()
        return { header: rect('.topbar'), main: rect('.main-content'), composer: rect('.message-compose'), thread: rect('.thread-head'), scroll: rect('.message-scroll'), bubble: rect('#message-m19 .message-bubble'), nav: getComputedStyle(document.querySelector('.mobile-tabbar')).display, overflow: document.documentElement.scrollWidth > innerWidth }
      })
      assert.ok(Math.abs(measure.thread.top - measure.header.bottom) < 2, `No wasted top gap ${width}/${height}`)
      assert.ok(Math.abs(measure.composer.bottom - height) < 2 && measure.composer.top >= measure.thread.bottom, `Composer fits ${width}/${height}`)
      assert.ok(measure.thread.height <= 74 && measure.scroll.height >= 80, 'Compact header leaves room for messages')
      assert.ok(measure.bubble.width < width / 2, 'Short outgoing message stays compact')
      assert.equal(measure.nav, 'none', 'Navigation does not cover the composer in an open thread')
      assert.equal(measure.overflow, false)
      await page.locator('#message-m19').evaluate(el => el.focus({ preventScroll: true }))
      assert.equal(await page.locator('#message-m19').evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'No full-row purple outline')
      await page.screenshot({ path: `.arena/mobile-messages/${width}-${height}-${theme}.png` })
    }
    await page.locator('.message-compose textarea').fill('Message sur téléphone')
    assert.ok(await page.locator('.message-compose .primary-button').isVisible())
    console.log(`PASS mobile chat ${width}×${height}, both themes`)
  }
  // Resize an already-open thread without reloading (reduced viewport/rotation regression).
  await page.setViewportSize({ width: 390, height: 640 })
  await page.setViewportSize({ width: 390, height: 380 })
  await page.waitForFunction(() => Math.abs(document.querySelector('.message-compose').getBoundingClientRect().bottom - innerHeight) < 2)
  // Return to the list: bottom navigation must be restored, without changing the page route.
  await page.getByRole('button', { name: 'Retour aux discussions', exact: true }).click()
  assert.notEqual(await page.locator('.mobile-tabbar').evaluate(el => getComputedStyle(el).display), 'none')
  const listBounds = await page.locator('.avani-messenger').boundingBox()
  const navBounds = await page.locator('.mobile-tabbar').boundingBox()
  assert.ok(listBounds.y + listBounds.height <= navBounds.y + 1, 'List stays above the navigation')
  assert.deepEqual(errors, [])
} finally { await browser.close() }
