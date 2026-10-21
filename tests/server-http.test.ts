import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { brotliCompressSync, brotliDecompressSync, constants, gzipSync, gunzipSync } from 'node:zlib'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createApp } from '../server/app'
import { createIndex } from '../server/db'
import viteConfig from '../vite.config'

const body = 'plain text with UTF-8 中文\n'.repeat(100)
const db = createIndex([])
let root: string
let app: ReturnType<typeof createApp>
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'server-http-'))
  for (const dir of ['en', 'zh', 'assets']) await mkdir(join(root, dir))
  for (const file of ['en/404.html', 'zh/404.html', 'en/index.html', 'en/article.md', 'assets/app.js', 'image.svg']) {
    await writeFile(join(root, file), body)
    await writeFile(join(root, file + '.br'), brotliCompressSync(body))
    await writeFile(join(root, file + '.gz'), gzipSync(body))
  }
  await writeFile(join(root, 'assets/plain.js'), body)
  const corpus = [{ id: 'large', type: 'article' as const, summary: { zh: body, en: body }, metrics: {}, url: 'https://example.com', tags: [], date: '2026-01-01' }]
  app = createApp(db, root, corpus)
})
afterAll(async () => { db.close(); await rm(root, { recursive: true, force: true }) })

it.each(['/en', '/assets/app.js', '/image.svg'])('serves precompressed %s with Brotli preferred and original MIME', async path => {
  const identity = await app.request(path)
  for (const [accept, encoding] of [['gzip, br', 'br'], ['gzip', 'gzip'], ['br;q=0, gzip', 'gzip'], ['br;q=0.5, gzip;q=0.5', 'br'], ['br;q=0.5, gzip;q=0.5, identity;q=0.5', 'br'], ['br;q=0.2, gzip;q=1', 'gzip'], ['*', 'br']]) {
    const response = await app.request(path, { headers: { 'Accept-Encoding': accept } })
    expect(response.headers.get('Content-Encoding')).toBe(encoding)
    expect(response.headers.get('Content-Type')).toBe(identity.headers.get('Content-Type'))
    expect(response.headers.get('Vary')).toMatch(/Accept-Encoding/i)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    const bytes = Buffer.from(await response.arrayBuffer())
    expect(bytes).toEqual(await readFile(join(root, (path === '/en' ? 'en/index.html' : path.slice(1)) + (encoding === 'br' ? '.br' : '.gz'))))
    expect((encoding === 'br' ? brotliDecompressSync(bytes) : gunzipSync(bytes)).toString()).toBe(body)
  }
  expect(identity.headers.get('Vary')).toMatch(/Accept-Encoding/i)
  const refused = await app.request(path, { headers: { 'Accept-Encoding': 'br;q=0, gzip;q=0' } })
  expect(refused.headers.get('Content-Encoding')).toBeNull()
  await refused.arrayBuffer()
})

it.each(['/api/corpus', '/en/missing'])('gzips large dynamic response %s exactly once', async path => {
  const original = await app.request(path)
  const bytes = Buffer.from(await original.arrayBuffer())
  expect(bytes.length).toBeGreaterThanOrEqual(1024)
  const compressed = await app.request(path, { headers: { 'Accept-Encoding': 'gzip' } })
  expect(compressed.headers.get('Content-Encoding')).toBe('gzip')
  expect(compressed.headers.get('X-Content-Type-Options')).toBe('nosniff')
  expect(compressed.headers.get('Vary')).toMatch(/Accept-Encoding/i)
  expect(gunzipSync(Buffer.from(await compressed.arrayBuffer()))).toEqual(bytes)
})

it('keeps small dynamic JSON uncompressed and sends nosniff on errors too', async () => {
  for (const path of ['/api/health', '/api/missing', '/api/corpus?limit=0']) {
    const response = await app.request(path, { headers: { 'Accept-Encoding': 'gzip' } })
    expect(response.headers.get('Content-Encoding')).toBeNull()
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  }
})

