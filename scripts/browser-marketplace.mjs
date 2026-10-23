// Mocked Supabase contract/UI regression. No production writes.
// Optional dependencies: npm i --no-save --package-lock=false playwright-core @sparticuz/chromium
import { chromium } from 'playwright-core'
import bundled from '@sparticuz/chromium'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
await mkdir('.arena/marketplace', { recursive: true })
const browser = await chromium.launch({ executablePath: await bundled.executablePath(), args: bundled.args.filter(arg => arg !== '--single-process'), headless: true })
const base = process.env.BROWSER_TEST_URL || 'http://localhost:5173'
const me = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002'
const user = { id: me, email: 'market@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: 'Compte de recette' } }
const profile = { id: me, full_name: 'Compte de recette', username: 'recette', avatar_url: null }
const seller = { id: other, full_name: 'Vendeuse de recette', username: 'vendeuse' }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ZkAAAAASUVORK5CYII=', 'base64')
let listings = [
  { id: 'bike', seller_id: other, seller, title: 'Vélo de ville', price: 75, currency: 'EUR', category: 'Loisirs', location: 'Lauterbourg', status: 'active', photo_path: `${other}/bike/photo.png` },
  { id: 'desk', seller_id: me, seller: profile, title: 'Bureau en bois', price: 0, currency: 'EUR', category: 'Maison', location: 'Strasbourg', status: 'active', photo_path: `${me}/desk/photo.png` },
].map(row => ({ ...row, description: 'Article de recette, sans vraie transaction.', condition: 'Bon état', created_at: new Date().toISOString() }))
let uploads = 0, inserts = 0, failInsert = false, failLoad = false
const calls = [], errors = []
const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } })
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(user => {
  localStorage.setItem('sb-avani-test-auth-token', JSON.stringify({ user, access_token: 'fixture', refresh_token: 'fixture', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer' }))
}, user)
await page.route('https://avani-test.supabase.co/**', async route => {
  const req = route.request(), url = new URL(req.url()); let data = []
  if (url.pathname.includes('/auth/')) data = { user }
  else if (url.pathname.endsWith('/rpc/avani_create_chat')) { calls.push(req.postDataJSON()); data = 'seller-chat' }
  else if (url.pathname.endsWith('/conversations')) data = { id: 'seller-chat', title: seller.full_name, is_group: false, created_by: me, updated_at: new Date().toISOString() }
  else if (url.pathname.endsWith('/marketplace_listings')) {
    if (req.method() === 'POST') {
      inserts++
      if (failInsert) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'Publication refusée par le serveur' }) })
      listings.unshift({ ...req.postDataJSON(), seller: profile, created_at: new Date().toISOString() }); data = null
    } else if (req.method() === 'PATCH') {
      const id = url.searchParams.get('id').slice(3), body = req.postDataJSON()
      const item = listings.find(row => row.id === id && row.seller_id === me)
      if (item) { Object.assign(item, body); data = { id } }
      else return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Accès refusé' }) })
    } else {
      if (failLoad) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Catalogue indisponible' }) })
      const query = url.searchParams.get('or')?.match(/title.ilike.%([^%]*)%/)?.[1]?.toLowerCase()
      data = listings.filter(row => (!url.searchParams.get('seller_id') || row.seller_id === me) &&
        (url.searchParams.get('status') === 'eq.active' ? row.status === 'active' : row.status !== 'removed') &&
        (!query || row.title.toLowerCase().includes(query)) &&
        (!url.searchParams.get('category') || row.category === url.searchParams.get('category').slice(3)))
      const offset = Number(url.searchParams.get('offset') || 0)
      data = data.slice(offset, offset + Number(url.searchParams.get('limit') || 24))
    }
  } else if (url.pathname.includes('/storage/v1/object/sign/')) data = req.postDataJSON().paths.map(path => ({ path, signedURL: `/object/public/marketplace-photos/${path}` }))
  else if (url.pathname.includes('/storage/v1/object/')) {
    if (req.method() === 'GET') return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" fill="#d6e8f1"/><rect x="100" y="90" width="300" height="280" rx="25" fill="#7fabc1"/><text x="250" y="425" text-anchor="middle" font-family="Arial" font-size="24" fill="#203950">Photo de recette</text></svg>` })
    if (req.method() === 'POST') uploads++
    data = { Key: url.pathname }
  } else if (url.pathname.endsWith('/profiles')) data = url.searchParams.get('id')?.startsWith('eq.') ? profile : [profile, seller]
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
})
try {
  await page.goto(`${base}/marketplace`)
  await page.getByRole('heading', { name: 'Vélo de ville', exact: true }).waitFor()
  assert.equal(await page.locator('.market-card').count(), 2)
  assert.ok(await page.getByText('Gratuit', { exact: true }).isVisible())
  await page.getByRole('searchbox', { name: 'Rechercher', exact: true }).fill('inexistant')
  await page.getByRole('heading', { name: 'Aucun résultat', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click()
  await page.getByRole('heading', { name: 'Vélo de ville', exact: true }).waitFor()
  await page.getByRole('combobox', { name: 'Catégorie', exact: true }).selectOption('Maison')
  await page.waitForFunction(() => document.querySelectorAll('.market-card').length === 1)
  await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click()
  await page.getByRole('heading', { name: 'Vélo de ville', exact: true }).click()
  await page.getByRole('button', { name: 'Contacter le vendeur', exact: true }).click()
  await page.waitForURL('**/messages/seller-chat')
  assert.deepEqual(calls[0].p_members, [other]); assert.equal(calls[0].p_group, false)
  await page.goto(`${base}/marketplace`)
  await page.getByRole('button', { name: '+ Vendre un article', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Vendre un article', exact: true })
  await dialog.getByLabel('Photo de l’article', { exact: true }).setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') })
  await dialog.getByRole('alert').waitFor()
  await dialog.getByLabel('Photo de l’article', { exact: true }).setInputFiles({ name: 'article.png', mimeType: 'image/png', buffer: png })
  await dialog.getByLabel('Titre', { exact: true }).fill('Lampe de bureau')
  await dialog.getByLabel('Prix', { exact: true }).fill('12,50')
  await dialog.getByLabel('Ville', { exact: true }).fill('Lauterbourg')
  await dialog.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit() })
  await page.getByRole('heading', { name: 'Lampe de bureau', exact: true }).waitFor()
  assert.equal(uploads, 1); assert.equal(inserts, 1)
  assert.equal(listings[0].price, 12.5)
  assert.ok(listings[0].photo_path.startsWith(`${me}/${listings[0].id}/`))
  await page.getByRole('button', { name: 'Mes annonces', exact: true }).click() // Already selected must not clear results.
  assert.equal(await page.locator('.market-card').count(), 2)
  await page.reload()
  await page.getByRole('heading', { name: 'Lampe de bureau', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Contacter le vendeur', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Marquer comme vendu', exact: true }).click()
  await page.getByText('Annonce marquée comme vendue.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Mes annonces', exact: true }).click()
  await page.getByRole('heading', { name: 'Lampe de bureau', exact: true }).click()
  await page.getByRole('button', { name: 'Remettre en vente', exact: true }).click()
  await page.getByText('Annonce remise en vente.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Parcourir', exact: true }).click()
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; const shell = document.querySelector('.app-shell'); shell.classList.remove('theme-light','theme-dark'); shell.classList.add(`theme-${theme}`) }, theme)
      await page.getByRole('heading', { name: 'Vélo de ville', exact: true }).waitFor()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow ${width}/${theme}`)
      await page.screenshot({ path: `.arena/marketplace/${theme}-${width}.png` })
    }
  }
  failLoad = true
  await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Catalogue indisponible' }).waitFor()
  failLoad = false
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await page.getByRole('heading', { name: 'Vélo de ville', exact: true }).waitFor()
  await page.getByRole('button', { name: '+ Vendre un article', exact: true }).click()
  await dialog.getByLabel('Photo de l’article', { exact: true }).setInputFiles({ name: 'article.png', mimeType: 'image/png', buffer: png })
  await dialog.getByLabel('Titre', { exact: true }).fill('Publication à refuser')
  await dialog.getByLabel('Prix', { exact: true }).fill('10')
  await dialog.getByLabel('Ville', { exact: true }).fill('Paris')
  failInsert = true
  await dialog.getByRole('button', { name: 'Publier l’annonce', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'Publication refusée' }).waitFor()
  assert.equal(await dialog.getByLabel('Titre', { exact: true }).inputValue(), 'Publication à refuser')
  assert.equal(listings.some(row => row.title === 'Publication à refuser'), false)
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()
  listings = Array.from({ length: 26 }, (_, i) => ({ ...listings.find(item => item.id === 'bike'), id: `page-${i}`, title: `Article paginé ${i}` }))
  await page.getByRole('button', { name: 'Parcourir', exact: true }).click()
  await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.market-card').length === 24)
  await page.getByRole('button', { name: 'Voir plus d’annonces', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.market-card').length === 26)
  assert.equal(new Set(await page.locator('.market-card h2').allTextContents()).size, 26)
  listings = []
  await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click()
  await page.getByRole('heading', { name: 'Les premières annonces arrivent bientôt', exact: true }).waitFor()
  assert.equal(await page.locator('.market-card').count(), 0, 'Empty database never becomes a demo catalog')
  assert.deepEqual(errors, [])
  console.log('PASS Marketplace: filters, seller contact, photo validation, persisted creation, double-submit, own status, errors/retry, mobile/desktop light/dark')
} finally { await browser.close() }
