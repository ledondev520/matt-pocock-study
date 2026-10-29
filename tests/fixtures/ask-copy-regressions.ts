// Synthetic originals only. These regressions are not examples of publishable answers.
export interface CopyRegression {
  name: string
  why: string
  source: string
  fields: string[]
  title?: string
  uncited?: boolean
  points?: { title: string; text: string; sources: string[] }[]
}
const paragraph = 'Before shipping TypeScript changes, sketch the failure boundary on paper and assign each uncertain assumption a separate experiment. Keep the monorepo quiet until the smallest failing scenario produces a useful explanation for the next reviewer.'
const dense = 'TypeScript and monorepo project references shape this pull request; Claude Code checks TypeScript project references before the monorepo pull request reaches review.'
const splitSource = 'Crimson lanterns guide harbor crews safely beyond winter shoals.'
const pieces = Array.from({ length: Math.ceil(splitSource.length / 14) }, (_, i) => splitSource.slice(i * 14, (i + 1) * 14))
const medium = ['bcdefghijklmnopqrst', 'vuwyxzabcdefghijklm', 'nopqrszyxwvutsrqpon', 'fedcbaqwertyuiopasd']
const shortSource = Array(26).fill('cat').join(' ')

export const copyRegressions: CopyRegression[] = [
  { name: 'terms replaced in copied paragraph', why: 'A model substitutes product names while preserving the author’s distinctive reasoning and syntax.', source: paragraph, fields: [paragraph.replaceAll('TypeScript', 'TS').replaceAll('monorepo', 'repo')] },
  { name: 'terms removed from copied paragraph', why: 'Deleting the nouns targeted by a terminology exemption must not launder the surrounding prose.', source: paragraph, fields: [paragraph.replaceAll('TypeScript', '').replaceAll('monorepo', '')] },
  { name: 'function words changed in copied paragraph', why: 'Light edits to articles and connectives are a common disguise for a copied paragraph.', source: paragraph, fields: [paragraph.replaceAll('the ', 'a ').replaceAll('and ', 'plus ')] },
  { name: 'punctuation and casing changed', why: 'Reformatting copied prose must retain normalized copy evidence.', source: paragraph, fields: [paragraph.toUpperCase().replaceAll(' ', ' ~ ').replaceAll('.', '!')] },
  { name: 'copy split across answer fields', why: 'A generated response can distribute one original across its heading and body.', source: paragraph, fields: [paragraph.slice(0, 37), paragraph.slice(37)] },
  { name: 'copy split across individually safe points', why: 'Each small field can appear harmless while their concatenation reconstructs the original.', source: splitSource, fields: pieces, title: '', points: pieces.map(text => ({ title: '', text, sources: ['S1'] })) },
  { name: 'four distinct runs just below long threshold', why: 'A model can insert commentary between 19-character source spans.', source: medium.join(' qq '), fields: [medium.join(' zz ')] },
  { name: 'many seven-character runs with commentary', why: 'Copied spans just below an eight-character cutoff must not become invisible when commentary separates them.', source: ['bcdefgh', 'ijklmnq', 'rstuvwx', 'yzabcde', 'fghijkl', 'mnopqrst', 'uvwyzab', 'cdefghj'].join(' qq '), fields: [['bcdefgh', 'ijklmnq', 'rstuvwx', 'yzabcde', 'fghijkl', 'mnopqrst', 'uvwyzab', 'cdefghj'].join(' Some fresh independent commentary goes here. ')] },
  { name: 'many five-character runs with commentary', why: 'A model can copy many short source tokens at the original fingerprint width.', source: Array.from({ length: 26 }, (_, i) => `term${String.fromCharCode(97 + i)}`).join(' '), fields: [Array.from({ length: 26 }, (_, i) => `term${String.fromCharCode(97 + i)}`).join(' Some fresh independent commentary goes here. ')] },
  { name: 'many four-character words below fingerprint width', why: 'Sub-fingerprint word copying must retain the word-budget fallback even when no five-character run survives.', source: Array.from({ length: 26 }, (_, i) => `cat${String.fromCharCode(97 + i)}`).join(' '), fields: [Array.from({ length: 26 }, (_, i) => `cat${String.fromCharCode(97 + i)}`).join(' Some fresh independent commentary goes here. ')] },
  { name: 'repeated medium run with affixes', why: 'Repetition with a suffix must not disappear when identical evidence is counted once.', source: Array(25).fill('abcdefghij').join(' '), fields: [Array(25).fill('abcdefghijX').join(' ')] },
  ...['before', 'after'].map(side => {
    const copied = Array(25).fill('abcdefghijX').join(' ')
    const padding = 'Our independent commentary describes a different possibility. '.repeat(20)
    return { name: `affixed medium copy padded ${side}`, why: 'Independent padding in the same field must not dilute a concentrated copied region or evade the repeated-run fallback.', source: Array(25).fill('abcdefghij').join(' '), fields: [side === 'before' ? padding + copied : copied + padding] }
  }),
  ...['XYZXYZ', 'XabcdefghijX'].map(variant => ({ name: `long-word affixes survive padding ${variant}`, why: 'Arbitrary suffix lengths and prefixes must not hide copied source words inside larger tokens, even with extensive independent padding.', source: Array(25).fill('abcdefghij').join(' '), fields: [Array(25).fill(variant.startsWith('Xabc') ? variant : 'abcdefghij' + variant).join(' ') + ' Our independent commentary considers a separate possibility.'.repeat(20)] })),
  { name: 'common-term-dense copied passage', why: 'A passage made largely of widely used names is still copied when their surrounding arrangement is reproduced.', source: dense, fields: [dense] },
  { name: 'common-term-dense passage lightly edited', why: 'Changing a few function words cannot excuse copying a dense technical passage.', source: dense, fields: [dense.replaceAll('and', 'plus').replaceAll('before', 'once')] },
  { name: 'uncited original copied with renamed terms', why: 'Citing a different retrieved unit cannot authorize reuse from the uncited original.', source: paragraph, fields: [paragraph.replaceAll('TypeScript', 'TS')], uncited: true },
  { name: 'CJK copy with changed punctuation', why: 'A Chinese answer can camouflage a copied explanation using different punctuation.', source: '先明确模块的责任边界，再选择可以独立验证的最小改动，最后根据实际反馈调整下一步计划。', fields: ['先明确模块的责任边界；再选择可以独立验证的最小改动！最后根据实际反馈调整下一步计划。'] },
  { name: 'CJK copy with renamed Latin terms', why: 'Changing embedded product names cannot hide copied Chinese reasoning or evade the Han fingerprint stream.', source: '先用TypeScript明确模块的责任边界，再检查monorepo里可以独立验证的最小改动，最后根据实际反馈调整下一步计划。', fields: ['先用TS明确模块的责任边界，再检查repo里可以独立验证的最小改动，最后根据实际反馈调整下一步计划。'] },
  { name: 'CJK copy split across fields', why: 'Chinese source text must remain protected when split in the middle of a word.', source: '先明确模块的责任边界，再选择可以独立验证的最小改动。', fields: ['先明确模块的责', '任边界，再选择可以独立验证的最小改动。'] },
  ...['X', 'XYZ', 'ｘ', '\u200bX'].map(suffix => ({ name: `cat affix ${JSON.stringify(suffix)}`, why: 'Appending arbitrary or compatibility characters to each short copied word must still exhaust the fragment budget.', source: shortSource, fields: [Array(26).fill('cat' + suffix).join(' ')] })),
  { name: 'cat prefix and suffix', why: 'Fragments embedded within tokens must stay visible, including on both sides of an affix.', source: shortSource, fields: [Array(26).fill('XcatX').join(' ')] },
  ...['a', 'an'].map(word => ({ name: `tiny affixed word ${word}`, why: 'Contextual filtering must preserve repeated one- and two-letter originals with suffixes.', source: Array(26).fill(word).join(' '), fields: [Array(26).fill(word + 'X').join(' ')] })),
  ...['a', 'an'].map(word => ({ name: `tiny affixed word ${word} after a clean title`, why: 'A clean preceding field must not hide the first short copied token and turn 26 occurrences into 25.', source: Array(26).fill(word).join(' '), fields: ['Review', Array(26).fill(word + 'X').join(' ')], title: 'Review' })),
  { name: 'medium runs padded with independent commentary', why: 'Low output overlap density cannot excuse many different copied spans from the same original.', source: medium.join(' qq '), fields: [medium.join(' These observations require a fresh independent evaluation before proceeding. ')] },
]
