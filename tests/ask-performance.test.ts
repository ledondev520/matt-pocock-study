import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'
import { parseAnswer, stripLinks } from '../server/ask/answer'
import { explanationsAreIndependent } from '../server/ask/excerpts'
import type { Unit } from '../server/ask/units'

const sourceUrl = 'https://x.com/mattpocockuk/status/1000000000000000001'
const units = (text: string) => Array.from({ length: 8 }, (_, i): Unit => ({ id: `post:${i}`, kind: 'post', title: '', text, sourceUrl: sourceUrl.replace(/1$/, String(i + 1)) }))
const content = (text: string) => JSON.stringify({ found: true, title: 'Workflow', points: [{ title: '', text, sources: ['S1'] }] })

for (const fixture of [
  { name: 'review-6 default eight 20k sources', source: 'configuration '.repeat(1500).slice(0, 20_000), output: 'independent explanation '.repeat(100).slice(0, 2000) },
  { name: 'repeated identical 8k sources and 8k output', source: 'a'.repeat(8000), output: 'a'.repeat(8000) },
  { name: 'eight 100k disjoint sources', source: 'configuration '.repeat(8000).slice(0, 100_000), output: 'Use small scoped checks to keep each edit cheap. '.repeat(40) },
]) {
  it(`bounds total time and lets timers run during ${fixture.name}`, async () => {
    let ticks = 0
    let last = performance.now()
    let maxDelay = 0
    const timer = setInterval(() => {
      const now = performance.now()
      maxDelay = Math.max(maxDelay, now - last)
      last = now
      ticks++
    }, 1)
    const started = performance.now()
    try {
      await parseAnswer(content(fixture.output), units(fixture.source), 'https://site.example')
      // Include the final synchronous slice rather than measuring only intermediate slices.
      maxDelay = Math.max(maxDelay, performance.now() - last)
      expect(performance.now() - started).toBeLessThan(1500)
      expect(maxDelay).toBeLessThan(100)
      expect(ticks).toBeGreaterThan(0)
    } finally { clearInterval(timer) }
  })
}

it('fails closed on excessive input instead of scanning a truncated source prefix', async () => {
  const started = performance.now()
  expect(await explanationsAreIndependent(['Our independent explanation.'], units('x'.repeat(130_000)))).toBe(false)
  expect(await parseAnswer(content('a'.repeat(40_000)), units('short source'), 'https://site.example')).toBeUndefined()
  expect(await explanationsAreIndependent(['a'.repeat(24_001)], [])).toBe(false)
  expect(performance.now() - started).toBeLessThan(100)
})

it('keeps model link stripping linear for unmatched Markdown, HTML and dotted tokens', () => {
  const started = performance.now()
  for (const text of ['['.repeat(32_000), '<'.repeat(32_000), '[a](x'.repeat(6000), 'a.'.repeat(16_000)]) stripLinks(text)
  expect(performance.now() - started).toBeLessThan(100)
})

it('carries fingerprints across slice seams and arbitrarily long removed symbol runs', async () => {
  const source = 'abc' + '~'.repeat(5000) + 'defghijklmnopqrstuv'
  expect(await explanationsAreIndependent(['abcdefghijklmnopqrstuv'], units(source))).toBe(false)
  const seam = 'x'.repeat(4096) + '\u0301' + 'y'.repeat(10)
  expect(await explanationsAreIndependent(['Our own explanation.'], units(seam))).toBe(false)
})
