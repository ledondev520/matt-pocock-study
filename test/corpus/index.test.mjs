import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INDEX_SCHEMA, validateIndex, validateSchema } from '../../scripts/corpus/schema.mjs';
import { buildRecords } from '../../scripts/corpus/build-index.mjs';
import { applySummaries } from '../../scripts/corpus/apply-summaries.mjs';
import { urlId } from '../../scripts/corpus/sources.mjs';
import { record, synthetic } from './helpers.mjs';

const source = (overrides = {}) => ({ id: 'x:123', type: 'post', url: 'https://example.org/post/123',
  date: '2026-01-01T00:00:00Z', original: [synthetic], raw: { public_metrics: { like_count: 70 } }, ...overrides });

test('committed JSON schema matches generator and validates starter index', async () => {
  const schema = JSON.parse(await readFile(new URL('../../data/corpus-index.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema, INDEX_SCHEMA);
  const index = JSON.parse(await readFile(new URL('../../data/corpus-index.json', import.meta.url), 'utf8'));
  validateIndex(index, schema);
  assert.deepEqual(validateSchema([]), []);
});

test('validator accepts all four record types with applicable metrics', () => {
  validateIndex([record(), record({ id: 'article:1', type: 'article', metrics: { impressions: 12 } }),
    record({ id: 'repo:1', type: 'repo', metrics: { stars: 20 } }), record({ id: 'web:1', type: 'web', metrics: {} })]);
});

test('validator rejects source text, duplicate IDs, wrong metric types, and inapplicable metrics', () => {
  for (const bad of [record({ text: synthetic }), record({ metrics: { likes: -1 } }), record({ metrics: { likes: 1.5 } }),
    record({ metrics: { likes: '70' } }), record({ type: 'repo', metrics: { likes: 70 } }),
    record({ type: 'web', metrics: { stars: 1 } }), record({ type: 'post', metrics: { stars: 1 } })]) {
    assert.throws(() => validateIndex([bad]), /Invalid corpus index/);
  }
  assert.throws(() => validateIndex([record(), record()]), /duplicate record id/);
});

test('validator rejects invalid URLs, missing fields, unknown types, and dates', () => {
  for (const bad of [record({ url: 'javascript:alert(1)' }), record({ url: 'https://user:pass@example.org' }),
    record({ date: 'yesterday' }), record({ date: '2026-01-01' }), record({ date: '2026-02-30T00:00:00Z' }),
    record({ date: '2026-01-01T24:00:00Z' }), record({ type: 'tweet' }),
    record({ summary: { en: '' } }), record({ tags: ['ai', 'ai'] })]) assert.throws(() => validateIndex([bad]));
  assert.throws(() => validateSchema([], { madeUpKeyword: true }), /Unsupported schema keyword/);
});

test('validator enforces summary length, one line, and quotation marks; counts Unicode characters', () => {
  validateIndex([record({ summary: { zh: '中'.repeat(40), en: Array(25).fill('idea').join(' ') } })]);
  for (const summary of [{ zh: '中'.repeat(41), en: 'Idea.' }, { zh: '摘要', en: Array(26).fill('idea').join(' ') },
    { zh: '两\n行', en: 'Idea.' }, { zh: '摘要', en: 'A “quote”.' }, { zh: '「引用」', en: 'Idea.' }]) {
    assert.throws(() => validateIndex([record({ summary })]));
  }
});

test('builder filters by likes and reply kind, keeps self threads, preserves summaries, strips source fields', () => {
  const sources = [source(), source({ id: 'x:124', raw: { public_metrics: { like_count: 49 } } }),
    source({ id: 'x:125', raw: { kind: 'reply', public_metrics: { like_count: 900 } } }),
    source({ id: 'x:126', raw: { kind: 'self_thread', user_id: '1', in_reply_to_user_id: '1', public_metrics: { like_count: 60 } }, original: ['TypeScript and AI testing workflows'] })];
  const summary = { zh: '探索工具测试流程。', en: 'Explores a tool testing workflow.' };
  const result = buildRecords(sources, [record({ summary })]);
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.find((item) => item.id === 'x:123').summary, summary);
  assert.deepEqual(result.pending, ['x:126']);
  assert.deepEqual(result.records.find((item) => item.id === 'x:126').tags, ['ai', 'testing', 'typescript']);
  assert.ok(result.records.every((item) => !Object.hasOwn(item, 'text') && !Object.hasOwn(item, 'raw')));
  assert.equal(buildRecords(sources, [], { includeReplies: true }).records.length, 3);
});

test('builder handles optional types, missing dates, empty sources, and invalid thresholds', () => {
  const repo = source({ id: 'repo:1', type: 'repo', raw: { stars: 3 }, original: ['A TypeScript helper'] });
  assert.equal(buildRecords([repo], [], { types: ['post'] }).records.length, 0);
  assert.deepEqual(buildRecords([repo]).records[0].metrics, { stars: 3 });
  assert.equal(buildRecords([source({ date: '' })]).undated, 1);
  assert.equal(buildRecords([]).pending.length, 0);
  assert.throws(() => buildRecords([], [], { minLikes: -1 }));
  assert.throws(() => buildRecords([], [], { minLikes: NaN }));
  assert.throws(() => buildRecords([], [], { types: ['unknown'] }));
});

test('stable URL ids exclude fragments and vary by namespace', () => {
  assert.equal(urlId('web', 'https://example.org/a'), urlId('web', 'https://example.org/a#section'));
  assert.notEqual(urlId('aihero', 'https://example.org/a'), urlId('web', 'https://example.org/a'));
});

test('apply summaries rejects eight-word copying, punctuation/case changes, and linked quotes', async () => {
  for (const en of [synthetic, synthetic.toUpperCase().replaceAll(' ', ', '), `${synthetic} https://example.org`]) {
    await assert.rejects(applySummaries([record()], [{ id: 'x:123', zh: '概括核心观点。', en }], [source()]), /eight consecutive words/);
  }
  const shortSource = source({ original: ['a b c d e f g h'] });
  await assert.rejects(applySummaries([record()], [{ id: 'x:123', zh: 'a b c d e f g h', en: 'A scenic idea.' }], [shortSource]), /eight consecutive words/);
});

test('apply summaries accepts independent phrasing and leaves other records untouched', async () => {
  const original = [record(), record({ id: 'x:456', summary: { zh: '旧摘要。', en: 'An earlier note.' } })];
  const result = await applySummaries(original, [{ id: 'x:123', zh: '  描绘回声穿越风景。  ', en: 'Describes a fanciful landscape through sound.' }], [source()]);
  assert.deepEqual(result[0].summary, { zh: '描绘回声穿越风景。', en: 'Describes a fanciful landscape through sound.' });
  assert.deepEqual(result[1], original[1]);
  assert.equal(original[0].summary.en, '');
});

test('apply summaries validates the whole batch and rejects duplicate/unknown IDs or missing originals', async () => {
  const update = { id: 'x:123', zh: '说明一个概念。', en: 'Explains one idea.' };
  for (const updates of [[update, update], [{ ...update, id: 'unknown' }], [{ ...update, text: synthetic }],
    [{ ...update, en: '' }], [{ ...update, en: Array(26).fill('idea').join(' ') }]]) {
    const index = [record()];
    await assert.rejects(applySummaries(index, updates, [source()]));
    assert.equal(index[0].summary.en, '');
  }
  await assert.rejects(applySummaries([record()], [update], []), /Original text is missing/);
});
