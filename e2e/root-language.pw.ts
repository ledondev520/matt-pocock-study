import { expect, test, type Page } from '@playwright/test'

// Opening "/" must show Chinese from the first paint and never swap languages. Every <h1> text and
// <html lang> the page ever has is recorded from before the first byte is parsed.
async function record(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { seen: string[] }).seen = seen
    const note = () => {
      const h1 = document.querySelector('h1')?.textContent
      const entry = `${document.documentElement?.lang ?? ''}|${h1 ?? ''}`
      if (h1 && seen.at(-1) !== entry) seen.push(entry)
    }
    new MutationObserver(note).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['lang'] })
  })
}
const seen = (page: Page) => page.evaluate(() => (window as unknown as { seen: string[] }).seen)

test('"/" shows the Chinese home page from the first paint and stays on it', async ({ page }) => {
  await record(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  expect(new URL(page.url()).pathname).toBe('/')
  expect(await page.locator('html').getAttribute('lang')).toBe('zh')
  expect(await seen(page)).toEqual(['zh|今天学什么'])
})

test('"/" with English navigator still opens in Chinese', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' })
  const page = await context.newPage()
  await record(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  expect(new URL(page.url()).pathname).toBe('/')
  expect(await seen(page)).toEqual(['zh|今天学什么'])
  await context.close()
})

// The stored-English case has to watch the "/" document itself, not just the /en one it ends on:
// a per-document `seen` list dies with "/". So every document reports to the test process through a
// binding, from its first script on: when it starts, every <h1>, and at every rendering opportunity
// (requestAnimationFrame runs before each paint) whether its body holds any Chinese text. The /en
// response is held for 1.5 s, so if "/" kept parsing or painted its Chinese body while waiting, the
// reports would show it.
test('a stored English choice goes to /en and the "/" document never renders Chinese', async ({ page }) => {
  await page.goto('/en')
  await page.evaluate(() => localStorage.setItem('lang', 'en'))
  await page.goto('about:blank')
  type Report = { path: string; kind: 'start' | 'h1' | 'frame'; lang: string; text: string; cjk: boolean }
  const reports: Report[] = []
  await page.exposeBinding('report', (_source, report: Report) => { reports.push(report) })
  await page.addInitScript(() => {
    const send = (window as unknown as { report: (r: unknown) => void }).report
    const path = location.pathname
    const cjk = () => /[\u3400-\u9fff]/.test(document.body?.textContent ?? '')
    const lang = () => document.documentElement?.lang ?? ''
    send({ path, kind: 'start', lang: lang(), text: '', cjk: false })
    let last = ''
    new MutationObserver(() => {
      const h1 = document.querySelector('h1')?.textContent ?? ''
      if (h1 && h1 !== last) { last = h1; send({ path, kind: 'h1', lang: lang(), text: h1, cjk: cjk() }) }
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['lang'] })
    const frame = () => { if (document.body) send({ path, kind: 'frame', lang: lang(), text: '', cjk: cjk() }); requestAnimationFrame(frame) }
    requestAnimationFrame(frame)
  })
  let held = 0
  await page.route(url => url.pathname === '/en', async route => { held++; await new Promise(resolve => setTimeout(resolve, 1500)); await route.continue() })
  await page.goto('/', { waitUntil: 'commit' })
  await page.waitForURL('**/en')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
  expect(held).toBe(1)
  const root = reports.filter(r => r.path === '/'), en = reports.filter(r => r.path === '/en')
  // The recorder did run inside "/"...
  expect(root.filter(r => r.kind === 'start')).toHaveLength(1)
  // ...and saw no heading and no Chinese text there, at any point or any frame.
  expect(root.filter(r => r.kind !== 'start')).toEqual(root.filter(r => r.kind === 'frame' && !r.cjk))
  // /en rendered English only.
  expect(en.filter(r => r.kind === 'h1').map(r => `${r.lang}|${r.text}`)).toEqual(['en|What to learn today'])
  expect(en.some(r => r.kind === 'frame')).toBe(true)
})
