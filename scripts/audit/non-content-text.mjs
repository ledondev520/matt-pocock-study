// Lists, page by page, the visible text in the built site that is not content: anything outside
// titles, the note/entry/licence bodies, navigation, search, the copy-for-agent line, the footer's
// licences link and screen-reader-only text. The target is zero; launch acceptance runs it.
//   node scripts/audit/non-content-text.mjs [dist] [--json] [--strict]
// --strict exits 1 when any page has non-content text.
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'

/** Regions whose text counts as content, navigation or controls (or is not shown). */
export const allowed = [
  // Not visible / screen readers only.
  'script', 'style', 'template', 'noscript', '[hidden]', '[aria-hidden="true"]', '.sr-only', 'svg title', 'svg desc',
  // Titles.
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // Content.
  '.article-lede', '.article-body', '.key-point', 'figure', '.kb-entry', '.corpus-record', '.intro-prose', '.licenses-page',
  // Timeline dates, learning text, lesson titles linking to their sections, and revealed originals.
  '.tl-meta time', '.tl-learned', 'a.tl-from', '.tl-original blockquote', '.tl-original > a.kb-source',
  // Navigation.
  '.skip-link', 'header', 'nav', '.article-sidebar', '.page-toc', '.corpus-page-intro > a', '.hero-actions',
  // Search and its states, the copy line (hint, button, the prompt shown for a manual copy), and in
  // the footer only its licences link: any other footer text is reported.
  'form[role="search"]', '.result-count', '.pagination', '.empty-state button', '[role="alert"]',
  '.agent-copy-hint', '.agent-copy-button', '.agent-copy-text', 'footer .footer-licenses',
  // Timeline's original-post switch label and year slider.
  'label.tl-toggle > span:last-child', '.tl-track[role="slider"]',
].join(', ')

export function nonContentText(html) {
  const { document } = new JSDOM(html).window
  const root = document.getElementById('root') ?? document.body
  const found = []
  const walker = document.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    if (!text || node.parentElement?.closest(allowed)) continue
    found.push({ text, where: path(node.parentElement) })
  }
  return found
}
function path(element) {
  const parts = []
  for (let e = element; e && e.id !== 'root' && e.tagName !== 'BODY'; e = e.parentElement) parts.unshift(e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).join('.')}` : ''))
  return parts.join(' > ')
}
async function htmlFiles(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) { if (entry.name !== 'assets') out.push(...await htmlFiles(file)) }
    else if (entry.name.endsWith('.html')) out.push(file)
  }
  return out.sort()
}
/** { "/zh/knowledge": [{ text, where }], … } for every pre-rendered page in `dist`. */
export async function auditSite(dist = 'dist') {
  const report = {}
  for (const file of await htmlFiles(dist)) {
    const route = '/' + relative(dist, file).replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '')
    report[route.replace(/\/$/, '') || '/'] = nonContentText(await readFile(file, 'utf8'))
  }
  return report
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), dist = args.find(a => !a.startsWith('--')) ?? 'dist'
  const report = await auditSite(dist)
  const total = Object.values(report).reduce((n, items) => n + items.length, 0)
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 1))
  else {
    for (const [route, items] of Object.entries(report)) {
      console.log(`${route}: ${items.length}`)
      for (const { text, where } of items) console.log(`  - ${JSON.stringify(text)}  (${where})`)
    }
    console.log(`Pages: ${Object.keys(report).length}, non-content text items: ${total}`)
  }
  if (args.includes('--strict') && total) process.exitCode = 1
}
