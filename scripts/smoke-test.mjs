const baseUrl = (process.argv[2] || process.env.SMOKE_URL || 'https://avani-pro.onrender.com').replace(/\/$/, '')
const checks = ['/', '/manus-routes.json', '/logo-icon.png', '/og-image.png', '/notification-bell.svg']
let failed = 0
for (const path of checks) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'follow' })
  const ok = response.status === 200
  console.log(`${ok ? 'OK' : 'FAIL'} ${response.status} ${path}`)
  if (!ok) failed += 1
}
const html = await (await fetch(`${baseUrl}/`)).text()
for (const marker of ['Avani Pro', 'og:image', 'logo-icon']) {
  const ok = html.includes(marker)
  console.log(`${ok ? 'OK' : 'FAIL'} marker ${marker}`)
  if (!ok) failed += 1
}
const scriptPath = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1]
if (scriptPath) {
  const bundle = await (await fetch(`${baseUrl}${scriptPath}`)).text()
  for (const marker of ['notification-bell.svg', 'markAllRead', 'postgres_changes']) {
    const ok = bundle.includes(marker)
    console.log(`${ok ? 'OK' : 'FAIL'} bundle marker ${marker}`)
    if (!ok) failed += 1
  }
}
if (failed) process.exit(1)
console.log(`Smoke test passed: ${baseUrl}`)
