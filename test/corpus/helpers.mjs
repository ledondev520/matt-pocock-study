import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'corpus-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

export function record(overrides = {}) {
  return { id: 'x:123', type: 'post', url: 'https://example.org/post/123',
    date: '2026-01-01T00:00:00.000Z', tags: ['testing'], metrics: { likes: 70 },
    summary: { zh: '', en: '' }, ...overrides };
}

export const synthetic = 'amber beacons carry distant echoes from gentle hills into jubilant kingdoms';
export const response = (value, headers = {}) => new Response(JSON.stringify(value), {
  headers: { 'content-type': 'application/json', ...headers },
});
