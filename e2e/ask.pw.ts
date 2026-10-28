import { expect, test, type Page } from '@playwright/test'

const hydrated = (page: Page) => page.waitForFunction(() => Object.keys(document.getElementById('site-search')!).some(key => key.startsWith('__reactProps')))
const post = 'https://x.com/mattpocockuk/status/1000000000000000001'

for (const lang of ['zh', 'en'] as const) {
  const label = lang === 'zh' ? '搜索' : 'Search'
  const question = lang === 'zh' ? 'PR' : 'review'
  for (const width of [320, 1440]) {
    test(`${lang} ask loads on demand, renders short quotes and original links (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const requests: string[] = [], errors: string[] = []
      page.on('request', r => { requests.push(new URL(r.url()).pathname) })
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/api/ask', async route => {
        expect(route.request().method()).toBe('POST')
        expect(route.request().postDataJSON()).toEqual({ q: question, lang })
        await route.fulfill({ json: { mode: 'answer', title: 'Small PRs', points: [{ title: 'Ship first', text: 'Keep the change reversible.', quote: 'easy to roll back', quoteUrl: post, cites: [1] }], citations: [{ n: 1, kind: 'post', sourceUrl: post }], cached: false } })
      })
      await page.goto(`/${lang}`, { waitUntil: 'networkidle' })
      await hydrated(page)
      expect(requests.filter(p => /AskPanel-|\/api\/ask|\/search\//.test(p))).toEqual([])
      const search = page.getByRole('searchbox', { name: label }), toggle = page.locator('.ask-toggle')
      await search.focus()
      await page.keyboard.press('Tab')
      await expect(toggle).toBeFocused()
      await page.keyboard.press('Enter')
      const form = page.locator('.ask-panel form')
      await expect(form.locator('textarea')).toBeFocused()
      expect(requests.some(p => /AskPanel-.*\.js$/.test(p))).toBe(true)
      expect(requests.filter(p => p === '/api/ask')).toEqual([])
      await form.locator('textarea').fill(question)
      await form.getByRole('button').click()
      await expect(page.locator('.ask-result blockquote')).toContainText('easy to roll back')
      await expect(page.locator('.ask-result blockquote a')).toHaveAttribute('href', post)
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      const panel = await page.locator('.ask-panel').boundingBox()
      expect(panel!.x).toBeGreaterThanOrEqual(0)
      expect(panel!.x + panel!.width).toBeLessThanOrEqual(width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await toggle.click()
      await expect(page.locator('#home-ask')).toBeHidden()
      expect(errors).toEqual([])
    })
  }

  for (const failure of ['404', '503', 'network', 'malformed', 'search', 'limited']) {
    test(`${lang} ask quietly returns to local search on ${failure}`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/api/ask', async route => {
        if (failure === 'network') return route.abort()
        if (failure === 'malformed') return route.fulfill({ json: { mode: 'answer' } })
        if (failure === 'search') return route.fulfill({ json: { mode: 'search', reason: 'disabled', message: 'Must never be shown', citations: [] } })
        if (failure === 'limited') return route.fulfill({ status: 429, json: { reason: 'per_ip_minute' } })
        await route.fulfill({ status: Number(failure), contentType: 'text/html', body: '<h1>Must never be shown</h1>' })
      })
      await page.goto(`/${lang}`)
      await hydrated(page)
      await page.locator('.ask-toggle').click()
      await page.locator('#ask-q').fill(question)
      await page.locator('.ask-panel button[type="submit"]').click()
      const search = page.getByRole('searchbox', { name: label })
      await expect(search).toHaveValue(question)
      await expect(search).toBeFocused()
      await expect(page.locator('#home-ask')).toBeHidden()
      await expect(page.locator('#site-search-results a').first()).toBeVisible()
      await expect(page.locator('main')).not.toContainText(/Must never be shown|暂时不可用|unavailable|Too many/)
      expect(errors).toEqual([])
    })
  }
}
