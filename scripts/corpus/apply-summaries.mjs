import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { isMain, rawDirectory, readJSON, ROOT, run, writeJSON } from './common.mjs';
import { exists, jsonLines } from './raw.mjs';
import { buildSourceIndex, findRuns } from './overlap.mjs';
import { loadSources } from './sources.mjs';
import { validateIndex } from './schema.mjs';

export async function applySummaries(index, updates, sources) {
  validateIndex(index);
  const byId = new Map(index.map((record) => [record.id, record]));
  const originals = new Map();
  for (const source of sources) {
    if (!originals.has(source.id)) originals.set(source.id, []);
    originals.get(source.id).push(...source.original);
  }
  const summaries = new Map();
  for await (const update of updates) {
    if (!update || typeof update !== 'object' || Array.isArray(update)
      || Object.keys(update).sort().join(',') !== 'en,id,zh'
      || typeof update.id !== 'string' || typeof update.zh !== 'string' || typeof update.en !== 'string') {
      throw new Error('Each summary must contain exactly the strings id, zh, en.');
    }
    if (!byId.has(update.id)) throw new Error('Summary refers to an unknown index id.');
    if (summaries.has(update.id)) throw new Error('Duplicate summary id in batch.');
    if (!update.zh.trim() || !update.en.trim()) throw new Error('Both summary languages must be nonempty.');
    const original = originals.get(update.id);
    if (!original?.some((text) => text.trim())) throw new Error('Original text is missing for a summary; cannot check overlap.');
    const candidate = { ...byId.get(update.id), summary: { zh: update.zh.trim(), en: update.en.trim() } };
    validateIndex([candidate]);
    const { hashes } = await buildSourceIndex(original);
    // Summaries receive no short-quote exemption, even when they contain links.
    for (const language of ['zh', 'en']) if (findRuns(candidate.summary[language], hashes).length) {
      throw new Error(`Rejected ${language} summary: shares at least eight consecutive words with its original.`);
    }
    summaries.set(update.id, candidate.summary);
  }
  const result = index.map((record) => summaries.has(record.id) ? { ...record, summary: summaries.get(record.id) } : record);
  validateIndex(result);
  return result;
}

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { help: { type: 'boolean' } } });
  if (values.help) { console.log('Usage: node scripts/corpus/apply-summaries.mjs BATCH.jsonl'); return; }
  if (positionals.length !== 1) throw new Error('Provide one summary JSONL batch file.');
  if (!await exists(rawDirectory())) throw new Error('Raw corpus is required to check summaries.');
  const file = join(ROOT, 'data/corpus-index.json');
  const index = await readJSON(file);
  const result = await applySummaries(index, jsonLines(positionals[0]), await loadSources(rawDirectory()));
  await writeJSON(file, result);
  console.log('Summaries validated and applied atomically. Run the full overlap guard before committing.');
}

if (isMain(import.meta.url)) await run(main);
