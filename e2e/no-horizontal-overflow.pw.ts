import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

// Every HTML page of the build, derived from dist/ (no hand-written list): dist/x/index.html → /x,
// dist/404.html → /404.
function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? htmlFiles(path) : path.endsWith('.html') ? [path] : []
  })
}
const routes = htmlFiles('dist')
  .map(file => '/' + file.slice('dist/'.length).replace(/index\.html$/, '').replace(/\.html$/, ''))
  .map(route => (route.length > 1 ? route.replace(/\/$/, '') : route))
  .sort()

test('the build has pages to check', () => {
  expect(routes.length).toBeGreaterThan(40)
  expect(routes).toEqual(expect.arrayContaining(['/', '/zh', '/en', '/zh/cheat-sheets', '/en/cheat-sheets']))
})

for (const width of [320, 390, 1440]) for (const colorScheme of ['light', 'dark'] as const) {
  test(`no page scrolls horizontally at ${width}px (${colorScheme})`, async ({ browser }) => {
    test.setTimeout(240_000)
    const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme })
    const page = await context.newPage()
    const overflowing: string[] = []
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.scrollingElement!.scrollWidth, clientWidth: document.scrollingElement!.clientWidth }))
      if (scrollWidth > clientWidth) overflowing.push(`${route} scrollWidth=${scrollWidth} clientWidth=${clientWidth}`)
    }
    await context.close()
    expect(overflowing).toEqual([])
  })
}
