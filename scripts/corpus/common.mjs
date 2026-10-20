import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const rawDirectory = () => resolve(process.env.CORPUS_RAW_DIR || '.corpus-raw');
export const sleep = (ms) => delay(ms);

export function isMain(url) {
  return Boolean(process.argv[1]) && url === pathToFileURL(resolve(process.argv[1])).href;
}

export async function run(main) {
  try { await main(); } catch (error) {
    // Never print HTTP bodies, headers, credentials, or stack traces.
    console.error(error.message);
    process.exitCode = 1;
  }
}

export async function readJSON(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw new Error('Cannot read JSON input; check its format and permissions.');
  }
}

export async function atomicWrite(file, text) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { mode: 0o600 });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

export const writeJSON = (file, value) => atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);

export function retryDelay(headers, attempt = 0, now = Date.now()) {
  const reset = Number(headers.get('x-rate-limit-reset') || headers.get('x-ratelimit-reset'));
  const retry = headers.get('retry-after');
  const seconds = retry !== null && /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : 0;
  const date = retry ? Date.parse(retry) : NaN;
  return Math.max(1000, reset ? reset * 1000 - now + 1000 : 0,
    seconds, Number.isFinite(date) ? date - now + 1000 : 0,
    !reset && !retry ? Math.min(60_000 * 2 ** attempt, 900_000) : 0);
}

export async function request(url, { fetchImpl = fetch, sleepImpl = sleep, ...options } = {}) {
  for (let attempt = 0; attempt <= 5; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), redirect: 'error', ...options });
    } catch { throw new Error('Network request failed; check connectivity and retry.'); }
    const limited = response.status === 429 || (response.status === 403 &&
      (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')));
    if (limited && attempt < 5) {
      const ms = retryDelay(response.headers, attempt);
      await response.body?.cancel();
      console.error(`Rate limited; waiting ${Math.ceil(ms / 1000)} seconds before retrying.`);
      await sleepImpl(ms);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status}; check API access, quota, and resource availability.`);
    }
    return response;
  }
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && Number.isFinite(Date.parse(value));
}

export function isoDate(value) {
  if (!validDate(value)) throw new Error('Missing or invalid source date; add an ISO date to the raw record.');
  return new Date(value).toISOString();
}
