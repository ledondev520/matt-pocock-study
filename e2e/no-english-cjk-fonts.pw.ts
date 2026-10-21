import { expect, test } from '@playwright/test'
import { routes } from './routes'

const englishRoutes = routes.filter(route => route === '/en' || route.startsWith('/en/'))
for (const colorScheme of ['light', 'dark'] as const) {
  test(`English routes never request Noto Sans SC fonts (${colorScheme})`, async ({ browser }) => {
    test.setTimeout(240_000)
    expect(englishRoutes.length).toBeGreaterThan(20)
    const requests: string[] = []
    for (const route of englishRoutes) {
      // A fresh context for each route catches font requests that a shared cache would hide.
      const context = await browser.newContext({ colorScheme })
      await context.addInitScript(theme => localStorage.setItem('theme', theme), colorScheme)
      context.on('request', request => {
        if (/noto-sans-sc.*\.(?:woff2?|otf|ttf)(?:[?#]|$)/i.test(request.url())) requests.push(`${route}: ${request.url()}`)
      })
      try {
        const page = await context.newPage()
        await page.goto(route, { waitUntil: 'networkidle' })
        await page.evaluate(() => document.fonts.ready)
        await expect(page.locator('html')).toHaveClass(colorScheme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
      } finally { await context.close() }
    }
    expect(requests).toEqual([])
  })
}