it.each(['/en', '/en/article.md', '/api/corpus', '/assets/app.js'])('caches %s with encoding-specific strong ETags and conditional 304s', async path => {
  const tags = new Set<string>()
  for (const encoding of ['identity', 'gzip', ...(path.startsWith('/api/') ? [] : ['br'])]) {
    const headers = { 'Accept-Encoding': encoding }
    const response = await app.request(path, { headers })
    const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
    expect(response.headers.get('Cache-Control')).toBe(cache)
    const tag = response.headers.get('ETag')!
    expect(tag).toMatch(/^"[^"\s]+"$/)
    expect(tags.has(tag)).toBe(false)
    tags.add(tag)
    await response.arrayBuffer()
    const conditional = await app.request(path, { headers: { ...headers, 'If-None-Match': `"other", W/${tag}` } })
    expect(conditional.status).toBe(304)
    expect(await conditional.text()).toBe('')
    expect(conditional.headers.get('ETag')).toBe(tag)
    expect(conditional.headers.get('Content-Length')).toBeNull()
    expect(conditional.headers.get('Content-Encoding')).toBeNull()
    expect(conditional.headers.get('Cache-Control')).toBe(cache)
    expect(conditional.headers.get('Vary')).toMatch(/Accept-Encoding/i)
    expect(conditional.headers.get('X-Content-Type-Options')).toBe('nosniff')
    const stale = await app.request(path, { headers: { ...headers, 'If-None-Match': '"stale"' } })
    expect(stale.status).toBe(response.status)
    await stale.arrayBuffer()
  }
})

it.each([
  ['/api/missing', 404], ['/en/missing', 404], ['/en/missing.md', 404], ['/api/corpus?limit=0', 400],
] as const)('preserves error status and body on conditional requests to %s', async (path, status) => {
  for (const encoding of ['identity', 'gzip', 'br']) {
    const headers = { 'Accept-Encoding': encoding }
    const original = await app.request(path, { headers })
    const bytes = Buffer.from(await original.arrayBuffer())
    // The old middleware generated this tag even for error responses.
    const tag = `"${createHash('sha256').update(bytes).digest('hex')}"`
    for (const condition of ['*', tag, `"other", W/${tag}`]) {
      const conditionalHeaders = { ...headers, 'If-None-Match': condition }
      const response = await app.request(path, { headers: conditionalHeaders })
      expect(response.status).toBe(status)
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
      const head = await app.request(path, { method: 'HEAD', headers: conditionalHeaders })
      expect(head.status).toBe(status)
      for (const name of parityHeaders) expect(head.headers.get(name), name).toBe(response.headers.get(name))
      expect(await head.text()).toBe('')
    }
  }
})

it('limits validators to successful GET/HEAD responses, preserving 500 and POST bodies', async () => {
  const fixtureDb = createIndex([])
  try {
    const fixture = createApp(fixtureDb, undefined, [])
    fixture.get('/failure', c => c.text(body, 500))
    fixture.post('/success', c => c.text(body))
    const tag = `"${createHash('sha256').update(body).digest('hex')}"`
    for (const condition of ['*', tag]) {
      for (const [path, method, status] of [['/failure', 'GET', 500], ['/failure', 'HEAD', 500], ['/success', 'POST', 200]] as const) {
        const response = await fixture.request(path, { method, headers: { 'If-None-Match': condition } })
        expect(response.status).toBe(status)
        expect(response.headers.get('ETag')).toBeNull()
        expect(await response.text()).toBe(method === 'HEAD' ? '' : body)
      }
    }
  } finally { fixtureDb.close() }
})

const parityHeaders = ['Content-Type', 'Content-Encoding', 'Content-Length', 'ETag', 'Vary', 'Cache-Control']
const representations = ['/en', '/assets/app.js', '/assets/plain.js', '/api/corpus', '/en/article.md']
it.each(representations.flatMap(path => ['identity', 'gzip', 'br'].map(encoding => [path, encoding])))('matches GET headers and conditional status for HEAD %s (%s)', async (path, encoding) => {
  const headers = { 'Accept-Encoding': encoding }
  const get = await app.request(path, { headers })
  const head = await app.request(path, { method: 'HEAD', headers })
  expect(head.status).toBe(get.status)
  for (const name of parityHeaders) expect(head.headers.get(name), name).toBe(get.headers.get(name))
  expect(await head.text()).toBe('')
  const bytes = await get.arrayBuffer()
  expect(get.headers.get('Content-Length')).toBe(String(bytes.byteLength))
  const conditionalHeaders = { ...headers, 'If-None-Match': get.headers.get('ETag')! }
  const conditionalGet = await app.request(path, { headers: conditionalHeaders })
  const conditionalHead = await app.request(path, { method: 'HEAD', headers: conditionalHeaders })
  expect(conditionalGet.status).toBe(304)
  expect(conditionalHead.status).toBe(304)
  for (const name of parityHeaders) expect(conditionalHead.headers.get(name), name).toBe(conditionalGet.headers.get(name))
  expect(await conditionalGet.text()).toBe('')
  expect(await conditionalHead.text()).toBe('')
})

