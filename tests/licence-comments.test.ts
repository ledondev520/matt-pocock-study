import { execFileSync } from 'node:child_process'
import { link, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { checkLicenceComments } from '../scripts/diagrams/licence-comments.mjs'
import { archifySvgComment } from '../scripts/licences.mjs'

const script = 'scripts/diagrams/licence-comments.mjs'
const comment = archifySvgComment()
const body = (await readFile('public/diagrams/d02-failure-sort.en.svg', 'utf8')).slice(comment.length)
let root = ''
let diagrams = ''
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'licence-comments-'))
  diagrams = join(root, 'diagrams')
  await mkdir(diagrams)
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

// Every entry under `base` with its bytes and metadata, to prove a run changed nothing.
async function snapshot(base: string) {
  const entries: Record<string, string> = {}
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      const info = await stat(path).catch(() => null)
      const bytes = entry.isFile() && info ? (await readFile(path)).toString('base64') : ''
      entries[relative(base, path)] = `${entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'dir' : 'file'}:${info?.ino}:${info?.mtimeMs}:${info?.nlink}:${bytes}`
      if (entry.isDirectory()) await walk(path)
    }
  }
  await walk(base)
  return entries
}

it('passes committed files that start with the exact comment', async () => {
  await writeFile(join(diagrams, 'a.en.svg'), comment + body)
  expect(await checkLicenceComments(diagrams)).toEqual([])
})

it('reports files that lack the comment or carry a different one, and changes nothing', async () => {
  const outside = join(root, 'outside.svg')
  await writeFile(outside, body)
  await writeFile(join(diagrams, 'a.en.svg'), body)
  await writeFile(join(diagrams, 'b.en.svg'), comment.replace('2026 tt-a1i', '2027 tt-a1i') + body)
  await writeFile(join(diagrams, 'c.en.svg'), comment + body)
  const before = await snapshot(root)
  expect(await checkLicenceComments(diagrams)).toEqual(['a.en.svg', 'b.en.svg'])
  expect(await snapshot(root)).toEqual(before)
})

it('the CLI fails on the real tree with a missing comment, prints the exact comment and writes nothing', async () => {
  // A copy of the repository's script layout pointing at a scratch public/diagrams.
  await mkdir(join(root, 'public', 'diagrams'), { recursive: true })
  await writeFile(join(root, 'public', 'diagrams', 'a.en.svg'), body)
  await writeFile(join(root, 'outside.txt'), 'sentinel')
  // The licence module reads third_party/archify/LICENSE relative to the working directory.
  await mkdir(join(root, 'third_party', 'archify'), { recursive: true })
  await writeFile(join(root, 'third_party', 'archify', 'LICENSE'), await readFile('third_party/archify/LICENSE'))
  const before = await snapshot(root)
  let stderr = ''
  let status = 0
  try { execFileSync(process.execPath, [join(process.cwd(), script), '--check'], { cwd: root, stdio: 'pipe', env: { ...process.env } }) }
  catch (error) { status = (error as { status: number }).status; stderr = String((error as { stderr: Buffer }).stderr) }
  expect(status).toBe(1)
  expect(stderr).toContain('public/diagrams/a.en.svg')
  expect(stderr).toContain(comment)
  expect(await snapshot(root)).toEqual(before)
})

it('rejects any argument that is not --check', () => {
  expect(() => execFileSync(process.execPath, [script, '--write'], { stdio: 'pipe' })).toThrow(/read-only check/)
})

it('fails on a symbolic link pointing outside', async () => {
  await writeFile(join(root, 'outside.svg'), body)
  await writeFile(join(diagrams, 'a.en.svg'), comment + body)
  await symlink(join(root, 'outside.svg'), join(diagrams, 'z.en.svg'))
  const before = await snapshot(root)
  await expect(checkLicenceComments(diagrams)).rejects.toThrow(/Symbolic links are not allowed/)
  expect(await snapshot(root)).toEqual(before)
})

it('fails on a hard link to a file outside', async () => {
  await writeFile(join(root, 'outside.svg'), body)
  await link(join(root, 'outside.svg'), join(diagrams, 'z.en.svg'))
  const before = await snapshot(root)
  await expect(checkLicenceComments(diagrams)).rejects.toThrow(/Hard-linked files are not allowed/)
  expect(await snapshot(root)).toEqual(before)
})

it('fails when the directory itself is a symbolic link', async () => {
  await writeFile(join(diagrams, 'a.en.svg'), comment + body)
  await symlink(diagrams, join(root, 'linked'))
  await expect(checkLicenceComments(join(root, 'linked'))).rejects.toThrow(/must not be a symbolic link/)
})

it.each([['a non-diagram name', 'notes.txt'], ['a subdirectory', 'nested']])('fails on %s', async (_, name) => {
  if (name === 'nested') await mkdir(join(diagrams, name))
  else await writeFile(join(diagrams, name), 'x')
  await expect(checkLicenceComments(diagrams)).rejects.toThrow(/Unexpected entry/)
})

it('fails on a file that is not an Archify diagram', async () => {
  await writeFile(join(diagrams, 'plain.en.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  await expect(checkLicenceComments(diagrams)).rejects.toThrow(/Not an Archify diagram/)
})

// The checker must stay read-only by construction: it may import only these file-system reads,
// open files only with O_RDONLY, and name no API that writes, creates, renames or deletes.
it('the checker source uses no write API', async () => {
  const source = await readFile(script, 'utf8')
  const code = source.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const fsImports = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'node:fs(?:\/promises)?'/g)].flatMap(match => match[1].split(',').map(name => name.trim()).filter(Boolean))
  expect(fsImports.sort()).toEqual(['constants', 'lstat', 'open', 'readdir', 'realpath'])
  // Only these modules, only static named imports; no dynamic import or require.
  expect([...code.matchAll(/from\s*'([^']+)'/g)].map(match => match[1]).sort()).toEqual(['../licences.mjs', 'node:fs', 'node:fs/promises', 'node:path', 'node:url'])
  expect(code).not.toMatch(/\bimport\s*\(|\brequire\s*\(|\bimport\s+\*|\bimport\s+\w+\s+from/)
  // No call to a writing function (as a function or method), and no writing open flag.
  expect(code).not.toMatch(/\b(?:write\w*|append\w*|rename\w*|rm\w*|unlink\w*|mkdir\w*|mkdtemp\w*|copy\w*|cp|truncate\w*|ftruncate\w*|symlink\w*|link|chmod\w*|chown\w*|utimes\w*|lutimes\w*|createWriteStream|sync|datasync)\s*\(/)
  expect(code).not.toMatch(/\b(?:O_WRONLY|O_RDWR|O_CREAT|O_TRUNC|O_APPEND|O_EXCL)\b|['"](?:w|wx|a|ax|r\+|w\+|a\+)['"]/)
  // The only open() call passes the read-only flag constant.
  expect([...code.matchAll(/\bopen\(([^)]*)\)/g)].map(match => match[1].split(',')[1]?.trim())).toEqual(['readOnly'])
  expect(code).toMatch(/const readOnly = constants\.O_RDONLY \| \(constants\.O_NOFOLLOW \?\? 0\)/)
})
