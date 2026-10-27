import { mkdir } from 'node:fs/promises'
import { buildContent } from './content'
import { importCorpus, loadCorpus } from '../server/corpus'
import { createIndex } from '../server/db'
import { readFileSync } from 'node:fs'
import { validateFeed } from './kb/feed'

// Fail early on an invalid knowledge base feed (static.tsx checks it again when rendering).
// KB_FEED only exists so tests can point the check at a bad file.
validateFeed(JSON.parse(readFileSync(process.env.KB_FEED ?? 'data/knowledge-base.json', 'utf8')))

const pages = await buildContent('content', 'public')
await mkdir('generated', { recursive: true })
const db = createIndex(pages, 'generated/content.sqlite')
importCorpus(db, loadCorpus())
db.close()
console.log(`Built ${pages.length} pages, Markdown downloads, LLM files, and SQLite index.`)
