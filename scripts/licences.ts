import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/**
 * MIT sources whose material this site reuses. Each LICENSE file under third_party/ is a
 * byte-for-byte copy of the upstream repository's LICENSE; the pinned sha256 makes any edit
 * (including a changed copyright holder or year) fail the build.
 */
export const licences = {
  'mattpocock-skills': {
    name: 'mattpocock/skills',
    repo: 'https://github.com/mattpocock/skills',
    file: 'third_party/mattpocock-skills/LICENSE',
    sha256: '0e7ac423bf2c6e223b7c5b156f8cf72da49d748e56a1641402c31f22ad07dbb5',
  },
  archify: {
    name: 'Archify (tt-a1i/archify)',
    repo: 'https://github.com/tt-a1i/archify',
    file: 'third_party/archify/LICENSE',
    sha256: 'b799ab081703e7821ae5096d2c1abdf14bbdc75e8ea1c4045998c36ed6db9706',
  },
} as const

export type LicenceId = keyof typeof licences

export function licenceText(id: string): string {
  if (!Object.hasOwn(licences, id)) throw new Error(`Unknown licence id: ${id}`)
  const entry = licences[id as LicenceId]
  const text = readFileSync(entry.file, 'utf8')
  if (createHash('sha256').update(text).digest('hex') !== entry.sha256) throw new Error(`Licence text changed: ${entry.file}`)
  return text
}
