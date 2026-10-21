import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { exportSvg } from './export-svg.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const inside = async (base, target) => {
  const parent = await realpath(base)
  const full = resolve(target)
  const rel = relative(parent, full)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Output is outside the allowed directory')
  // Check existing ancestors as well: lexical containment alone allows symlink
  // escapes. Outputs never follow candidate-authored file paths.
  let ancestor = full
  while (true) {
    try {
      const actual = await realpath(ancestor)
      const from = relative(parent, actual)
      if (from === '..' || from.startsWith(`..${sep}`) || isAbsolute(from)) throw new Error('Output has a symlink outside its directory')
      break
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      ancestor = dirname(ancestor)
    }
  }
  return full
}

const run = (command, args, options = {}) => new Promise((accept, reject) => {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, CHROME_BIN: process.env.CHROME_BIN || 'google-chrome' }, ...options })
  let stdout = '', stderr = ''
  const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${command} timed out`)) }, 180_000)
  child.stdout.on('data', data => { stdout += data })
  child.stderr.on('data', data => { stderr += data })
  child.once('error', error => { clearTimeout(timeout); reject(error) })
  child.once('close', code => { clearTimeout(timeout); accept({ code, stdout, stderr }) })
})

async function main() {
  if (!process.env.ARCHIFY_HOME) throw new Error('Set ARCHIFY_HOME to the installed Archify package before running npm run diagrams')
  const archify = join(process.env.ARCHIFY_HOME, 'bin/archify.mjs')
  const source = join(root, 'diagrams/src')
  const output = join(root, 'public/diagrams')
  await mkdir(output, { recursive: true })
  await mkdir(join(root, '.archify'), { recursive: true })
  await mkdir(join(root, '.cache'), { recursive: true })
  const names = (await readdir(source)).filter(name => /^[a-z][a-z0-9-]*\.(en|zh)\.json$/.test(name)).sort()
  if (!names.length) throw new Error('No bilingual diagram candidates found')
  const requested = new Set(process.argv.slice(2))
  for (const name of names) {
    const match = /^(.*)\.(en|zh)\.json$/.exec(name)
    const [, id, lang] = match
    if (!names.includes(`${id}.${lang === 'en' ? 'zh' : 'en'}.json`)) throw new Error(`Missing bilingual candidate for ${id}`)
  }
  const report = []
  for (const name of names) {
    const [, id, lang] = /^(.*)\.(en|zh)\.json$/.exec(name)
    if (requested.size && !requested.has(id)) continue
    const identity = `${id}-${lang}`
    const candidate = JSON.parse(await readFile(join(source, name), 'utf8'))
    // Every invocation owns a fresh receipt directory. This also separates
    // concurrent sessions and never overwrites browser evidence from a repair.
    const work = await mkdtemp(await inside(root, join(root, '.archify', `${identity}-`)))
    const html = join(work, 'diagram.html')
    const finalized = await run(process.execPath, [archify, 'finalize', candidate.diagram_type, join(source, name), html, '--quality', 'showcase', '--json', '--out-dir', join(work, 'review')])
    await writeFile(await inside(work, join(work, 'finalize.stdout.json')), finalized.stdout)
    let receipt
    try { receipt = JSON.parse(finalized.stdout) } catch { receipt = {} }
    if (receipt.update?.noticeRequired) console.log(`Archify update notice: ${JSON.stringify(receipt.update)}`)
    if (finalized.code !== 0 || !receipt.ok) {
      report.push({ id, lang, finalize: 'fail', diagnostics: receipt.diagnostics || finalized.stderr })
      console.error(`${id}.${lang}: finalize FAIL ${JSON.stringify(receipt.diagnostics || finalized.stderr)}`)
      continue
    }
    let links = {}
    try {
      const sidecar = JSON.parse(await readFile(join(source, `${id}.links.json`), 'utf8'))
      links = sidecar[lang] || {}
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    const scriptJson = value => JSON.stringify(value).replace(/</g, '\\u003c')
    const injection = `\n<script>addEventListener('load',()=>{try{const result=(${exportSvg.toString()})(${scriptJson(candidate)},${scriptJson(identity)},${scriptJson(links)});document.body.replaceChildren();const pre=document.createElement('pre');pre.id='diagram-export';pre.textContent=JSON.stringify({svg:result});document.body.append(pre)}catch(error){document.body.replaceChildren();const pre=document.createElement('pre');pre.id='diagram-export';pre.textContent=JSON.stringify({error:String(error.stack||error)});document.body.append(pre)}})</script>`
    // Explainers contain child HTML as escaped data. Insert before the actual
    // final body tag, rather than inside one of those embedded documents.
    const helper = join(work, 'extract.html')
    const documentHtml = await readFile(html, 'utf8')
    const bodyEnd = documentHtml.toLowerCase().lastIndexOf('</body>')
    if (bodyEnd < 0) throw new Error(`No body in Archify HTML: ${name}`)
    await writeFile(await inside(work, helper), documentHtml.slice(0, bodyEnd) + injection + documentHtml.slice(bodyEnd))
    const profile = await mkdtemp(await inside(root, join(root, '.cache', 'diagram-chrome-')))
    let extracted
    try {
      const chrome = await run(process.env.CHROME_BIN || 'google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--allow-file-access-from-files', '--virtual-time-budget=4000', '--dump-dom', pathToFileURL(helper).href])
      if (chrome.code !== 0) throw new Error(`Chrome extraction failed: ${chrome.stderr.slice(-1500)}`)
      const serialized = /<pre id="diagram-export">([\s\S]*?)<\/pre>/.exec(chrome.stdout)?.[1]
      if (!serialized) throw new Error(`Chrome did not produce an SVG for ${name}`)
      extracted = JSON.parse(serialized.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
      if (extracted.error) throw new Error(extracted.error)
    } finally { await rm(await inside(root, profile), { recursive: true, force: true }) }
    const svg = extracted.svg.replace(/>\s+</g, '><') + '\n'
    if (!svg.includes('viewBox=') || !svg.includes('<title') || /<(?:script|foreignObject)\b|\son[a-z]+\s*=|(?:https?:\/\/|javascript:|file:)/i.test(svg.replace('http://www.w3.org/2000/svg', ''))) throw new Error(`Unsafe SVG export: ${name}`)
    const target = await inside(output, join(output, `${id}.${lang}.svg`))
    const temporary = await inside(output, `${target}.tmp`)
    await writeFile(temporary, svg)
    await rename(temporary, target)
    const bytes = Buffer.byteLength(svg)
    report.push({ id, lang, finalize: 'pass', bytes })
    console.log(`${id}.${lang}: finalize PASS, SVG ${bytes} bytes${bytes >= 80_000 ? ' (over size target)' : ''}`)
  }
  const reportPath = await inside(root, join(root, '.archify', 'build-report.json'))
  let previous = []
  if (requested.size) {
    try { previous = JSON.parse(await readFile(reportPath, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const combined = new Map([...previous, ...report].map(item => [`${item.id}.${item.lang}`, item]))
  await writeFile(reportPath, JSON.stringify([...combined.values()].sort((a, b) => `${a.id}.${a.lang}`.localeCompare(`${b.id}.${b.lang}`)), null, 2) + '\n')
  if (report.some(item => item.finalize === 'fail')) process.exitCode = 1
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
