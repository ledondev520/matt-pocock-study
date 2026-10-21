import { expect, test } from '@playwright/test'

test('Chinese pages load both Noto subset weights as usable web fonts', async ({ page }) => {
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', request => {
    if (/noto-sans-sc.*\.woff2(?:[?#]|$)/i.test(request.url())) requests.push(request.url())
  })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/zh', { waitUntil: 'networkidle' })
  const loaded = await page.evaluate(async () => {
    const weights = [400, 700]
    return Promise.all(weights.map(async weight => {
      const faces = await document.fonts.load(`${weight} 18px "Noto Sans SC"`, '中文学习')
      return faces.length === 1 && faces[0].status === 'loaded'
    }))
  })
  expect(loaded).toEqual([true, true])
  expect(new Set(requests).size).toBe(2)
  expect(errors).toEqual([])
})
