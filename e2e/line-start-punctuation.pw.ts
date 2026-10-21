import { expect, test } from '@playwright/test'
import { routes } from './routes'

// Trailing punctuation must never start a line (or sit on a line of its own): that is how a wrap
// fix for long inline code once looked, "SKILL.md" at the end of a line and "." alone below it.
// The check works on what is visible. A character counts only if it has a laid-out box and nothing
// on its ancestor chain hides it: visibility other than visible, opacity 0, a fully transparent text
// colour (color or -webkit-text-fill-color with alpha 0, and no visible stroke), or a visually hidden
// clip (clip / clip-path cutting the content down to 1px or less, or a box no larger than 1px with
// overflow hidden, as screen-reader-only text uses). Inside each block (nearest non-inline ancestor) the
// visible characters are read in order, and the first character of every visual line, including the
// block's first line, is checked. Hidden text can neither start a line nor stand in for the visible
// character before one. Whether ".,;:!?" ends a sentence is decided by the next visible character in
// the same block, across element boundaries, so ".<em>env</em>" is a file name, not a full stop.
// Code (pre), SVG and similar are skipped.
function findLineStartPunctuation(): string[] {
  const cjk = /[、。，；：！？）】」』》〉…]/
  const latinTrailing = /[.,;:!?]/
  const closing = /[)\]}’”]/
  const skip = 'pre, script, style, svg, noscript, template, textarea'
  const alpha = (colour: string) => {
    if (colour === 'transparent') return 0
    const inner = colour.match(/\(([^)]*)\)/)?.[1]
    if (!inner) return 1
    const parts = inner.includes('/') ? [inner.split('/')[1]] : inner.split(',').slice(3)
    if (!parts.length) return 1
    const value = parts[0].trim()
    return value.endsWith('%') ? parseFloat(value) / 100 : parseFloat(value)
  }
  const length = (value: string, size: number) => value.endsWith('%') ? (parseFloat(value) / 100) * size : parseFloat(value)
  const clippedAway = (el: Element, style: CSSStyleDeclaration) => {
    const rect = el.getBoundingClientRect()
    const clip = style.clip.match(/^rect\((.*)\)$/)?.[1].split(/[\s,]+/)
    if (clip && clip.length === 4 && clip.every(v => /^-?[\d.]+px$/.test(v))) {
      const [top, right, bottom, left] = clip.map(parseFloat)
      if (right - left <= 1 || bottom - top <= 1) return true
    }
    const clipPath = style.clipPath
    const inset = clipPath.match(/^inset\(([^)]*)\)/)?.[1].split(/\s+round\s+/)[0].trim().split(/\s+/)
    if (inset) {
      const [t, r = t, b = t, l = r] = inset
      if (rect.width - length(r, rect.width) - length(l, rect.width) <= 1 || rect.height - length(t, rect.height) - length(b, rect.height) <= 1) return true
    }
    const radius = clipPath.match(/^(?:circle|ellipse)\(\s*([^\s)]+)(?:\s+([^\s)]+))?/)
    if (radius && /^[\d.]+(px|%)$/.test(radius[1])) {
      const rx = length(radius[1], rect.width), ry = radius[2] && /^[\d.]+(px|%)$/.test(radius[2]) ? length(radius[2], rect.height) : rx
      if (Math.min(rx, ry) * 2 <= 1) return true
    }
    const polygon = clipPath.match(/^polygon\(([^)]*)\)/)?.[1]
    if (polygon) {
      const points = polygon.replace(/^\s*(nonzero|evenodd)\s*,/, '').split(',').map(p => p.trim().split(/\s+/))
      if (points.every(p => p.length === 2 && p.every(v => /^-?[\d.]+(px|%)$/.test(v)))) {
        const xs = points.map(([x]) => length(x, rect.width)), ys = points.map(([, y]) => length(y, rect.height))
        if (Math.max(...xs) - Math.min(...xs) <= 1 || Math.max(...ys) - Math.min(...ys) <= 1) return true
      }
    }
    if (style.display !== 'inline' && style.display !== 'contents') {
      if (rect.width <= 1 && style.overflowX !== 'visible') return true
      if (rect.height <= 1 && style.overflowY !== 'visible') return true
    }
    return false
  }
  // An element hides its text if it or any ancestor does; the answer is cached per element.
  const hiddenCache = new Map<Element, boolean>()
  const hides = (el: Element | null): boolean => {
    if (!el) return false
    const cached = hiddenCache.get(el)
    if (cached !== undefined) return cached
    const style = getComputedStyle(el)
    const own = parseFloat(style.opacity) === 0 || clippedAway(el, style)
    const result = own || hides(el.parentElement)
    hiddenCache.set(el, result)
    return result
  }
  const textInvisible = (parent: Element) => {
    const style = getComputedStyle(parent)
    if (style.visibility !== 'visible') return true
    const stroke = parseFloat(style.getPropertyValue('-webkit-text-stroke-width')) > 0 && alpha(style.getPropertyValue('-webkit-text-stroke-color')) > 0
    const fill = style.getPropertyValue('-webkit-text-fill-color') || style.color
    if ((alpha(style.color) === 0 || alpha(fill) === 0) && !stroke) return true
    return hides(parent)
  }
  const blocks = new Map<Element, Element>()
  const blockOf = (parent: Element) => {
    let block = blocks.get(parent)
    if (!block) {
      block = document.body
      for (let el: Element | null = parent; el; el = el.parentElement) if (!getComputedStyle(el).display.startsWith('inline')) { block = el; break }
      blocks.set(parent, block)
    }
    return block
  }
  const range = document.createRange()
  const boxOf = (node: Text, index: number) => {
    range.setStart(node, index); range.setEnd(node, index + 1)
    const rects = range.getClientRects()
    return rects.length && rects[0].width > 0 && rects[0].height > 0 ? rects[0] : null
  }
  // Pass 1: the visible characters of each block, in document order. Whitespace inside visible text
  // is kept (box or not) because it separates words; it never starts a line.
  type Char = { c: string, box: DOMRect | null }
  const chars = new Map<Element, Char[]>()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement?.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT })
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement!
    if (textInvisible(parent)) continue
    const block = blockOf(parent), text = node.data
    let list = chars.get(block)
    if (!list) chars.set(block, list = [])
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (/\s/.test(c)) { list.push({ c: ' ', box: null }); continue }
      const box = boxOf(node, i)
      if (box) list.push({ c, box })
    }
  }
  // Pass 2: the first visible character of each line, and what follows it in the same block.
  const sameLine = (a: DOMRect, b: DOMRect) => b.top < a.bottom - 2 && a.top < b.bottom - 2
  const found: string[] = []
  for (const [block, list] of chars) {
    let before: DOMRect | null = null
    for (let k = 0; k < list.length; k++) {
      const { c, box } = list[k]
      if (!box) continue
      const previous = before
      before = box
      if (previous && box.top < previous.bottom - 2) continue
      const next = list[k + 1]
      const endsSentence = !next || !next.box || closing.test(next.c) || !sameLine(box, next.box)
      if (cjk.test(c) || closing.test(c) || (latinTrailing.test(c) && endsSentence)) {
        const lineText = list.slice(k, k + 16).map(x => x.c).join('').replace(/\s+/g, ' ')
        found.push(`"${c}" starts ${previous ? 'a line' : 'its block'} in <${block.tagName.toLowerCase()}>: "${lineText}"`)
      }
    }
  }
  return found
}

