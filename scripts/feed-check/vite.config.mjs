import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Build de test : la logique pure du fil est compilée pour Node, sans DOM ni Supabase.
const repo = fileURLToPath(new URL('../..', import.meta.url))
export default defineConfig({
  root: repo,
  build: {
    ssr: `${repo}/scripts/feed-check/entry.ts`,
    outDir: 'scripts/feed-check/out',
    emptyOutDir: true,
    minify: false,
    target: 'node22',
  },
})