const negotiations = [
  ['identity;q=1, br;q=0.1, gzip;q=0.1', null],
  ['br;q=0.5, gzip;q=0.5', 'br'],
  ['gzip;q=0.1', 'gzip'],
  ['*;q=0.5', 'br'],
  ['br;q=0.5, gzip;q=0.5, identity;q=0.5', 'br'],
  ['br;q=0.1, gzip;q=0.8, identity;q=0.2', 'gzip'],
  ['identity;q=0, br;q=0.1, gzip;q=0', 'br'],
  ['*;q=0, identity;q=0.5', null],
  ['*;q=0, gzip;q=1', 'gzip'],
  ['identity;q=0, br;q=0, gzip;q=0', '406'],
  ['*;q=0', '406'],
] as const
it.each(representations.flatMap(path => negotiations.map(([accept, encoding]) => ({ path, accept, encoding }))))('negotiates $path with $accept -> $encoding', async ({ path, accept, encoding }) => {
  const original = await app.request(path)
  const bytes = Buffer.from(await original.arrayBuffer())
  const headers = { 'Accept-Encoding': accept }
  const response = await app.request(path, { headers })
  expect(response.status).toBe(encoding === '406' ? 406 : 200)
  expect(response.headers.get('Vary')).toMatch(/Accept-Encoding/i)
  if (encoding === '406') {
    expect(response.headers.get('Content-Encoding')).toBeNull()
    await response.arrayBuffer()
    const head = await app.request(path, { method: 'HEAD', headers })
    expect(head.status).toBe(406)
    for (const name of parityHeaders) expect(head.headers.get(name), name).toBe(response.headers.get(name))
    expect(await head.text()).toBe('')
    return
  }
  expect(response.headers.get('Content-Encoding')).toBe(encoding)
  expect(response.headers.get('Content-Type')).toBe(original.headers.get('Content-Type'))
  const encoded = Buffer.from(await response.arrayBuffer())
  expect(response.headers.get('Content-Length')).toBe(String(encoded.length))
  expect(encoding === 'br' ? brotliDecompressSync(encoded) : encoding === 'gzip' ? gunzipSync(encoded) : encoded).toEqual(bytes)
})

it('honors identity refusal even for small dynamic JSON', async () => {
  const response = await app.request('/api/health', { headers: { 'Accept-Encoding': 'identity;q=0, gzip;q=1' } })
  expect(response.status).toBe(200)
  expect(response.headers.get('Content-Encoding')).toBe('gzip')
  expect(JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString())).toEqual({ ok: true })
})

it.each(['identity', 'gzip', 'br'])('serves Markdown inline with nosniff (%s)', async encoding => {
  const response = await app.request('/en/article.md', { headers: { 'Accept-Encoding': encoding } })
  expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
  expect(response.headers.get('Content-Disposition')).toBeNull()
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  expect(response.headers.get('Content-Encoding')).toBe(encoding === 'identity' ? null : encoding)
  await response.arrayBuffer()
})

it('parses HOST with a loopback default and preserves PORT validation', async () => {
  const modulePath = '../server/listen'
  const { parseListenOptions } = await import(modulePath)
  expect(parseListenOptions({})).toEqual({ hostname: '127.0.0.1', port: 8787 })
  expect(parseListenOptions({ HOST: 'localhost', PORT: '9000' })).toEqual({ hostname: 'localhost', port: 9000 })
  for (const port of ['', '0', '65536', '1.5', 'oops']) expect(() => parseListenOptions({ PORT: port })).toThrow('PORT must be an integer from 1 to 65535')
})

