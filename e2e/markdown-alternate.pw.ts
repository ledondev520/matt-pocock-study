import { expect, test, type Page } from '@playwright/test'

// <link rel="alternate" type="text/markdown"> names the current page's .md twin, after hydration and
// after in-site navigation (the client rewrites the language alternates in <head> on every route).
const markdownHref = (page: Page) => page.evaluate(() => [...document.querySelectorAll('link[rel="alternate"][type="text/markdown"]')].map(link => link.getAttribute('href')))
const expected = (pathname: string) => { const [, lang, slug] = pathname.split('/'); return [`/${lang}/${slug || 'index'}.md`] }
for (const start of ['/zh', '/en/review-and-pr', '/en/corpus']) {
  test(`markdown alternate follows the page from ${start}`, async ({ page }) => {
    await page.goto(start)
    // Wait for hydration (React has attached its props to a button), then let its effects run.
    await page.waitForFunction(() => Object.keys(document.querySelector('.icon-button')!).some(key => key.startsWith('__reactProps')))
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))))
    await expect.poll(() => markdownHref(page)).toEqual(expected(new URL(page.url()).pathname))
    // Language alternates keep their hreflang and still point at HTML.
    const languages = await page.evaluate(() => [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(link => link.getAttribute('href')!))
    expect(languages).toHaveLength(2)
    for (const href of languages) expect(href).not.toMatch(/\.md$/)
    // Navigate inside the site (client-side, no reload) to an article, then back home.
    const marker = await page.evaluate(() => (window as unknown as { marker: number }).marker = Math.random())
    const lang = new URL(page.url()).pathname.split('/')[1]
    await page.locator(`a[href^="/${lang}/"][href$="learn-from-matt"]`).first().click()
    await expect(page).toHaveURL(new RegExp(`/${lang}/learn-from-matt$`))
    await expect.poll(() => markdownHref(page)).toEqual([`/${lang}/learn-from-matt.md`])
    await page.locator('a.brand').click()
    await expect(page).toHaveURL(new RegExp(`/${lang}$`))
    await expect.poll(() => markdownHref(page)).toEqual([`/${lang}/index.md`])
    expect(await page.evaluate(() => (window as unknown as { marker: number }).marker), 'no full reload').toBe(marker)
  })
}
