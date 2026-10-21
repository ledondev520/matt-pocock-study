import { expect, test } from '@playwright/test'
import { routes } from './routes'

// Trailing punctuation must never start a line (or sit on a line of its own): that is how a wrap
// fix for long inline code once looked, "SKILL.md" at the end of a line and "." alone below it.
// Checked in the browser on every page of the build at the narrow widths where wrapping happens.
function findLineStartPunctuation(): string[] {
  const cjk = /[、。，；：！？）】」』》〉…]/
  const latinTrailing = /[.,;:!?]/
  const closing = /[)\]}’”]/
  const skip = 'pre, script, style, svg, noscript, template, textarea'
  const blockOf = (node: Node) => {
    for (let el = node.parentElement; el; el = el.parentElement) if (!getComputedStyle(el).display.startsWith('inline')) return el
    return document.body
  }
  const rectOf = (node: Text, index: number) => { const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 1); return range.getBoundingClientRect() }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement?.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT })
  const found: string[] = []
  let prev: { node: Text, index: number } | null = null
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const text = node.data
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (/\s/.test(c)) continue
      const next = text[i + 1] ?? ''
      const candidate = cjk.test(c) || closing.test(c) || (latinTrailing.test(c) && (next === '' || /[\s)\]}’”]/.test(next)))
      if (candidate && prev && blockOf(prev.node) === blockOf(node)) {
        const here = rectOf(node, i), before = rectOf(prev.node, prev.index)
        if (here.width > 0 && before.width > 0 && here.top >= before.bottom - 2) {
          const context = (prev.node.data.slice(Math.max(0, prev.index - 24), prev.index + 1) + (prev.node === node ? '' : '⟨…⟩') + text.slice(i, i + 12)).replace(/\s+/g, ' ')
          found.push(`"${c}" starts a line after "${context}"`)
        }
      }
      prev = { node, index: i }
    }
  }
  return found
}

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
