// Two independent rolling uint32 hashes per eight-word window. Only hashes are
// retained for sources; JSONL documents are streamed and fields stay separate.
export const WINDOW = 8;

export function tokenize(text) {
  return Array.from(text.toLowerCase().matchAll(/[\p{Script=Latin}0-9]+/gu), (match) => match[0]);
}

function wordHashes(word) {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < word.length; i++) {
    a = Math.imul(a ^ word.charCodeAt(i), 16777619) >>> 0;
    b = (Math.imul(b, 33) ^ word.charCodeAt(i)) >>> 0;
  }
  return [a, b];
}

export function* ngrams(words) {
  const baseA = 16777619;
  const baseB = 65599;
  let powerA = 1;
  let powerB = 1;
  for (let i = 1; i < WINDOW; i++) {
    powerA = Math.imul(powerA, baseA) >>> 0;
    powerB = Math.imul(powerB, baseB) >>> 0;
  }
  const ring = new Array(WINDOW);
  let a = 0;
  let b = 0;
  for (let i = 0; i < words.length; i++) {
    const [nextA, nextB] = wordHashes(words[i]);
    const slot = i % WINDOW;
    if (i >= WINDOW) {
      a = (a - Math.imul(ring[slot][0], powerA)) >>> 0;
      b = (b - Math.imul(ring[slot][1], powerB)) >>> 0;
    }
    a = (Math.imul(a, baseA) + nextA) >>> 0;
    b = (Math.imul(b, baseB) + nextB) >>> 0;
    ring[slot] = [nextA, nextB];
    if (i >= WINDOW - 1) yield { start: i - WINDOW + 1, key: `${a.toString(36)}:${b.toString(36)}` };
  }
}

export async function buildSourceIndex(texts) {
  const hashes = new Set();
  let fields = 0;
  for await (const text of texts) {
    fields++;
    for (const { key } of ngrams(tokenize(text))) hashes.add(key);
  }
  return { hashes, fields };
}

// Only the renderer's exact quote fence with one short text and one URL qualifies.
function linkedQuoteLines(text) {
  const ranges = [];
  for (const block of text.matchAll(/^```quote\n([\s\S]*?)^```$/gm)) {
    const body = block[1];
    const lines = [...body.matchAll(/^text:.*$/gm)];
    const urls = [...body.matchAll(/^url:.*$/gm)];
    if (lines.length !== 1 || urls.length !== 1 || !/^url: https?:\/\/\S+$/.test(urls[0][0])) continue;
    const quote = lines[0][0].slice(5).trim();
    if (!quote || quote.split(/\s+/).length > 30 || tokenize(quote).length > 30) continue;
    const bodyStart = block.index + block[0].indexOf('\n') + 1;
    ranges.push([bodyStart + lines[0].index, bodyStart + lines[0].index + lines[0][0].length]);
  }
  return ranges;
}

// Methodology data (data/methods/*.json) keeps each short quote in an anchor object next to its
// source: one `"quote": "…"` line of at most 25 words inside a flat object with an http(s) "url".
function anchorQuoteLines(text) {
  const ranges = [];
  for (const object of text.matchAll(/\{[^{}]*\}/g)) {
    if (!/^\s*"url": "https?:\/\/[^"\s]+",?$/m.test(object[0])) continue;
    for (const line of object[0].matchAll(/^\s*"quote": "((?:[^"\\\n]|\\.)*)",?$/gm)) {
      if (line[1].split(/\s+/).length > 25) continue;
      const start = object.index + line.index;
      ranges.push([start, start + line[0].length]);
    }
  }
  return ranges;
}

export function findRuns(text, hashes) {
  const quoteLines = [...linkedQuoteLines(text), ...anchorQuoteLines(text)];
  // Offsets refer to the original text, including newlines, for accurate reports.
  const matches = Array.from(text.matchAll(/[\p{Script=Latin}0-9]+/gu));
  const words = matches.map((match) => match[0].toLowerCase());
  const runs = [];
  let current;
  let previous = -2;
  for (const { start, key } of ngrams(words)) {
    if (!hashes.has(key)) continue;
    if (current && start === previous + 1) current.end = start + WINDOW;
    else {
      current = { start, end: start + WINDOW };
      runs.push(current);
    }
    previous = start;
  }
  return runs.map(({ start, end }) => {
    const offset = matches[start].index;
    const endOffset = matches[end - 1].index + matches[end - 1][0].length;
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const newline = text.indexOf('\n', offset);
    const lineEnd = newline === -1 ? text.length : newline;
    const lineText = text.slice(lineStart, lineEnd);
    return {
      line: text.slice(0, offset).split('\n').length,
      length: end - start,
      words: words.slice(start, end).join(' '),
      // A link on a different line cannot authorize a cross-line run.
      allowed: end - start <= 30 && endOffset <= lineEnd &&
        (/https?:\/\/[^\s<>"')|]+/i.test(lineText) || quoteLines.some(([a, b]) => a === lineStart && b === lineEnd)),
    };
  });
}
