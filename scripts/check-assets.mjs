import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]))).flat()
}
const files = (await walk('public')).filter(path => /\.(svg|png|jpe?g|webp|gif|avif)$/i.test(path))
const hashes = new Map()
for (const file of files) {
  const bytes = await readFile(file)
  const hash = createHash('sha256').update(bytes).digest('hex')
  assert.ok(!hashes.has(hash), `Duplicate asset bytes: ${hashes.get(hash)} and ${file}`)
  hashes.set(hash, file)
  if (file.endsWith('.svg')) {
    const ids = [...bytes.toString().matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
    assert.equal(new Set(ids).size, ids.length, `Duplicate SVG IDs in ${file}`)
  }
}
const sprite = await readFile('public/social-icons.svg', 'utf8')
const symbols = new Set([...sprite.matchAll(/<symbol\s+id="([^"]+)"/g)].map(match => match[1]))
let references = 0
for (const file of (await walk('src')).filter(path => path.endsWith('.tsx'))) {
  const source = await readFile(file, 'utf8')
  for (const match of source.matchAll(/<SvgIcon\s+name="([^"]+)"|\bicon="([^"]+)"/g)) {
    const name = match[1] || match[2]
    references++; assert.ok(symbols.has(name), `Missing icon ${name} in ${file}`)
  }
}
console.log(`PASS ${files.length} asset files: no identical files or duplicate SVG IDs; ${references} static icon references resolved.`)

// The story card already supplies its accessible label and add control in React.
const storyPlaceholder = await readFile('public/assets/story-placeholder.svg', 'utf8')
assert.ok(!/<text\b|<path\b/.test(storyPlaceholder), 'Story placeholder must not bake in a second label or plus')
