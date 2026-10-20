import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { lstat, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { isMain, rawDirectory, run } from './corpus/common.mjs';
import { exists, sourceTexts, walk } from './corpus/raw.mjs';
import { buildSourceIndex, findRuns } from './corpus/overlap.mjs';

export { tokenize, buildSourceIndex, findRuns } from './corpus/overlap.mjs';

function excluded(file) {
  const name = relative(process.cwd(), resolve(file)).split(sep).join('/');
  return name === 'third_party' || name.startsWith('third_party/') || /(^|\/)package-lock\.json$/.test(name);
}

// Default targets are prose and data (where copied originals would live). Source code is
// excluded because import lines and utility-class strings collide with code samples in the
// raw corpus; pass --all-files to include it anyway.
const PROSE = /\.(md|mdx|txt|json)$/i;

export async function targetFiles(paths = [], { allFiles = false } = {}) {
  let files = [];
  if (paths.length) {
    // Explicit paths also support new, untracked files before their first commit.
    for (const path of paths) {
      const stat = await lstat(path);
      if (stat.isDirectory()) for await (const file of walk(path)) files.push(file);
      else if (stat.isFile()) files.push(path);
    }
  } else {
    try {
      const { stdout } = await promisify(execFile)('git', ['ls-files', '-z'], { maxBuffer: 32 * 1024 * 1024 });
      files = stdout.split('\0').filter(Boolean).filter((file) => allFiles || PROSE.test(file));
    } catch { throw new Error('Cannot list tracked files; run in a Git checkout or supply --paths.'); }
  }
  return [...new Set(files.map((file) => resolve(file)))].filter((file) => !excluded(file)).sort();
}

export async function scanFiles(files, hashes, report = console.log) {
  const totals = { files: 0, hits: 0, allowed: 0, violations: 0 };
  for (const file of files) {
    let buffer;
    try {
      if (!(await lstat(file)).isFile()) continue;
      buffer = await readFile(file);
    } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (buffer.includes(0)) continue;
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { continue; }
    // eslint-disable-next-line no-control-regex -- binary-file sniffing
    if (/[\x01-\x08\x0B\x0C\x0E-\x1F]/.test(text)) continue;
    totals.files++;
    for (const hit of findRuns(text, hashes)) {
      totals.hits++;
      if (hit.allowed) totals.allowed++;
      else totals.violations++;
      const display = relative(process.cwd(), file).split(sep).join('/');
      report(`${display}:${hit.line}: ${hit.allowed ? 'allowed quote' : 'VIOLATION'} (${hit.length} words): ${hit.words}`);
    }
  }
  report(`files scanned: ${totals.files}; hits: ${totals.hits}; allowed quotes: ${totals.allowed}; violations: ${totals.violations}`);
  return totals;
}

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    raw: { type: 'string' }, paths: { type: 'string', multiple: true },
    'require-raw': { type: 'boolean', default: false }, 'all-files': { type: 'boolean', default: false }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node scripts/check-overlap.mjs [--raw DIR] [--require-raw] [--paths FILE_OR_DIR[,PATH...]] [--all-files]');
    return;
  }
  if (positionals.length && !values.paths) throw new Error('Targets require --paths.');
  const directory = resolve(values.raw || rawDirectory());
  if (!await exists(directory)) {
    if (values['require-raw']) throw new Error('Raw corpus required but directory is missing.');
    console.log('no raw corpus, skipped');
    return;
  }
  const { hashes, fields } = await buildSourceIndex(sourceTexts(directory));
  if (!hashes.size) {
    if (values['require-raw']) throw new Error('Raw corpus required but has no eight-word source windows.');
    console.log(`Raw corpus: ${fields} text fields, no eight-word windows.`);
  }
  const paths = [...(values.paths || []).flatMap((value) => value.split(',')), ...positionals];
  const totals = await scanFiles(await targetFiles(paths, { allFiles: values['all-files'] }), hashes);
  if (totals.violations) process.exitCode = 1;
}

if (isMain(import.meta.url)) await run(main);
