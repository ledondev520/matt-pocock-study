// Ensures every committed Archify diagram (public/diagrams/*.svg) starts with Archify's full
// licence comment, generated from the hash-checked LICENSE. Idempotent; `--check` only reports.
//
// Whitelist only: the directory may hold nothing but regular files named <id>.<zh|en>.svg. A
// symbolic link or any other entry fails the whole run, every file's real path must stay inside
// the directory, and nothing is written until all files have been checked.
//
// Files are never written in place. Each one is read through a handle opened with O_NOFOLLOW,
// must have exactly one link (a hard link would share its data with a file elsewhere), and is
// replaced by writing a new, exclusively created temporary file in the same directory and
// renaming it over the entry. Just before the rename the entry must still be the same file
// (device, inode, one link, not a link). rename replaces the directory entry itself and never
// follows it, so even an entry swapped after that last check cannot redirect the write outside.
import { constants } from 'node:fs'
import { lstat, open, readdir, realpath, rename, rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { archifySvgComment, embedsArchify } from '../licences.mjs'

const allowedName = /^[a-z][a-z0-9-]*\.(?:zh|en)\.svg$/
// O_NOFOLLOW exists on Linux and macOS; elsewhere the lstat checks below still apply.
const noFollow = constants.O_NOFOLLOW ?? 0

// Same containment rule as scripts/diagrams/build.mjs `inside`, applied to the resolved real path.
async function inside(root, target) {
  const real = await realpath(target)
  const rel = relative(root, real)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Diagram file is outside the diagram directory: ${target}`)
  return real
}

const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino

async function checkedEntry(path, name) {
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`Not a regular file: ${name}`)
  if (info.nlink !== 1) throw new Error(`Hard-linked files are not allowed: ${name}`)
  return info
}

/**
 * @param {string} directory
 * @param {{ check?: boolean, beforeReplace?: (name: string, path: string) => Promise<void> | void }} options
 *   beforeReplace runs after all checks, just before a file is replaced (tests swap files here).
 */
export async function ensureLicenceComments(directory = 'public/diagrams', { check = false, beforeReplace } = {}) {
  if ((await lstat(resolve(directory))).isSymbolicLink()) throw new Error(`Diagram directory must not be a symbolic link: ${directory}`)
  const root = await realpath(directory)
  const comment = archifySvgComment()
  const pending = []
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(root, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in ${directory}: ${entry.name}`)
    if (!entry.isFile() || !allowedName.test(entry.name)) throw new Error(`Unexpected entry in ${directory}: ${entry.name}`)
    if (await inside(root, path) !== path) throw new Error(`Diagram file is not a direct entry: ${entry.name}`)
    const listed = await checkedEntry(path, entry.name)
    const handle = await open(path, constants.O_RDONLY | noFollow)
    let source, opened
    try {
      opened = await handle.stat()
      if (!opened.isFile() || opened.nlink !== 1 || !sameFile(opened, listed)) throw new Error(`File changed while being checked: ${entry.name}`)
      source = await handle.readFile('utf8')
    } finally { await handle.close() }
    if (source.startsWith(comment)) continue
    if (!embedsArchify(source)) throw new Error(`Not an Archify diagram: ${entry.name}`)
    pending.push({ name: entry.name, path, identity: opened, data: comment + source })
  }
  if (check) return pending.length
  for (const { name, path, identity, data } of pending) {
    await beforeReplace?.(name, path)
    const temporary = join(root, `.${name}.${randomBytes(6).toString('hex')}.tmp`)
    // wx = O_CREAT | O_EXCL: never reuses or follows an existing path.
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, identity.mode & 0o777)
    try {
      try { await handle.writeFile(data); await handle.sync() } finally { await handle.close() }
      const current = await checkedEntry(path, name).catch(error => { throw new Error(`File changed since it was checked: ${name} (${error.message})`) })
      if (!sameFile(current, identity)) throw new Error(`File changed since it was checked: ${name}`)
      await rename(temporary, path)
    } catch (error) {
      await rm(temporary, { force: true })
      throw error
    }
  }
  return pending.length
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const check = process.argv.includes('--check')
  const missing = await ensureLicenceComments('public/diagrams', { check })
  if (check && missing) { console.error(`${missing} diagram file(s) lack the Archify licence comment`); process.exitCode = 1 }
  else console.log(check ? 'all diagram files carry the Archify licence comment' : `added the licence comment to ${missing} file(s)`)
}
