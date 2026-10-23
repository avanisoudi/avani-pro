// Optional: npm i --no-save --package-lock=false playwright-core @sparticuz/chromium
// Run Vite with VITE_SUPABASE_URL=https://avani-test.supabase.co and VITE_SUPABASE_PUBLISHABLE_KEY=browser-test-only.
// Isolated browser fixtures; no production requests or writes.
import { chromium } from 'playwright-core'
import bundled from '@sparticuz/chromium'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
await mkdir('.arena/chat-settings', { recursive: true })
const base = process.env.BROWSER_TEST_URL || 'http://localhost:5173'
const browser = await chromium.launch({ executablePath: await bundled.executablePath(), args: bundled.args.filter(arg => arg !== '--single-process'), headless: true })
const me = '00000000-0000-4000-8000-000000000001'
const user = { id: me, email: 'settings@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: 'Responsable' } }
const people = Array.from({ length: 9 }, (_, i) => ({ id: i ? `person-${i}` : me, full_name: i ? `Personne ${i}` : 'Responsable', username: `membre${i}`, avatar_url: null, bio: null, verified_type: null }))
try {
  for (const width of [1214, 390]) {
    for (const role of ['owner', 'member', 'direct']) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors = []; const calls = []; let failAdd = false; let failSearch = false
      let roster = people.slice(0, 7)
      const chat = { id: 'fixture-chat', title: 'Équipe de test', is_group: role !== 'direct', created_by: role === 'owner' ? me : people[1].id, updated_at: new Date().toISOString(), avatar_path: null }
      page.on('pageerror', error => errors.push(error.message))
      await page.addInitScript(user => {
        localStorage.setItem('sb-avani-test-auth-token', JSON.stringify({ user, access_token: 'fixture', refresh_token: 'fixture', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer' }))
      }, user)
      await page.route('https://avani-test.supabase.co/**', async route => {
        const req = route.request(); const url = new URL(req.url()); let data = []
        if (url.pathname.includes('/auth/')) data = { user }
        else if (url.pathname.endsWith('/rpc/avani_manage_chat')) {
          const body = req.postDataJSON(); calls.push(body)
          if (failAdd && body.p_action === 'add') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'Ajout refusé par le serveur' }) })
          if (body.p_action === 'add') roster = [...roster, people.find(p => p.id === body.p_target)]
          if (body.p_action === 'rename') chat.title = body.p_title
          if (body.p_action === 'remove') roster = roster.filter(p => p.id !== body.p_target)
          if (body.p_action === 'transfer') chat.created_by = body.p_target
          data = null
        } else if (url.pathname.endsWith('/conversation_members')) {
          if (req.method() !== 'GET') data = null
          else if (url.searchParams.get('select')?.includes('conversation:')) data = [{ user_id: me, last_read_at: null, conversation: chat, profile: people[0] }]
          else data = roster.map(p => ({ user_id: p.id }))
        } else if (url.pathname.endsWith('/profiles')) {
          if (url.searchParams.has('or')) {
            if (failSearch) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'indisponible' }) })
            data = people // Includes existing members deliberately: UI must exclude them.
          } else if (url.searchParams.get('id')?.startsWith('in.')) data = roster
          else data = people[0]
        }
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
      })
      await page.goto(`${base}/messages/fixture-chat`)
      const trigger = page.getByRole('button', { name: 'Paramètres de la discussion', exact: true })
      await trigger.click()
      const dialog = page.getByRole('dialog', { name: 'Paramètres de la discussion', exact: true })
      await dialog.waitFor()
      await page.waitForFunction(() => document.querySelectorAll('.conversation-settings .message-profile-member').length === 7)
      if (width === 390) await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; const shell = document.querySelector('.app-shell'); shell.classList.remove('theme-light'); shell.classList.add('theme-dark') })
      await page.screenshot({ path: `.arena/chat-settings/${role}-${width}.png` })
      const bounds = await dialog.locator('.conversation-settings').boundingBox()
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 901, 'Settings fit viewport vertically')
      const closeButton = dialog.getByRole('button', { name: 'Fermer les paramètres', exact: true })
      assert.ok(await closeButton.evaluate(el => { const r = el.getBoundingClientRect(); return r.y >= 0 && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === el }), 'Close button visible above header and bottom navigation')
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Settings fit the viewport')
      assert.equal(await dialog.locator('.message-profile-member').count(), 7, 'All members visible, not just five')
      await page.keyboard.press('Shift+Tab')
      assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), 'Keyboard stays inside dialog')
      if (role === 'owner') {
        const search = dialog.getByRole('textbox', { name: 'Rechercher une personne', exact: true })
        await search.fill('personne')
        const add = dialog.getByRole('button', { name: 'Ajouter Personne 7 (@membre7)', exact: true })
        await add.waitFor()
        assert.equal(await dialog.getByRole('button', { name: /^Ajouter / }).count(), 2, 'Existing members excluded')
        failAdd = true
        await add.click()
        await dialog.getByRole('alert').filter({ hasText: 'Ajout refusé' }).waitFor()
        assert.equal(await dialog.locator('.message-profile-member').count(), 7, 'Failure does not invent membership')
        failAdd = false
        await add.dblclick()
        await page.waitForFunction(() => document.querySelectorAll('.conversation-settings .message-profile-member').length === 8)
        assert.equal(calls.filter(c => c.p_action === 'add').length, 2, 'Failed request + one successful request, no double-submit')
        assert.equal(calls.at(-1).p_chat, chat.id)
        assert.equal(calls.at(-1).p_target, people[7].id)
        await search.fill('personne')
        await dialog.getByRole('button', { name: 'Ajouter Personne 8 (@membre8)', exact: true }).waitFor()
        assert.equal(await dialog.getByRole('button', { name: /^Ajouter / }).count(), 1, 'Added member excluded on next search')
        failSearch = true
        await search.fill('autre')
        await dialog.getByRole('alert').filter({ hasText: 'Recherche indisponible' }).waitFor()
        assert.equal(await dialog.getByRole('button', { name: /^Ajouter / }).count(), 0, 'Search failure clears stale choices')
        const name = dialog.getByRole('textbox', { name: 'Nom du groupe', exact: true })
        await name.fill('Équipe renommée')
        await dialog.getByRole('button', { name: 'Renommer', exact: true }).click()
        await dialog.getByRole('heading', { name: 'Équipe renommée', exact: true }).waitFor()
        assert.equal(calls.at(-1).p_title, 'Équipe renommée')
        page.once('dialog', d => d.dismiss())
        await dialog.getByRole('button', { name: 'Retirer Personne 1', exact: true }).click()
        assert.equal(calls.filter(c => c.p_action === 'remove').length, 0, 'Cancelled removal sends nothing')
        assert.equal(await dialog.getByRole('button', { name: 'Quitter le groupe', exact: true }).count(), 0, 'Owner must transfer first')
        page.once('dialog', d => d.accept())
        await dialog.getByRole('button', { name: 'Retirer Personne 1', exact: true }).click()
        await page.waitForFunction(() => document.querySelectorAll('.conversation-settings .message-profile-member').length === 7)
        assert.equal(calls.at(-1).p_action, 'remove')
        page.once('dialog', d => d.accept())
        await dialog.getByRole('button', { name: 'Transférer la gestion à Personne 2', exact: true }).click()
        await dialog.getByRole('button', { name: 'Quitter le groupe', exact: true }).waitFor()
        assert.equal(await dialog.getByRole('textbox', { name: 'Rechercher une personne', exact: true }).count(), 0, 'Transfer removes old owner management controls')
        assert.equal(calls.at(-1).p_action, 'transfer')
      } else {
        assert.equal(await dialog.getByRole('textbox', { name: 'Rechercher une personne', exact: true }).count(), 0)
        assert.equal(await dialog.getByRole('button', { name: 'Renommer', exact: true }).count(), 0)
        assert.equal(await dialog.getByRole('button', { name: 'Quitter le groupe', exact: true }).count(), role === 'member' ? 1 : 0)
        assert.equal(calls.length, 0)
      }
      await page.keyboard.press('Escape')
      assert.equal(await dialog.count(), 0)
      assert.ok(await trigger.evaluate(el => document.activeElement === el), 'Closing restores focus')
      assert.deepEqual(errors, [])
      await page.close()
      console.log(`PASS chat settings ${width}px ${role}`)
    }
  }
} finally { await browser.close() }
