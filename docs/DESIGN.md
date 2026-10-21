# Option B / 扁平

Flat surfaces, neutral 1px borders and restrained purple accents define the approved option B. Cards use at most 2px accent top borders; hover changes the border colour. There are no shadows or hero glow. Self-hosted Latin typefaces remain in use.

## Palette

| Role | Light | Dark |
| --- | --- | --- |
| Page | `#F8F7FC` | `#0E0A1F` |
| Hero surface | `#F1EEF8` | `#151024` |
| Hero text / muted | `#241B35 / #5E5470` | `#EAE5F4 / #AEA4C0` |
| Hero node / border | `#FFFFFF / #CFC7DF` | `#1D1631 / #3A2F50` |
| Primary action | `#5B3FB8` | `#9C8BD9` |
| Hero accent / ink | `#5B3FB8 / #FFFFFF` | `#B4A3EC / #140C28` |
| Card accent | `#6A52C2` | `#8F7FC9` |
| Small lime accent | `#C6F432` | `#C6F432` |
| Pink accent | `#F25CAC` | `#F25CAC` |
| Link | `#5B3FB8` | `#B4A3EC` |
| Body | `#241B35` | `#EAE5F4` |
| Muted text | `#6B607B` | `#AEA4C0` |
| Diagram warning text / fill | `#94205C / #FCE7F2` | `#FFB2D9 / #3A1931` |
| Completed layer text / fill | `#FFFFFF / #5B3FB8` | `#140C28 / #9C8BD9` |

Lime remains on the logo and lesson number chip; the hero's final PR node and CTA use purple. The older tracer art retains its illustrated lime first slice. Figure connectors use contrasting neutral text tokens. Pink warning text has its own theme-aware contrast tokens. The corpus entry is an outlined row.

## Typography and layout

- Headings: Space Grotesk. Body: self-hosted Inter and Noto Sans SC, with locally installed CJK fallbacks. Command labels: self-hosted JetBrains Mono. No remote fonts or image requests; no font subsetting. The 中文 language switch uses `lang="zh-Hans"` and the local PingFang SC / Hiragino Sans GB / Microsoft YaHei / Noto Sans CJK SC stack.
- Inline navigation and prose arrows use `Arrow` SVG paths. Decorative arrows are hidden from assistive technology; meaningful arrows have an accessible label. SVG text isolates arrow characters in system-font tspans. Markdown and llms exports retain their original characters.
- Reading body: **18px / 1.85**; descriptions, cards, captions and footer prose: **at least 17px**. Article reading column: **38em maximum**.
- Article paragraphs stay short; the key-point cards and success/failure criteria hold the supporting detail. The spec/ticket/ADR table retains real table semantics and wraps within a 390px viewport.
- At phone widths the article sidebar disappears, cards become a single column, and the two tracer-bullet panels stack. The hero chain is already vertical and scales without changing its order.

## Two explanatory figures (sample v2)

The hand-written inline SVG components in `src/Diagrams.tsx` supply the hero and tracer fallback. Every color comes from CSS variables. Each SVG includes a bilingual accessible title and description; every figure has a visible localized caption. Imported art and generated diagrams are registered separately in `data/figures.json`.

1. **Hero: the AI coding chain.** Six numbered, linked nodes explain Align → Spec → Tickets → Implement → Review → PR. Each node has a short action label. A dashed return path begins at Review and returns to Align; the attached Standards & feedback box explains mistake → rule → caught next review. Align opens the introduction; Spec, Tickets, Implement, Review and PR open the spec/ticket article sample. All six use real same-language anchors, preserve theme, support keyboard activation and show a contrasting focus stroke. Diagram anchors permit only known content paths without fragments; art has no links.
2. **Tracer bullet: layer by layer versus vertical slices.** The left timeline completes UI, API and DB separately and ends in a pink integration warning. On the right, a lime first slice connects all three layers before slices two and three follow. Each slice has a check mark; the outcome states that each ticket can be verified independently. Shared layer labels and time direction make the comparison explicit. The panels stack on small screens so labels remain readable at 390px.

## Language, navigation and content

