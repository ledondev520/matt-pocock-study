import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildSourceIndex, findRuns, ngrams, tokenize } from '../../scripts/corpus/overlap.mjs';
import { sourceTexts } from '../../scripts/corpus/raw.mjs';
import { scanFiles, targetFiles } from '../../scripts/check-overlap.mjs';
import { temporary, synthetic } from './helpers.mjs';

test('tokenizer lowercases Latin/digits, splits punctuation, ignores CJK', () => {
  assert.deepEqual(tokenize('HELLO, café! Types_42—中文; Don’t re-use 2026.'),
    ['hello', 'café', 'types', '42', 'don', 't', 're', 'use', '2026']);
  assert.deepEqual(tokenize('只有中文。日本語。'), []);
});

test('rolling hashes equal isolated eight-word hashes at every offset', () => {
  const words = tokenize(`${synthetic} lunar meadows nurture owls peacefully quartz rivers shine`);
  for (const window of ngrams(words)) {
    assert.equal(window.key, [...ngrams(words.slice(window.start, window.start + 8))][0].key);
  }
});

test('seven words do not hit, eight do, and adjacent hits extend to maximal runs', async () => {
  const { hashes } = await buildSourceIndex([synthetic]);
  const words = tokenize(synthetic);
  assert.deepEqual(findRuns(words.slice(0, 7).join(' '), hashes), []);
  assert.equal(findRuns(words.slice(0, 8).join(' '), hashes)[0].length, 8);
  const hits = findRuns(`unrelated prefix\n${synthetic.toUpperCase()}\nunrelated suffix`, hashes);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].length, words.length);
  assert.equal(hits[0].line, 2);
  assert.equal(hits[0].words, synthetic);
  assert.equal(hits[0].allowed, false);
});

test('separate source fields and documents do not make synthetic windows', async () => {
  const { hashes } = await buildSourceIndex(['amber beacons carry distant', 'echoes from gentle hills']);
  assert.equal(hashes.size, 0);
  assert.deepEqual(findRuns('amber beacons carry distant echoes from gentle hills', hashes), []);
});

test('short quotes need a link on the same line, including Markdown table rows', async () => {
  const { hashes } = await buildSourceIndex([synthetic]);
  assert.equal(findRuns(`${synthetic} [source](https://example.org/)`, hashes)[0].allowed, true);
  assert.equal(findRuns(`| ${synthetic} | https://example.org/ |`, hashes)[0].allowed, true);
  assert.equal(findRuns(`${synthetic}\nhttps://example.org/`, hashes)[0].allowed, false);
  assert.equal(findRuns(synthetic, hashes)[0].allowed, false);
});

test('a 30-word linked run is allowed and a 31-word run violates', async () => {
  const text = Array.from({ length: 31 }, (_, index) => `word${index}`).join(' ');
  const { hashes } = await buildSourceIndex([text]);
  const short = tokenize(text).slice(0, 30).join(' ');
  assert.equal(findRuns(`${short} https://example.org`, hashes)[0].allowed, true);
  assert.equal(findRuns(`${text} https://example.org`, hashes)[0].allowed, false);
});

test('copied text across target line breaks is detected and cannot use a nearby link', async () => {
  const { hashes } = await buildSourceIndex([synthetic]);
  const words = tokenize(synthetic);
  const text = `${words.slice(0, 5).join(' ')}\n${words.slice(5).join(' ')} https://example.org`;
  const hit = findRuns(text, hashes)[0];
  assert.equal(hit.length, words.length);
  assert.equal(hit.allowed, false);
});

test('disjoint runs are all reported with correct lines', async () => {
  const { hashes } = await buildSourceIndex([synthetic]);
  const hits = findRuns(`${synthetic}\nseparator\n${synthetic}`, hashes);
  assert.deepEqual(hits.map((hit) => hit.line), [1, 3]);
});

test('sources recursively include JSON values, JSONL values, and Markdown', async (t) => {
  const directory = await temporary(t);
  await mkdir(join(directory, 'nested'));
  await writeFile(join(directory, 'nested/one.json'), JSON.stringify({ nested: [{ text: synthetic }] }));
  await writeFile(join(directory, 'two.jsonl'), `${JSON.stringify({ content: synthetic })}\n\n`);
  await writeFile(join(directory, 'three.md'), synthetic);
  await writeFile(join(directory, 'ignored.txt'), 'ignored input');
  const texts = [];
  for await (const text of sourceTexts(directory)) texts.push(text);
  assert.deepEqual(texts, [synthetic, synthetic, synthetic]);
});

