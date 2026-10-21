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

// Character ranges of the `text:` line of each ```quote block that also carries an
// http(s) `url:` field. Such a line is a linked quotation, like a quote with an inline link.
function linkedQuoteLines(text) {
  const ranges = [];
  for (const block of text.matchAll(/^```quote[^\n]*\n([\s\S]*?)^```/gm)) {
    const body = block[1];
    if (!/^url:\s*https?:\/\/\S+/m.test(body)) continue;
    const bodyStart = block.index + block[0].indexOf('\n') + 1;
    for (const line of body.matchAll(/^text:.*$/gm)) ranges.push([bodyStart + line.index, bodyStart + line.index + line[0].length]);
  }
  return ranges;
}

export function findRuns(text, hashes) {
  const quoteLines = linkedQuoteLines(text);
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
