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
  expect(await seen(page)).toEqual(['zh|想清楚，再动手。'])
})

test('"/" with English navigator still opens in Chinese', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' })
  const page = await context.newPage()
  await record(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  expect(new URL(page.url()).pathname).toBe('/')
  expect(await seen(page)).toEqual(['zh|想清楚，再动手。'])
  await context.close()
})

test('a stored English choice goes to /en before anything Chinese is shown', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('lang', 'en') } catch { /* opaque origin before the first navigation */ } })
  await record(page)
  await page.goto('/')
  await page.waitForURL('**/en')
  await page.waitForLoadState('networkidle')
  expect(await seen(page)).toEqual(['en|Think clearly.Build better.'])
})