- `/zh` and `/en` are localized homes. `/<lang>/<slug>` opens a lesson; `/<lang>/corpus` opens the live SQLite-backed index. Root selection prefers stored language, then browser language.
- HTML file aliases and percent-encoded page paths return real localized 404s before static serving; server, SSR and client share the route grammar.
- Same-page TOC fragments use native scrolling and history without per-page JSON requests or scroll resets. Cross-page fragments load the model, render, then scroll to the decoded heading ID, including Chinese fragments.
- Language switching keeps the same lesson and uses SPA navigation. The theme control persists `theme`, while a head script applies the saved/system theme before paint. Illustrated art switches through light/dark image classes.
- The complete 06 lesson preserves the approved sample's teaching sequence, sole attributed quotation, vertical-slice explanation and favourites exercise. The 01 lesson introduces the author and the site's independent scope.
- All content follows `CONTENT_FORMAT.md`. Figures are registered in `data/figures.json`; missing assets use themed placeholders with explicit IDs and dimensions. The hand-written chain and tracer remain in `src/Diagrams.tsx`. SVG CSS uses an explicit static property/function allowlist and root-scoped selectors rewritten under a unique scope; no at-rules, escapes or CSS resource loading are accepted. XML declarations and metadata are removed. Download fallbacks resolve the light palette to literal values and contain only scoped SVG presentation rules. Registry IDs are validated on load and generated files use a shared output containment helper.
- Corpus records come from the public metadata index, with our own bilingual summaries. Metrics are snapshots, not claims about learning effectiveness.
- The site is unofficial and non-commercial. Source: https://github.com/ledondev520/matt-pocock-study.

## Build and visual review

`npm run build` renders crawler-readable static HTML and the React reader. Fonts are bundled locally through @fontsource, including Noto Sans SC for consistent CJK typography. Full OFL notices ship in `public/font-licenses/`.

`npm run contrast` recomputes the approved token pairs below; every pair must reach **4.5:1**. It runs as part of `npm test`.
Run `node scripts/contrast.mjs --write` after palette changes to refresh this table.

`npm run review` captures home/article light/dark at 1440px, 390px and 320px, plus English views, tracer details and corpus results, using headless Google Chrome. The profile, screenshots and measurement report live in ignored `.cache/`. The script checks horizontal overflow, runtime errors, navigation, saved preferences, corpus filtering, alias/encoded HTTP 404 responses, Chinese/English TOC and fragment history, cross-page fragments and all six hero links with keyboard focus/activation. Screenshots are also inspected visually.

