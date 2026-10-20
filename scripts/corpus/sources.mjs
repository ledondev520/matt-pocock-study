import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readJSON } from './common.mjs';
import { jsonLines, textFields } from './raw.mjs';

export function urlId(prefix, url) {
  const canonical = new URL(url);
  canonical.hash = '';
  return `${prefix}:${createHash('sha256').update(canonical.href).digest('hex').slice(0, 24)}`;
}

async function optionalLines(file) {
  const rows = [];
  try { for await (const row of jsonLines(file)) rows.push(row); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return rows;
}

export async function loadSources(directory) {
  const sources = [];
  const add = (id, type, raw, url, date, original) => sources.push({ id, type, raw, url, date, original });
  for (const raw of await optionalLines(join(directory, 'x/posts.jsonl'))) {
    if (!/^\d+$/.test(raw.id)) throw new Error('Invalid raw X post id.');
    add(`x:${raw.id}`, 'post', raw, raw.url || `https://x.com/i/status/${raw.id}`, raw.created_at,
      [...textFields({ text: raw.text, note_tweet: raw.note_tweet })]);
  }
  // Optional public X Articles metadata, supplied separately when API access permits.
  const articles = [...await readJSON(join(directory, 'x/articles.json'), []), ...await optionalLines(join(directory, 'x/articles.jsonl'))];
  for (const raw of articles) add(raw.id ? `x-article:${raw.id}` : urlId('x-article', raw.url), 'article', raw,
    raw.url, raw.created_at || raw.date, [...textFields({ title: raw.title, text: raw.text, body: raw.body })]);
  for (const raw of await readJSON(join(directory, 'github/repos.json'), [])) add(urlId('github', raw.url), 'repo', raw,
    raw.url, raw.pushed_at, [...textFields({ name: raw.name, description: raw.description })]);
  for (const raw of await readJSON(join(directory, 'aihero/pages.json'), [])) add(urlId('aihero', raw.url), 'article', raw,
    raw.url, raw.lastmod, [...textFields({ title: raw.title })]);
  for (const raw of await readJSON(join(directory, 'web/pages.json'), [])) add(urlId('web', raw.url), 'web', raw,
    raw.url, raw.date || raw.lastmod, [...textFields({ title: raw.title, text: raw.text, description: raw.description })]);
  return sources;
}
