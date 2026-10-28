import { expect, test } from '@playwright/test'

for (const lang of ['zh', 'en']) for (const width of [375, 1280]) {
  test(`method navigation, language links and anchors (${lang}, ${width}px)`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    try {
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
      await page.goto(`/${lang}/methods`)
      await page.waitForFunction(() => Object.keys(document.querySelector('.icon-button')!).some(key => key.startsWith('__reactProps')))
      const marker = await page.evaluate(() => (window as unknown as { methodMarker: number }).methodMarker = Math.random())
      await expect(page.locator('.methods-index .topic-card')).toHaveCount(31)
      await page.locator(`.topic-card a[href="/${lang}/methods/pr-review"]`).click()
      await expect(page.locator('.method-article')).toBeVisible()
      await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute('href', `/${lang}/methods/pr-review.md`)
      await page.evaluate(() => {
        const a = document.createElement('a')
        a.href = '#s1'
        a.id = 'method-anchor-fixture'
        a.textContent = 'Step'
        document.querySelector('.method-article')!.prepend(a)
      })
      await page.locator('#method-anchor-fixture').click()
      await expect(page).toHaveURL(new RegExp(`/${lang}/methods/pr-review#s1$`))
      await expect(page.locator('#s1')).toBeInViewport()
      const other = lang === 'zh' ? 'en' : 'zh'
      await page.locator('.language-toggle').click()
      await expect(page).toHaveURL(new RegExp(`/${other}/methods/pr-review$`))
      await expect(page.locator('html')).toHaveAttribute('lang', other)
      await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute('href', `/${other}/methods/pr-review.md`)
      await expect(page.locator('.method-nav [aria-current="page"]')).toHaveAttribute('href', `/${other}/methods/pr-review`)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await page.evaluate(() => (window as unknown as { methodMarker: number }).methodMarker)).toBe(marker)
      expect(errors).toEqual([])
    } finally { await context.close() }
  })
}
