import { expect, test } from '@playwright/test'
import { collectCharacters } from '../scripts/fonts.mjs'
import { auditPage, type Miss } from './font-coverage'
import { routes } from './routes'

// The "missing glyph fails the build" gate: open every built page, take the characters it
// actually renders (including script-written text and ::before/::after content) in elements
// whose font stack names Noto Sans SC, and fail if Chrome draws any of them with a system font.
test('every built page renders its CJK text with the site fonts, never a system fallback', async ({ browser }) => {
  test.setTimeout(600_000)
  expect(routes.length).toBeGreaterThan(40)
  const context = await browser.newContext()
  const misses: Miss[] = []
  let probes = 0
  try {
    const page = await context.newPage()
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      const result = await auditPage(page, route)
      probes += result.probes
      misses.push(...result.misses)
    }
  } finally { await context.close() }
  expect(probes).toBeGreaterThan(1000)
  expect(misses).toEqual([])
})

// Characters outside the subset. 丂 is checked against the collected set so the fixture
// cannot silently become covered; 𠮷 is outside the simplified-Chinese source font.
const absent = '丂'
const astral = '\u{20BB7}'
const fixtures: { name: string; html?: string; script?: string; expected: string | null; drawnBySiteFont?: string }[] = [
  { name: 'entity assigned through innerHTML', script: `const p = document.createElement('p'); document.querySelector('main').append(p); p.innerHTML = "\\u0026#x4e02;"`, expected: absent },
  { name: 'surrogate pair built from two escapes', script: `const p = document.createElement('p'); document.querySelector('main').append(p); p.textContent = "\\uD842" + "\\uDFB7"`, expected: astral },
  { name: 'numeric entity in a style attribute that becomes a CSS escape in ::after', html: `<p class="fx-a" style="--label:'&#92;4e02'"></p><style>.fx-a::after { content: var(--label) }</style>`, expected: absent },
  { name: 'named entity (&bsol;) in a style attribute that becomes a CSS escape in ::after', html: `<p class="fx-b" style="--label:'&bsol;4e02'"></p><style>.fx-b::before { content: var(--label) }</style>`, expected: absent },
  // ˙ falls through to a system font; ˇ is drawn by Inter, so it is correctly not a miss.
  { name: 'named entities (&dot; &caron;) as text', html: `<p>&dot;&caron;</p>`, expected: '˙', drawnBySiteFont: 'ˇ' },
  // Legitimate content that must not be reported.
  { name: 'JSON value "\\\\uf900" (six ASCII characters once parsed)', script: `const p = document.createElement('p'); document.querySelector('main').append(p); p.textContent = JSON.parse('{"label":"\\\\\\\\uf900"}').label`, expected: null },
  { name: 'escape inside a CSS comment', html: `<style>/* \\f900 */ .fx-c::after { content: "ok" }</style><p class="fx-c"></p>`, expected: null },
]

test.describe('font coverage gate fixtures', () => {
  test.beforeAll(async () => {
    expect((await collectCharacters()).has(absent)).toBe(false)
  })
  for (const fixture of fixtures) {
    test(`${fixture.expected ? 'catches' : 'does not report'}: ${fixture.name}`, async ({ page }) => {
      await page.goto('/zh/learning-path', { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      expect((await auditPage(page, 'baseline', {})).misses).toEqual([])
      if (fixture.html) await page.evaluate(html => { document.querySelector('main')!.insertAdjacentHTML('beforeend', html) }, fixture.html)
      if (fixture.script) await page.evaluate(code => { new Function(code)() }, fixture.script)
      const { misses } = await auditPage(page, 'fixture', {})
      if (fixture.expected) expect(misses.map(m => m.char)).toContain(fixture.expected)
      else expect(misses).toEqual([])
      if (fixture.drawnBySiteFont) expect(misses.map(m => m.char)).not.toContain(fixture.drawnBySiteFont)
    })
  }
})
