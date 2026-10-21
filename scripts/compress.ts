import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { brotliCompress, constants, gzip } from 'node:zlib'
import { outputPath, writeOutput } from './output-path.mjs'

const brotli = promisify(brotliCompress)
const gz = promisify(gzip)

export async function compressDist(root = 'dist'): Promise<void> {
  const directory = outputPath(root)
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = outputPath(root, entry.name)
    if (entry.isDirectory()) await compressDist(file)
    else if (entry.isFile() && /\.(html|css|js|mjs|svg|json|txt|md|xml)$/i.test(entry.name)) {
      const bytes = await readFile(file)
      if (bytes.length < 1024) continue
      await writeOutput(root, file + '.br', await brotli(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }))
      await writeOutput(root, file + '.gz', await gz(bytes))
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await compressDist()
