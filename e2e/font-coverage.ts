import type { CDPSession, Page } from '@playwright/test'
import { notoPattern } from '../scripts/fonts.mjs'

// Fonts the site ships. A CDP platform-font report naming anything else, or naming one of
// these but not as a downloaded web font (isCustomFont false: a same-named system font),
// is a fallback.
const siteFont = /^(Noto Sans SC|Inter|Space Grotesk|JetBrains Mono)\b/
export type Miss = { route: string; char: string; code: string; where: string; family: string; weight: string; fonts: string[] }
type Probe = { family: string; weight: string; style: string; char: string; where: string }
// Probe results are valid for one document only: a later page can load (or fail to load)
// different font faces. Create one per navigation.
export type ProbeCache = Set<string>

// Every character the page actually draws (text nodes, including ones written by scripts,
// ::before/::after content, and form control placeholder/value) in an element whose font
// stack names Noto Sans SC. Elements that are not rendered (hidden, display:none,
// visibility:hidden, closed content) and SVG <title>/<desc> are skipped: nothing is drawn.
function collectInPage(pattern: string): Probe[] {
  const cjk = new RegExp(pattern, 'gu')
  const probes = new Map<string, Probe>()
  // A closed <select> has no box for its options, but it draws them (selected text, popup).
  const box = (element: Element) => element.closest('option, optgroup') ? element.closest('select') : element
  // Its contents (child text, ::before/::after) are drawn. checkVisibility() is false for a
  // display:contents element, which has no box but whose contents are laid out in its parent's
  // box, so climb to the nearest element with a box. That box must be laid out and must not
  // skip its own contents (content-visibility:hidden, which checkVisibility() only checks on
  // ancestors); a closed <details> passed on the way skips everything but its <summary>.
  const contentsDrawn = (element: Element) => {
    let child: Element | null = null
    for (let e = box(element); e; child = e, e = e.parentElement) {
      if (child && e instanceof HTMLDetailsElement && !e.open && child !== e.querySelector(':scope > summary')) return false
      const style = getComputedStyle(e)
      if (style.display !== 'contents') return e.checkVisibility() && style.contentVisibility !== 'hidden'
    }
    return false
  }
  // Text in it is drawn: its contents are drawn and its own visibility is visible (a
  // descendant may override a hidden ancestor).
  const textDrawn = (element: Element) => contentsDrawn(element) && getComputedStyle(box(element)!).visibility === 'visible'
  // A form control is laid out and visible.
  const drawn = (element: Element) => !!box(element)?.checkVisibility({ visibilityProperty: true })
  const add = (element: Element, pseudo: string | null, text: string, where = element.tagName.toLowerCase() + (pseudo ?? '')) => {
    const style = getComputedStyle(element, pseudo)
    if (!style.fontFamily.includes('Noto Sans SC')) return
    for (const char of text.match(cjk) ?? []) {
      const key = [style.fontFamily, style.fontWeight, style.fontStyle, char].join('|')
      if (!probes.has(key)) probes.set(key, { family: style.fontFamily, weight: style.fontWeight, style: style.fontStyle, char, where })
    }
  }
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement
    // A <textarea>'s text node is only its default value; what it draws is collected below.
    if (!parent || parent.closest('script, style, template, noscript, head, svg title, svg desc, textarea') || !textDrawn(parent)) continue
    // Text directly inside a closed <details> (outside its <summary>) is not drawn.
    if (parent instanceof HTMLDetailsElement && !parent.open) continue
    add(parent, null, (walker.currentNode as Text).data)
  }
  // Generated content: the browser's own serialization of the computed `content` value.
  const unescape = (s: string) => s.replace(/\\([\da-fA-F]{1,6}) ?|\\(.)/g, (_, hex, ch) => hex ? String.fromCodePoint(parseInt(hex, 16)) : ch)
  for (const element of document.querySelectorAll('body *')) {
    // A pseudo-element is drawn when its element's contents are drawn (display:contents
    // included, content-visibility:hidden excluded) and its own computed visibility is
    // visible, whatever the element's visibility is.
    if (!contentsDrawn(element)) continue
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(element, pseudo)
      const content = style.content
      if (!content || content === 'none' || content === 'normal' || style.display === 'none' || style.visibility !== 'visible') continue
      const text = [...content.matchAll(/"((?:[^"\\]|\\.)*)"|attr\(\s*([\w-]+)\s*\)/g)].map(m => m[2] ? element.getAttribute(m[2]) ?? '' : unescape(m[1])).join('')
      add(element, pseudo, text)
    }
  }
  // Form controls draw their value, or their placeholder while empty, outside the DOM text.
  const textTypes = new Set(['text', 'search', 'email', 'url', 'tel'])
  for (const control of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
    if (!drawn(control) || (control instanceof HTMLInputElement && !textTypes.has(control.type))) continue
    const name = control.tagName.toLowerCase()
    if (control.value) add(control, null, control.value, `${name}[value]`)
    else if (control.placeholder) add(control, '::placeholder', control.placeholder, `${name}::placeholder`)
  }
  return [...probes.values()]
}