async function startProduction(env: NodeJS.ProcessEnv) {
  // Runs the real server/index.ts in a throwaway production layout (no dist build needed).
  const dir = await mkdtemp(join(tmpdir(), 'production-start-'))
  for (const name of ['content', 'data', 'public', 'third_party', 'src']) await symlink(resolve(name), join(dir, name), 'dir')
  await mkdir(join(dir, 'dist'))
  const file = join(dir, 'dist/content.json')
  const bytes = Buffer.from('[]')
  await writeFile(join(dir, 'dist/index.html'), body)
  await writeFile(file, bytes)
  await writeFile(file + '.br', brotliCompressSync(bytes))
  const script = `import { Server } from 'node:net';
    const listen = Server.prototype.listen;
    Server.prototype.listen = function (...args) {
      this.once('listening', () => { console.log('BOUND:' + JSON.stringify(this.address())); process.exit(0) });
      return listen.apply(this, args);
    };
    await import(${JSON.stringify(pathToFileURL(resolve('server/index.ts')).href)});`
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env, TSX_TSCONFIG_PATH: resolve('tsconfig.json') }
  if (!('HOST' in env)) delete childEnv.HOST
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ['--import', pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href, '--input-type=module', '-e', script], { cwd: dir, env: childEnv, timeout: 30000 })
    return { address: JSON.parse(stdout.match(/BOUND:(.+)/)![1]).address as string, bytes, file: await readFile(file), br: await readFile(file + '.br') }
  } finally { await rm(dir, { recursive: true, force: true }) }
}

it('starts the actual server on 127.0.0.1 by default, never 0.0.0.0', async () => {
  const { address } = await startProduction({ PORT: '48783' })
  expect(address).toBe('127.0.0.1')
  expect(address).not.toBe('0.0.0.0')
  expect(address).not.toBe('::')
}, 40000)

it('binds HOST when it is set', async () => {
  expect((await startProduction({ PORT: '48784', HOST: '::1' })).address).toBe('::1')
}, 40000)

it('preserves production files and their compressed siblings at startup', async () => {
  const { bytes, file, br } = await startProduction({ PORT: '48785' })
  expect(file.equals(bytes)).toBe(true)
  expect(brotliDecompressSync(br)).toEqual(bytes)
}, 40000)

it('proxies Vite API requests to IPv4 loopback', () => {
  expect(viteConfig.server?.proxy?.['/api']).toBe('http://127.0.0.1:' + (process.env.PORT ?? '8787'))
})

it('compresses every eligible extension at 1 KB with Brotli q11 and gzip, leaving originals intact', async () => {
  const modulePath = '../scripts/compress'
  const { compressDist } = await import(modulePath)
  const dir = await mkdtemp(join(tmpdir(), 'compress-dist-'))
  try {
    await mkdir(join(dir, 'nested'))
    for (const ext of ['html', 'css', 'js', 'mjs', 'svg', 'json', 'txt', 'md', 'xml']) {
      await writeFile(join(dir, `nested/file.${ext}`), Buffer.alloc(1024, 'a'))
    }
    await writeFile(join(dir, 'small.txt'), Buffer.alloc(1023, 'a'))
    await writeFile(join(dir, 'binary.png'), Buffer.alloc(1024, 'a'))
    await compressDist(dir)
    for (const ext of ['html', 'css', 'js', 'mjs', 'svg', 'json', 'txt', 'md', 'xml']) {
      const file = join(dir, `nested/file.${ext}`)
      const bytes = await readFile(file)
      expect(bytes).toEqual(Buffer.alloc(1024, 'a'))
      const br = await readFile(file + '.br')
      expect(br).toEqual(brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }))
      expect(brotliDecompressSync(br)).toEqual(bytes)
      expect(gunzipSync(await readFile(file + '.gz'))).toEqual(bytes)
    }
    for (const file of ['small.txt', 'binary.png']) for (const suffix of ['.br', '.gz']) await expect(readFile(join(dir, file + suffix))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await rm(dir, { recursive: true, force: true }) }
})
