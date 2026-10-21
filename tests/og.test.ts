import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { generateOg, outputPath } from '../scripts/og.mjs'

it('rejects a traversal slug before writing any OG file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'og-traversal-'))
  try {
    for (const lang of ['en', 'zh']) {
      await mkdir(join(root, lang))
      const source = (await readFile(`content/${lang}/learn-from-matt.md`, 'utf8')).replace('slug: learn-from-matt', 'slug: ../escaped')
      await writeFile(join(root, lang, 'learn-from-matt.md'), source)
    }
    await expect(generateOg(root, join(root, 'out'))).rejects.toThrow(/Invalid front matter/)
    await expect(readFile(join(root, 'escaped.png'))).rejects.toThrow()
    expect(() => outputPath(join(root, 'out'), 'en', '../../escaped')).toThrow(/escapes/)
    expect(() => outputPath(join(root, 'out'), resolve(root, 'outside'), 'page')).toThrow(/escapes/)
    expect(outputPath(join(root, 'out'), 'en', '..valid')).toBe(resolve(root, 'out/en/..valid.png'))
  } finally { await rm(root, { recursive: true, force: true }) }
})
