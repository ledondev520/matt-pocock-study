import { mkdir } from 'node:fs/promises'
import { buildContent } from './content'
import { importCorpus, loadCorpus } from '../server/corpus'
import { createIndex } from '../server/db'

const pages = await buildContent('content', 'public')
await mkdir('generated', { recursive: true })
const db = createIndex(pages, 'generated/content.sqlite')
importCorpus(db, loadCorpus())
db.close()
console.log(`Built ${pages.length} pages, Markdown downloads, LLM files, and SQLite index.`)
