import { mkdir } from 'node:fs/promises'
import { buildContent } from './content'
import { createIndex } from '../server/db'

const pages = await buildContent('content', 'public')
await mkdir('generated', { recursive: true })
createIndex(pages, 'generated/content.sqlite').close()
console.log(`Built ${pages.length} pages, Markdown downloads, LLM files, and SQLite index.`)
