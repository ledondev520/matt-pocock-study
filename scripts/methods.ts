// The methodology sets in data/methods/<slug>.json, read and validated once per directory.
// This is the module other code uses (home page, static search, /api/ask, the build); see
// docs/methods.md. Adding a set is adding a file: an invalid file fails the build with every
// problem and its JSON path.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Lang } from '../src/lib/lang'
import { buildChunks, pickForDay, slugOf, summarize, validateMethodology, type MethodChunk, type Methodology, type MethodSummary } from '../src/lib/methods'

export { methodPath, methodsSlug, slugOf, type MethodChunk, type Methodology, type MethodSummary } from '../src/lib/methods'
export const METHODS_DIR = 'data/methods'

const cache = new Map<string, Methodology[]>()

/** Every set in `dir`, sorted by id. Throws one error listing every problem in every file. */
export function loadMethodologies(dir = METHODS_DIR): Methodology[] {
  const hit = cache.get(dir)
  if (hit) return hit
  let files: string[] = []
  try { files = readdirSync(dir).filter(f => f.endsWith('.json')).sort() } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const problems: string[] = [], sets: Methodology[] = []
  for (const file of files) {
    let value: unknown
    try { value = JSON.parse(readFileSync(join(dir, file), 'utf8')) } catch (error) { problems.push(`${file}: invalid JSON (${(error as Error).message})`); continue }
    const errors = validateMethodology(value)
    if (errors.length) { problems.push(...errors.map(e => `${file} ${e}`)); continue }
    const m = value as Methodology
    if (`${slugOf(m.id)}.json` !== file) { problems.push(`${file}: file name must be ${slugOf(m.id)}.json for id ${m.id}`); continue }
    sets.push(m)
  }
  if (problems.length) throw new Error(`Invalid methodology data in ${dir}:\n${problems.map(p => `  ${p}`).join('\n')}`)
  sets.sort((a, b) => a.id.localeCompare(b.id))
  cache.set(dir, sets)
  return sets
}

/** One summary per set in `lang` (title, question, claim, domain, date_last), sorted by id. */
export function listMethodologies(lang: Lang = 'zh', dir = METHODS_DIR): MethodSummary[] {
  return loadMethodologies(dir).map(m => summarize(m, lang))
}

/** A set by id (`m.pr-review`) or slug (`pr-review`). */
export function getMethodology(idOrSlug: string, dir = METHODS_DIR): Methodology | undefined {
  const id = idOrSlug.startsWith('m.') ? idOrSlug : `m.${idOrSlug}`
  return loadMethodologies(dir).find(m => m.id === id)
}

/** Retrieval chunks for one language, or both when `lang` is omitted (zh first). */
export function chunks(lang?: Lang, dir = METHODS_DIR): MethodChunk[] {
  const langs: Lang[] = lang ? [lang] : ['zh', 'en']
  return langs.flatMap(l => loadMethodologies(dir).flatMap(m => buildChunks(m, l)))
}

/** The set for a calendar day (YYYY-MM-DD), stable all day; undefined when there are no sets. */
export function todaysMethodology(day: string, lang: Lang = 'zh', dir = METHODS_DIR): MethodSummary | undefined {
  return pickForDay(listMethodologies(lang, dir), day)
}
