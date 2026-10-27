import { expect, test, type Page } from '@playwright/test'

// <link rel="alternate" type="text/markdown"> names the current page's .md twin, after hydration and
// after in-site navigation (the client rewrites the language alternates in <head> on every route),
// including "/" (the Chinese home) and the licences view.
const markdownHref = (page: Page) => page.evaluate(() => [...document.querySelectorAll('link[rel="alternate"][type="text/markdown"]')].map(link => link.getAttribute('href')))
const expected = (pathname: string) => { const [, lang, slug] = pathname.split('/'); return [`/${lang || 'zh'}/${slug || 'index'}.md`] }
// The three hreflang links: this language, the other language, and x-default (always the Chinese page).
const hreflangs = (page: Page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(link => [link.getAttribute('hreflang')!, link.getAttribute('href')!])))
async function expectLanguageLinks(page: Page) {
  await expect.poll(async () => Object.keys(await hreflangs(page)).sort()).toEqual(['en', 'x-default', 'zh'])
  const links = await hreflangs(page)
  expect(await page.evaluate(() => document.querySelectorAll('link[rel="alternate"][hreflang]').length)).toBe(3)
  for (const href of Object.values(links)) expect(href).not.toMatch(/\.md$/)
  expect(links['x-default'], 'x-default is the Chinese page').toBe(links.zh)
}
for (const start of ['/', '/zh', '/en/review-and-pr', '/en/corpus', '/zh/licenses']) {
  test(`markdown alternate follows the page from ${start}`, async ({ page }) => {
    await page.goto(start)
    // Wait for hydration (React has attached its props to a button), then let its effects run.
    await page.waitForFunction(() => Object.keys(document.querySelector('.icon-button')!).some(key => key.startsWith('__reactProps')))
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))))
    await expect.poll(() => markdownHref(page)).toEqual(expected(new URL(page.url()).pathname))
    // Language alternates keep their hreflang and still point at HTML; x-default stays Chinese.
    await expectLanguageLinks(page)
    // Navigate inside the site (client-side, no reload) to an article, then back home.
    const marker = await page.evaluate(() => (window as unknown as { marker: number }).marker = Math.random())
    const lang = new URL(page.url()).pathname.split('/')[1] || 'zh'
    await page.locator(`a[href^="/${lang}/"][href$="learn-from-matt"]`).first().click()
    await expect(page).toHaveURL(new RegExp(`/${lang}/learn-from-matt$`))
    await expect.poll(() => markdownHref(page)).toEqual([`/${lang}/learn-from-matt.md`])
    await expectLanguageLinks(page)
    // The footer's licences link opens the licences view in-site; its twin is licenses.md.
    await page.locator('footer .footer-note a').click()
    await expect(page).toHaveURL(new RegExp(`/${lang}/licenses$`))
    await expect.poll(() => markdownHref(page)).toEqual([`/${lang}/licenses.md`])
    await expectLanguageLinks(page)
    await page.locator('a.brand').click()
    await expect(page).toHaveURL(new RegExp(`/${lang}$`))
    await expect.poll(() => markdownHref(page)).toEqual([`/${lang}/index.md`])
    expect(await page.evaluate(() => (window as unknown as { marker: number }).marker), 'no full reload').toBe(marker)
  })
}
