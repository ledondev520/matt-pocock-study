// Retrieval units: the pieces of text /api/ask searches and hands to the model.
//
// This module is the one place that decides what a unit is. Everything downstream (index,
// prompt, answer check) only sees `Unit`. To change how the knowledge is sliced (for example
// one unit per method step instead of one per post), replace `loadUnits` and keep the type.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '../../src/lib/content'
import type { CorpusRecord } from '../corpus'
import type { KbEntry } from '../../scripts/kb/feed'
import { chunkUnits, readChunks } from './methodology-adapter'
import { loadPageManifest, hasGeneratedPage, isMethodLink } from './page-manifest'

export type UnitKind =
  /** Matt's own words, read server-side from a private dataset. The only kind quotes may come from. */
  | 'post'
  /** Our daily study note about a post (our words). */
  | 'note'
  /** Our corpus summary of one public item (our words). */
  | 'summary'
  /** A section of a site page (our words). */
  | 'page'
  /** A methodology chunk (overview / step / pitfalls / evolution); see methodology-adapter.ts. */
  | 'method'

/** A quote checked upstream to be Matt's exact words, with its original post. */
export interface Anchor { text: string; url: string; date?: string }

export interface Unit {
  /** Stable id, unique across kinds. */
  id: string
  kind: UnitKind
  title: string
  text: string
  date?: string
  /** Original post or page on the author's site (x.com, github.com, aihero.dev). */
  sourceUrl?: string
  /** Path on this site, e.g. /zh/knowledge#id or /en/<slug>#<heading>. */
  sitePath?: string
  /** Quotes the model may use for this unit, verbatim (methodology chunks). */
  quotes?: Anchor[]
}

/** The post exporter prefixes our methodology title, not the author's original title.
 * Recognize that exact heading before excluding it from protected source text. Plain posts
 * without this wrapper retain their real titles in the overlap check.
 */
export function originalPost(unit: Unit): { title: string; text: string } {
  const heading = /^([^\n]*) · Matt Pocock, \d{4}-\d{2}-\d{2}\r?\n/.exec(unit.text)
  if (heading && unit.title.replace(/ \((?:history|superseded)\)$/, '') === heading[1]) {
    return { title: '', text: unit.text.slice(heading[0].length) }
  }
  return { title: unit.title, text: unit.text }
}

/** Public units built at build time from the site's own content (see scripts/ask-index.ts). */
export interface PublicIndex { version: 1; units: Unit[] }

const SAFE_SOURCE = /^https:\/\/(?:x\.com\/mattpocockuk\/|github\.com\/mattpocock\/|(?:www\.)?aihero\.dev\/|(?:www\.)?totaltypescript\.com\/)/
export const isAllowedSourceUrl = (url: string | undefined): url is string => !!url && SAFE_SOURCE.test(url)
export const isSitePath = (path: string | undefined): path is string => !!path && /^\/(?:zh|en)\/[a-z0-9-]+(?:\/[a-z0-9-]+)?(?:#[\p{L}\p{N}-]+)?$/u.test(path)

const plainText = (markdown: string) => markdown
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/!?\[([^\]\n]*)\]\([^)\s]*\)/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[*_`>#|]+/g, ' ')
  .replace(/\s+/g, ' ').trim()

/** One unit per `## ` section of every page, linked to the section anchor the site renders. */
export function pageUnits(pages: Page[]): Unit[] {
  const units: Unit[] = []
  for (const page of pages) {
    const parts = page.markdown.split(/^## /m)
    // parts[0] is the text before the first H2; toc holds the H2 anchors in document order.
    const intro = plainText(parts[0] ?? '')
    if (intro) units.push({ id: `page:${page.lang}:${page.slug}`, kind: 'page', title: page.title, text: intro, date: page.updated, sitePath: `/${page.lang}/${page.slug}` })
    parts.slice(1).forEach((part, i) => {
      const anchor = page.toc[i]?.id
      const [heading, ...body] = part.split('\n')
      const text = plainText(body.join('\n'))
      if (!text || /```licence/.test(part)) return
      units.push({ id: `page:${page.lang}:${page.slug}#${anchor ?? i}`, kind: 'page', title: `${page.title} · ${plainText(heading)}`, text, date: page.updated, sitePath: `/${page.lang}/${page.slug}${anchor ? `#${anchor}` : ''}` })
    })
  }
  return units
}

export function noteUnits(entries: KbEntry[]): Unit[] {
  return entries.map(e => ({ id: `note:${e.id}`, kind: 'note' as const, title: e.title, text: e.body.map(s => s.text).join(''), date: e.date, sourceUrl: e.url, sitePath: `/zh/knowledge#${e.id}` }))
}

export function summaryUnits(records: CorpusRecord[]): Unit[] {
  return records.map(r => ({ id: `summary:${r.id}`, kind: 'summary' as const, title: r.summary.en.slice(0, 80), text: `${r.summary.en} ${r.summary.zh}`, date: r.date, sourceUrl: r.url }))
}

interface DatasetPost { id: string; date: string; type: string; text: string | null; url: string; quoted_url?: string }
/** Post types that are Matt's own standalone words. Replies are skipped: they can quote third
 * parties with `>`, and they rarely carry a method on their own. */
const POST_TYPES = new Set(['original', 'self_thread', 'quote'])

/**
 * Matt's posts from the private dataset directory (matt-posts-<year>.jsonl). Read on the server
 * only, never copied into the repository, the build or a public endpoint; public answers carry at
 * most a short quote and the link.
 */
export function postUnits(dir: string): Unit[] {
  const units: Unit[] = []
  for (const file of readdirSync(dir).filter(f => /^matt-posts-\d{4}\.jsonl$/.test(f)).sort()) {
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      if (!line.trim()) continue
      const post = JSON.parse(line) as DatasetPost
      if (!POST_TYPES.has(post.type) || !post.text || !isAllowedSourceUrl(post.url)) continue
      const text = post.text.replace(/https:\/\/t\.co\/\S+/g, '').replace(/\s+/g, ' ').trim()
      if (text.length < 40) continue
      units.push({ id: `post:${post.id}`, kind: 'post', title: '', text, date: post.date.slice(0, 10), sourceUrl: post.url })
    }
  }
  return units
}

/**
 * The unit set: the public build-time index, plus methodology chunks when a chunks file is
 * configured, plus Matt's posts when the private dataset is configured. Switching to the
 * methodology chunks only needs ASK_CHUNKS_FILE (and, if its fields change, the adapter).
 */
export function loadUnits(opts: { indexFile: string; pageManifestFile: string; datasetDir?: string; chunksFile?: string }): Unit[] {
  const pages = loadPageManifest(opts.pageManifestFile)
  const index = JSON.parse(readFileSync(opts.indexFile, 'utf8')) as PublicIndex
  if (index.version !== 1 || !Array.isArray(index.units)) throw new Error('ask index: unexpected format')
  return [
    ...(opts.chunksFile ? chunkUnits(readChunks(opts.chunksFile)) : []),
    ...index.units,
    ...(opts.datasetDir ? postUnits(opts.datasetDir) : []),
  ].map(unit => {
    if ((unit.kind === 'method' || isMethodLink(unit.sitePath)) && !hasGeneratedPage(pages, unit.sitePath)) {
      return { ...unit, sitePath: undefined }
    }
    return unit
  })
}
