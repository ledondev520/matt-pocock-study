# electric / 电光

Deep violet gives the page its structure. Electric lime marks completed paths and actions; pink marks the integration risk. The approved light/dark electric palette and self-hosted Latin typefaces remain in use.

## Palette

| Role | Light | Dark |
| --- | --- | --- |
| Page | `#F8F7FC` | `#0E0A1F` |
| Hero violet | `#43209E` | `#43209E` |
| Filled electric accent | `#C6F432` | `#C6F432` |
| Pink accent | `#F25CAC` | `#F25CAC` |
| Link / action | `#5129C5` | `#C6F432` |
| Body | `#241B35` | `#EAE5F4` |
| Muted text | `#6B607B` | `#AEA4C0` |
| Diagram warning text / fill | `#94205C / #FCE7F2` | `#FFB2D9 / #3A1931` |
| Completed layer text / fill | `#FFFFFF / #5129C5` | `#221438 / #A083F4` |

Lime is never used for text or fine lines against a light background. In the figures it fills the final PR node and first vertical slice, both with dark ink. Figure connectors use contrasting neutral text tokens. Pink warning text has its own theme-aware contrast tokens.

## Typography and layout

- Headings: Space Grotesk, with the locally installed Noto Sans CJK SC fallback. Body: self-hosted Inter and the CJK fallback. Command labels: self-hosted JetBrains Mono. No remote fonts or image requests.
- Reading body: **18px / 1.85**; descriptions, cards, captions and footer prose: **at least 17px**. Article reading column: **38em maximum**.
- Article paragraphs stay short; the key-point cards and success/failure criteria hold the supporting detail. The spec/ticket/ADR table retains real table semantics and wraps within a 390px viewport.
- At phone widths the article sidebar disappears, cards become a single column, and the two tracer-bullet panels stack. The hero chain is already vertical and scales without changing its order.

## Two explanatory figures (sample v2)

Both figures are hand-written inline SVG React components in `src/Diagrams.tsx`. Every color comes from CSS variables. Each SVG includes a bilingual accessible title and description; every figure has a visible localized caption. There are no image assets, Mermaid diagrams, decorative orbit illustrations or motion dependencies.

1. **Hero: the AI coding chain.** Six numbered, linked nodes explain Align → Spec → Tickets → Implement → Review → PR. Each node has a short action label. A dashed return path begins at Review and returns to Align; the attached Standards & feedback box explains mistake → rule → caught next review. The Spec node opens the article sample, preserving language and theme; other nodes expose the requested section hash routes.
2. **Tracer bullet: layer by layer versus vertical slices.** The left timeline completes UI, API and DB separately and ends in a pink integration warning. On the right, a lime first slice connects all three layers before slices two and three follow. Each slice has a check mark; the outcome states that each ticket can be verified independently. Shared layer labels and time direction make the comparison explicit. The panels stack on small screens so labels remain readable at 390px.

## Language, navigation and content

- `/zh` and `/en` are localized homes. `/<lang>/<slug>` opens a lesson; `/<lang>/corpus` opens the live SQLite-backed index. Root selection prefers stored language, then browser language.
- Language switching keeps the same lesson and uses SPA navigation. The theme control persists `theme`, while a head script applies the saved/system theme before paint. Illustrated art switches through light/dark image classes.
- The complete 06 lesson preserves the approved sample's teaching sequence, sole attributed quotation, vertical-slice explanation and favourites exercise. The 01 lesson introduces the author and the site's independent scope.
- All content follows `CONTENT_FORMAT.md`. Figures are registered in `data/figures.json`; missing assets use themed placeholders with explicit IDs and dimensions. The hand-written chain and tracer remain in `src/Diagrams.tsx`.
- Corpus records come from the public metadata index, with our own bilingual summaries. Metrics are snapshots, not claims about learning effectiveness.
- The site is unofficial and non-commercial. Source: https://github.com/ledondev520/matt-pocock-study.

## Build and visual review

`npm run build` renders crawler-readable static HTML and the React reader. Fonts are bundled locally through @fontsource, including Noto Sans SC for consistent CJK typography. Full OFL notices ship in `public/font-licenses/`.

`npm run contrast` recomputes the approved token pairs below; every pair must reach **4.5:1**. It runs as part of `npm test`.

