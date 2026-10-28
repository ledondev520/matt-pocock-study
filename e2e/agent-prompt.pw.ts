import { expect, test } from '@playwright/test'

// The home page's copy line: one quiet hint and a Copy button. The button is reachable by its
// accessible name and the keyboard, really puts a ready-to-use prompt on the clipboard (the full
// llms.txt address, no instructions to edit it), says so briefly, and falls back to showing and
// selecting the prompt when the Clipboard API is missing or refuses.
const site = 'https://matt.withkeya.com'
const cases = [
  { path: '/zh', hint: '点一下复制，丢给你的 agent', name: '复制给 agent 的提示', copied: '已复制给 agent 的提示', label: '已复制', url: `${site}/zh/llms.txt` },
  { path: '/en', hint: 'Copy and paste into your agent', name: 'Copy the prompt for your agent', copied: 'Copied the prompt for your agent', label: 'Copied', url: `${site}/llms.txt` },
] as const
const instructions = /替换|换掉|换成|说话就行|改成|填入|swap|replace|placeholder|fill in|\{|\}|<|>|…|\.\.\./i
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  for (const c of cases) {
    test(`${c.path} copy button copies the agent prompt (${viewport.width}px)`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] })
      try {
        const page = await context.newPage()
        await page.goto(c.path)
        await expect(page.locator('.agent-copy-hint')).toHaveText(c.hint)
        // The prompt itself stays out of sight until a manual copy needs it.
        await expect(page.locator('#agent-prompt-text')).toBeHidden()
        const button = page.getByRole('button', { name: c.name, exact: true })
        await expect(button).toBeVisible()
        await button.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('button', { name: c.copied, exact: true })).toBeVisible()
        await expect(button.or(page.getByRole('button', { name: c.copied, exact: true }))).toHaveText(c.label)
        const copied = await page.evaluate(() => navigator.clipboard.readText())
        expect(copied).toContain(c.url)
        expect(copied).not.toMatch(instructions)
        expect(copied).toBe(await page.locator('#agent-prompt-text').textContent())
        // The guide the prompt points to is served by this site.
        expect((await page.request.get(new URL(new URL(c.url).pathname, baseURL).href)).status()).toBe(200)
        await expect(page.getByRole('button', { name: c.name, exact: true })).toBeVisible({ timeout: 5000 })
      } finally { await context.close() }
    })
  }
}
test('without the Clipboard API the prompt is shown and selected for manual copy', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }))
  try {
    const page = await context.newPage()
    await page.goto('/en')
    await page.getByRole('button', { name: 'Copy the prompt for your agent', exact: true }).click()
    const line = page.locator('#agent-prompt-text')
    await expect(line).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(await line.textContent())
  } finally { await context.close() }
})
test('when the clipboard refuses, the prompt is shown and selected for manual copy', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } }))
  try {
    const page = await context.newPage()
    await page.goto('/zh')
    await page.getByRole('button', { name: '复制给 agent 的提示', exact: true }).click()
    const line = page.locator('#agent-prompt-text')
    await expect(line).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(await line.textContent())
    await expect(page.locator('.agent-copy-button')).toHaveText('复制')
  } finally { await context.close() }
})
// "Copy" → "Copied" must not move anything: the button is as wide as its longest label. Boxes are
// measured in page coordinates (the click may scroll the button into view).
for (const width of [320, 390]) {
  for (const c of [{ path: '/zh', copy: '复制', copied: '已复制' }, { path: '/en', copy: 'Copy', copied: 'Copied' }]) {
    test(`${c.path} copy button does not shift the layout (${width}px)`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] })
      try {
        const page = await context.newPage()
        await page.goto(c.path)
        await page.evaluate(() => document.fonts.ready)
        const button = page.locator('.agent-copy-button')
        const measure = () => page.evaluate(() => {
          const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height } }
          return { button: box('.agent-copy-button'), hint: box('.agent-copy-hint'), line: box('.agent-copy'), footer: box('footer') }
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
