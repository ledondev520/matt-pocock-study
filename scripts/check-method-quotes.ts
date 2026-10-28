// Pre-launch check: every quote in data/methods/*.json appears word for word in Matt's original
// text, at the URL it links to, in at most 25 words. Needs the private source dataset, so it runs
// only on the maintainer's machine, never in CI:
//
//   npm run check:quotes -- --dataset <dir>     (or set KB_DATASET=<dir>)
//
// <dir> holds matt-posts-*.jsonl, aihero-pages.jsonl and github-repos.jsonl ({url, text, date}).
// Also checks that every anchor URL is in the dataset, that its date is within a day of the
// post's date, and that each repository's licence matches. Prints counts and problems only.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadMethodologies } from './methods'
import { anchorsOf, MAX_QUOTE_WORDS, quoteWords, type Methodology } from '../src/lib/methods'

interface Source { text: string; date?: string; license?: string }

export const normalize = (text: string) => text
  .replace(/\u200b|\u200c|\u200d|\ufeff/g, '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim()

export function loadSources(dataset: string): Map<string, Source> {
  const sources = new Map<string, Source>()
  const read = (file: string, text: (row: Record<string, unknown>) => string) => {
    for (const line of readFileSync(join(dataset, file), 'utf8').split('\n')) {
      if (!line.trim()) continue
      const row = JSON.parse(line) as Record<string, unknown>
      if (typeof row.url !== 'string') continue
      const prev = sources.get(row.url)
      sources.set(row.url, { text: `${prev?.text ?? ''} ${text(row)}`, date: typeof row.date === 'string' ? row.date.slice(0, 10) : prev?.date, license: typeof row.license === 'string' ? row.license : prev?.license })
    }
  }
  const files = readdirSync(dataset)
  for (const f of files.filter(f => /^matt-posts-.*\.jsonl$/.test(f))) read(f, r => `${r.text ?? ''} ${r.post_text ?? ''}`)
  for (const f of ['aihero-pages.jsonl', 'github-repos.jsonl']) if (files.includes(f)) read(f, r => String(r.text ?? ''))
  return sources
}

export function checkQuotes(sets: Methodology[], sources: Map<string, Source>) {
  const problems: string[] = []
  let anchors = 0, quotes = 0, repos = 0
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000
  for (const m of sets) {
    for (const { anchor, at } of anchorsOf(m)) {
      anchors++
      const where = `${m.id} ${at}`
      const source = sources.get(anchor.url)
      if (!source) { problems.push(`${where}: URL not in dataset: ${anchor.url}`); continue }
      if (source.date && days(source.date, anchor.date) > 1) problems.push(`${where}: date ${anchor.date} but the source is dated ${source.date}: ${anchor.url}`)
      if (anchor.quote === undefined) continue
      quotes++
      if (quoteWords(anchor.quote) > MAX_QUOTE_WORDS) problems.push(`${where}: quote has ${quoteWords(anchor.quote)} words (max ${MAX_QUOTE_WORDS})`)
      if (!normalize(source.text).includes(normalize(anchor.quote))) problems.push(`${where}: quote not found verbatim at ${anchor.url}: "${anchor.quote}"`)
    }
    for (const r of m.repos ?? []) {
      repos++
      const source = sources.get(r.url)
      if (!source) problems.push(`${m.id} repos: URL not in dataset: ${r.url}`)
      else if (source.license && source.license.toLowerCase() !== r.license.toLowerCase()) problems.push(`${m.id} repos: licence ${r.license} but the dataset says ${source.license}: ${r.url}`)
    }
  }
  return { sets: sets.length, anchors, quotes, repos, problems }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const i = process.argv.indexOf('--dataset')
  const dataset = i > 0 ? process.argv[i + 1] : process.env.KB_DATASET
  if (!dataset || !existsSync(dataset)) {
    console.error('check:quotes needs the source dataset: npm run check:quotes -- --dataset <dir> (or KB_DATASET=<dir>)')
    process.exit(2)
  }
  const result = checkQuotes(loadMethodologies(), loadSources(dataset))
  for (const p of result.problems) console.log(p)
  console.log(`quote check: ${result.sets} sets, ${result.anchors} anchors, ${result.quotes} quotes, ${result.repos} repos, ${result.problems.length} problems`)
  if (result.problems.length) process.exitCode = 1
}
