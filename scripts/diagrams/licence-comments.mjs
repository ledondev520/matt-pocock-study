// Read-only check that every committed Archify diagram (public/diagrams/*.svg) starts with
// Archify's full licence comment, generated from the hash-checked LICENSE. The comments are
// committed content (written once by the diagram export in scripts/diagrams/build.mjs); this
// script never writes, creates, renames or deletes anything. When a file lacks the comment or
// carries a different one it fails and prints the exact comment to paste in by hand.
//
// Whitelist only: the directory may hold nothing but regular, single-link files named
// <id>.<zh|en>.svg whose real path is inside it. A symbolic link, hard link or any other entry
// fails the run. Files are opened read-only with O_NOFOLLOW.
import { constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { archifySvgComment, embedsArchify } from '../licences.mjs'

const allowedName = /^[a-z][a-z0-9-]*\.(?:zh|en)\.svg$/
// O_NOFOLLOW exists on Linux and macOS; elsewhere the lstat checks still apply.
const readOnly = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)

// Same containment rule as scripts/diagrams/build.mjs `inside`, applied to the resolved real path.
async function inside(root, target) {
  const real = await realpath(target)
  const rel = relative(root, real)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Diagram file is outside the diagram directory: ${target}`)
  return real
}

/**
 * Returns the names of diagram files whose first bytes are not the exact licence comment.
 * Throws on any entry outside the whitelist. Reads only.
 */
export async function checkLicenceComments(directory = 'public/diagrams') {
  if ((await lstat(resolve(directory))).isSymbolicLink()) throw new Error(`Diagram directory must not be a symbolic link: ${directory}`)
  const root = await realpath(directory)
  const comment = archifySvgComment()
  const missing = []
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(root, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in ${directory}: ${entry.name}`)
    if (!entry.isFile() || !allowedName.test(entry.name)) throw new Error(`Unexpected entry in ${directory}: ${entry.name}`)
    if (await inside(root, path) !== path) throw new Error(`Diagram file is not a direct entry: ${entry.name}`)
    const listed = await lstat(path)
    if (listed.isSymbolicLink() || !listed.isFile()) throw new Error(`Not a regular file: ${entry.name}`)
    if (listed.nlink !== 1) throw new Error(`Hard-linked files are not allowed: ${entry.name}`)
    const handle = await open(path, readOnly)
    let source
    try {
      const opened = await handle.stat()
      if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== listed.dev || opened.ino !== listed.ino) throw new Error(`File changed while being checked: ${entry.name}`)
      source = await handle.readFile('utf8')
    } finally { await handle.close() }
    if (source.startsWith(comment)) continue
    if (!embedsArchify(source)) throw new Error(`Not an Archify diagram: ${entry.name}`)
    missing.push(entry.name)
  }
  return missing
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const unknown = process.argv.slice(2).filter(argument => argument !== '--check')
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(' ')}. This script is a read-only check.`)
  const missing = await checkLicenceComments('public/diagrams')
  if (missing.length) {
    console.error(`${missing.length} diagram file(s) lack the exact Archify licence comment:\n${missing.map(name => `  public/diagrams/${name}`).join('\n')}`)
    console.error('\nEach must start with exactly these bytes (paste them in by hand, nothing before them):\n')
    console.error(archifySvgComment())
    process.exitCode = 1
  } else console.log('all diagram files carry the Archify licence comment')
}
