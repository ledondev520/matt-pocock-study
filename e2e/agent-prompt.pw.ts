import { expect, test } from '@playwright/test'

// The home page's "paste this into your coding agent" line: the Copy button is reachable by its
// accessible name, really puts the line on the clipboard, says so, and falls back to selecting the
// line when the Clipboard API is missing.
const cases = [
  { path: '/zh', name: '复制这句话', copied: '已复制这句话', start: '去 ', guide: '/zh/llms.txt' },
  { path: '/en', name: 'Copy the line for your agent', copied: 'Copied the line for your agent', start: 'Go read ', guide: '/llms.txt' },
] as const
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  for (const c of cases) {
    test(`${c.path} copy button copies the agent line (${viewport.width}px)`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] })
      try {
        const page = await context.newPage()
        await page.goto(c.path)
        const line = page.locator('#agent-prompt-text')
        const text = (await line.textContent())!
        expect(text.startsWith(c.start)).toBe(true)
        expect(text).toContain(c.guide)
        const button = page.getByRole('button', { name: c.name, exact: true })
        await expect(button).toBeVisible()
        await button.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('button', { name: c.copied, exact: true })).toBeVisible()
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text)
        // The guide the line points to is served.
        const guide = await page.request.get(new URL(c.guide, baseURL).href)
        expect(guide.status()).toBe(200)
        await expect(page.getByRole('button', { name: c.name, exact: true })).toBeVisible({ timeout: 5000 })
      } finally { await context.close() }
    })
  }
}
test('without the Clipboard API the line is selected for manual copy', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }))
  try {
    const page = await context.newPage()
    await page.goto('/en')
    await page.getByRole('button', { name: 'Copy the line for your agent', exact: true }).click()
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(await page.locator('#agent-prompt-text').textContent())
  } finally { await context.close() }
})
test('when the clipboard refuses, the line is selected for manual copy', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } }))
  try {
    const page = await context.newPage()
    await page.goto('/zh')
    await page.getByRole('button', { name: '复制这句话', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(await page.locator('#agent-prompt-text').textContent())
    await expect(page.locator('.agent-prompt-copy')).toHaveText('复制')
  } finally { await context.close() }
})
// "Copy" → "Copied" must not move anything: the button is as wide as its longest label, so the line
// keeps its wrapping and the paragraph below stays put, even at the narrowest supported width.
for (const width of [320, 390]) {
  for (const c of [{ path: '/zh', copy: '复制', copied: '已复制' }, { path: '/en', copy: 'Copy', copied: 'Copied' }]) {
    test(`${c.path} copy button does not shift the layout (${width}px)`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] })
      try {
        const page = await context.newPage()
        await page.goto(c.path)
        await page.evaluate(() => document.fonts.ready)
        const button = page.locator('.agent-prompt-copy')
        const measure = () => page.evaluate(() => {
          const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
          return { button: box('.agent-prompt-copy'), line: box('#agent-prompt-text'), prompt: box('.agent-prompt'), tribute: box('.tribute p') }
        })
        await expect(button).toHaveText(c.copy)
        const before = await measure()
        await button.click()
        await expect(button).toHaveText(c.copied)
        expect(await measure()).toEqual(before)
        await expect(button).toHaveText(c.copy, { timeout: 5000 })
        expect(await measure()).toEqual(before)
      } finally { await context.close() }
    })
  }
}
