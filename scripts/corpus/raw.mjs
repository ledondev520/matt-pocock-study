import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createInterface } from 'node:readline';

export async function* walk(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(file);
    else if (entry.isFile()) yield file; // Never follow symlinks into unrelated data.
  }
}

export async function exists(directory) {
  try { return (await lstat(directory)).isDirectory(); } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export function* textFields(value) {
  if (typeof value === 'string') yield value;
  else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) yield* textFields(child);
  }
}

export async function* jsonLines(file) {
  const input = createReadStream(file, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const line of lines) {
      lineNumber++;
      if (!line.trim()) continue;
      try { yield JSON.parse(line); } catch {
        throw new Error(`Invalid raw JSONL at line ${lineNumber}.`);
      }
    }
  } finally { lines.close(); input.destroy(); }
}

export async function* sourceTexts(directory) {
  for await (const file of walk(directory)) {
    const extension = extname(file).toLowerCase();
    if (extension === '.jsonl') {
      for await (const value of jsonLines(file)) yield* textFields(value);
    } else if (extension === '.json') {
      let value;
      try { value = JSON.parse(await readFile(file, 'utf8')); } catch {
        throw new Error('Invalid raw JSON input.');
      }
      yield* textFields(value);
    } else if (extension === '.md') yield await readFile(file, 'utf8');
  }
}
