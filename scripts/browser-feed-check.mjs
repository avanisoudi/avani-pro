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
let moderatedDeletes = 0
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
  else if (url.pathname.endsWith('/rpc/avani_delete_post')) { moderatedDeletes++; data = null }
  else if (url.pathname.endsWith('/rpc/avani_admin_overview')) data = { users: 4, pages: 2, posts: 1, reports: 0, publications: [{ id: 'fixture-post', body: 'Publication à modérer', author: 'Compte de recette', created_at: new Date().toISOString() }], signals: [], logs: [] }
  else if (url.pathname.includes('/storage/v1/object/sign/')) {
    const body = req.postDataJSON()
    data = body.paths ? body.paths.map(path => ({ path, signedURL: `/object/public/post-media/${path}` })) : { signedURL: '/object/public/story-media/fixture.png' }
  } else if (url.pathname.includes('/storage/v1/object/')) {
    if (req.method() === 'GET') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ZkAAAAASUVORK5CYII=', 'base64') })
    if (req.method() === 'POST') uploaded.push(url.pathname)
    if (req.method() === 'DELETE') deletedUploads += req.postDataJSON().prefixes?.length || 0
    data = { Key: url.pathname }
  } else if (url.pathname.endsWith('/profiles')) data = url.searchParams.get('id')?.startsWith('eq.') ? profile : Array.from({ length: 4 }, (_, i) => ({ ...profile, id: `contact-${i}`, full_name: `Contact de recette ${i + 1}`, username: `contact${i}` }))
  else if (url.pathname.endsWith('/stories')) data = [
    ['own1', user.id, 'Compte de recette'], ['other2', 'other', 'Hacker Benz'],
    ['same-name', 'different-person', 'Hacker Benz'], ['own2', user.id, 'Compte de recette'],
    ['other1', 'other', 'Hacker Benz'],
  ].map(([id, author_id, full_name], index) => ({
    id, author_id, author: { id: author_id, full_name }, media_type: 'image', media_path: `${author_id}/${id}.png`,
    privacy: 'public', caption: id, created_at: new Date(Date.now() - (6 - index) * 10000).toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(),
  }))
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
    await page.locator('.story-self.story-live').waitFor()
    assert.equal(await page.locator('.stories-row .story-card').count(), 3, 'One card per author, not one per story or display name')
    const otherCard = page.locator('.stories-row .story-card').filter({ hasText: '2 stories' }).filter({ hasText: 'Hacker Benz' })
    assert.equal(await otherCard.count(), 1)
    await otherCard.click()
    const viewer = page.getByRole('dialog', { name: 'Story de Hacker Benz', exact: true })
    assert.equal(await viewer.locator('p').innerText(), 'other2')
    await page.getByRole('button', { name: 'Story suivante', exact: true }).click()
    assert.equal(await viewer.locator('p').innerText(), 'other1', 'Finish author before switching to another person')
    await page.getByRole('button', { name: 'Story précédente', exact: true }).click()
    assert.equal(await viewer.locator('p').innerText(), 'other2')
    await page.getByRole('button', { name: 'Fermer la story', exact: true }).click()
    await page.getByRole('button', { name: 'Voir votre story', exact: true }).click()
    await page.getByRole('button', { name: 'Story suivante', exact: true }).click()
    assert.equal(await page.locator('.story-viewer p').innerText(), 'own2')
    await page.getByRole('button', { name: 'Fermer la story', exact: true }).click()
    console.log('PASS one story card per author, names not merged, all own/other stories navigable in author order')
    assert.equal(await page.locator('.fpost-media').first().locator('figure').count(), 3)
    await page.getByRole('button', { name: 'Voir les 5 médias de la publication' }).click()
    await page.getByRole('dialog', { name: 'Album de la publication' }).waitFor()
    assert.match(await page.locator('.post-gallery-counter').innerText(), /3 \/ 5/)
    await page.keyboard.press('ArrowRight')
    assert.match(await page.locator('.post-gallery-counter').innerText(), /4 \/ 5/)
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').count(), 0)
    await page.getByRole('textbox', { name: 'Contenu de la publication' }).fill('Texte accompagnant mes cinq photos')
    await page.reload()
    await page.getByRole('textbox', { name: 'Contenu de la publication' }).waitFor()
    assert.equal(await page.getByRole('textbox', { name: 'Contenu de la publication' }).inputValue(), 'Texte accompagnant mes cinq photos', 'Text draft restored after reload')
    const selectFive = () => page.locator('.fcomposer input[type=file]').evaluate(input => {
      const transfer = new DataTransfer()
      for (let i = 0; i < 5; i++) transfer.items.add(new File(['fixture image'], `photo-${i}.png`, { type: 'image/png', lastModified: 42 }))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await selectFive()
    await selectFive()
    assert.equal(await page.locator('.fcomposer-media li:not(:has(.fcomposer-add))').count(), 5)
    await page.getByRole('button', { name: 'Déplacer le média 2 vers la gauche' }).click()
    assert.match(await page.locator('.fcomposer-media li img').first().getAttribute('alt'), /photo-1.png/)
    await page.getByRole('textbox', { name: 'Contenu de la publication' }).press('Control+Enter')
    await page.locator('.fcomposer').evaluate(form => { form.requestSubmit(); form.requestSubmit() })
    await page.waitForFunction(() => document.querySelector('.fcomposer-field textarea')?.value === '')
    assert.equal(savedPost.body, 'Texte accompagnant mes cinq photos')
    assert.equal(savedPost.media_paths.length, 5)
    assert.equal(uploaded.length, 5)
    assert.equal(postWrites, 1, 'Rapid repeated submissions do not create duplicate posts')
    assert.equal(await page.getByText('Avani Pro Premium', { exact: true }).count(), 0, 'Premium promotion is reserved for administrators, not this ordinary fixture account')
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
  if (!captureOnly) {
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Vider le brouillon', exact: true }).click()
    assert.equal(await page.getByRole('textbox', { name: 'Contenu de la publication' }).inputValue(), '')
    assert.equal(await page.locator('.fcomposer-media').count(), 0)
    await page.reload()
    await page.getByRole('textbox', { name: 'Contenu de la publication' }).waitFor()
    assert.equal(await page.getByRole('textbox', { name: 'Contenu de la publication' }).inputValue(), '')
    console.log('PASS draft restore/discard, media reorder and Control+Enter')
    await page.goto(`${base}/settings`)
    const logout = page.getByRole('button', { name: 'Se déconnecter ↗', exact: true })
    await logout.waitFor()
    assert.equal(await logout.count(), 1)
    assert.equal(await logout.evaluate(el => getComputedStyle(el).color), 'rgb(192, 47, 69)')
    await page.goto(`${base}/settings/compte`)
    await page.getByRole('heading', { name: 'Préférences & compte' }).waitFor()
    assert.equal(await page.getByRole('checkbox').count(), 0, 'No nonfunctional notification/compact switches')
    await page.goto(`${base}/admin`)
    await page.getByRole('heading', { name: 'Modérer les publications' }).waitFor()
    await page.setViewportSize({ width: 1214, height: 1000 })
    await page.screenshot({ path: `${dir}/admin-console.png`, fullPage: true })
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await page.waitForTimeout(300)
    assert.equal(moderatedDeletes, 1, 'Console delete invokes server moderation RPC')
    await page.getByRole('button', { name: 'Signalements', exact: true }).click()
    await page.getByText('Aucun signalement en attente.').waitFor()
    await page.getByRole('button', { name: 'Journal des actions', exact: true }).click()
    await page.getByText('Aucune action enregistrée.').waitFor()
    console.log('PASS logout red only, settings clarity, admin console tabs and server delete request')
  }
  if (!captureOnly) {
    await page.goto(`${base}/messages`)
    await page.locator('.messages-heading .eyebrow').waitFor()
    for (const width of [1214, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => {
          document.documentElement.dataset.theme = theme
          const shell = document.querySelector('.app-shell')
          shell.classList.remove('theme-light', 'theme-dark')
          shell.classList.add(`theme-${theme}`)
        }, theme)
        const topbar = await page.locator('.topbar').evaluate(el => ({
          background: getComputedStyle(el).backgroundImage,
          color: getComputedStyle(el).color,
          logo: el.querySelector('.navbar-wordmark').currentSrc,
        }))
        assert.ok(topbar.background.includes('rgb(17, 29, 86)'), `Navy header ${theme}/${width}`)
        assert.equal(topbar.color, 'rgb(255, 255, 255)')
        assert.ok(topbar.logo.endsWith('/assets/avani-navbar.svg'), 'White wordmark in both themes/sizes')
        const heading = await page.locator('.messages-heading .eyebrow').evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundImage, fill: getComputedStyle(el).webkitTextFillColor }))
        const expected = theme === 'light' ? 'rgb(124, 58, 237)' : 'rgb(167, 139, 250)'
        assert.equal(heading.color, expected, `Actual heading colour ${theme}/${width}`)
        assert.equal(heading.fill, expected, `Text not transparent ${theme}/${width}`)
        assert.equal(heading.background, 'none')
        assert.ok(await page.getByText('Conversations de votre compte', { exact: true }).isVisible(), `Subtitle visible ${theme}/${width}`)
        await page.screenshot({ path: `${dir}/messages-heading-${theme}-${width}.png` })
      }
    }
    console.log('PASS actual messaging heading CSS, visible subtitle, mobile/desktop, light/dark')
  }
  assert.deepEqual(errors, [])
  console.log(captureOnly ? 'Baseline captured' : 'PASS album, keyboard, five uploads + text, persistence reload, failed-album preservation, duplicate selection/submission protection, responsive layout')
} catch (error) { console.log('Browser errors:', errors); console.log((await page.locator('body').innerText()).slice(0, 1800)); await page.screenshot({ path: `${dir}/failure.png`, fullPage: true }); throw error } finally { await browser.close() }
