import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, relative, isAbsolute, sep, dirname } from 'node:path'

export function outputPath(root, ...parts) {
  const base = resolve(root)
  const target = resolve(base, ...parts)
  const rel = relative(base, target)
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('Output path escapes its root')
  return target
}

export async function writeOutput(root, target, data) {
  const file = outputPath(root, target)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, data)
}
