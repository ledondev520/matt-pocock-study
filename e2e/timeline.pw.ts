import { expect, test, type Page } from '@playwright/test'

// The timeline view on the production build: both routes are pre-rendered, Matt's original posts stay
// hidden until the switch is on, and the year scrubber jumps by tap, mouse drag, touch drag and keys.
// Years are read from the page, never hard-coded.
async function open(page: Page, path: string) {
  await page.goto(path)
  // Wait for hydration (React has attached its props to the slider), then let its effects run.
  await page.waitForFunction(() => Object.keys(document.querySelector('.tl-track')!).some(key => key.startsWith('__reactProps')))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))))
}
const years = (page: Page) => page.locator('.tl-label').evaluateAll(labels => labels.map(l => l.getAttribute('data-year')!))
const slider = (page: Page) => page.getByRole('slider')
async function labelCenter(page: Page, year: string) {
  const box = (await page.locator(`.tl-label[data-year="${year}"]`).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
// The year's section is at the top of the screen, or the page is scrolled to the end with the section in view.
async function expectAtYear(page: Page, year: string) {
  await expect(slider(page)).toHaveAttribute('aria-valuenow', year)
  await expect.poll(() => page.evaluate(id => {
    const top = document.getElementById(id)!.getBoundingClientRect().top
    const end = window.scrollY + window.innerHeight >= document.scrollingElement!.scrollHeight - 2
    return (top >= 0 && top <= 40) || (end && top >= 0 && top < window.innerHeight)
  }, `year-${year}`)).toBe(true)
}

for (const lang of ['zh', 'en'] as const) {
  test(`/${lang}/timeline is a pre-rendered 200 page`, async ({ request }) => {
    const response = await request.get(`/${lang}/timeline`)
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain(`<html lang="${lang}">`)
    expect(html).toMatch(/<section class="tl-year" id="year-\d{4}"/)
    expect(html).toContain('role="slider"')
  })

  test(`${lang}: original posts are hidden by default and shown by the switch`, async ({ page }) => {
    await open(page, `/${lang}/timeline`)
    const main = page.locator('main')
    const items = await page.locator('.tl-item').count()
    expect(items).toBeGreaterThan(1)
    const toggle = page.getByRole('switch', { name: lang === 'zh' ? '原帖' : 'Original posts' })
    await expect(toggle).not.toBeChecked()
    await expect(page.locator('.tl-original')).toHaveCount(0)
    await expect(main.locator('a[href^="https://x.com/"]')).toHaveCount(0)
    await expect(main.locator('blockquote')).toHaveCount(0)
    await toggle.click()
    await expect(toggle).toBeChecked()
    await expect(page.locator('.tl-original')).toHaveCount(items)
    await expect(page.locator('.tl-original a[href^="https://x.com/"]')).toHaveCount(items)
    expect(await page.locator('.tl-original blockquote').count()).toBeGreaterThan(0)
    await toggle.click()
    await expect(page.locator('.tl-original')).toHaveCount(0)
    await expect(main.locator('a[href^="https://x.com/"]')).toHaveCount(0)
  })

  test(`${lang}: tapping a year on the scrubber jumps to it`, async ({ page }) => {
    await open(page, `/${lang}/timeline`)
    const all = await years(page)
    expect(all.length).toBeGreaterThan(2)
    expect([...all].sort().reverse(), 'newest year at the top').toEqual(all)
    await expect(slider(page)).toHaveAttribute('aria-valuenow', all[0])
    for (const year of [all.at(-2)!, all[1], all.at(-1)!, all[0]]) {
      const { x, y } = await labelCenter(page, year)
      await page.mouse.click(x, y)
      await expectAtYear(page, year)
      await expect(page.locator(`.tl-label[data-year="${year}"]`)).toHaveClass(/active/)
    }
  })

  test(`${lang}: dragging shows the year bubble and lands on the year under the pointer`, async ({ page }) => {
    await open(page, `/${lang}/timeline`)
    const all = await years(page)
    const bubble = page.locator('.tl-bubble')
    await expect(bubble).toHaveCSS('opacity', '0')
    const from = await labelCenter(page, all[0]), to = await labelCenter(page, all.at(-1)!)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, (from.y + to.y) / 2, { steps: 6 })
    await expect(bubble).toHaveCSS('opacity', '1')
    await expect(bubble).toHaveText(await slider(page).getAttribute('aria-valuenow') ?? '')
    await page.mouse.move(to.x, to.y, { steps: 6 })
    await expect(bubble).toHaveText(all.at(-1)!)
    await page.mouse.up()
    await expectAtYear(page, all.at(-1)!)
    await expect(bubble).toHaveCSS('opacity', '0')
  })

  for (const width of [375, 1280]) test(`${lang}: at ${width}px Tab follows the list then the right-hand scrubber`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    await open(page, `/${lang}/timeline`)
    const all = await years(page)
    expect(await page.locator('.tl-layout').evaluate(node => [...node.children].map(child => child.className))).toEqual(['tl-years', 'tl-scrubber'])
    const list = (await page.locator('.tl-years').boundingBox())!
    const track = (await slider(page).boundingBox())!
    expect(list.x + list.width, 'DOM order matches the left-to-right visual order').toBeLessThanOrEqual(track.x)
    await page.getByRole('switch').focus()
    const links = page.locator('.tl-item a')
    for (let i = 0; i < await links.count(); i++) {
      await page.keyboard.press('Tab')
      await expect(links.nth(i)).toBeFocused()
    }
    await page.keyboard.press('Tab')
    await expect(slider(page)).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(links.last()).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(slider(page)).toBeFocused()
    await expect(slider(page)).toHaveAttribute('aria-label', lang === 'zh' ? '按年份跳转' : 'Jump to a year')
    await expect(slider(page)).toHaveAttribute('aria-valuemax', all[0])
    await expect(slider(page)).toHaveAttribute('aria-valuemin', all.at(-1)!)
    await page.keyboard.press('Home')
    await expectAtYear(page, all.at(-1)!)
    await page.keyboard.press('ArrowUp')
    await expectAtYear(page, all.at(-2)!)
    await page.keyboard.press('End')
    await expectAtYear(page, all[0])
    await page.keyboard.press('ArrowDown')
    await expectAtYear(page, all[1])
    // Reverse traversal reaches the last item because the list precedes the scrubber.
    await page.keyboard.press('Shift+Tab')
    await expect(links.last()).toBeFocused()
  })

  test(`${lang}: at 375px the scrubber fits on screen, keeps a touch-sized target and follows a finger`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })
    const page = await context.newPage()
    try {
      await open(page, `/${lang}/timeline`)
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth)).toBeLessThanOrEqual(375)
      const track = (await page.locator('.tl-track').boundingBox())!
      expect(track.width).toBeGreaterThanOrEqual(44)
      expect(track.x + track.width).toBeLessThanOrEqual(375)
      const list = (await page.locator('.tl-years').boundingBox())!
      expect(list.x + list.width, 'the list is not under the scrubber').toBeLessThanOrEqual(track.x)
      const all = await years(page)
      const target = all.at(-2)!
      const from = await labelCenter(page, all[0]), to = await labelCenter(page, target)
      const cdp = await context.newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
      for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: from.y + ((to.y - from.y) * i) / 8 }] })
      await expect(page.locator('.tl-bubble')).toHaveCSS('opacity', '1')
      await expect(page.locator('.tl-bubble')).toHaveText(target)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await expectAtYear(page, target)
      // The finger moved the scrubber, not the page: the track is still where it was on screen.
      const after = (await page.locator('.tl-track').boundingBox())!
      expect(Math.abs(after.x - track.x)).toBeLessThan(1)
    } finally { await context.close() }
  })
}
