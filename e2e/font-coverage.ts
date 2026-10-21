import type { CDPSession, Page } from '@playwright/test'
import { notoPattern } from '../scripts/fonts.mjs'

// Fonts the site ships. Anything else in a CDP platform-font report is a system fallback.
const siteFont = /^(Noto Sans SC|Inter|Space Grotesk|JetBrains Mono)\b/
export type Miss = { route: string; char: string; code: string; where: string; family: string; weight: string; fonts: string[] }
type Probe = { family: string; weight: string; style: string; char: string; where: string }

// Every character the page actually renders (text nodes, including ones written by scripts,
// plus ::before/::after content) in an element whose font stack names Noto Sans SC.
function collectInPage(pattern: string): Probe[] {
  const cjk = new RegExp(pattern, 'gu')
  const probes = new Map<string, Probe>()
  const add = (element: Element, pseudo: string | null, text: string) => {
    const style = getComputedStyle(element, pseudo)
    if (!style.fontFamily.includes('Noto Sans SC')) return
    for (const char of text.match(cjk) ?? []) {
      const key = [style.fontFamily, style.fontWeight, style.fontStyle, char].join('|')
      if (!probes.has(key)) probes.set(key, { family: style.fontFamily, weight: style.fontWeight, style: style.fontStyle, char, where: element.tagName.toLowerCase() + (pseudo ?? '') })
    }
  }
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement
    if (parent && !parent.closest('script, style, template, noscript, head')) add(parent, null, (walker.currentNode as Text).data)
  }
  // Generated content: the browser's own serialization of the computed `content` value.
  const unescape = (s: string) => s.replace(/\\([\da-fA-F]{1,6}) ?|\\(.)/g, (_, hex, ch) => hex ? String.fromCodePoint(parseInt(hex, 16)) : ch)
  for (const element of document.querySelectorAll('body *')) for (const pseudo of ['::before', '::after']) {
    const content = getComputedStyle(element, pseudo).content
    if (!content || content === 'none' || content === 'normal') continue
    const text = [...content.matchAll(/"((?:[^"\\]|\\.)*)"|attr\(\s*([\w-]+)\s*\)/g)].map(m => m[2] ? element.getAttribute(m[2]) ?? '' : unescape(m[1])).join('')
    add(element, pseudo, text)
  }
  return [...probes.values()]
}

const checked = new WeakMap<object, Set<string>>()

// Render each (font stack, weight, style, character) once in an isolated probe and ask Chrome
// which platform fonts drew it. A probe drawn by any non-site font is a missing glyph.
export async function auditPage(page: Page, route: string, cache: object = page.context()): Promise<{ probes: number; misses: Miss[] }> {
  const seen = checked.get(cache) ?? new Set<string>()
  checked.set(cache, seen)
  const all = await page.evaluate(collectInPage, notoPattern)
  const probes = all.filter(p => !seen.has([p.family, p.weight, p.style, p.char].join('|')))
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
      seen.add([p.family, p.weight, p.style, p.char].join('|'))
      if (!fonts.length || fonts.some(f => !siteFont.test(f.familyName))) misses.push({ route, char: p.char, code: `U+${p.char.codePointAt(0)!.toString(16).toUpperCase()}`, where: p.where, family: p.family, weight: p.weight, fonts: fonts.map(f => f.familyName) })
    }
  } finally {
    await cdp.detach()
    await page.evaluate(() => document.getElementById('__font-probes')?.remove())
  }
  return { probes: probes.length, misses }
}
