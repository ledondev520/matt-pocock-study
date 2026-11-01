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
      const fontSizes: Promise<number>[] = []
      const errors: string[] = []
      context.on('request', request => {
        if (request.resourceType() === 'font' || /\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(request.url())) requests.push(request.url())
      })
      context.on('response', response => {
        if (response.request().resourceType() === 'font' || /\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(response.url())) fontSizes.push(response.body().then(body => body.length))
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
        const sizes = await Promise.all(fontSizes)
        expect(sizes.length, route).toBe(requests.length)
        expect(sizes.reduce((total, size) => total + size, 0), route).toBeLessThanOrEqual(60_000)
        const diagramFonts = await page.locator('svg[class^="arch-"] text:not([font-family*="Mono"])').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontFamily))
        for (const family of diagramFonts) expect(family, route).toContain('Source Sans 3')
        if (route === '/zh' || route === '/en') {
          if (route === '/zh') {
            const chinese = page.locator('main p, main h1, main h2, main h3').filter({ hasText: /[\u4e00-\u9fff]/ }).first()
            await expect(chinese).toBeVisible()
            for (const node of [page.locator('body'), chinese]) {
              const families = (await node.evaluate(element => getComputedStyle(element).fontFamily)).split(',').map(family => family.trim().replace(/^["']|["']$/g, ''))
              expect(families.slice(0, 5)).toEqual(['Source Sans 3', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC'])
              expect(families.at(-1)).toBe('sans-serif')
            }
            await page.evaluate(async () => {
              const node = document.createElement('span')
              node.id = 'cjk-font-probe'
              node.style.cssText = 'position: fixed; top: 0; left: 0; display: block; visibility: visible; opacity: 1; color: black; background: white; z-index: 2147483647; font-size: 16px; font-weight: 400'
              node.textContent = '中文'
              document.body.append(node)
              await document.fonts.ready
              await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
            })
            await expect(page.locator('#cjk-font-probe')).toBeVisible()
            const cdp = await context.newCDPSession(page)
            await cdp.send('DOM.enable')
            await cdp.send('CSS.enable')
            const { root } = await cdp.send('DOM.getDocument')
            const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#cjk-font-probe' })
            const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
            expect(fonts.length).toBeGreaterThan(0)
            for (const font of fonts) expect(font.isCustomFont).toBe(false)
            expect(fonts.reduce((total, font) => total + font.glyphCount, 0)).toBe(2)
            await page.locator('#cjk-font-probe').evaluate(node => node.remove())
            await cdp.detach()
          }
          for (const weight of [400, 700]) {
            expect(await page.evaluate(weight => document.fonts.check(`${weight} 16px "Source Sans 3"`, 'Latin'), weight)).toBe(true)
            const id = `latin-font-${weight}`
            await page.evaluate(async ({ id, weight }) => {
              const node = document.createElement('span')
              node.id = id
              node.style.cssText = 'position: fixed; top: 0; left: 0; display: block; visibility: visible; opacity: 1; color: black; background: white; z-index: 2147483647'
              node.style.font = `${weight} 16px "Source Sans 3"`
              node.textContent = 'Latin'
              document.body.append(node)
              await document.fonts.load(`${weight} 16px "Source Sans 3"`, node.textContent)
              await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
            }, { id, weight })
            await expect(page.locator(`#${id}`)).toBeVisible()
            await expect(page.locator(`#${id}`)).toHaveText('Latin')
            await expect(page.locator(`#${id}`)).toHaveCSS('font-family', '"Source Sans 3"')
            await expect(page.locator(`#${id}`)).toHaveCSS('font-weight', String(weight))
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
