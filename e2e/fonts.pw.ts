import { expect, test } from '@playwright/test'
import { routes } from './routes'

for (const colorScheme of ['light', 'dark'] as const) {
  test(`every built route uses only local Latin/code web fonts (${colorScheme})`, async ({ browser, baseURL }) => {
    test.setTimeout(600_000)
    expect(routes.filter(route => route.startsWith('/zh')).length).toBeGreaterThan(20)
    expect(routes.filter(route => route.startsWith('/en')).length).toBeGreaterThan(20)
    for (const route of routes) {
      const context = await browser.newContext({ colorScheme })
      await context.addInitScript(theme => localStorage.setItem('theme', theme), colorScheme)
      const requests: string[] = []
      const errors: string[] = []
      context.on('request', request => {
        if (request.resourceType() === 'font' || /\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(request.url())) requests.push(request.url())
      })
      try {
        const page = await context.newPage()
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(route, { waitUntil: 'networkidle' })
        await page.evaluate(() => document.fonts.ready)
        await expect(page.locator('html')).toHaveClass(colorScheme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
        expect(requests.length, route).toBeGreaterThan(0)
        for (const request of requests) {
          const url = new URL(request)
          expect(url.origin, route).toBe(new URL(baseURL!).origin)
          expect(url.pathname, route).toMatch(/^\/assets\/(?:source-sans-3-latin-wght|jetbrains-mono)-[^/]+\.woff2$/)
          expect(url.pathname, route).not.toMatch(/noto|cjk|han|inter-|space-grotesk/i)
        }
        const diagramFonts = await page.locator('svg[class^="arch-"] text:not([font-family*="Mono"])').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontFamily))
        for (const family of diagramFonts) expect(family, route).toContain('Source Sans 3')
        if (route === '/zh' || route === '/en') {
          for (const weight of [400, 700]) {
            expect(await page.evaluate(weight => document.fonts.check(`${weight} 16px "Source Sans 3"`, 'Latin'), weight)).toBe(true)
            const id = `latin-font-${weight}`
            await page.evaluate(({ id, weight }) => {
              const node = document.createElement('span')
              node.id = id
              node.style.font = `${weight} 16px "Source Sans 3"`
              node.textContent = 'Latin'
              document.body.append(node)
            }, { id, weight })
            const cdp = await context.newCDPSession(page)
            await cdp.send('DOM.enable')
            await cdp.send('CSS.enable')
            const { root } = await cdp.send('DOM.getDocument')
            const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `#${id}` })
            const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
            expect(fonts).toEqual([expect.objectContaining({ familyName: expect.stringMatching(/^Source Sans 3\b/), isCustomFont: true, glyphCount: 5 })])
            await page.locator(`#${id}`).evaluate(node => node.remove())
            await cdp.detach()
          }
          const preloads = page.locator('link[rel="preload"][as="font"]')
          await expect(preloads).toHaveCount(1)
          await expect(preloads).toHaveAttribute('href', /\/assets\/source-sans-3-latin-wght-[^/]+\.woff2$/)
          await page.locator(`a[href="/${route === '/zh' ? 'en' : 'zh'}"]`).first().click()
          await expect(page).toHaveURL(new RegExp(`/${route === '/zh' ? 'en' : 'zh'}$`))
          await expect(preloads).toHaveCount(1)
          expect(errors, route).toEqual([])
        }
      } finally { await context.close() }
    }
  })
}
