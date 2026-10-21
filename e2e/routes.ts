import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Every HTML page of the build, derived from dist/ (no hand-written list): dist/x/index.html → /x,
// dist/404.html → /404.
function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? htmlFiles(path) : path.endsWith('.html') ? [path] : []
  })
}
export const routes = htmlFiles('dist')
  .map(file => '/' + file.slice('dist/'.length).replace(/index\.html$/, '').replace(/\.html$/, ''))
  .map(route => (route.length > 1 ? route.replace(/\/$/, '') : route))
  .sort()
