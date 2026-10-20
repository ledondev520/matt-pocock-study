import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { isMain, rawDirectory, request, run, sleep, writeJSON } from './common.mjs';

const ORIGIN = 'https://www.aihero.dev';
const USER_AGENT = 'PublicStudyCorpus';
const BLOCKED = /cohorts?|products?|workshops?|events?|checkout|login|paid|premium|subscribe|purchase|pricing|membership/i;

export function decodeEntities(text) {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi, (all, decimal, hex, name) => {
    if (decimal || hex) {
      const code = Number.parseInt(decimal || hex, hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[name.toLowerCase()];
  });
}

export function publicCandidate(value) {
  try {
    const url = new URL(value);
    const path = decodeURIComponent(url.pathname);
    return url.origin === ORIGIN && !url.username && !url.password && !url.search && !url.hash
      && path !== '/' && !BLOCKED.test(path)
      && !/^\/(?:newsletter|skills|skills-catalog|about|contact|privacy|terms|tags|authors|search)\/?$/i.test(path);
  } catch { return false; }
}

export function parseSitemap(xml) {
  const index = /<sitemapindex\b/i.test(xml);
  const rows = [...xml.matchAll(index ? /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi : /<url\b[^>]*>([\s\S]*?)<\/url>/gi)];
  return { index, entries: rows.flatMap((match) => {
    const location = match[1].match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i)?.[1];
    if (!location) return [];
    const clean = (value) => decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim());
    return [{ url: clean(location), lastmod: clean(match[1].match(/<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/i)?.[1] || '') }];
  }) };
}

export function robotsPolicy(text, agent = USER_AGENT) {
  const groups = [];
  let group;
  let hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const match = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const [, rawKey, value] = match;
    const key = rawKey.toLowerCase();
    if (key === 'user-agent') {
      if (!group || hasRules) { group = { agents: [], rules: [], delay: 0 }; groups.push(group); hasRules = false; }
      group.agents.push(value.toLowerCase());
    } else if (group) {
      hasRules = true;
      if ((key === 'allow' || key === 'disallow') && value) group.rules.push({ allow: key === 'allow', path: value });
      if (key === 'crawl-delay' && Number.isFinite(Number(value))) group.delay = Math.max(group.delay, Number(value) * 1000);
    }
  }
  const specific = groups.filter((item) => item.agents.some((name) => name !== '*' && agent.toLowerCase().includes(name)));
  const selected = specific.length ? specific : groups.filter((item) => item.agents.includes('*'));
  return {
    delay: Math.max(1000, ...selected.map((item) => item.delay)),
    allows(url) {
      const target = new URL(url).pathname + new URL(url).search;
      let best;
      for (const rule of selected.flatMap((item) => item.rules)) {
        const terminal = rule.path.endsWith('$');
        const pattern = (terminal ? rule.path.slice(0, -1) : rule.path).split('*')
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        if (new RegExp(`^${pattern}${terminal ? '$' : ''}`).test(target)) {
          const length = rule.path.replace(/[*$]/g, '').length;
          if (!best || length > best.length || (length === best.length && rule.allow)) best = { ...rule, length };
        }
      }
      return !best || best.allow;
    },
  };
}

