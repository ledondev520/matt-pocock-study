import type { Unit } from '../../server/ask/units'
import { regressions } from './ask-original-regressions'
import { copyRegressions } from './ask-copy-regressions'
import { additionalRegressions } from './ask-additional-regressions'
import { reviewCases } from './ask-review-cases'

export interface RewriteCase { name: string; group: string; units: Unit[]; content: string; siteUrl: string }
const url = 'https://x.com/mattpocockuk/status/1000000000000000001'
const base: Unit = { id: 'post:fixture', kind: 'post', title: 'probe', text: '', sourceUrl: url }
const sentence = 'Start small. Adjust quickly. Build trust. Expand carefully.'
interface Spec {
  name: string; source: string; fields: string[]; title?: string; sourceTitle?: string; uncited?: boolean
  marker?: { chunk_id: string; start: number; end: number }; quoteOnly?: boolean
  points?: { title: string; text: string; sources: string[] }[]
}
const probes: Spec[] = [
  { name: 'shared sentence budget', source: sentence, fields: ['Build trust.'], marker: { chunk_id: 'S1', start: 0, end: 28 } },
  { name: 'short affixed words', source: Array(26).fill('cat').join(' '), fields: [Array(26).fill('catX').join(' ')] },
  { name: 'uncited substantive text', source: 'Comprehensive documentation strengthens maintainability through predictable configuration boundaries.', fields: ['Comprehensive documentation strengthens maintainability through predictable configuration boundaries.'], uncited: true },
  { name: 'original title', source: 'Unrelated additional context.', sourceTitle: 'Comprehensive documentation strengthens maintainability through predictable configuration boundaries.', fields: ['Comprehensive documentation strengthens maintainability through predictable configuration boundaries.'] },
  { name: 'three rendered sentences', source: sentence, fields: ['Review dependencies.'], quoteOnly: true },
]
function makeCase(f: Spec, group: string): RewriteCase {
  const units: Unit[] = [{ ...base, text: f.source, title: f.sourceTitle ?? (group === 'copy' ? '' : base.title) }]
  if (f.uncited) {
    units[0].sourceUrl = url.replace(/1$/, '2')
    units.unshift({ ...base, kind: 'note', text: 'Our independent interpretation.' })
  }
  const points = f.quoteOnly ? [
    { title: '', text: 'Inspect risk.', sources: ['S1'], quote: { chunk_id: 'S1', start: 0, end: 28 } },
    { title: '', text: 'Check scope.', sources: ['S1'], quote: { chunk_id: 'S1', start: 29, end: 41 } },
  ] : f.points ?? [{ title: group === 'copy' ? '' : 'Review', text: f.fields.at(-1), sources: ['S1'], ...(f.marker ? { quote: f.marker } : {}) }]
  return { name: f.name, group, units, siteUrl: 'https://site.example', content: JSON.stringify({
    found: true, title: f.title ?? (f.fields.length > 1 && !f.points ? f.fields[0] : ''), points,
  }) }
}

export const rewriteCases: RewriteCase[] = [
  ...regressions.map(f => makeCase(f, 'original')),
  ...probes.map(f => makeCase(f, 'probes')),
  ...copyRegressions.map(f => makeCase(f, 'copy')),
  ...additionalRegressions.map(f => ({ ...f, name: f.id, group: 'additional' })),
  ...reviewCases.map(f => ({ ...f, name: f.id, group: 'review' })),
]
