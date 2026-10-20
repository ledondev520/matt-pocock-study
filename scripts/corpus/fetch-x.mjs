import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { atomicWrite, isMain, rawDirectory, readJSON, request, run, sleep, validDate, writeJSON } from './common.mjs';
import { jsonLines } from './raw.mjs';

export const TWEET_FIELDS = 'created_at,public_metrics,conversation_id,referenced_tweets,note_tweet,in_reply_to_user_id';

export function classifyKind(post, userId) {
  if (post.in_reply_to_user_id) return post.in_reply_to_user_id === userId ? 'self_thread' : 'reply';
  return post.referenced_tweets?.some((reference) => reference.type === 'quoted') ? 'quote' : 'original';
}

export function newestId(posts) {
  let newest;
  for (const post of posts) {
    if (!/^\d+$/.test(post.id)) throw new Error('Invalid post id in raw timeline.');
    if (!newest || BigInt(post.id) > BigInt(newest)) newest = post.id;
  }
  return newest;
}

export async function fetchTimeline({ token, handle = 'mattpocockuk', directory = rawDirectory(),
  since, until, sinceId, untilId, fetchImpl = fetch, sleepImpl = sleep } = {}) {
  if (!token?.trim()) throw new Error('Missing X_BEARER_TOKEN. Set it in your environment; never put it in a file or command argument.');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error('X_HANDLE must be a valid public handle.');
  for (const value of [since, until]) if (value && !validDate(value)) throw new Error('--since and --until require ISO dates.');
  for (const value of [sinceId, untilId]) if (value && !/^\d+$/.test(value)) throw new Error('ID windows require decimal post IDs.');
  if (since && until && Date.parse(since) >= Date.parse(until)) throw new Error('--since must precede --until.');
  if (sinceId && untilId && BigInt(sinceId) >= BigInt(untilId)) throw new Error('--since-id must precede --until-id.');
  const headers = { Authorization: `Bearer ${token}`, 'User-Agent': 'PublicStudyCorpus/1.0' };
  const getJSON = async (url) => (await request(url, { headers, fetchImpl, sleepImpl })).json();
  const lookup = await getJSON(`https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`);
  if (!lookup.data?.id || lookup.errors?.length) throw new Error('X user lookup failed; check handle and API access.');
  const userId = lookup.data.id;
  const file = join(directory, 'x/posts.jsonl');
  const stateFile = join(directory, 'x/timeline-state.json');
  const posts = new Map();
  try {
    for await (const post of jsonLines(file)) posts.set(post.id, post);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // A shared raw file must never silently mix timelines from different users.
  for (const post of posts.values()) {
    if ((post.user_id && post.user_id !== userId) || (post.handle && post.handle.toLowerCase() !== handle.toLowerCase())) {
      throw new Error('Raw timeline belongs to a different user; select a separate CORPUS_RAW_DIR.');
    }
  }
  const signature = JSON.stringify({ userId, since, until, sinceId, untilId });
  let state = await readJSON(stateFile, null);
  if (state && state.signature !== signature) throw new Error('An unfinished timeline has different windows. Finish it first or remove its raw timeline-state.json.');
  if (!state) {
    state = { signature, sinceId: sinceId || (!until && !untilId && !since ? newestId(posts.values()) : undefined), nextToken: null };
    await writeJSON(stateFile, state);
  }
  const seenTokens = new Set();
  let added = 0;
  while (true) {
    const url = new URL(`https://api.x.com/2/users/${userId}/tweets`);
    url.searchParams.set('tweet.fields', TWEET_FIELDS);
    url.searchParams.set('max_results', '100');
    url.searchParams.set('exclude', 'retweets');
    for (const [key, value] of Object.entries({ since_id: state.sinceId, until_id: untilId,
      start_time: since && new Date(since).toISOString(), end_time: until && new Date(until).toISOString(),
      pagination_token: state.nextToken })) if (value) url.searchParams.set(key, value);
    const page = await getJSON(url);
    if (page.errors?.length) throw new Error('X returned partial errors; timeline checkpoint retained for retry.');
    if (page.data !== undefined && !Array.isArray(page.data)) throw new Error('Unexpected X timeline response.');
    for (const post of page.data || []) {
      if (!/^\d+$/.test(post.id)) throw new Error('X returned an invalid post id.');
      if (!posts.has(post.id)) added++;
      posts.set(post.id, { ...post, user_id: userId, handle, kind: classifyKind(post, userId),
        url: `https://x.com/${handle}/status/${post.id}` });
    }
    const ordered = [...posts.values()].sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : BigInt(a.id) < BigInt(b.id) ? 1 : 0);
    await atomicWrite(file, ordered.map((post) => JSON.stringify(post)).join('\n') + (ordered.length ? '\n' : ''));
    const nextToken = page.meta?.next_token;
    if (!nextToken) break;
    if (seenTokens.has(nextToken)) throw new Error('X repeated a pagination token; checkpoint retained.');
    seenTokens.add(nextToken);
    state.nextToken = nextToken;
    // Save raw first, then checkpoint: interrupted pages are safely deduplicated.
    await writeJSON(stateFile, state);
    await sleepImpl(1000);
  }
  await rm(stateFile, { force: true });
  console.log(`X: ${added} new posts; ${posts.size} total raw posts.`);
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    since: { type: 'string' }, until: { type: 'string' },
    'since-id': { type: 'string' }, 'until-id': { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node scripts/corpus/fetch-x.mjs [--since ISO] [--until ISO] [--since-id ID] [--until-id ID]');
    return;
  }
  await fetchTimeline({ token: process.env.X_BEARER_TOKEN, handle: process.env.X_HANDLE || 'mattpocockuk',
    since: values.since, until: values.until, sinceId: values['since-id'], untilId: values['until-id'] });
}

if (isMain(import.meta.url)) await run(main);
