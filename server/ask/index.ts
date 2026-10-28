// matt-ask: the /api/ask process. Listens on loopback only; nginx forwards POST /api/ask to it.
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { serve } from '@hono/node-server'
import { createAskApp } from './app'
import { loadConfig } from './config'
import { openStore } from './store'
import { loadUnits } from './units'

const config = loadConfig()
const units = loadUnits({ indexFile: config.indexFile, pageManifestFile: config.pageManifestFile, datasetDir: config.datasetDir, chunksFile: config.chunksFile })
mkdirSync(dirname(config.dbFile), { recursive: true })
const store = openStore(config.dbFile)
const app = createAskApp({ config, units, store })
const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, info => {
  // Never print the key; only whether answers are on.
  console.log(JSON.stringify({ event: 'listening', host: config.host, port: info.port, enabled: config.enabled, model: config.model, units: units.length, posts: units.filter(u => u.kind === 'post').length, methods: units.filter(u => u.kind === 'method').length }))
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      store.close()
      process.exit(0)
    })
  })
}
