import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { classifyKind, fetchTimeline, TWEET_FIELDS } from '../../scripts/corpus/fetch-x.mjs';
import { fetchRepos } from '../../scripts/corpus/fetch-github.mjs';
import { fetchPages, parseSitemap, publicCandidate, publicTitle, robotsPolicy } from '../../scripts/corpus/fetch-aihero.mjs';
import { request, retryDelay } from '../../scripts/corpus/common.mjs';
import { temporary, response } from './helpers.mjs';

const post = (id, extra = {}) => ({ id, text: `Synthetic idea ${id}`, created_at: '2026-01-01T00:00:00Z', public_metrics: { like_count: 60 }, ...extra });

test('X classification distinguishes original, quote, self thread, and another-user reply', () => {
  assert.equal(classifyKind(post('1'), '10'), 'original');
  assert.equal(classifyKind(post('1', { referenced_tweets: [{ type: 'quoted', id: '2' }] }), '10'), 'quote');
  assert.equal(classifyKind(post('1', { in_reply_to_user_id: '10' }), '10'), 'self_thread');
  assert.equal(classifyKind(post('1', { in_reply_to_user_id: '20' }), '10'), 'reply');
});

test('X fails clearly without an environment-supplied token', async () => {
  await assert.rejects(fetchTimeline({ token: '' }), /Missing X_BEARER_TOKEN/);
});