`npm run review` captures home/article light/dark at 1440px and 390px, plus English views, tracer details and corpus results, using headless Google Chrome. The profile, screenshots and measurement report live in ignored `.cache/`. The script checks horizontal overflow, runtime errors, navigation, saved preferences, corpus filtering and HTTP 404 responses. Screenshots are also inspected visually.

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
| Light | Link / page | #5129C5 | #F8F7FC | 7.97:1 | PASS |
| Light | Link / panel | #5129C5 | #FFFFFF | 8.49:1 | PASS |
| Light | Primary button | #FFFFFF | #5129C5 | 8.49:1 | PASS |
| Light | Quote text | #241B35 | #EEEBF5 | 13.90:1 | PASS |
| Light | Quote attribution | #6B607B | #EEEBF5 | 4.98:1 | PASS |
| Light | Diagram heading / panel | #241B35 | #FFFFFF | 16.37:1 | PASS |
| Light | Diagram labels / track & slices | #241B35 | #EEEBF5 | 13.90:1 | PASS |
| Light | Diagram secondary / panel | #6B607B | #FFFFFF | 5.86:1 | PASS |
| Light | Diagram layer completion | #FFFFFF | #5129C5 | 8.49:1 | PASS |
| Light | Diagram integration warning | #94205C | #FCE7F2 | 6.81:1 | PASS |
| Light | Diagram first slice / lime | #221438 | #C6F432 | 13.38:1 | PASS |
| Light | Figure caption / page | #6B607B | #F8F7FC | 5.50:1 | PASS |
| Light | Article quote / muted | #241B35 | #EEEBF5 | 13.90:1 | PASS |
| Light | Article quote source / muted | #6B607B | #EEEBF5 | 4.98:1 | PASS |
| Light | Article links / muted | #5129C5 | #EEEBF5 | 7.21:1 | PASS |
| Light | Hero figure labels / nodes | #EBE3FF | #30156F | 11.60:1 | PASS |
| Light | Hero figure numbers / nodes | #D8CCF3 | #30156F | 9.47:1 | PASS |
| Light | Hero figure loop / violet | #EBE3FF | #43209E | 8.75:1 | PASS |
| Light | Hero figure caption / violet | #D8CCF3 | #43209E | 7.14:1 | PASS |
| Dark | Body / page | #EAE5F4 | #0E0A1F | 15.73:1 | PASS |
| Dark | Body / card | #EAE5F4 | #171128 | 14.83:1 | PASS |
| Dark | Body / corpus, reading | #EAE5F4 | #1A132D | 14.48:1 | PASS |
| Dark | Muted / page | #AEA4C0 | #0E0A1F | 8.20:1 | PASS |
| Dark | Muted / card | #AEA4C0 | #171128 | 7.73:1 | PASS |
| Dark | Muted / corpus | #AEA4C0 | #1A132D | 7.55:1 | PASS |
| Dark | Muted / input | #AEA4C0 | #211932 | 7.10:1 | PASS |
| Dark | Muted / badges | #AEA4C0 | #241B38 | 6.88:1 | PASS |
| Dark | Link / page | #C6F432 | #0E0A1F | 15.15:1 | PASS |
| Dark | Link / panel | #C6F432 | #1A132D | 13.95:1 | PASS |
| Dark | Primary button | #1A2110 | #C6F432 | 12.91:1 | PASS |
| Dark | Quote text | #EAE5F4 | #251A39 | 13.23:1 | PASS |
| Dark | Quote attribution | #AEA4C0 | #251A39 | 6.90:1 | PASS |
| Dark | Diagram heading / panel | #EAE5F4 | #1A132D | 14.48:1 | PASS |
| Dark | Diagram labels / track & slices | #EAE5F4 | #241B38 | 13.20:1 | PASS |
| Dark | Diagram secondary / panel | #AEA4C0 | #1A132D | 7.55:1 | PASS |
| Dark | Diagram layer completion | #221438 | #A083F4 | 5.75:1 | PASS |
| Dark | Diagram integration warning | #FFB2D9 | #3A1931 | 9.26:1 | PASS |
| Dark | Diagram first slice / lime | #221438 | #C6F432 | 13.38:1 | PASS |
| Dark | Figure caption / page | #AEA4C0 | #0E0A1F | 8.20:1 | PASS |
| Dark | Article quote / muted | #EAE5F4 | #241B38 | 13.20:1 | PASS |
| Dark | Article quote source / muted | #AEA4C0 | #241B38 | 6.88:1 | PASS |
| Dark | Article links / muted | #C6F432 | #241B38 | 12.71:1 | PASS |
| Dark | Hero figure labels / nodes | #EBE3FF | #30156F | 11.60:1 | PASS |
| Dark | Hero figure numbers / nodes | #D8CCF3 | #30156F | 9.47:1 | PASS |
| Dark | Hero figure loop / violet | #EBE3FF | #43209E | 8.75:1 | PASS |
| Dark | Hero figure caption / violet | #D8CCF3 | #43209E | 7.14:1 | PASS |
| Both | Hero body | #EBE3FF | #43209E | 8.75:1 | PASS |
| Both | Hero tribute | #D8CCF3 | #43209E | 7.14:1 | PASS |
| Both | Hero muted | #D3C5F3 | #43209E | 6.73:1 | PASS |
| Both | Hero link | #EEE6FF | #43209E | 8.97:1 | PASS |
| Both | Hero accent | #C6F432 | #43209E | 8.45:1 | PASS |
| Both | Hero button | #221438 | #C6F432 | 13.38:1 | PASS |
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