test('malformed raw JSON fails closed', async (t) => {
  const directory = await temporary(t);
  await writeFile(join(directory, 'bad.jsonl'), '{broken\n');
  await assert.rejects(buildSourceIndex(sourceTexts(directory)), /Invalid raw JSONL/);
});

test('scan skips binaries and reports violations and allowed quotes separately', async (t) => {
  const directory = await temporary(t);
  const text = join(directory, 'target.md');
  const binary = join(directory, 'image.bin');
  await writeFile(text, `${synthetic}\n${synthetic} https://example.org\n`);
  await writeFile(binary, Buffer.from([0, 1, 2, 255]));
  const { hashes } = await buildSourceIndex([synthetic]);
  const lines = [];
  const result = await scanFiles([text, binary], hashes, (line) => lines.push(line));
  assert.deepEqual(result, { files: 1, hits: 2, allowed: 1, violations: 1 });
  assert.match(lines[0], /target\.md:1: VIOLATION/);
});

test('explicit target paths exclude lockfiles', async (t) => {
  const directory = await temporary(t);
  const lock = join(directory, 'package-lock.json');
  await writeFile(lock, '{}');
  const files = await targetFiles(['data/corpus-index.json', lock]);
  assert.equal(files.length, 1);
  assert.ok(files[0].endsWith('corpus-index.json'));
});

test('guard CLI skips missing raw, require-raw fails, explicit target violation exits one', async (t) => {
  const directory = await temporary(t);
  const cli = join(process.cwd(), 'scripts/check-overlap.mjs');
  const execute = promisify(execFile);
  const missing = join(directory, 'missing');
  const skipped = await execute(process.execPath, [cli, '--raw', missing]);
  assert.match(skipped.stdout, /no raw corpus, skipped/);
  await assert.rejects(execute(process.execPath, [cli, '--raw', missing, '--require-raw']), (error) => error.code === 1);
  const raw = join(directory, 'raw');
  await mkdir(raw);
  await writeFile(join(raw, 'source.json'), JSON.stringify({ text: synthetic }));
  const target = join(directory, 'target.md');
  await writeFile(target, synthetic);
  await assert.rejects(execute(process.execPath, [cli, '--raw', raw, '--paths', target]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stdout, /VIOLATION/);
    assert.match(error.stdout, /violations: 1/);
    return true;
  });
});

test('a quote block text line is allowed only when the block has an http(s) url field', async () => {
  const quote = 'amber beacons carry distant echoes from gentle hills tonight';
  const { hashes } = await buildSourceIndex([quote]);
  const linked = findRuns(`\`\`\`quote\ntext: ${quote}\nauthor: A\nurl: https://example.com/q\n\`\`\`\n`, hashes);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].allowed, true);
  const unlinked = findRuns(`\`\`\`quote\ntext: ${quote}\nauthor: A\n\`\`\`\n`, hashes);
  assert.equal(unlinked[0].allowed, false);
  const outside = findRuns(`text: ${quote}\nurl: https://example.com/q\n`, hashes);
  assert.equal(outside[0].allowed, false);
  const otherLine = findRuns(`\`\`\`quote\ntext: hi\nnote: ${quote}\nurl: https://example.com/q\n\`\`\`\n`, hashes);
  assert.equal(otherLine[0].allowed, false);
});

test('quote exemption rejects fake fences, repeated fields, overlong text and missing URL', async () => {
  const words = Array.from({ length: 64 }, (_, i) => `word${i}`);
  const { hashes } = await buildSourceIndex([words.join(' ')]);
  const short = words.slice(0, 16).join(' ');
  const cases = [
    `\`\`\`quote-x\ntext: ${short}\nurl: https://example.org\n\`\`\``,
    `\`\`\`quote extra\ntext: ${short}\nurl: https://example.org\n\`\`\``,
    `\`\`\`quote\ntext: ${short}\ntext: ${words.slice(16, 32).join(' ')}\nurl: https://example.org\n\`\`\``,
    `\`\`\`quote\ntext: ${words.slice(0, 31).join(' ')}\nurl: https://example.org\n\`\`\``,
    `\`\`\`quote\ntext: ${short}\n\`\`\``,
    `\`\`\`quote\ntext: ${short}\nurl: https://example.org\nurl: https://example.org/two\n\`\`\``,
  ];
  for (const text of cases) {
    const hits = findRuns(text, hashes);
    assert.ok(hits.length > 0);
    assert.ok(hits.every(hit => !hit.allowed), text);
  }
  assert.equal(findRuns(`\`\`\`quote\ntext: ${words.slice(0, 30).join(' ')}\nurl: https://example.org\n\`\`\``, hashes)[0].allowed, true);
});
