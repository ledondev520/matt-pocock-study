// Re-check data/knowledge-base.json in CI for data-only PRs: shape (validateFeed), the
// publication gate (gateFeed, plus the private name list when KB_DENYLIST is provided as a
// secret), and canonical formatting (exactly what scripts/kb/sync.ts writes).
// Fails closed: a missing gate module, a symlink or an unreadable file is an error.
// Prints categories and entry ids only, never the matched text.
// Usage: npx tsx scripts/ci/check-kb-data.ts
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

interface Finding { category: string; id: string; field: string }
interface FeedModule {
  validateFeed: (value: unknown) => unknown
  gateFeed: (feed: unknown, names?: string[]) => Finding[]
  parseDenylist: (text: string) => string[]
}

const DATA = 'data/knowledge-base.json'
const GATE = resolve('scripts/kb/feed.ts')

async function run(): Promise<number> {
  if (!existsSync(GATE)) { console.error(`cannot check ${DATA}: ${GATE} is missing`); return 1 }
  const stat = lstatSync(DATA, { throwIfNoEntry: false })
  if (!stat?.isFile()) { console.error(`${DATA} must be a regular file`); return 1 }
  const feedModule = (await import(pathToFileURL(GATE).href)) as FeedModule
  const text = readFileSync(DATA, 'utf8')
  let feed: unknown
  try {
    feed = feedModule.validateFeed(JSON.parse(text))
  } catch (error) {
    // validateFeed reports entry ids, fields and categories, not the matched text.
    console.error(error instanceof Error ? error.message : 'invalid feed')
    return 1
  }
  const names = feedModule.parseDenylist(process.env.KB_DENYLIST ?? '')
  const findings = feedModule.gateFeed(feed, names)
  if (findings.length) {
    for (const f of findings) console.error(`gate: ${f.category} in ${f.id} ${f.field}`)
    return 1
  }
  if (text !== JSON.stringify(feed, null, 2) + '\n') { console.error(`${DATA} is not in canonical format (2-space JSON, trailing newline)`); return 1 }
  console.log(`${DATA}: ok (private name list ${names.length ? 'checked' : 'not provided'})`)
  return 0
}

process.exitCode = await run()
