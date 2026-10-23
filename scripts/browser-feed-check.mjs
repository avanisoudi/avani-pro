// Browser regression: isolated Supabase responses, no production writes or credentials.
// Start Vite with VITE_SUPABASE_URL=https://avani-test.supabase.co
// and VITE_SUPABASE_PUBLISHABLE_KEY=browser-test-only, then run this script.
// Optional browser dependencies: npm i --no-save --package-lock=false playwright-core @sparticuz/chromium
import { chromium } from 'playwright-core'
import bundledChromium from '@sparticuz/chromium'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const base = process.env.BROWSER_TEST_URL || 'http://localhost:5173'
const captureOnly = process.env.CAPTURE_ONLY === '1'
const dir = process.env.SCREENSHOT_DIR || '.arena/feed-check'
await mkdir(dir, { recursive: true })
const browser = await chromium.launch({ executablePath: await bundledChromium.executablePath(), args: bundledChromium.args, headless: true })
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: 'Compte de recette' } }
const profile = { ...user, full_name: 'Compte de recette', username: 'recette', avatar_url: null, followers_count: 0, following_count: 0 }
let savedPost = null
let uploaded = []
let rejectAlbum = false
let postWrites = 0
let deletedUploads = 0
const page = await browser.newPage({ viewport: { width: 1214, height: 1295 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(({ user }) => {
  localStorage.setItem('sb-avani-test-auth-token', JSON.stringify({ access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user }))
  localStorage.setItem('avani-theme', 'light')
}, { user })
await page.route('https://fixtures.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#304691"/><stop offset="1" stop-color="#e5a4ad"/></linearGradient></defs><path fill="url(#g)" d="M0 0h800v600H0z"/><text x="60" y="290" fill="white" font-size="56">Photo ${route.request().url().split('/').pop()}</text></svg>` }))
await page.route('https://avani-test.supabase.co/**', async route => {
  const req = route.request(), url = new URL(req.url())
  let data = []
  if (url.pathname.includes('/auth/')) data = { user }
  else if (url.pathname.includes('/storage/v1/object/sign/')) {
    const body = req.postDataJSON()
    data = body.paths.map(path => ({ path, signedURL: `/object/public/post-media/${path}` }))
  } else if (url.pathname.includes('/storage/v1/object/')) {
    if (req.method() === 'GET') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ZkAAAAASUVORK5CYII=', 'base64') })
    if (req.method() === 'POST') uploaded.push(url.pathname)
    if (req.method() === 'DELETE') deletedUploads += req.postDataJSON().prefixes?.length || 0
    data = { Key: url.pathname }
  } else if (url.pathname.endsWith('/profiles')) data = url.searchParams.get('id')?.startsWith('eq.') ? profile : Array.from({ length: 4 }, (_, i) => ({ ...profile, id: `contact-${i}`, full_name: `Contact de recette ${i + 1}`, username: `contact${i}` }))
  else if (url.pathname.endsWith('/posts')) {
    if (req.method() === 'POST') {
      postWrites++
      if (rejectAlbum) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST204', message: "Could not find the 'media_paths' column of 'posts' in the schema cache" }) })
      savedPost = req.postDataJSON(); data = { ...savedPost, id: 'new-post', created_at: new Date().toISOString() } }
    else data = [{ id: 'fixture-post', body: 'Un texte et plusieurs photos dans une seule publication.\nChaque photo doit rester accessible. #Album', post_type: 'image', created_at: new Date().toISOString(), media_paths: Array.from({ length: 5 }, (_, i) => `https://fixtures.test/${i + 1}.svg`), author: profile }, ...(savedPost ? [{ ...savedPost, id: 'new-post', created_at: new Date().toISOString(), author: profile }] : [])]
  }
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
})
try {
  await page.goto(base)
  await page.locator('.fpost-media').first().waitFor()
  await page.screenshot({ path: `${dir}/desktop.png`, fullPage: true })
  if (!captureOnly) {
    assert.equal(await page.locator('.fpost-media').first().locator('figure').count(), 3)
    await page.getByRole('button', { name: 'Voir les 5 médias de la publication' }).click()
    await page.getByRole('dialog', { name: 'Album de la publication' }).waitFor()
    assert.match(await page.locator('.post-gallery-counter').innerText(), /3 \/ 5/)
    await page.keyboard.press('ArrowRight')
    assert.match(await page.locator('.post-gallery-counter').innerText(), /4 \/ 5/)
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').count(), 0)
    await page.getByRole('textbox', { name: 'Contenu de la publication' }).fill('Texte accompagnant mes cinq photos')
    const selectFive = () => page.locator('.fcomposer input[type=file]').evaluate(input => {
      const transfer = new DataTransfer()
      for (let i = 0; i < 5; i++) transfer.items.add(new File(['fixture image'], `photo-${i}.png`, { type: 'image/png', lastModified: 42 }))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await selectFive()
    await selectFive()
    assert.equal(await page.locator('.fcomposer-media li:not(:has(.fcomposer-add))').count(), 5)
    await page.locator('.fcomposer').evaluate(form => { form.requestSubmit(); form.requestSubmit() })
    await page.waitForFunction(() => document.querySelector('.fcomposer-field textarea')?.value === '')
    assert.equal(savedPost.body, 'Texte accompagnant mes cinq photos')
    assert.equal(savedPost.media_paths.length, 5)
    assert.equal(uploaded.length, 5)
    assert.equal(postWrites, 1, 'Rapid repeated submissions do not create duplicate posts')
    assert.equal(await page.getByText('Avani Pro Premium', { exact: true }).count(), 1)
    assert.deepEqual(savedPost.media_paths, uploaded.map(path => path.split('/post-media/')[1]), 'Selection order preserved in persisted paths')
    await page.reload()
    await page.getByText('Texte accompagnant mes cinq photos', { exact: true }).waitFor()
  }
  for (const width of [1214, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    const measure = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, main: document.querySelector('.stories-section').getBoundingClientRect().toJSON(), rail: document.querySelector('.right-rail > .rail-card').getBoundingClientRect().toJSON() }))
    assert.ok(measure.scroll <= width, `Horizontal overflow at ${width}: ${measure.scroll}`)
    if (width <= 1100 && width >= 761) assert.equal(await page.locator('.app-shell').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length), 2, 'No ghost third column on tablet')
    await page.screenshot({ path: `${dir}/layout-${width}.png` })
    if (width === 1214 && !captureOnly) assert.ok(Math.abs(measure.main.y - measure.rail.y) < 2, 'Main and rail share top alignment')
    console.log(`PASS layout ${width}px`)
  }
  await page.screenshot({ path: `${dir}/mobile.png`, fullPage: true })
  if (!captureOnly) {
    await page.getByRole('button', { name: 'Voir les 5 médias de la publication' }).first().click()
    await page.getByRole('button', { name: 'Média suivant' }).click()
    assert.match(await page.locator('.post-gallery-counter').innerText(), /4 \/ 5/)
    await page.getByRole('button', { name: 'Fermer l’album' }).click()
    rejectAlbum = true
    const writesBefore = postWrites
    await page.getByRole('textbox', { name: 'Contenu de la publication' }).fill('Brouillon conservé si la base refuse mon album')
    await page.locator('.fcomposer input[type=file]').setInputFiles([{ name: 'retry.png', mimeType: 'image/png', buffer: Buffer.from('fixture') }])
    await page.getByRole('button', { name: 'Publier', exact: true }).click()
    await page.getByText('Album non publié', { exact: false }).waitFor()
    assert.equal(postWrites - writesBefore, 1, 'No silent single-photo fallback insert')
    assert.ok(deletedUploads >= 1, 'Failed upload cleaned up')
    assert.equal(await page.getByRole('textbox', { name: 'Contenu de la publication' }).inputValue(), 'Brouillon conservé si la base refuse mon album')
    assert.equal(await page.locator('.fcomposer-media li:not(:has(.fcomposer-add))').count(), 1)
  }
  assert.deepEqual(errors, [])
  console.log(captureOnly ? 'Baseline captured' : 'PASS album, keyboard, five uploads + text, persistence reload, failed-album preservation, duplicate selection/submission protection, responsive layout')
} catch (error) { console.log('Browser errors:', errors); console.log((await page.locator('body').innerText()).slice(0, 1800)); await page.screenshot({ path: `${dir}/failure.png`, fullPage: true }); throw error } finally { await browser.close() }
