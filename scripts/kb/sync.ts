// Usage: tsx scripts/kb/sync.ts --config <sources.json> --denylist <file> --out <json> [--log <jsonl>]
// sources.json: { "sources": [ { "id": "matt-notes", "files": "/dir/notes-*.md", "enabled": true } ] }
// Only enabled sources are read, and only files whose name matches the pattern inside that one
// directory (`*` and `?` in the file name; no recursion, no other directories).
// Exit 0: gate passed, <json> written (an unchanged file is left alone). Exit 1: blocked, nothing
// written. Exit 2: usage or input error, nothing written. The private name list is required: a
// missing or empty list blocks publication instead of skipping that check.
import { appendFileSync, readFileSync, readdirSync, renameSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { buildFeed, gateFeed, isSourceId, parseDenylist, validateFeed, type SourceId } from './feed'

export function sourceFiles(configText: string): { source: SourceId; file: string }[] {
  const config = JSON.parse(configText) as { sources?: unknown }
  if (!Array.isArray(config.sources)) throw new Error('config: "sources" must be an array')
  const out: { source: SourceId; file: string }[] = []
  for (const item of config.sources as Record<string, unknown>[]) {
    const { id, files, enabled } = item ?? {}
    if (!isSourceId(id) || typeof files !== 'string' || typeof enabled !== 'boolean') throw new Error(`config: bad source ${JSON.stringify(item)}`)
    if (!enabled) continue
    const dir = dirname(files), pattern = basename(files)
    if (/[*?[\]{}]/.test(dir)) throw new Error(`config: wildcards are allowed only in the file name (${id})`)
    const rule = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$')
    for (const name of readdirSync(dir).sort()) if (rule.test(name) && statSync(join(dir, name)).isFile()) out.push({ source: id, file: join(dir, name) })
  }
  return out
}

export function runSync(argv: string[], now = () => new Date()): number {
  let log: string | undefined
  const record = (event: Record<string, unknown>) => {
    // Logged in Beijing time (UTC+8), like the rest of the maintainers' logs.
    const at = new Date(now().getTime() + 8 * 3600_000).toISOString().replace('Z', '+08:00')
    const line = JSON.stringify({ at, ...event })
    if (log) appendFileSync(log, line + '\n'); else console.error(line)
  }
  try {
    const { values } = parseArgs({ args: argv, options: { config: { type: 'string' }, denylist: { type: 'string' }, out: { type: 'string' }, log: { type: 'string' } } })
    log = values.log
    if (!values.config || !values.out || !values.denylist) { record({ result: 'error', reason: 'usage: --config, --denylist and --out are required' }); return 2 }
    const names = parseDenylist(readFileSync(values.denylist, 'utf8'))
    if (!names.length) { record({ result: 'blocked', reason: 'empty denylist' }); return 1 }
    const files = sourceFiles(readFileSync(values.config, 'utf8'))
    if (!files.length) { record({ result: 'error', reason: 'no source files' }); return 2 }
    const { feed, skipped } = buildFeed(files.map(({ source, file }) => ({ source, text: readFileSync(file, 'utf8') })))
    for (const s of skipped) record({ result: 'skip', ...s })
    const findings = gateFeed(feed, names)
    if (findings.length) {
      // Categories, places and the matched text only; the log stays on the maintainers' machine.
      for (const f of findings) record({ result: 'blocked', ...f })
      record({ result: 'blocked', findings: findings.length, published: false })
      return 1
    }
    validateFeed(feed)
    const text = JSON.stringify(feed, null, 2) + '\n'
    if (existsSync(values.out) && readFileSync(values.out, 'utf8') === text) { record({ result: 'noop', entries: feed.entries.length }); return 0 }
    const temp = join(dirname(values.out), `.${basename(values.out)}.tmp`)
    writeFileSync(temp, text); renameSync(temp, values.out)
    record({ result: 'written', entries: feed.entries.length, files: files.length })
    return 0
  } catch (error) {
    record({ result: 'error', reason: error instanceof Error ? error.message : String(error) })
    return 2
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = runSync(process.argv.slice(2))