test('X pagination deduplicates IDs, records required fields, and resumes from newest ID', async (t) => {
  const directory = await temporary(t);
  const requests = [];
  let pages = 0;
  const fetchImpl = async (value, options) => {
    const url = new URL(value);
    requests.push(url);
    assert.ok(options.headers.Authorization.startsWith('Bearer '));
    if (url.pathname.includes('/by/username/')) return response({ data: { id: '10' } });
    pages++;
    if (pages === 1) return response({ data: [post('105'), post('104')], meta: { next_token: 'second-page' } });
    if (pages === 2) return response({ data: [post('104'), post('103')], meta: {} });
    return response({ data: [post('106')], meta: {} });
  };
  await fetchTimeline({ token: 'synthetic-test-value', handle: 'fixture', directory, fetchImpl, sleepImpl: async () => {} });
  let rows = (await readFile(join(directory, 'x/posts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map((row) => row.id), ['105', '104', '103']);
  assert.equal(requests[1].searchParams.get('tweet.fields'), TWEET_FIELDS);
  assert.equal(requests[2].searchParams.get('pagination_token'), 'second-page');
  assert.equal(requests[1].searchParams.get('exclude'), 'retweets');
  await fetchTimeline({ token: 'synthetic-test-value', handle: 'fixture', directory, fetchImpl, sleepImpl: async () => {} });
  assert.equal(requests.at(-1).searchParams.get('since_id'), '105');
  rows = (await readFile(join(directory, 'x/posts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map((row) => row.id), ['106', '105', '104', '103']);
  await assert.rejects(stat(join(directory, 'x/timeline-state.json')), (error) => error.code === 'ENOENT');
});

test('X interruption preserves the original since boundary and pagination checkpoint', async (t) => {
  const directory = await temporary(t);
  let calls = 0;
  const fetchImpl = async (value) => {
    const url = new URL(value);
    if (url.pathname.includes('/by/username/')) return response({ data: { id: '10' } });
    calls++;
    if (calls === 1) return response({ data: [post('200')], meta: { next_token: 'older' } });
    throw new Error('simulated connection interruption');
  };
  const options = { token: 'synthetic-test-value', directory, fetchImpl, sleepImpl: async () => {} };
  await assert.rejects(fetchTimeline(options), /Network request failed/);
  let resumed;
  await fetchTimeline({ ...options, fetchImpl: async (value) => {
    const url = new URL(value);
    if (url.pathname.includes('/by/username/')) return response({ data: { id: '10' } });
    resumed = url;
    return response({ data: [post('199')], meta: {} });
  } });
  assert.equal(resumed.searchParams.get('pagination_token'), 'older');
  assert.equal(resumed.searchParams.has('since_id'), false);
  const rows = (await readFile(join(directory, 'x/posts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map((row) => row.id), ['200', '199']);
});

test('X explicit time and ID windows are passed through for backfill', async (t) => {
  const directory = await temporary(t);
  let window;
  await fetchTimeline({ token: 'synthetic-test-value', directory, since: '2026-01-01', until: '2026-02-01',
    sinceId: '100', untilId: '200', sleepImpl: async () => {}, fetchImpl: async (value) => {
      const url = new URL(value);
      if (url.pathname.includes('/by/username/')) return response({ data: { id: '10' } });
      window = url;
      return response({ data: [], meta: {} });
    } });
  assert.equal(window.searchParams.get('start_time'), '2026-01-01T00:00:00.000Z');
  assert.equal(window.searchParams.get('end_time'), '2026-02-01T00:00:00.000Z');
  assert.equal(window.searchParams.get('since_id'), '100');
  assert.equal(window.searchParams.get('until_id'), '200');
});

test('rate-limit reset and Retry-After are both respected without truncation', async () => {
  const now = 1_000_000;
  assert.equal(retryDelay(new Headers({ 'x-rate-limit-reset': '1120' }), 0, now), 121_000);
  assert.equal(retryDelay(new Headers({ 'retry-after': '180' }), 0, now), 180_000);
  assert.equal(retryDelay(new Headers({ 'retry-after': new Date(now + 120_000).toUTCString() }), 0, now), 121_000);
  const waits = [];
  let requests = 0;
  const result = await request('https://example.org/', {
    fetchImpl: async () => ++requests === 1 ? new Response('', { status: 429, headers: { 'retry-after': '120' } }) : response({ ok: true }),
    sleepImpl: async (ms) => waits.push(ms),
  });
  assert.equal(requests, 2);
  assert.equal(waits[0], 120_000);
  assert.equal((await result.json()).ok, true);
});

test('GitHub fetches only repository listing pages and stores public metadata', async (t) => {
  const directory = await temporary(t);
  const urls = [];
  const repo = { id: 1, name: 'demo', html_url: 'https://github.com/example/demo', description: 'Synthetic fixture',
    license: { spdx_id: 'MIT' }, stargazers_count: 12, pushed_at: '2026-01-01T00:00:00Z', fork: false, private: false };
  await fetchRepos({ directory, user: 'example', token: '', sleepImpl: async () => {}, fetchImpl: async (value) => {
    const url = new URL(value);
    urls.push(url);
    assert.equal(url.pathname, '/users/example/repos');
    if (url.searchParams.get('page') === '1') return response([repo], { link: '<https://api.github.com/users/example/repos?page=2>; rel="next"' });
    return response([{ ...repo, id: 2, private: true }, { ...repo, id: 3, name: 'fork', html_url: 'https://github.com/example/fork', fork: true, license: null }]);
  } });
  const rows = JSON.parse(await readFile(join(directory, 'github/repos.json'), 'utf8'));
  assert.equal(urls.length, 2);
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['description', 'fork', 'license', 'name', 'pushed_at', 'stars', 'url']);
  assert.equal(rows.find((row) => row.name === 'fork').fork, true);
  assert.equal(rows.find((row) => row.name === 'fork').license, null);
});

test('aihero URL filtering rejects restricted and non-content pages', () => {
  for (const path of ['/cohorts/a', '/products/a', '/workshops/a', '/events/a', '/checkout', '/login', '/premium/a', '/', '/newsletter', '/skills/subscribe']) {
    assert.equal(publicCandidate(`https://www.aihero.dev${path}`), false, path);
  }
  assert.equal(publicCandidate('https://elsewhere.example/tutorial'), false);
  assert.equal(publicCandidate('https://www.aihero.dev/a-tutorial'), true);
});

test('aihero sitemap parser handles indexes, XML entities, CDATA, and lastmod', () => {
  const sitemap = parseSitemap('<urlset><url><loc><![CDATA[https://www.aihero.dev/a-tutorial]]></loc><lastmod>2026-01-01</lastmod></url></urlset>');
  assert.deepEqual(sitemap, { index: false, entries: [{ url: 'https://www.aihero.dev/a-tutorial', lastmod: '2026-01-01' }] });
  assert.equal(parseSitemap('<sitemapindex><sitemap><loc>https://www.aihero.dev/one.xml?a=1&amp;b=2</loc></sitemap></sitemapindex>').entries[0].url,
    'https://www.aihero.dev/one.xml?a=1&b=2');
});

test('robots policy honors longest paths, wildcard rules, exact endpoints, and crawl delay', () => {
  const policy = robotsPolicy('User-agent: *\nDisallow: /private\nAllow: /private/open\nDisallow: /*.json$\nCrawl-delay: 2');
  assert.equal(policy.delay, 2000);
  assert.equal(policy.allows('https://www.aihero.dev/private/a'), false);
  assert.equal(policy.allows('https://www.aihero.dev/private/open/a'), true);
  assert.equal(policy.allows('https://www.aihero.dev/a.json'), false);
  assert.equal(policy.allows('https://www.aihero.dev/a.json/page'), true);
});

test('aihero requires explicit free article metadata and rejects paid or unrelated public metadata', () => {
  const url = 'https://www.aihero.dev/a-tutorial';
  const title = '<title>A &amp; B</title>';
  const free = `<script type="application/ld+json">{"@type":"Article","url":"${url}","isAccessibleForFree":true}</script>`;
  assert.equal(publicTitle(title + free, url), 'A & B');
  assert.equal(publicTitle(title, url), null);
  assert.equal(publicTitle(title + free.replace('true', 'false'), url), null);
  assert.equal(publicTitle(title + free.replace(url, 'https://www.aihero.dev/another-article'), url), null);
  assert.equal(publicTitle(title + '{"fields":{"slug":"other","type":"tutorial","visibility":"public","state":"published"}}', url), null);
  assert.equal(publicTitle(title + '{"fields":{"slug":"a-tutorial","type":"tutorial","visibility":"public","state":"published"}}', url), 'A & B');
});

test('aihero only writes URL, lastmod, title and never page bodies or paid pages', async (t) => {
  const directory = await temporary(t);
  const urls = [];
  await fetchPages({ directory, sleepImpl: async () => {}, fetchImpl: async (value) => {
    const url = String(value);
    urls.push(url);
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /blocked');
    if (url.endsWith('/sitemap.xml')) return new Response('<urlset>' + ['a-tutorial', 'paid-post', 'workshops/a', 'blocked', 'uncertain'].map((path) =>
      `<url><loc>https://www.aihero.dev/${path}</loc><lastmod>2026-01-01</lastmod></url>`).join('') + '</urlset>');
    const metadata = url.endsWith('/uncertain') ? '' : `<script type="application/ld+json">{"@type":"Article","url":"${url}","isAccessibleForFree":true}</script>`;
    return new Response(`<title>Synthetic heading</title>${metadata}<body>BODY_SENTINEL_NEVER_STORED</body>`, { headers: { 'content-type': 'text/html' } });
  } });
  const text = await readFile(join(directory, 'aihero/pages.json'), 'utf8');
  const rows = JSON.parse(text);
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['lastmod', 'title', 'url']);
  assert.equal(text.includes('BODY_SENTINEL'), false);
  assert.equal(urls.some((url) => url.endsWith('/workshops/a') || url.endsWith('/paid-post') || url.endsWith('/blocked')), false);
});

test('an unfinished X window cannot silently change parameters or accounts', async (t) => {
  const directory = await temporary(t);
  await mkdir(join(directory, 'x'));
  await writeFile(join(directory, 'x/posts.jsonl'), JSON.stringify({ ...post('123'), user_id: 'other' }) + '\n');
  await assert.rejects(fetchTimeline({ token: 'synthetic-test-value', directory,
    fetchImpl: async () => response({ data: { id: '10' } }) }), /different user/);
  await writeFile(join(directory, 'x/posts.jsonl'), JSON.stringify({ ...post('123'), user_id: '10' }) + '\n');
  await writeFile(join(directory, 'x/timeline-state.json'), JSON.stringify({ signature: 'different-window' }));
  await assert.rejects(fetchTimeline({ token: 'synthetic-test-value', directory,
    fetchImpl: async () => response({ data: { id: '10' } }) }), /different windows/);
});
