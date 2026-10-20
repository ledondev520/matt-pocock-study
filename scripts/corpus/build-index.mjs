import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { INDEX_SCHEMA, validateIndex } from './schema.mjs';
import { isMain, isoDate, rawDirectory, readJSON, ROOT, run, validDate, writeJSON } from './common.mjs';
import { loadSources } from './sources.mjs';
import { exists } from './raw.mjs';

// Topic rules scan original text/title/description and URL in memory only.
// Multiple rules may match; tags are sorted. No match => "general".
// These rules are editorial categories, not generated excerpts.
export const TAG_RULES = {
  typescript: /\b(?:typescript|tsconfig|type[- ]safe|type[- ]safety|generics?)\b/i,
  javascript: /\b(?:javascript|ecmascript|node\.?js|deno|bun)\b/i,
  react: /\b(?:react|next\.?js|jsx|tsx|react[- ]hooks?)\b/i,
  ai: /\b(?:ai|llms?|claude|gpt|agents?|prompt(?:ing)?|mcp|model[- ]context[- ]protocol|artificial[- ]intelligence)\b/i,
  testing: /\b(?:tests?|testing|vitest|jest|playwright|evals?)\b/i,
  tooling: /\b(?:git|github|vscode|eslint|prettier|vite|skills?|cli|workflow)\b/i,
  career: /\b(?:career|hiring|interview|salary|jobs?|learning|learn|roadmap)\b/i,
};

export function tagsFor(source) {
  const text = `${source.original.join('\n')} ${source.url}`;
  const tags = Object.entries(TAG_RULES).filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag).sort();
  return tags.length ? tags : ['general'];
}

export function metricsFor(source) {
  if (source.type === 'repo') return Number.isSafeInteger(source.raw.stars) && source.raw.stars >= 0 ? { stars: source.raw.stars } : {};
  if (!['post', 'article'].includes(source.type)) return {};
  const mapping = { like_count: 'likes', retweet_count: 'reposts', reply_count: 'replies', quote_count: 'quotes',
    bookmark_count: 'bookmarks', impression_count: 'impressions' };
  return Object.fromEntries(Object.entries(source.raw.public_metrics || {}).flatMap(([key, value]) =>
    mapping[key] && Number.isSafeInteger(value) && value >= 0 ? [[mapping[key], value]] : []));
}

export function buildRecords(sources, existing = [], { types = ['post', 'article', 'repo', 'web'], minLikes = 50, includeReplies = false } = {}) {
  validateIndex(existing);
  if (!Number.isSafeInteger(minLikes) || minLikes < 0) throw new Error('--min-likes must be a nonnegative integer.');
  if (!types.length || types.some((type) => !['post', 'article', 'repo', 'web'].includes(type))) throw new Error('Unknown or empty --types selection.');
  const prior = new Map(existing.map((record) => [record.id, record]));
  const records = [];
  let undated = 0;
  for (const source of sources) {
    if (!types.includes(source.type)) continue;
    const metrics = metricsFor(source);
    const reply = source.raw.kind === 'reply' || (source.raw.in_reply_to_user_id
      && source.raw.in_reply_to_user_id !== source.raw.user_id && source.raw.kind !== 'self_thread');
    if (source.type === 'post' && ((!includeReplies && reply) || (metrics.likes || 0) < minLikes)) continue;
    if (!validDate(source.date)) { undated++; continue; }
    records.push({ id: source.id, type: source.type, url: source.url, date: isoDate(source.date),
      tags: tagsFor(source), metrics, summary: prior.get(source.id)?.summary || { zh: '', en: '' } });
  }
  records.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  validateIndex(records);
  return { records, pending: records.filter((record) => !record.summary.zh.trim() || !record.summary.en.trim()).map((record) => record.id), undated };
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    types: { type: 'string', default: 'post,article,repo,web' }, 'min-likes': { type: 'string', default: '50' },
    'include-replies': { type: 'boolean', default: false }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node scripts/corpus/build-index.mjs [--types post,article,repo,web] [--min-likes 50] [--include-replies]');
    return;
  }
  if (!await exists(rawDirectory())) throw new Error('Raw corpus is missing; fetch sources before building the index.');
  const indexFile = join(ROOT, 'data/corpus-index.json');
  const result = buildRecords(await loadSources(rawDirectory()), await readJSON(indexFile, []), {
    types: values.types.split(',').map((type) => type.trim()), minLikes: /^\d+$/.test(values['min-likes']) ? Number(values['min-likes']) : NaN,
    includeReplies: values['include-replies'],
  });
  // Validate using the schema that is written for external editors and CI.
  validateIndex(result.records, INDEX_SCHEMA);
  await writeJSON(join(ROOT, 'data/corpus-index.schema.json'), INDEX_SCHEMA);
  await writeJSON(indexFile, result.records);
  console.log(`Index: ${result.records.length} records; pending summaries: ${result.pending.length}; skipped undated: ${result.undated}.`);
}

if (isMain(import.meta.url)) await run(main);
