// Read-only audit. Do not print chunk text or source data.
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chunkUnits, readChunks } from '../server/ask/methodology-adapter'
import { hasGeneratedPage, isMethodLink, loadPageManifest } from '../server/ask/page-manifest'

export function checkAskMethodLinks(chunksFile: string, manifestFile: string) {
  const pages = loadPageManifest(manifestFile)
  // Adapt each chunk independently so duplicate ids cannot hide a link from this audit.
  const links = [...new Set(readChunks(chunksFile).flatMap(chunk => chunkUnits([chunk]))
    .map(unit => unit.sitePath).filter(isMethodLink))].sort()
  return links.map(path => ({ path, exists: hasGeneratedPage(pages, path) }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const chunksFile = process.env.ASK_CHUNKS_FILE
    const args = process.argv.slice(2)
    const manifestFile = args[0] ?? process.env.ASK_PAGE_MANIFEST ?? 'dist/page-manifest.json'
    if (!chunksFile || args.length > 1) throw new Error('Usage: ASK_CHUNKS_FILE=<chunks> scripts/check-ask-method-links [page-manifest.json]')
    const links = checkAskMethodLinks(chunksFile, manifestFile)
    for (const link of links) console.log(`${link.exists ? 'OK' : 'MISSING'} ${link.path}`)
    const missing = links.filter(link => !link.exists).length
    console.log(`Method links: ${links.length}, missing: ${missing}`)
    if (missing) process.exitCode = 1
  } catch {
    // Parsing errors can include private data; only report the usage, never raw input.
    console.error('Cannot check links. Set ASK_CHUNKS_FILE and provide a valid page manifest: scripts/check-ask-method-links [page-manifest.json]')
    process.exitCode = 2
  }
}
