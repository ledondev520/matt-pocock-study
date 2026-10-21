// Ensures every committed Archify diagram (public/diagrams/*.svg) starts with Archify's full
// licence comment, generated from the hash-checked LICENSE. Idempotent; `--check` only reports.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { archifySvgComment, embedsArchify } from '../licences.mjs'

const directory = 'public/diagrams'
const comment = archifySvgComment()
const check = process.argv.includes('--check')
let missing = 0
for (const file of (await readdir(directory)).filter(name => name.endsWith('.svg')).sort()) {
  const path = join(directory, file)
  const source = await readFile(path, 'utf8')
  const body = source.startsWith(comment) ? source.slice(comment.length) : source
  if (!embedsArchify(body) || source.startsWith(comment)) continue
  missing++
  if (!check) await writeFile(path, comment + body)
}
if (check && missing) { console.error(`${missing} diagram file(s) lack the Archify licence comment`); process.exitCode = 1 }
else console.log(check ? 'all diagram files carry the Archify licence comment' : `added the licence comment to ${missing} file(s)`)
