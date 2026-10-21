import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const origin = process.env.REVIEW_URL || 'http://localhost:8811'
await mkdir('.cache/screenshots', { recursive: true })
const context = await chromium.launchPersistentContext('.cache/chrome-profile', {
  executablePath: execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim(),
  headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const errors = [], browserMessages = [], cspViolations = [], checks = []
const missingPaths = ['/zh/nope', '/zh/a/b', '/zh/a_b', '/zh/不存在', '/zh/not/a/page']
const expected404Responses = new Set()
await context.exposeBinding('reportCspViolation', (_source, violation) => cspViolations.push(violation))
await context.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', event => {
    window.reportCspViolation({ directive: event.effectiveDirective, blockedURI: event.blockedURI, path: location.pathname })
  })
})
context.on('page', page => {
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserMessages.push({ message: message.text(), location: message.location() }) })
  page.on('response', response => {
    const url = new URL(response.url())
    if (response.status() === 404 && response.request().isNavigationRequest() && url.origin === origin && missingPaths.includes(decodeURIComponent(url.pathname))) expected404Responses.add(response.url())
  })
})
try {
  for (const width of [1440, 390, 320]) for (const theme of ['light', 'dark']) for (const view of ['home', 'article']) {
    const page = await context.newPage()
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript(value => { localStorage.setItem('theme', value); localStorage.setItem('lang', 'zh') }, theme)
    const path = view === 'home' ? '/zh' : '/zh/specs-and-tickets'
    await page.goto(origin + path, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await page.locator('html').evaluate(node => node.classList.contains('dark')), theme === 'dark')
    const measurements = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, body: getComputedStyle(document.body).fontSize, reading: document.querySelector('.full-article')?.getBoundingClientRect().width }))
    assert.ok(measurements.width <= width, `Horizontal overflow: ${JSON.stringify(measurements)}`)
    const name = `${view}-${width}-${theme}`
    await page.screenshot({ path: `.cache/screenshots/${name}.png`, fullPage: true })
    await page.screenshot({ path: `.cache/screenshots/${name}-viewport.png` })
    if (view === 'article') await page.locator('.tracer-figure').screenshot({ path: `.cache/screenshots/tracer-${width}-${theme}.png` })
    checks.push({ name, ...measurements })
    for (const englishPath of ['/en/specs-and-tickets', '/en/corpus']) {
      await page.goto(origin + englishPath, { waitUntil: 'networkidle' })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `English overflow at ${width}: ${englishPath}`)
    }
    await page.close()
  }
  const page = await context.newPage()
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.goto(origin + '/zh/specs-and-tickets', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '打开导航' }).click()
  assert.equal(await page.locator('.main-nav').evaluate(node => getComputedStyle(node).display), 'flex')
  await page.evaluate(() => { window.reviewNavigationMarker = true })
  await page.locator('.language-toggle').click()
  await page.waitForURL('**/en/specs-and-tickets')
  assert.equal(await page.evaluate(() => localStorage.getItem('lang')), 'en')
  assert.equal(await page.evaluate(() => window.reviewNavigationMarker), true, 'Language switch stays in SPA')
  assert.match(await page.locator('h1').innerText(), /Specs/)
  await page.screenshot({ path: '.cache/screenshots/article-390-en.png', fullPage: true })
  await page.locator('.header-tools button[aria-pressed]').click()
  const theme = await page.evaluate(() => localStorage.getItem('theme'))
  await page.reload({ waitUntil: 'networkidle' })
  assert.equal(await page.locator('html').evaluate(node => node.classList.contains('dark')), theme === 'dark')
  await page.goto(origin + '/', { waitUntil: 'networkidle' })
  assert.equal(new URL(page.url()).pathname, '/en')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: '.cache/screenshots/home-1440-en.png', fullPage: true })
  await page.goto(origin + '/en/corpus', { waitUntil: 'networkidle' })
  await page.locator('#corpus-q').fill('typescript')
  await page.getByLabel('Type', { exact: true }).selectOption('post')
  await page.waitForTimeout(500)
  await page.waitForLoadState('networkidle')
  const expected = await (await page.request.get(origin + '/api/corpus?q=typescript&type=post&limit=20')).json()
  assert.equal(await page.locator('.corpus-record').count(), expected.items.length)
  await page.screenshot({ path: '.cache/screenshots/corpus-1440.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 1000 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Corpus fits a phone')
  await page.screenshot({ path: '.cache/screenshots/corpus-390.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('#corpus-q').fill('no-such-source-xyz')
  await page.waitForTimeout(500)
  await page.waitForLoadState('networkidle')
  assert.equal(await page.locator('.empty-state').count(), 1)
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await page.waitForTimeout(500)
  assert.ok(await page.locator('.corpus-record').count() > 0)
  const response = await page.goto(origin + '/zh/nope', { waitUntil: 'networkidle' })
  assert.equal(response.status(), 404)
  assert.match(await page.locator('h1').innerText(), /这个地址没有页面/)
  for (const path of missingPaths.slice(1)) {
    const missing = await page.goto(origin + path, { waitUntil: 'networkidle' })
    assert.equal(missing.status(), 404)
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh')
    assert.equal(await page.locator('h1').innerText(), '这个地址没有页面')
    assert.match(await page.title(), /页面不存在/)
  }
  checks.push({ interactions: 'mobile menu, SPA language switch, saved language/theme, corpus query/type, empty/reset, localized 404 passed' })
  assert.deepEqual(errors, [], 'No browser runtime or hydration errors')
  // Chrome logs failed document navigations, including our deliberate HTTP 404 tests.
  // Account for only those verified responses; every other error remains fatal.
  const expectedHttp404 = browserMessages.filter(entry => entry.message === 'Failed to load resource: the server responded with a status of 404 (Not Found)' && expected404Responses.has(entry.location.url))
  const consoleErrors = browserMessages.filter(entry => !expectedHttp404.includes(entry))
  assert.equal(expected404Responses.size, missingPaths.length, 'Every intentional missing path returned HTTP 404')
  assert.deepEqual(consoleErrors, [], 'No console errors')
  assert.deepEqual(cspViolations, [], 'No CSP violations')
  await writeFile('.cache/screenshots/review.json', JSON.stringify({ checks, errors, consoleErrors, cspViolations, expectedHttp404 }, null, 2) + '\n')
  console.log(JSON.stringify({ checks, errors, consoleErrors, cspViolations, expectedHttp404 }, null, 2))
} finally { await context.close() }
