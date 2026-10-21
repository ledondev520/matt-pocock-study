import { access, mkdir, readFile } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { buildContent } from '../scripts/content'
import { createApp } from './app'
import { createIndex } from './db'
import { parseListenOptions } from './listen'
import type { Page } from '../src/lib/content'

const dev = process.argv.includes('--dev')
const output = dev ? 'public' : 'dist'
if (!dev) await access('dist/index.html')
// Production must preserve the build's bytes and their precompressed siblings.
const pages: Page[] = dev ? await buildContent('content', output, true) : JSON.parse(await readFile('dist/content.json', 'utf8'))
await mkdir('generated', { recursive: true })
const db = createIndex(pages, 'generated/content.sqlite')
const server = serve({ fetch: createApp(db, output).fetch, ...parseListenOptions() }, (info) => {
  console.log(`Study site listening on port ${info.port}`)
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      db.close()
      process.exit(0)
    })
  })
}
