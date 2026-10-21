import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ensureLicenceComments } from '../scripts/diagrams/licence-comments.mjs'
import { archifySvgComment } from '../scripts/licences.mjs'

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

it('adds the exact comment to whitelisted diagram files and is idempotent', async () => {
  await writeFile(join(diagrams, 'd02-failure-sort.en.svg'), body)
  expect(await ensureLicenceComments(diagrams, { check: true })).toBe(1)
  expect(await readFile(join(diagrams, 'd02-failure-sort.en.svg'), 'utf8')).toBe(body)
  expect(await ensureLicenceComments(diagrams)).toBe(1)
  expect(await readFile(join(diagrams, 'd02-failure-sort.en.svg'), 'utf8')).toBe(comment + body)
  expect(await ensureLicenceComments(diagrams)).toBe(0)
})

it('fails on a symbolic link pointing outside and changes no file', async () => {
  const outside = join(root, 'outside.svg')
  await writeFile(outside, body)
  await writeFile(join(diagrams, 'a.en.svg'), body)
  await symlink(outside, join(diagrams, 'z.en.svg'))
  await expect(ensureLicenceComments(diagrams)).rejects.toThrow(/Symbolic links are not allowed/)
  expect(await readFile(outside, 'utf8')).toBe(body)
  // Nothing is written before every entry has been checked.
  expect(await readFile(join(diagrams, 'a.en.svg'), 'utf8')).toBe(body)
})

it('fails when the directory itself is a symbolic link', async () => {
  const linked = join(root, 'linked')
  await writeFile(join(diagrams, 'a.en.svg'), body)
  await symlink(diagrams, linked)
  await expect(ensureLicenceComments(linked)).rejects.toThrow(/must not be a symbolic link/)
  expect(await readFile(join(diagrams, 'a.en.svg'), 'utf8')).toBe(body)
})

it.each([['a non-diagram name', 'notes.txt'], ['a subdirectory', 'nested']])('fails on %s', async (_, name) => {
  if (name === 'nested') await mkdir(join(diagrams, name))
  else await writeFile(join(diagrams, name), 'x')
  await expect(ensureLicenceComments(diagrams)).rejects.toThrow(/Unexpected entry/)
})

it('refuses to stamp a file that is not an Archify diagram', async () => {
  await writeFile(join(diagrams, 'plain.en.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  await expect(ensureLicenceComments(diagrams)).rejects.toThrow(/Not an Archify diagram/)
})