<!-- contrast:start -->
| Theme | Text / role | Foreground | Background | Contrast | AA |
| --- | --- | --- | --- | --- | --- |
| Light | Body / page | #241B35 | #F8F7FC | 15.35:1 | PASS |
| Light | Body / card | #241B35 | #FFFFFF | 16.37:1 | PASS |
| Light | Body / corpus, reading | #241B35 | #FFFFFF | 16.37:1 | PASS |
| Light | Muted / page | #6B607B | #F8F7FC | 5.50:1 | PASS |
| Light | Muted / card | #6B607B | #FFFFFF | 5.86:1 | PASS |
| Light | Muted / corpus | #6B607B | #FFFFFF | 5.86:1 | PASS |
| Light | Muted / input | #6B607B | #F8F7FC | 5.50:1 | PASS |
| Light | Muted / badges | #6B607B | #EEEBF5 | 4.98:1 | PASS |
| Light | Link / page | #5B3FB8 | #F8F7FC | 6.92:1 | PASS |
| Light | Link / panel | #5B3FB8 | #FFFFFF | 7.37:1 | PASS |
| Light | Primary button | #FFFFFF | #5B3FB8 | 7.37:1 | PASS |
| Light | Quote text | #241B35 | #EEEBF5 | 13.90:1 | PASS |
| Light | Quote attribution | #6B607B | #EEEBF5 | 4.98:1 | PASS |
| Light | Diagram heading / panel | #241B35 | #FFFFFF | 16.37:1 | PASS |
| Light | Diagram labels / track & slices | #241B35 | #EEEBF5 | 13.90:1 | PASS |
| Light | Diagram secondary / panel | #6B607B | #FFFFFF | 5.86:1 | PASS |
| Light | Inline diagram labels / card | #241B35 | #FFFFFF | 16.37:1 | PASS |
| Light | Inline diagram details / card | #6B607B | #FFFFFF | 5.86:1 | PASS |
| Light | Diagram layer completion | #FFFFFF | #5B3FB8 | 7.37:1 | PASS |
| Light | Diagram integration warning | #94205C | #FCE7F2 | 6.81:1 | PASS |
| Light | Diagram first slice / lime | #221438 | #C6F432 | 13.38:1 | PASS |
| Light | Figure caption / page | #6B607B | #F8F7FC | 5.50:1 | PASS |
| Light | Article quote / muted | #241B35 | #EEEBF5 | 13.90:1 | PASS |
| Light | Article quote source / muted | #6B607B | #EEEBF5 | 4.98:1 | PASS |
| Light | Article links / muted | #5B3FB8 | #EEEBF5 | 6.26:1 | PASS |
| Light | Hero figure labels / nodes | #241B35 | #FFFFFF | 16.37:1 | PASS |
| Light | Hero figure numbers / nodes | #5E5470 | #FFFFFF | 7.05:1 | PASS |
| Light | Hero body / surface | #241B35 | #F1EEF8 | 14.28:1 | PASS |
| Light | Hero muted / surface | #5E5470 | #F1EEF8 | 6.15:1 | PASS |
| Light | Hero accent / surface | #5B3FB8 | #F1EEF8 | 6.43:1 | PASS |
| Light | Hero button & final node | #FFFFFF | #5B3FB8 | 7.37:1 | PASS |
| Light | Corpus entry / outlined row | #241B35 | #F8F7FC | 15.35:1 | PASS |
| Dark | Body / page | #EAE5F4 | #0E0A1F | 15.73:1 | PASS |
| Dark | Body / card | #EAE5F4 | #171128 | 14.83:1 | PASS |
| Dark | Body / corpus, reading | #EAE5F4 | #1A132D | 14.48:1 | PASS |
| Dark | Muted / page | #AEA4C0 | #0E0A1F | 8.20:1 | PASS |
| Dark | Muted / card | #AEA4C0 | #171128 | 7.73:1 | PASS |
| Dark | Muted / corpus | #AEA4C0 | #1A132D | 7.55:1 | PASS |
| Dark | Muted / input | #AEA4C0 | #211932 | 7.10:1 | PASS |
| Dark | Muted / badges | #AEA4C0 | #241B38 | 6.88:1 | PASS |
| Dark | Link / page | #B4A3EC | #0E0A1F | 8.68:1 | PASS |
| Dark | Link / panel | #B4A3EC | #1A132D | 7.99:1 | PASS |
| Dark | Primary button | #140C28 | #9C8BD9 | 6.39:1 | PASS |
| Dark | Quote text | #EAE5F4 | #251A39 | 13.23:1 | PASS |
| Dark | Quote attribution | #AEA4C0 | #251A39 | 6.90:1 | PASS |
| Dark | Diagram heading / panel | #EAE5F4 | #1A132D | 14.48:1 | PASS |
| Dark | Diagram labels / track & slices | #EAE5F4 | #241B38 | 13.20:1 | PASS |
| Dark | Diagram secondary / panel | #AEA4C0 | #1A132D | 7.55:1 | PASS |
| Dark | Inline diagram labels / card | #EAE5F4 | #171128 | 14.83:1 | PASS |
| Dark | Inline diagram details / card | #AEA4C0 | #171128 | 7.73:1 | PASS |
| Dark | Diagram layer completion | #140C28 | #9C8BD9 | 6.39:1 | PASS |
| Dark | Diagram integration warning | #FFB2D9 | #3A1931 | 9.26:1 | PASS |
| Dark | Diagram first slice / lime | #221438 | #C6F432 | 13.38:1 | PASS |
| Dark | Figure caption / page | #AEA4C0 | #0E0A1F | 8.20:1 | PASS |
| Dark | Article quote / muted | #EAE5F4 | #241B38 | 13.20:1 | PASS |
| Dark | Article quote source / muted | #AEA4C0 | #241B38 | 6.88:1 | PASS |
| Dark | Article links / muted | #B4A3EC | #241B38 | 7.29:1 | PASS |
| Dark | Hero figure labels / nodes | #EAE5F4 | #1D1631 | 14.04:1 | PASS |
| Dark | Hero figure numbers / nodes | #AEA4C0 | #1D1631 | 7.32:1 | PASS |
| Dark | Hero body / surface | #EAE5F4 | #151024 | 15.04:1 | PASS |
| Dark | Hero muted / surface | #AEA4C0 | #151024 | 7.84:1 | PASS |
| Dark | Hero accent / surface | #B4A3EC | #151024 | 8.30:1 | PASS |
| Dark | Hero button & final node | #140C28 | #B4A3EC | 8.44:1 | PASS |
| Dark | Corpus entry / outlined row | #EAE5F4 | #211932 | 13.61:1 | PASS |
| Both | Code: Text | #E9E4F5 | #171126 | 14.75:1 | PASS |
| Both | Code: Keyword / operator | #D5ADFF | #171126 | 9.83:1 | PASS |
| Both | Code: String | #C6F432 | #171126 | 14.32:1 | PASS |
| Both | Code: Function | #FF91CB | #171126 | 8.88:1 | PASS |
| Both | Code: Type | #9DDFFF | #171126 | 12.61:1 | PASS |
| Both | Code: Punctuation | #C2B7D6 | #171126 | 9.64:1 | PASS |
| Both | Code: Comment | #B4A7C8 | #171126 | 8.13:1 | PASS |
| Both | Code: Line number | #A394B8 | #171126 | 6.54:1 | PASS |
| Both | Code toolbar | #C2B7D6 | #211930 | 8.86:1 | PASS |
<!-- contrast:end -->
