import { expect, test } from '@playwright/test'
import { routes } from './routes'

// Trailing punctuation must never start a line (or sit on a line of its own): that is how a wrap
// fix for long inline code once looked, "SKILL.md" at the end of a line and "." alone below it.
// The check works on what is visible: inside each block (nearest non-inline ancestor) it walks the
// characters that have a painted box, in order, and looks at the first character of every visual
// line, including the block's first line. Hidden text has no box, so it can neither start a line
// nor stand in for the visible character before one. Code (pre), SVG and similar are skipped.
function findLineStartPunctuation(): string[] {
  const cjk = /[、。，；：！？）】」』》〉…]/
  const latinTrailing = /[.,;:!?]/
  const closing = /[)\]}’”]/
  const skip = 'pre, script, style, svg, noscript, template, textarea'
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
  const last = new Map<Element, DOMRect>()
  const found: string[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement?.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT })
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement!
    if (getComputedStyle(parent).visibility !== 'visible') continue
    const block = blockOf(parent), text = node.data
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (/\s/.test(c)) continue
      const box = boxOf(node, i)
      if (!box) continue
      const before = last.get(block)
      last.set(block, box)
      if (before && box.top < before.bottom - 2) continue
      const next = text[i + 1] ?? ''
      if (cjk.test(c) || closing.test(c) || (latinTrailing.test(c) && (next === '' || /[\s)\]}’”]/.test(next)))) {
        const lineText = text.slice(i, i + 16).replace(/\s+/g, ' ')
        found.push(`"${c}" starts ${before ? 'a line' : 'its block'} in <${block.tagName.toLowerCase()}>: "${lineText}"`)
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
