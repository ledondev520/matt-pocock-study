// Build-time index for /api/ask: the site's own words only (page sections, study notes, corpus
// summaries). Written outside dist/ so the static server never publishes it; the matt-ask
// process reads it at start. Matt's original posts are not part of the build (see server/ask/units.ts).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Page } from '../src/lib/content'
import { loadCorpus } from '../server/corpus'
import { noteUnits, pageUnits, summaryUnits, type PublicIndex } from '../server/ask/units'
import { validateFeed } from './kb/feed'

export const ASK_INDEX_FILE = 'server-data/ask-index.json'

export async function buildAskIndex(root = 'dist', out = ASK_INDEX_FILE, kbFile = 'data/knowledge-base.json', corpusFile = 'data/corpus-index.json') {
  const pages: Page[] = JSON.parse(await readFile(resolve(root, 'content.json'), 'utf8'))
  const index: PublicIndex = { version: 1, units: [
    ...pageUnits(pages),
    ...noteUnits(validateFeed(JSON.parse(await readFile(kbFile, 'utf8'))).entries),
    ...summaryUnits(loadCorpus(corpusFile)),
  ] }
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(index))
  return index
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const index = await buildAskIndex()
  console.log(`ask index: ${index.units.length} units -> ${ASK_INDEX_FILE}`)
}
