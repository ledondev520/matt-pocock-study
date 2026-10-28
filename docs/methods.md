# Methodologies

Pages: `/zh/methods`, `/zh/methods/<slug>` and the same under `/en`. Each page has a Markdown twin
(`<path>.md`), is listed in `llms.txt` and the sitemap, and step `N` has the anchor `#sN`.

## Data

- `data/methods/<slug>.json`: one methodology set, checked against `data/methodology.schema.json`
  by `validateMethodology` (src/lib/methods.ts) when it is loaded. The file name is the id
  without `m.`. Adding a set is data only: add the file and rebuild.
- `status` (`draft` | `published`) is kept for gating publication later; today both render.
- `thin: true` marks a set with little source material. It renders with the same template and is
  listed last within its domain.
- `data/methods-i18n/<slug>.en.json`: the English overlay used by the import, keyed by JSON path,
  `{ "zh": <source text>, "en": <translation> }`. If the Chinese source changes, its English
  counts as missing again.

Licence names are not shown on the pages (they are on the licences page): `forDisplay` removes
them from the text and drops `license_ref`; the data keeps both.

## Import

```sh
npm run import:methods -- <methodologies-dir> [--skeleton]
```

Reads `<methodologies-dir>/index.json` and imports only the sets it lists. A set is written only
when every Chinese field has English; `--skeleton` adds the missing paths to the overlay with an
empty `en`. Re-running with the same inputs changes nothing. Internal notes
(`internal_notes` at any depth, `sources_count.method`, `repos[].note`) are excluded before translation.
Index `internal_notes` is ignored; only ids, file paths and thin flags are used. Index flags `thin` (or a note starting
with 薄) set `thin: true`.

The 31 method slugs below each have both `/zh/methods/<slug>` and `/en/methods/<slug>` pages:

```text
afk-loops agent-docs-skills align-grill codebase-design context-mgmt
course-design debugging domain-language educator-career error-handling
evals feedback-loops generics infer-vs-annotate launch-sell learn
llm-app-build make-videos pr-review runtime-validation spec-tickets
state-modeling teach-explain testing-tdd ts-feature-choice ts-migration
tsconfig-modules type-design write-docs write-threads write-with-ai
```

Site-authored examples retain the `本站示例:` / `Our example:` attribution in HTML and Markdown.
Quotes keep at most two sentences. Import retains a verbatim prefix when shortening and omits
the accompanying translation, which may describe sentences no longer quoted. Abbreviations such
as `I.e.` stay with the following text. The source dataset remains unchanged.

## Module interface (scripts/methods.ts, build time)

```ts
listMethodologies(lang?: 'zh' | 'en'): MethodSummary[]   // id, slug, domain, title, question, claim, date_last, status, thin
getMethodology(idOrSlug: string): Methodology | undefined // 'm.pr-review' or 'pr-review'
chunks(lang?: 'zh' | 'en'): MethodChunk[]                // both languages when lang is omitted
todaysMethodology(day: 'YYYY-MM-DD', lang?): MethodSummary | undefined // same set all day
methodPath(lang, id?, anchor?)                           // '/zh/methods/pr-review#s4'
```

Chunks follow the knowledge architecture: one `overview`, one `step` per step, `pitfalls` (split
above 800 characters) and `evolution` per set. Fields: `key` (`<lang>:<chunk_id>`, unique),
`chunk_id` (`m.<slug>#s4`), `kind`, `methodology_id`, `domain`, `step`, `title`, `text`, `lang`,
`sitePath`, `years`, `date_last`, `stance_status`, `evolution_period`, `source_urls`,
`quotes[] {text, url, date}` (copied from the anchors), `evidence`, `schema_version`.

## Checks that need the private source dataset (not run in CI)

```sh
npm run check:quotes -- --dataset <dir>
npm run build:ask-chunks -- --dataset <dir> --out <dir> [--rules <file.json>]
```

`check:quotes` checks that every quote is word for word in Matt's text at its URL, at most 25
words, with the right date, and that repository licences match. `build:ask-chunks` writes the
server-only chunk file for `/api/ask` (methodology chunks plus Matt's own posts, each with
methodology id, step, year, source link and one short quote), after scanning every chunk for
emails, phone numbers and third-party quotes and re-checking every quote. The output is never
committed.