test('the check sees punctuation at a block start, after hidden text and after a line break', async ({ page }) => {
  const check = async (html: string) => { await page.setContent(`<body style="width: 300px">${html}</body>`); return page.evaluate(findLineStartPunctuation) }
  expect(await check('<p>word</p><p>.</p>')).toHaveLength(1)
  expect(await check('<p>word<br><span hidden>hidden</span>.</p>')).toHaveLength(1)
  expect(await check('<p>word<br><span style="visibility: hidden">hidden</span>.</p>')).toHaveLength(1)
  expect(await check('<p>word<br>.</p>')).toHaveLength(1)
  expect(await check('<p>word<br>。</p>')).toHaveLength(1)
  // Controls: ordinary text, separate blocks and table cells, code blocks and file names.
  expect(await check('<p>One sentence. Another, longer sentence; it ends here.</p><p>Next.</p>')).toEqual([])
  expect(await check('<table><tr><td>a</td><td>b.</td></tr></table><pre>)\n.</pre><p>word<br>.env file</p>')).toEqual([])
})

test('text that is laid out but not visible cannot stand in for the visible character before a line start', async ({ page }) => {
  const check = async (html: string) => { await page.setContent(`<body style="width: 300px">${html}</body>`); return page.evaluate(findLineStartPunctuation) }
  const hidden = {
    'opacity 0': '<span style="opacity: 0">hidden</span>',
    'opacity 0 on an ancestor': '<span style="opacity: 0"><b>hidden</b></span>',
    'transparent color': '<span style="color: transparent">hidden</span>',
    'color with alpha 0': '<span style="color: rgb(0 0 0 / 0)">hidden</span>',
    'transparent -webkit-text-fill-color': '<span style="-webkit-text-fill-color: transparent">hidden</span>',
    'clip-path cut to nothing': '<span style="clip-path: inset(50%)">hidden</span>',
    'clip-path circle of radius 0 on an ancestor': '<span style="clip-path: circle(0)"><i>hidden</i></span>',
    '1px box with overflow hidden': '<span style="display: inline-block; width: 1px; height: 1px; overflow: hidden">hidden</span>',
    'screen-reader-only (absolute, clip rect 0)': '<span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap">hidden</span>',
  }
  for (const [name, span] of Object.entries(hidden)) expect(await check(`<p>word<br>${span}.</p>`), name).toHaveLength(1)
  // Visually hidden punctuation is not on screen, so it starts nothing.
  expect(await check('<p>word <span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">.</span></p>')).toEqual([])
  // Controls: half-transparent text and outlined text with a transparent fill are visible.
  expect(await check('<p>word<br><span style="opacity: 0.5">seen</span>.</p>')).toEqual([])
  expect(await check('<p>word<br><span style="-webkit-text-fill-color: transparent; -webkit-text-stroke: 1px black">seen</span>.</p>')).toEqual([])
})

test('a full stop is told from a file name by the next visible character, across elements', async ({ page }) => {
  const check = async (html: string) => { await page.setContent(`<body style="width: 300px">${html}</body>`); return page.evaluate(findLineStartPunctuation) }
  expect(await check('<p>word<br>.<em>env</em> file</p>')).toEqual([])
  expect(await check('<p>word<br>.<span hidden>x</span><em>env</em> file</p>')).toEqual([])
  expect(await check('<p>word<br>.<em> next</em></p>')).toHaveLength(1)
  expect(await check('<p>word<br>.<span hidden>env</span></p>')).toHaveLength(1)
  expect(await check('<p>word<br>.<br>env</p>')).toHaveLength(1)
})

for (const width of [320, 390]) for (const colorScheme of ['light', 'dark'] as const) {
  test(`no line starts with trailing punctuation at ${width}px (${colorScheme})`, async ({ browser }) => {
    test.setTimeout(300_000)
    const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme })
    const page = await context.newPage()
    const problems: string[] = []
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      for (const problem of await page.evaluate(findLineStartPunctuation)) problems.push(`${route}: ${problem}`)
    }
    await context.close()
    expect(problems).toEqual([])
  })
}
