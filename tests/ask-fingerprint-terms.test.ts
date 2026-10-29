import { expect, it } from 'vitest'
import { parseAnswer } from '../server/ask/answer'
import { explanationsAreIndependent } from '../server/ask/excerpts'
import type { Unit } from '../server/ask/units'
import { attacks } from './fixtures/ask-copy-attacks'
import { legitimate } from './fixtures/ask-legitimate-answers'

const url = 'https://x.com/mattpocockuk/status/1000000000000000001'
const unit = (text: string, sourceUrl = url): Unit => ({ id: sourceUrl, kind: 'post', title: '', text, sourceUrl })
const parse = (content: string, units: Unit[]) => parseAnswer(content, units, 'https://site.example')

for (const attack of attacks) {
  it(`rejects ${attack.name}: ${attack.why}`, async () => {
    const units = [unit(attack.source, attack.uncited ? url.replace(/1$/, '2') : url)]
    if (attack.uncited) units.unshift({ ...unit('Our interpretation.'), kind: 'note' })
    expect(await explanationsAreIndependent(attack.fields, units, [url])).toBe(false)
    const points = attack.points ?? [{ title: '', text: attack.fields.at(-1)!, sources: ['S1'] }]
    const content = JSON.stringify({ found: true, title: attack.title ?? (attack.fields.length > 1 ? attack.fields[0] : ''), points })
    expect(await parse(content, units)).toBeUndefined()
    if (attack.points) {
      for (const point of attack.points) expect(await explanationsAreIndependent([point.text], units, [url])).toBe(true)
    }
  })
}


for (const fixture of legitimate) {
  it(`retains ${fixture.name}`, async () => {
    const units = fixture.sources.map((source, i) => unit(source, url.replace(/1$/, String(i + 1))))
    const points = fixture.texts.map(text => ({ title: '', text, sources: units.map((_, i) => `S${i + 1}`) }))
    expect(await explanationsAreIndependent([fixture.title, ...fixture.texts], units, units.map(u => u.sourceUrl!))).toBe(true)
    const parsed = await parse(JSON.stringify({ found: true, title: fixture.title, points }), units)
    expect(parsed).toMatchObject({ found: true, title: fixture.title, points: fixture.texts.map(text => ({ text })) })
    expect(parsed && parsed.found && parsed.points).toHaveLength(fixture.texts.length)
  })
}

it('aggregates medium runs across same-post anchor chunks and URL variants', async () => {
  const parts = ['bcdefghijklmnopqrst', 'vuwyxzabcdefghijklm', 'nopqrszyxwvutsrqpon']
  const units = parts.map((text, i): Unit => ({ ...unit('Our interpretation.'), kind: 'method', quotes: [{ text, url: `${url}?part=${i}#anchor` }] }))
  const text = parts.join(' zz ')
  expect(await explanationsAreIndependent([text], units, [url])).toBe(false)
  expect(await parse(JSON.stringify({ found: true, title: '', points: [{ title: '', text, sources: ['S1'] }] }), units)).toBeUndefined()
})

it('carries aligned runs and short-word contexts over normalization slice seams', async () => {
  const source = 'x'.repeat(253) + 'Crimson lanterns guide harbor crews safely.'
  expect(await explanationsAreIndependent(['Crimson lanterns guide harbor crews safely.'], [unit(source)], [url])).toBe(false)
  const tiny = 'q'.repeat(252) + ' a ' + Array(26).fill('an').join(' ')
  expect(await explanationsAreIndependent([Array(26).fill('anX').join(' ')], [unit(tiny)], [url])).toBe(false)
})
