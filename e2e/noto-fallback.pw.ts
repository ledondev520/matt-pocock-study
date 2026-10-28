import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { notoPattern } from '../scripts/fonts.mjs'
import { parseFontFaces } from '../tests/font-faces'
import { routes } from './routes'

// Option A (docs/FONT_SUBSETS.md): characters outside the subset fall back, by unicode-range,
// to the full Fontsource slices served from this site; subset characters never pull a slice.
const fontRequest = /\/noto-sans-sc[^/]*\.woff2(?:[?#]|$)/i
const fallbackRequest = /\/assets\/noto-sans-sc-fallback-(\d+)-(\d+)-[^/]+\.woff2$/
const rare = '丂' // U+4E02: not in the chinese-simplified source, so never in the subset; Fontsource slice [85]

async function faces() {
  return parseFontFaces(await readFile('generated/fonts/noto-sans-sc.css', 'utf8'), './')
}

async function drawnBy(page: Page, selector: string) {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    return (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts
  } finally { await cdp.detach() }
}

test('a character outside the subset is drawn with the self-hosted Fontsource slice, not a system font', async ({ page, baseURL }) => {
  const all = await faces()
  const code = rare.codePointAt(0)!
  for (const weight of [400, 700]) {
    expect(all.find(face => face.kind === 'subset' && face.weight === weight)!.codes.has(code)).toBe(false)
    expect(all.filter(face => face.weight === weight && face.codes.has(code)).map(face => [face.kind, face.slice])).toEqual([['fallback', 85]])
  }
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', request => { if (fontRequest.test(request.url())) requests.push(request.url()) })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/zh', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  expect(requests.filter(url => fallbackRequest.test(url))).toEqual([])

  const slices = [400, 700].map(weight => page.waitForResponse(response => {
    const match = fallbackRequest.exec(new URL(response.url()).pathname)
    return !!match && match[1] === '85' && match[2] === String(weight)
  }))
  await page.evaluate(character => {
    const main = document.querySelector('main')!
    main.insertAdjacentHTML('beforeend', `<p id="rare-400" style="font-weight:400">${character}</p><p id="rare-700" style="font-weight:700">${character}</p>`)
  }, rare)
  for (const response of await Promise.all(slices)) {
    // Served by this site (CSP font-src 'self'), as a WOFF2.
    expect(new URL(response.url()).origin).toBe(new URL(baseURL!).origin)
    expect(response.status()).toBe(200)
    expect((await response.body()).toString('ascii', 0, 4)).toBe('wOF2')
  }
  await page.evaluate(() => document.fonts.ready)

  // The FontFace that covers 丂 for each weight is the loaded slice face, not the subset face.
  const state = await page.evaluate(code => {
    const covers = (range: string) => range.split(',').some(part => {
      const [start, end] = part.trim().replace(/^U\+/i, '').split('-').map(hex => parseInt(hex, 16))
      return code >= start && code <= (end ?? start)
    })
    return [...document.fonts].filter(face => face.family.replace(/["']/g, '') === 'Noto Sans SC' && covers(face.unicodeRange))
      .map(face => ({ weight: face.weight, status: face.status }))
  }, code)
  expect(state.sort((a, b) => a.weight.localeCompare(b.weight))).toEqual([{ weight: '400', status: 'loaded' }, { weight: '700', status: 'loaded' }])
  expect(await page.evaluate(character => document.fonts.check(`400 16px "Noto Sans SC"`, character) && document.fonts.check(`700 16px "Noto Sans SC"`, character), rare)).toBe(true)

  // Chrome reports a web font (isCustomFont), not a system font, as what drew the glyph. Its
  // internal name is upstream's "Noto Sans SC Thin" for every weight (docs/FONT_SUBSETS.md); the
  // subset face cannot be it, since the subset has no glyph and no range for 丂 (checked above).
  for (const id of ['#rare-400', '#rare-700']) {
    expect(await drawnBy(page, id), id).toEqual([expect.objectContaining({ familyName: expect.stringMatching(/^Noto Sans SC\b/), isCustomFont: true, glyphCount: 1 })])
  }
  // Exactly one slice per weight was fetched for it; nothing was blocked by CSP.
  expect(requests.filter(url => fallbackRequest.test(url)).map(url => new URL(url).pathname.replace(/-[A-Za-z0-9_-]{8}\.woff2$/, ''))).toEqual(['/assets/noto-sans-sc-fallback-85-400', '/assets/noto-sans-sc-fallback-85-700'])
  expect(errors).toEqual([])
})

test('Chinese home and article pages load only the two subset files on first paint, no fallback slice', async ({ browser }) => {
  for (const route of ['/', '/zh', '/zh/core-principles', '/zh/knowledge', '/zh/licenses']) {
    const context = await browser.newContext()
    const requests: string[] = []
    context.on('request', request => { if (fontRequest.test(request.url())) requests.push(new URL(request.url()).pathname) })
    try {
      const page = await context.newPage()
      await page.goto(route, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      expect(requests.map(path => path.replace(/-[A-Za-z0-9_-]{8}\.woff2$/, '')).sort(), route).toEqual(['/assets/noto-sans-sc-400', '/assets/noto-sans-sc-700'])
    } finally { await context.close() }
  }
})

test('on every Chinese route, a fallback slice is requested only for a drawn character the subset lacks', async ({ browser }) => {
  test.setTimeout(300_000)
  const subset = new Set((await faces()).filter(face => face.kind === 'subset').flatMap(face => [...face.codes]))
  const chineseRoutes = routes.filter(route => route === '/' || route === '/zh' || route.startsWith('/zh/'))
  expect(chineseRoutes.length).toBeGreaterThan(20)
  const unexplained: string[] = []
  for (const route of chineseRoutes) {
    const context = await browser.newContext()
    const requests: string[] = []
    context.on('request', request => { if (fallbackRequest.test(new URL(request.url()).pathname)) requests.push(request.url()) })
    try {
      const page = await context.newPage()
      await page.goto(route, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      const outside = await page.evaluate(({ pattern, subset }) => {
        const re = new RegExp(pattern, 'u')
        const have = new Set(subset)
        return [...new Set([...document.body.innerText].filter(c => re.test(c) && !have.has(c.codePointAt(0)!)))]
      }, { pattern: notoPattern, subset: [...subset] })
      if (requests.length && !outside.length) unexplained.push(`${route}: ${requests.join(', ')}`)
    } finally { await context.close() }
  }
  expect(unexplained).toEqual([])
})
