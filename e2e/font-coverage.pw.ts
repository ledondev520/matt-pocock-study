import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { chromium, expect, test } from '@playwright/test'
import subsetFont from 'subset-font'
import { collectCharacters } from '../scripts/fonts.mjs'
import { auditPage, auditRoute, type Miss } from './font-coverage'
import { routes } from './routes'

// The "missing glyph fails the build" gate: open every built page (at 1440px and 320px, and on
// the corpus page through every result page, a search, the empty, error and loading states),
// take the characters it actually draws (text, script-written text, ::before/::after content,
// form placeholders and values) in elements whose font stack names Noto Sans SC, and fail if
// Chrome draws any of them with anything but the site's own web fonts.
test('every built page renders its CJK text with the site fonts, never a system fallback', async ({ browser }) => {
  test.setTimeout(600_000)
  expect(routes.length).toBeGreaterThan(40)
  const context = await browser.newContext()
  const misses: Miss[] = []
  let probes = 0
  try {
    const page = await context.newPage()
    for (const route of routes) {
      const result = await auditRoute(page, route)
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
const fixtures: { name: string; html?: string; script?: string; expected: string | string[] | null; drawnBySiteFont?: string }[] = [
  { name: 'entity assigned through innerHTML', script: `const p = document.createElement('p'); document.querySelector('main').append(p); p.innerHTML = "\\u0026#x4e02;"`, expected: absent },
  { name: 'surrogate pair built from two escapes', script: `const p = document.createElement('p'); document.querySelector('main').append(p); p.textContent = "\\uD842" + "\\uDFB7"`, expected: astral },
  { name: 'numeric entity in a style attribute that becomes a CSS escape in ::after', html: `<p class="fx-a" style="--label:'&#92;4e02'"></p><style>.fx-a::after { content: var(--label) }</style>`, expected: absent },
  { name: 'named entity (&bsol;) in a style attribute that becomes a CSS escape in ::after', html: `<p class="fx-b" style="--label:'&bsol;4e02'"></p><style>.fx-b::before { content: var(--label) }</style>`, expected: absent },
  // ˙ falls through to a system font; ˇ is drawn by Inter, so it is correctly not a miss.
  { name: 'named entities (&dot; &caron;) as text', html: `<p>&dot;&caron;</p>`, expected: '˙', drawnBySiteFont: 'ˇ' },
  // Legitimate content that must not be reported.
  { name: 'JSON value "\\\\uf900" (six ASCII characters once parsed)', script: `const p = document.createElement('p'); document.querySelector('main').append(p); p.textContent = JSON.parse('{"label":"\\\\\\\\uf900"}').label`, expected: null },
  { name: 'escape inside a CSS comment', html: `<style>/* \\f900 */ .fx-c::after { content: "ok" }</style><p class="fx-c"></p>`, expected: null },
  // Form controls draw placeholder and value text outside the DOM text nodes.
  { name: 'input placeholder', html: `<input type="search" placeholder="&#x4e02;">`, expected: absent },
  { name: 'input value', script: `const i = document.createElement('input'); document.querySelector('main').append(i); i.value = "\\u4e02"`, expected: absent },
  // Nothing is drawn for these, so they must not be reported.
  { name: 'hidden, display:none, visibility:hidden and closed-<details> text, SVG <title>/<desc>', html: `<p hidden>&#x4e02;</p><div style="display:none"><span>&#x4e02;</span></div><p style="visibility:hidden">&#x4e02;</p><p class="fx-d" style="--label:'&#92;4e02'"></p><style>.fx-d::after { content: var(--label); display: none }</style><details><summary>x</summary>&#x4e02;</details><svg width="20" height="20"><title>&#x4e02;</title><desc>&#x4e02;</desc><rect width="20" height="20"/></svg>`, expected: null },
]

test.describe('font coverage gate fixtures', () => {
  test.beforeAll(async () => {
    expect((await collectCharacters()).has(absent)).toBe(false)
  })
  for (const fixture of fixtures) {
    test(`${fixture.expected ? 'catches' : 'does not report'}: ${fixture.name}`, async ({ page }) => {
      await page.goto('/zh/learning-path', { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      expect((await auditPage(page, 'baseline')).misses).toEqual([])
      if (fixture.html) await page.evaluate(html => { document.querySelector('main')!.insertAdjacentHTML('beforeend', html) }, fixture.html)
      if (fixture.script) await page.evaluate(code => { new Function(code)() }, fixture.script)
      const { misses } = await auditPage(page, 'fixture')
      if (fixture.expected) expect(misses.map(m => m.char)).toContain(fixture.expected)
      else expect(misses).toEqual([])
      if (fixture.drawnBySiteFont) expect(misses.map(m => m.char)).not.toContain(fixture.drawnBySiteFont)
    })
  }
})

test.describe('font coverage gate: states, cache and font source', () => {
  test('catches a character that only a later corpus page shows', async ({ page }) => {
    // Page 2 of the results carries a record with a character outside the subset.
    await page.route('**/api/corpus?*', async route => {
      const url = new URL(route.request().url())
      const response = await route.fetch()
      const body = await response.json()
      if (url.searchParams.get('offset') === '20' && !url.searchParams.get('q')) body.items[0].summary.zh += absent
      await route.fulfill({ response, json: body })
    })
    const { misses } = await auditRoute(page, '/zh/corpus')
    expect(misses.map(m => m.char)).toContain(absent)
  })

  test('re-checks a later page instead of trusting results from an earlier one', async ({ page }) => {
    await page.goto('/zh/learning-path', { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    expect((await auditPage(page, 'first visit')).misses).toEqual([])
    // Same text on a later page whose Noto font faces are gone (failed to load).
    await page.goto('/zh/learning-path', { waitUntil: 'networkidle' })
    await page.evaluate(async () => {
      for (const sheet of document.styleSheets) for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
        const rule = sheet.cssRules[i]
        if (rule instanceof CSSFontFaceRule && rule.style.getPropertyValue('font-family').includes('Noto Sans SC')) sheet.deleteRule(i)
      }
      await document.fonts.ready
    })
    expect((await auditPage(page, 'second visit')).misses.length).toBeGreaterThan(0)
  })

  test('does not accept a same-named system font in place of the web font', async () => {
    // A system font called "Noto Sans SC" that has the glyph, and no web font for it.
    const directory = await mkdtemp(join(tmpdir(), 'system-noto-'))
    try {
      const fontsource = dirname(createRequire(import.meta.url).resolve('@fontsource/noto-sans-sc/package.json'))
      const source = await readFile(join(fontsource, 'files/noto-sans-sc-chinese-simplified-400-normal.woff2'))
      await writeFile(join(directory, 'system-noto.ttf'), await subsetFont(source, '学', { targetFormat: 'truetype' }))
      await writeFile(join(directory, 'fonts.conf'), `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include><dir>${directory}</dir><cachedir>${directory}/cache</cachedir><match target="scan"><test name="file"><string>${join(directory, 'system-noto.ttf')}</string></test><edit name="family" mode="assign"><string>Noto Sans SC</string></edit></match></fontconfig>`)
      const browser = await chromium.launch({ env: { ...process.env, FONTCONFIG_FILE: join(directory, 'fonts.conf') } })
      try {
        const page = await browser.newPage()
        await page.setContent(`<p style="font-family: 'Noto Sans SC'">学</p>`)
        const { misses } = await auditPage(page, 'system font')
        expect(misses).toEqual([expect.objectContaining({ char: '学', fonts: [expect.stringMatching(/^Noto Sans SC\b.* \(system\)$/)] })])
      } finally { await browser.close() }
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
