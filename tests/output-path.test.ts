import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { outputPath, writeOutput } from '../scripts/output-path.mjs'
import { validateFigureRegistry } from '../scripts/figure-registry.mjs'
import { buildFigures } from '../scripts/figures'
import registry from '../data/figures.json'

it.each(['../escaped', '../../escaped', '/tmp/escaped', 'a/b', '..', '', 'UPPER', 'bad_id'])('rejects unsafe registry id %s at the loading boundary', id => {
  expect(() => validateFigureRegistry({ figures: [{ id: 'safe' }, { id }] })).toThrow(/Invalid figure id/)
})
it('rejects duplicate IDs and accepts all current registry IDs', () => {
  expect(validateFigureRegistry(registry)).toBe(registry)
  expect(() => validateFigureRegistry({ figures: [{ id: 'same' }, { id: 'same' }] })).toThrow()
})
it('checks relative and absolute writes, preserving legitimate ..valid filenames', async () => {
  const root = await mkdtemp(join(tmpdir(), 'output-boundary-'))
  try {
    const base = join(root, 'out')
    expect(() => outputPath(base, '../escaped')).toThrow(/escapes/)
    expect(() => outputPath(base, resolve(root, 'escaped'))).toThrow(/escapes/)
    await expect(writeOutput(base, '../escaped', 'bad')).rejects.toThrow(/escapes/)
    await expect(writeOutput(base, resolve(root, 'escaped'), 'bad')).rejects.toThrow(/escapes/)
    await writeOutput(base, '..valid', 'safe')
    expect(await readFile(join(base, '..valid'), 'utf8')).toBe('safe')
    await expect(readFile(join(root, 'escaped'))).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('rejects a traversal registry entry before buildFigures writes any files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'registry-traversal-'))
  const figure = registry.figures.at(-1)!, original = figure.id
  try {
    figure.id = '../../escaped'
    await expect(buildFigures(join(root, 'out'))).rejects.toThrow(/Invalid figure id/)
    expect(await readdir(root)).toEqual([])
  } finally { figure.id = original; await rm(root, { recursive: true, force: true }) }
})
