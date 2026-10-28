import { expect, test, type Page } from '@playwright/test'

// The home search: the index is not fetched for the first paint, only once the box is used; Chinese
// fragments and English words both find entries; results are reachable and opened by keyboard; a
// query without matches says so.
const indexRequests = (page: Page) => {
  const seen: string[] = []
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/search/')) seen.push(new URL(request.url()).pathname) })
  return seen
}
// Typing before React has attached its handlers would test the server HTML, not the search.
const hydrated = (page: Page) => page.waitForFunction(() => Object.keys(document.getElementById('site-search')!).some(key => key.startsWith('__reactProps')))
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`zh home search finds a method by a Chinese fragment and opens it by keyboard (${viewport.width}px)`, async ({ browser }) => {
    const context = await browser.newContext({ viewport })
    try {
      const page = await context.newPage()
      const requests = indexRequests(page)
      await page.goto('/zh', { waitUntil: 'networkidle' })
      await hydrated(page)
      expect(requests).toEqual([])
      const box = page.getByRole('searchbox', { name: '搜索' })
      await expect(box).toBeVisible()
      // The first "what to learn today" entry, searched by three characters from inside its title.
      const first = page.locator('.today h2 a').first()
      const title = (await first.textContent())!.trim()
      const href = (await first.getAttribute('href'))!
      await box.focus()
      expect(requests).toEqual(['/search/zh.json'])
      await page.keyboard.type([...title].slice(1, 4).join(''))
      const results = page.locator('#site-search-results a')
      await expect(results.first()).toBeVisible()
      expect(await results.evaluateAll(links => links.map(a => a.getAttribute('href')))).toContain(href)
      await page.keyboard.press('ArrowDown')
      await expect(results.first()).toBeFocused()
      const target = (await results.first().getAttribute('href'))!
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp(`${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
      expect(requests).toEqual(['/search/zh.json'])
    } finally { await context.close() }
  })
}
test('en home search finds a note by an English word and Enter opens the first result', async ({ page }) => {
  await page.goto('/en')
  await hydrated(page)
  const box = page.getByRole('searchbox', { name: 'Search' })
  await box.fill('review')
  const results = page.locator('#site-search-results a')
  await expect(results.first()).toBeVisible()
  expect(await results.evaluateAll(links => links.map(a => a.getAttribute('href')))).toContain('/en/review-and-pr')
  const target = (await results.first().getAttribute('href'))!
  await box.press('Enter')
  await expect(page).toHaveURL(new RegExp(`${target}$`))
  await expect(page.locator('h1')).not.toHaveText('What to learn today')
})
test('a query without matches shows the no-results state, and Escape clears it', async ({ page }) => {
  for (const [path, label, none] of [['/zh', '搜索', '没有找到'], ['/en', 'Search', 'No results']] as const) {
    await page.goto(path)
    await hydrated(page)
    const box = page.getByRole('searchbox', { name: label })
    await box.fill('zzqqxxyy')
    await expect(page.getByRole('status')).toHaveText(none)
    await expect(page.locator('#site-search-results')).toBeHidden()
    await box.press('Escape')
    await expect(box).toHaveValue('')
    // The status line is emptied (and, being empty, takes no space).
    await expect(page.locator('.search-status')).toHaveText('')
  }
})

for (const lang of ['zh', 'en'] as const) {
  test(`${lang} search opens the independently expected method step and scrolls to it`, async ({ page }) => {
    await page.goto(`/${lang}`)
    await hydrated(page)
    const box = page.getByRole('searchbox', { name: lang === 'zh' ? '搜索' : 'Search' })
    await box.fill(lang === 'zh' ? '伪代码' : 'pseudocode')
    const result = page.locator(`#site-search-results a[href="/${lang}/methods/pr-review#s4"]`)
    await expect(result).toBeVisible()
    await result.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${lang}/methods/pr-review#s4$`))
    await expect(page.locator('#s4')).toBeVisible()
    await expect(page.locator('#s4')).toBeInViewport()
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  })
}
