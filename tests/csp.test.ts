import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createApp, PAGE_CSP } from '../server/app'
import { createAskApp } from '../server/ask/app'
import { loadConfig } from '../server/ask/config'
import { openStore } from '../server/ask/store'
import { createIndex } from '../server/db'

const db = createIndex([])
let root: string
let app: ReturnType<typeof createApp>

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'csp-'))
  await mkdir(join(root, 'en'))
  await writeFile(join(root, 'en/index.html'), '<!doctype html><html lang="en"><title>CSP</title><body>CSP</body></html>')
  app = createApp(db, root, [])
})

afterAll(async () => {
  db.close()
  await rm(root, { recursive: true, force: true })
})

it('serves HTML with the exact page CSP allowing the Cloudflare beacon', async () => {
  const response = await app.request('/en')
  expect(response.status).toBe(200)
  expect(response.headers.get('Content-Type')).toContain('text/html')
  const expected = "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  expect(response.headers.get('Content-Security-Policy')).toBe(expected)
  expect(PAGE_CSP).toBe(expected)
  await response.text()
})

it('adds only the Cloudflare script host and preserves all previous directives', async () => {
  const response = await app.request('/en')
  const policy = response.headers.get('Content-Security-Policy')!
  const directives = policy.split(';').map(directive => directive.trim().split(/\s+/))
  const previous = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  expect(directives.map(([name]) => name)).toEqual(Object.keys(previous))
  for (const [name, sources] of Object.entries(previous)) {
    expect(directives.find(([directive]) => directive === name)?.slice(1)).toEqual(
      name === 'script-src' ? [...sources, 'https://static.cloudflareinsights.com'] : sources,
    )
  }
  const hosts = directives.flatMap(([directive, ...sources]) => sources
    .filter(source => !source.startsWith("'") && !/^[a-z][a-z\d+.-]*:$/i.test(source))
    .map(source => ({ directive, source })))
  expect(hosts).toEqual([{ directive: 'script-src', source: 'https://static.cloudflareinsights.com' }])
  expect(policy).not.toContain('*')
  expect(policy).not.toContain("'unsafe-eval'")
  await response.text()
})

it('preserves the ask app CSP', async () => {
  const store = openStore(':memory:')
  try {
    const ask = createAskApp({ config: loadConfig({}), units: [], store })
    const response = await ask.request('/healthz')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'none'; frame-ancestors 'none'")
    await response.json()
  } finally {
    store.close()
  }
})
