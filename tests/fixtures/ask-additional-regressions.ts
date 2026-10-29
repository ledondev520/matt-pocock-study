import type { ReviewCase } from './ask-review-cases'

const url = 'https://x.com/mattpocockuk/status/1000000000000000001'
const source = 'Crimson lanterns guide harbor crews safely.'
const edited = 'Crimson lanterns lead harbor crews securely.'
function regression(id: string, reason: string, text: string, original = source): ReviewCase {
  return {
    id, reason, units: [{ id: 'synthetic', kind: 'post', title: '', text: original, sourceUrl: url }],
    fields: ['', '', text], linkedUrls: [url], quotes: [], siteUrl: 'https://site.example',
    content: JSON.stringify({ found: true, title: '', points: [{ title: '', text, sources: ['S1'] }] }),
  }
}
const repeatedTerm = 'Crimson lanterns independently illuminate unusual options. '
const quoteSource = source + ' A beacon burns.'
const quoteCombo = regression('H09', 'A short quote retains its bonus beside edited and repeated copied wording.',
  'Crimson lanterns glow beside checkpoints. '.repeat(3), quoteSource)
quoteCombo.quotes = [{ text: 'A beacon burns.', url }]
quoteCombo.content = JSON.stringify({ found: true, title: '', points: [{ title: '', text: quoteCombo.fields[2], sources: ['S1'], quote: { chunk_id: 'S1', start: 44, end: 59 } }] })
const aliases = regression('H10', 'Separated anchors and URL aliases retain cumulative copied evidence.', edited)
aliases.units = [{ id: 'method:synthetic', kind: 'method', title: '', text: 'Our interpretation.', sourceUrl: url, quotes: [
  { text: 'Crimson lanterns guide', url: url + '?part=1#top' },
  { text: 'harbor crews safely.', url: url + '/?part=2#tail' },
] }]
const tinyQuote = regression('H11', 'Short-word suffixes still share a quoted three-word budget.', Array(24).fill('anX independently').join(' '), 'An amber beacon. ' + Array(26).fill('an').join(' '))
tinyQuote.quotes = [{ text: 'An amber beacon.', url }]
tinyQuote.content = JSON.stringify({ found: true, title: '', points: [{ title: '', text: tinyQuote.fields[2], sources: ['S1'], quote: { chunk_id: 'S1', start: 0, end: 16 } }] })
const acrossFields = regression('H12', 'Formatting and field seams cannot split cumulative ordinary evidence.', edited)
acrossFields.fields = ['Crim', 'son lanterns lead harbor ', 'crews securely.']
acrossFields.content = JSON.stringify({ found: true, title: acrossFields.fields[0], points: [{ title: acrossFields.fields[1], text: acrossFields.fields[2], sources: ['S1'] }] })

export const additionalRegressions: ReviewCase[] = [
  regression('H01', 'Repeating one complete phrase cannot erase a second edited source fragment.', repeatedTerm.repeat(4) + 'Harbor crews choose another direction.'),
  regression('H02', 'Alternating two complete copied spans retains the unselected span on every occurrence.', ('Crimson lanterns independently observe. Harbor crews privately consider. ').repeat(4)),
  regression('H03', 'Interleaving padding between each long copied word preserves the global counter.', 'Crimson independently lanterns independently harbor independently crews independently safely.'),
  regression('H04', 'Inserted format characters and punctuation normalize to cumulative copied evidence.', [...edited].join('\u2060-')),
  regression('H05', 'Fullwidth compatibility letters combined with format characters cannot erase matches.', [...edited.replace(/[A-Za-z]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0))].join('\u200d')),
  regression('H06', 'Mixed-script interleaving between copied words keeps ordinary fingerprints.', '以Crimson说明lanterns，再用harbor说明crews，最后safely。'),
  regression('H07', 'Repeated suffixes of a longer source token are partial evidence, never a term exception.', ('hijklmnopqrstuvwxyza independently considers alternatives. ').repeat(5), 'abcdefghijklmnopqrstuvwxyza'),
  regression('H08', 'A source term with copied affixes cannot turn into a complete-term exemption.', ('abcdefghijklmnopqrsX independently considers alternatives. ').repeat(5), 'abcdefghijklmnopqrs'),
  quoteCombo, aliases, tinyQuote, acrossFields,
  regression('H13', 'A repeated term plus another copied word exceeds the complete short-source allowance.', repeatedTerm.repeat(4) + 'Harbor observers consider alternatives.'),
  regression('H14', 'Repeated source positions cannot collapse into one shared hash interval.', ('bcdefghij independently considers alternatives. ').repeat(4), 'bcdefghij qq bcdefghij qq bcdefghij'),
]