// Render each (font stack, weight, style, character) once in an isolated probe and ask Chrome
// which platform fonts drew it. A probe drawn by any non-site font is a missing glyph.
export async function auditPage(page: Page, route: string, cache: ProbeCache = new Set()): Promise<{ probes: number; misses: Miss[] }> {
  const all = await page.evaluate(collectInPage, notoPattern)
  const probes = all.filter(p => !cache.has([p.family, p.weight, p.style, p.char].join('|')))
  if (!probes.length) return { probes: 0, misses: [] }
  await page.evaluate(async list => {
    const box = document.createElement('div')
    box.id = '__font-probes'
    box.setAttribute('aria-hidden', 'true')
    box.style.cssText = 'position:absolute;left:0;top:0;opacity:0;pointer-events:none;'
    for (const [i, p] of list.entries()) {
      const span = document.createElement('span')
      span.dataset.fontProbe = String(i)
      span.style.cssText = `font-family:${p.family};font-weight:${p.weight};font-style:${p.style}`
      span.textContent = p.char
      box.append(span)
    }
    document.body.append(box)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    await document.fonts.ready
  }, probes)
  const cdp: CDPSession = await page.context().newCDPSession(page)
  const misses: Miss[] = []
  try {
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '#__font-probes > span' })
    for (const [i, nodeId] of nodeIds.entries()) {
      const p = probes[i]
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      cache.add([p.family, p.weight, p.style, p.char].join('|'))
      if (!fonts.length || fonts.some(f => !f.isCustomFont || !siteFont.test(f.familyName))) misses.push({ route, char: p.char, code: `U+${p.char.codePointAt(0)!.toString(16).toUpperCase()}`, where: p.where, family: p.family, weight: p.weight, fonts: fonts.map(f => `${f.familyName}${f.isCustomFont ? '' : ' (system)'}`) })
    }
  } finally {
    await cdp.detach()
    await page.evaluate(() => document.getElementById('__font-probes')?.remove())
  }
  return { probes: probes.length, misses }
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    await document.fonts.ready
  })
}

// Wait for the corpus list to finish the request a UI action started.
async function corpusAction(page: Page, action: () => Promise<unknown>) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/corpus')
  await action()
  await response
  await page.waitForFunction(() => !/搜索中|Searching/.test(document.querySelector('.result-count')?.textContent ?? ''))
  await settle(page)
}

// States the corpus page reaches after the first paint: every result page, a search with
// results, the empty state, the invalid-filter and unavailable errors, and the loading text.
async function corpusStates(page: Page, audit: (state: string) => Promise<void>) {
  const next = page.locator('.pagination button').last()
  for (let n = 2; await next.isEnabled(); n++) {
    await corpusAction(page, () => next.click())
    await audit(`page ${n}`)
  }
  const search = page.locator('#corpus-q')
  const tag = (await page.locator('.tag-filters button').nth(1).textContent()) ?? ''
  await corpusAction(page, () => search.fill(tag))
  await audit(`search "${tag}"`)
  await corpusAction(page, () => search.fill('zzzz-no-such-record'))
  await audit('empty result')
  await corpusAction(page, () => search.fill(''))
  const dates = page.locator('.corpus-filter-row input[type="date"]')
  await corpusAction(page, () => dates.nth(0).fill('2030-01-02'))
  await corpusAction(page, () => dates.nth(1).fill('2030-01-01'))
  await audit('invalid filter')
  await page.route('**/api/corpus?*', route => route.fulfill({ status: 500, body: '{}' }))
  await corpusAction(page, () => dates.nth(1).fill(''))
  await audit('unavailable')
  await page.unroute('**/api/corpus?*')
  let release!: () => void
  const held = new Promise<void>(r => { release = r })
  await page.route('**/api/corpus?*', async route => { await held; await route.continue() })
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/corpus')
  await page.getByRole('button', { name: /重试|Retry/ }).click()
  await page.waitForFunction(() => /搜索中|Searching/.test(document.querySelector('.result-count')?.textContent ?? ''))
  await settle(page)
  await audit('loading')
  release()
  await response
  await page.unroute('**/api/corpus?*')
}

// The gate for one route: the page as loaded at desktop and phone widths, with its <details>
// opened, plus, on the corpus page, every state its paging and search reach. One probe cache
// per document.
export async function auditRoute(page: Page, route: string): Promise<{ probes: number; misses: Miss[] }> {
  const cache: ProbeCache = new Set()
  const misses: Miss[] = []
  let probes = 0
  const audit = async (state: string) => {
    const result = await auditPage(page, state ? `${route} (${state})` : route, cache)
    probes += result.probes
    misses.push(...result.misses)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(route, { waitUntil: 'networkidle' })
  await settle(page)
  await audit('')
  await page.setViewportSize({ width: 320, height: 800 })
  await settle(page)
  await audit('320px')
  await page.setViewportSize({ width: 1440, height: 900 })
  // Closed <details> (exercise answers) draw their text once a reader opens them.
  if (await page.evaluate(() => { const closed = [...document.querySelectorAll('details:not([open])')] as HTMLDetailsElement[]; for (const d of closed) d.open = true; return closed.length })) {
    await settle(page)
    await audit('details opened')
  }
  if (/\/corpus$/.test(route)) await corpusStates(page, audit)
  return { probes, misses }
}
