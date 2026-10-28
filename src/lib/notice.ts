import type { Lang } from './lang'

/** The site's one notice about its status and the authors' rights. It appears only on the licences
 * page and its Markdown twin; no other page, export or footer carries it (tests/static.test.tsx). */
export function siteNotice(lang: Lang) {
  return lang === 'zh'
    ? '本站是非官方、非商业的学习整理，与 Matt Pocock 无隶属或背书关系。引文和链接的作品版权归原作者；本站解读不代表原作者观点，原话与语境以原文为准。'
    : 'Unofficial, non-commercial study notes, not affiliated with or endorsed by Matt Pocock. Quoted and linked works belong to their authors; our reading is not their view, and the originals are authoritative.'
}
