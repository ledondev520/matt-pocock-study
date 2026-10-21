// Ensures every committed Archify diagram (public/diagrams/*.svg) starts with Archify's full
// licence comment, generated from the hash-checked LICENSE. Idempotent; `--check` only reports.
//
// Whitelist only: the directory may hold nothing but regular files named <id>.<zh|en>.svg. A
// symbolic link or any other entry fails the whole run, every file's real path must stay inside
// the directory, and nothing is written until all files have been checked.
import { lstat, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { archifySvgComment, embedsArchify } from '../licences.mjs'

const allowedName = /^[a-z][a-z0-9-]*\.(?:zh|en)\.svg$/

// Same containment rule as scripts/diagrams/build.mjs `inside`, applied to the resolved real path.
async function inside(base, target) {
  const root = await realpath(base)
  const real = await realpath(target)
  const rel = relative(root, real)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Diagram file is outside ${base}: ${target}`)
  return real
}

export async function ensureLicenceComments(directory = 'public/diagrams', { check = false } = {}) {
  const base = resolve(directory)
  if ((await lstat(base)).isSymbolicLink()) throw new Error(`Diagram directory must not be a symbolic link: ${directory}`)
  const comment = archifySvgComment()
  const pending = []
  for (const entry of (await readdir(base, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(base, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in ${directory}: ${entry.name}`)
    if (!entry.isFile() || !allowedName.test(entry.name)) throw new Error(`Unexpected entry in ${directory}: ${entry.name}`)
    const real = await inside(base, path)
    if (!(await lstat(real)).isFile()) throw new Error(`Not a regular file: ${entry.name}`)
    const source = await readFile(real, 'utf8')
    if (source.startsWith(comment)) continue
    if (!embedsArchify(source)) throw new Error(`Not an Archify diagram: ${entry.name}`)
    pending.push({ real, data: comment + source })
  }
  if (!check) for (const { real, data } of pending) await writeFile(real, data)
  return pending.length
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const check = process.argv.includes('--check')
  const missing = await ensureLicenceComments('public/diagrams', { check })
  if (check && missing) { console.error(`${missing} diagram file(s) lack the Archify licence comment`); process.exitCode = 1 }
  else console.log(check ? 'all diagram files carry the Archify licence comment' : `added the licence comment to ${missing} file(s)`)
}
