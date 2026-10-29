import { expect, it } from 'vitest'
import { explanationsAreIndependent } from '../server/ask/excerpts'
import { parseAnswer } from '../server/ask/answer'
import { reviewAttacks } from './fixtures/ask-review-attacks'
import { huntingAttacks } from './fixtures/ask-hunting-attacks'

for (const fixture of [...reviewAttacks, ...huntingAttacks]) {
  it(`rejects ${fixture.id}: ${fixture.reason}`, async () => {
    expect(await explanationsAreIndependent(fixture.fields, fixture.units, fixture.linkedUrls, fixture.quotes)).toBe(false)
    expect(await parseAnswer(fixture.content, fixture.units, fixture.siteUrl)).toBeUndefined()
  })
}
