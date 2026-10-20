import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { isMain, rawDirectory, request, run, sleep, writeJSON } from './common.mjs';

export async function fetchRepos({ user = 'mattpocock', token = process.env.GITHUB_TOKEN,
  directory = rawDirectory(), fetchImpl = fetch, sleepImpl = sleep } = {}) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(user)) throw new Error('GH_USER must be a valid public user name.');
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'PublicStudyCorpus/1.0',
    'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const repos = new Map();
  for (let page = 1; ; page++) {
    const url = new URL(`https://api.github.com/users/${encodeURIComponent(user)}/repos`);
    url.search = new URLSearchParams({ type: 'owner', sort: 'pushed', direction: 'desc', per_page: '100', page: String(page) });
    const response = await request(url, { headers, fetchImpl, sleepImpl });
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Unexpected GitHub repository response.');
    for (const repo of rows) if (!repo.private) repos.set(repo.id, {
      name: repo.name, url: repo.html_url, description: repo.description || '',
      license: repo.license?.spdx_id || null, stars: repo.stargazers_count,
      pushed_at: repo.pushed_at, fork: Boolean(repo.fork),
    });
    if (!rows.length || !/rel="next"/.test(response.headers.get('link') || '')) break;
    await sleepImpl(1000);
  }
  await writeJSON(join(directory, 'github/repos.json'), [...repos.values()].sort((a, b) => a.url.localeCompare(b.url)));
  console.log(`GitHub: ${repos.size} public repository metadata records; no contents downloaded.`);
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { help: { type: 'boolean' } } });
  if (values.help) { console.log('Usage: node scripts/corpus/fetch-github.mjs (GH_USER, optional GITHUB_TOKEN)'); return; }
  await fetchRepos({ user: process.env.GH_USER || 'mattpocock' });
}

if (isMain(import.meta.url)) await run(main);
