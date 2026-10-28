// BM25 over retrieval units. No dependencies: English is split into lower-case words, Chinese
// into single characters plus adjacent pairs. A small glossary maps common Chinese terms to the
// English words Matt uses, so a Chinese question can reach English posts.
import type { Unit } from './units'

const EN_STOP = new Set('a an and are as at be but by can do does for from how i if in into is it its me my of on or should so that the their them then there this to was we what when where which who why will with you your'.split(' '))
const ZH_STOP = new Set([...'的了是在我你他她它们和与及或吗呢吧啊么怎样什这那个一有就也都要会能把被让给对从帮请问些吗哪'])
const GLOSSARY: [RegExp, string][] = [
  [/方法论|方法|做法/g, 'method approach process'], [/构建|搭建/g, 'build'], [/拆分|拆/g, 'split break'],
  [/测试/g, 'test tests testing tdd'], [/类型/g, 'type types'], [/重构/g, 'refactor'], [/提示词/g, 'prompt prompts'],
  [/智能体|代理/g, 'agent agents'], [/规划|计划/g, 'plan planning'], [/评审|审查|审核/g, 'review'],
  [/上下文/g, 'context'], [/回滚/g, 'rollback revert'], [/代码库|仓库/g, 'codebase repo'], [/需求|规格|规范/g, 'spec prd'],
  [/反馈/g, 'feedback'], [/教学|教/g, 'teach teaching'], [/写作/g, 'writing'], [/泛型/g, 'generics'], [/校验|验证/g, 'validate validation'],
]

export function tokenize(text: string): string[] {
  const normalized = text.normalize('NFKC').toLowerCase()
  const extra = GLOSSARY.flatMap(([re, words]) => (normalized.match(re) ? [words] : [])).join(' ')
  const tokens: string[] = []
  for (const word of `${normalized} ${extra}`.match(/[a-z0-9][a-z0-9'+#.-]*[a-z0-9+#]|[a-z0-9]/g) ?? []) {
    const w = word.replace(/'s$/, '')
    if (!EN_STOP.has(w)) tokens.push(w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
  }
  // Chinese: adjacent pairs only (single characters match almost everything); a pair with a
  // function character such as 怎/么/的 is dropped. A one-character run keeps the character.
  for (const run of normalized.match(/\p{Script=Han}+/gu) ?? []) {
    const chars = [...run]
    if (chars.length === 1 && !ZH_STOP.has(chars[0])) tokens.push(chars[0])
    for (let i = 0; i + 1 < chars.length; i++) if (!ZH_STOP.has(chars[i]) && !ZH_STOP.has(chars[i + 1])) tokens.push(chars[i] + chars[i + 1])
  }
  return tokens
}

export interface Hit { unit: Unit; score: number; matched: number }
export interface Retriever { search(query: string, limit?: number): { hits: Hit[]; queryTerms: number } ; size: number }

export function createRetriever(units: Unit[], { k1 = 1.2, b = 0.75 } = {}): Retriever {
  const docs = units.map(unit => {
    const tf = new Map<string, number>()
    // The title counts twice.
    const tokens = [...tokenize(unit.title), ...tokenize(unit.title), ...tokenize(unit.text)]
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
    return { unit, tf, length: tokens.length }
  })
  const df = new Map<string, number>()
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(docs.length, 1)
  const idf = (t: string) => Math.log(1 + (docs.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5))
  return {
    size: docs.length,
    search(query, limit = 8) {
      const terms = [...new Set(tokenize(query))]
      const hits: Hit[] = []
      for (const d of docs) {
        let score = 0, matched = 0
        for (const t of terms) {
          const f = d.tf.get(t)
          if (!f) continue
          matched++
          score += idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.length / avg))
        }
        if (score > 0) hits.push({ unit: d.unit, score, matched })
      }
      hits.sort((x, y) => y.score - x.score)
      return { hits: hits.slice(0, limit), queryTerms: terms.length }
    },
  }
}

/** Relevant enough to answer from: a minimum score and at least two distinct query terms (one
 * when the question has only one). The model is still told to say "not found" when the
 * passages do not answer the question; this gate only keeps off-topic questions from costing a call. */
export function relevant(result: { hits: Hit[]; queryTerms: number }, minScore: number): Hit[] {
  const need = Math.min(2, result.queryTerms)
  return result.hits.filter(h => h.score >= minScore && h.matched >= need)
}
