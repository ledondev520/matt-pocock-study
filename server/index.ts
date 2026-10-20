import { access, mkdir } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { buildContent } from '../scripts/content'
import { createApp } from './app'
import { createIndex } from './db'

const dev = process.argv.includes('--dev')
const output = dev ? 'public' : 'dist'
if (!dev) await access('dist/index.html')
const pages = await buildContent('content', output)
await mkdir('generated', { recursive: true })
const db = createIndex(pages, 'generated/content.sqlite')
const port = Number(process.env.PORT ?? 8787)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535')
const server = serve({ fetch: createApp(db, output).fetch, port }, (info) => {
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
