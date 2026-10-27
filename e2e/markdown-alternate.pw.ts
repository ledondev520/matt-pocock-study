import { expect, test, type Page } from '@playwright/test'

// <link rel="alternate" type="text/markdown"> names the current page's .md twin, after hydration and
// after in-site navigation (the client rewrites the language alternates in <head> on every route),
// including "/" (the Chinese home), the licences view and the knowledge base view.
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
for (const start of ['/', '/zh', '/en/review-and-pr', '/en/corpus', '/zh/licenses', '/en/knowledge', '/zh/knowledge']) {
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
    // The header's knowledge base link: its twin is knowledge.md.
    await page.locator(`header a[href="/${lang}/knowledge"]`).first().click()
    await expect(page).toHaveURL(new RegExp(`/${lang}/knowledge$`))
    await expect.poll(() => markdownHref(page)).toEqual([`/${lang}/knowledge.md`])
    await expectLanguageLinks(page)
    await page.locator('a.brand').click()
    await expect(page).toHaveURL(new RegExp(`/${lang}$`))
    await expect.poll(() => markdownHref(page)).toEqual([`/${lang}/index.md`])
    expect(await page.evaluate(() => (window as unknown as { marker: number }).marker), 'no full reload').toBe(marker)
  })
}

// 404s have no Markdown twin. The client removes the link when it renders a 404 and adds it back when
// the reader leaves one (src/App.tsx). Entering: a one-level and a multi-level unknown path, both
// served as 404 without the link; leaving: the brand link (client-side, no reload); then a client-side
// 404 again (pushState + popstate to /<lang>/404, whose page data exists, so nothing reloads).
const hydrated = async (page: Page) => {
  await page.waitForFunction(() => Object.keys(document.querySelector('.icon-button')!).some(key => key.startsWith('__reactProps')))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))))
}
for (const start of ['/zh/no-such-page', '/en/a/b']) {
  test(`markdown alternate is absent on a 404 and comes back after leaving it, from ${start}`, async ({ page }) => {
    const response = await page.goto(start)
    expect(response!.status()).toBe(404)
    await hydrated(page)
    const lang = start.split('/')[1]
    expect(await markdownHref(page), 'no Markdown link on the 404').toEqual([])
    await expectLanguageLinks(page)
    const marker = await page.evaluate(() => (window as unknown as { marker: number }).marker = Math.random())
    await page.locator('a.brand').click()
    await expect(page).toHaveURL(new RegExp(`/${lang}$`))
    await expect.poll(() => markdownHref(page), 'the link is added back on the home page').toEqual([`/${lang}/index.md`])
    await expectLanguageLinks(page)
    await page.evaluate(path => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')) }, `/${lang}/404`)
    await expect(page.locator('.missing-page')).toBeVisible()
    await expect.poll(() => markdownHref(page), 'the link is removed on a client-side 404').toEqual([])
    await expectLanguageLinks(page)
    expect(await page.evaluate(() => (window as unknown as { marker: number }).marker), 'no full reload').toBe(marker)
  })
}
