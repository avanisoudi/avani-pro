import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

const [auth, app, migration, robots, sitemap, index, privacy] = await Promise.all([
  read('../src/components/AuthModal.tsx'),
  read('../src/App.tsx'),
  read('../supabase/migrations/016_private_profile_phone.sql'),
  read('../public/robots.txt'),
  read('../public/sitemap.xml'),
  read('../index.html'),
  read('../public/confidentialite/index.html'),
])

test('le téléphone est facultatif et absent des métadonnées si le champ est vide', () => {
  assert.match(auth, /Téléphone <span className="optional">\(facultatif\)<\/span>/)
  assert.match(auth, /phone: phone\.trim\(\) \|\| null/)
  assert.doesNotMatch(auth, /!phone\.trim\(\)/)
  assert.match(auth, /href="\/confidentialite\/"/)
})

test('la migration retire l’accès public au téléphone sans supprimer ni déplacer de lignes', () => {
  assert.match(migration, /revoke select on table public\.profiles from anon, authenticated, public/i)
  assert.match(migration, /grant select on table public\.profiles to service_role/i)
  const grantedColumns = migration.match(/grant select\s*\(([\s\S]*?)\) on table public\.profiles to anon, authenticated/i)?.[1]
  assert.ok(grantedColumns, 'la liste de colonnes publiques doit être explicite')
  assert.doesNotMatch(grantedColumns, /\bphone\b/i)
  assert.doesNotMatch(migration, /\b(drop|delete|truncate)\b/i)
})

test('les routes membres sont exclues de l’indexation et seules les pages publiques sont dans le sitemap', () => {
  for (const route of ['/messages', '/settings', '/admin', '/u/', '/profile/']) assert.ok(robots.includes(`Disallow: ${route}`))
  assert.match(robots, /Sitemap: https:\/\/avani-pro\.vercel\.app\/sitemap\.xml/)
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]), [
    'https://avani-pro.vercel.app/',
    'https://avani-pro.vercel.app/confidentialite/',
  ])
  assert.match(app, /robots\.content = 'noindex, nofollow'/)
})

test('les pages publiques ont des métadonnées et l’aperçu du fil est clairement une démonstration', () => {
  assert.match(index, /name="description"/)
  assert.match(index, /property="og:title"/)
  assert.match(privacy, /rel="canonical" href="https:\/\/avani-pro\.vercel\.app\/confidentialite\//)
  assert.match(app, /démonstration visuelle/i)
  assert.doesNotMatch(app, /3 commentaires · 1 partage/)
})
