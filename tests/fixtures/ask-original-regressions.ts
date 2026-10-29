import type {Unit} from '../../server/ask/units'
const url='https://x.com/mattpocockuk/status/1000000000000000001'
const shortPost: Unit = { id: 'post:fixture', kind: 'post', title: '', text: 'Start small. Adjust quickly. Build trust. Expand carefully.', sourceUrl: url }
const longText = Array.from({ length: 10 }, (_, i) => `A sample workflow phase ${i} requires a separate confirmation.`).join(' ')
const characterSource = 'Comprehensive documentation strengthens maintainability through predictable configuration boundaries, while characterization testing improves interoperability between independently initialized authentication, authorization, serialization, and synchronization components.'
const punctuationSource = 'Clear docs strengthen maintenance through predictable configuration boundaries, while character testing improves interoperability between independently initialized "authentication", "authorization", "serialization", and "synchronization" components.'
const groups = (source: string) => source.split(/\s+/).reduce<string[]>((out, word, i) => {
  if (i % 3 === 0) out.push(word); else out[out.length - 1] += ` ${word}`
  return out
}, []).join(' Our aside. ')
const englishSplit = punctuationSource.indexOf('interoperability') + 7
const chinesePrefix = '清晰文档让维护边界更加稳定，字符级检查让各字段之间的引用保持一致'
const chineseSource = chinesePrefix + '，；：、'.repeat(60).slice(0, 248 - chinesePrefix.length) + '。'
const regressions = [
  { name: 'round-1 full original', source: longText, fields: [longText] },
  ...['Start small. Adjust quickly. Build trust.', 'Start small. We can inspect risk. Adjust quickly. Then review our assumptions. Build trust.', 'Start small We can inspect risk Adjust quickly We inspect dependencies Build trust'].map(text => ({ name: 'round-2 interleaved English', source: shortPost.text, fields: [text] })),
  ...['先分拆。我们检查风险。再验证。我们检查依赖。后发布。', '先分拆 我们检查风险 再验证 我们检查依赖 后发布'].map(text => ({ name: 'round-2 interleaved Han', source: '先分拆。再验证。后发布。', fields: [text] })),
  { name: 'round-3 scattered character total', source: characterSource, fields: [groups(characterSource)] },
  { name: 'round-4 punctuation', source: punctuationSource, fields: [groups(punctuationSource)] },
  ...[punctuationSource, chineseSource].flatMap(source => {
    const word = source === punctuationSource ? 'interoperability' : '维护边界'
    const cut = source === punctuationSource ? englishSplit : source.indexOf(word) + 2
    return [
      ...[240, 241, 249].map(length => ({ name: `round-5 split ${length}`, source, fields: [source.slice(0, cut), source.slice(cut, length)] })),
      ...['X', 'ｘ'].map(suffix => ({ name: `round-5 suffix ${suffix}`, source, fields: [source.replace(word, word + suffix)] })),
    ]
  }),
  ...[241, 274].map(length => {
    const source = Array(25).fill('abcdefghij').join(' ').slice(0, length)
    return { name: `round-6 short words ${length}`, source, fields: [source.replace(/[a-j]+/g, word => word + 'X')] }
  }),
  ...['\u200b', '\u200c', '\u200d', '\u2060', '\ufeff', '~'].map(symbol => ({ name: `round-6 inserted U+${symbol.codePointAt(0)!.toString(16)}`, source: punctuationSource, fields: [[...punctuationSource.slice(0, 241)].map((c, i) => c + ((i + 1) % 6 === 0 ? symbol : '')).join('')] })),
  ...[
    ['ＣＬＥＡＲ “docs” aren’t fragile—', 'clear "docs" aren\'t fragile-'],
    ['e\u0301', 'é'], ['ΟΣ', 'ος'], ['接口「Ａ」—', '接口"a"-'], ['canʼt', "can't"],
  ].map(([prefix, rendered]) => ({ name: `normalized Unicode ${prefix}`, source: prefix + '—'.repeat(241 - [...prefix].length), fields: [rendered + '-'.repeat(241 - [...prefix].length)] })),
  { name: 'unanchored punctuation', source: 'alpha' + '“' + '， '.repeat(119) + '”\t', fields: ['“' + '， '.repeat(119) + '”\t'] },
  ...['en', 'zh'].map(lang => {
    const parts = lang === 'en' ? Array.from({ length: 26 }, (_, i) => `term${i}`) : Array.from({ length: 51 }, (_, i) => String.fromCodePoint(0x4e00 + i))
    const sep = lang === 'en' ? ' ' : ''
    return { name: `isolated word/Han total ${lang}`, source: parts.join(sep), fields: [parts.join(`${sep}aside${sep}`)] }
  }),
]


export {regressions}