export function publicTitle(html, url) {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!title) return null;
  // Inspect metadata transiently. Persist only the title, never HTML or bodies.
  const metadata = html.replace(/\\+"/g, '"');
  if (/"(?:isAccessibleForFree|isFree)"\s*:\s*(?:false|"false")/i.test(metadata)
    || /"(?:visibility|accessLevel)"\s*:\s*"(?:paid|private|premium|members|subscribers|pro)"/i.test(metadata)
    || /<(?:form|div|section)[^>]*(?:id|class)\s*=\s*["'][^"']*\bpaywall\b/i.test(html)) return null;
  let publicArticle = false;
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const visit = (value) => {
        if (!value || typeof value !== 'object') return;
        const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
        const canonical = typeof value.mainEntityOfPage === 'object' ? value.mainEntityOfPage?.['@id'] : value.mainEntityOfPage;
        if (types.some((type) => /^(?:Article|BlogPosting|TechArticle|HowTo|Tutorial)$/.test(type || ''))
          && (value.isAccessibleForFree === true || value.isAccessibleForFree === 'true')
          && (value.url === url || canonical === url)
          && (!value.url || value.url === url) && (!canonical || canonical === url)) publicArticle = true;
        for (const child of Object.values(value)) {
          if (Array.isArray(child)) child.forEach(visit);
          else if (child && typeof child === 'object') visit(child);
        }
      };
      visit(JSON.parse(match[1]));
    } catch { /* Unknown metadata is not evidence of public access. */ }
  }
  // aihero's public tutorial metadata is serialized in Next.js flight data.
  // Match a flat fields object with this page's slug; unrelated sidebar links
  // must not establish public access for the requested page.
  const slug = decodeURIComponent(new URL(url).pathname).split('/').filter(Boolean).at(-1);
  for (const match of metadata.matchAll(/"fields"\s*:\s*(\{[^{}]*\})/g)) {
    try {
      const fields = JSON.parse(match[1]);
      if (fields.slug === slug && fields.visibility === 'public' && fields.state === 'published'
        && /^(?:article|post|tutorial)$/.test(fields.type || '')) publicArticle = true;
    } catch { /* Fail closed if fields cannot be parsed. */ }
  }
  if (!publicArticle) return null;
  return decodeEntities(title.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() || null;
}

async function boundedText(response, limit = 8 * 1024 * 1024) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Remote document exceeds safety size limit.');
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally { await reader.cancel(); }
}

export async function fetchPages({ directory = rawDirectory(), fetchImpl = fetch, sleepImpl = sleep } = {}) {
  const headers = { 'User-Agent': `${USER_AGENT}/1.0`, Accept: 'text/html,application/xml,text/plain' };
  const get = (url) => request(url, { headers, fetchImpl, sleepImpl });
  // Fail closed when robots cannot be checked; never fetch login or paywalls.
  const policy = robotsPolicy(await boundedText(await get(`${ORIGIN}/robots.txt`)));
  const queue = [`${ORIGIN}/sitemap.xml`];
  const visited = new Set();
  const candidates = new Map();
  while (queue.length) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    if (visited.size >= 100) throw new Error('Too many nested sitemaps.');
    if (new URL(url).origin !== ORIGIN || !policy.allows(url)) continue;
    visited.add(url);
    await sleepImpl(policy.delay);
    const { index, entries } = parseSitemap(await boundedText(await get(url)));
    if (index) queue.push(...entries.map((entry) => entry.url));
    else for (const entry of entries) if (publicCandidate(entry.url) && policy.allows(entry.url)) candidates.set(entry.url, entry);
  }
  const pages = [];
  for (const entry of candidates.values()) {
    await sleepImpl(policy.delay);
    try {
      const response = await get(entry.url);
      if (!/text\/html/i.test(response.headers.get('content-type') || '')) { await response.body?.cancel(); continue; }
      const title = publicTitle(await boundedText(response), entry.url);
      if (title) pages.push({ url: entry.url, lastmod: entry.lastmod, title });
    } catch (error) {
      // Keep remote URLs and all response bodies out of diagnostics.
      console.error(`Skipped one candidate: ${error.message}`);
    }
  }
  await writeJSON(join(directory, 'aihero/pages.json'), pages.sort((a, b) => a.url.localeCompare(b.url)));
  console.log(`aihero: ${pages.length} confirmed public articles/tutorials; ${candidates.size - pages.length} uncertain or inaccessible pages skipped.`);
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { help: { type: 'boolean' } } });
  if (values.help) { console.log('Usage: node scripts/corpus/fetch-aihero.mjs'); return; }
  await fetchPages();
}

if (isMain(import.meta.url)) await run(main);
