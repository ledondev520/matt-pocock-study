# PR assets: quiet licences page + Chinese root

Screenshots for the quiet-licences PR. Not part of the site.

- `before-*` / `after-*`: `/zh/review-and-pr` top and bottom, its footer, at 390x844 (mobile) and
  1440x900 (desktop), light and dark. `after-*-licenses-{zh,en}`: the new licences pages.
- `*-root-frameN-<ms>.png`: distinct frames of a CDP screencast while opening `/` in a Chinese
  browser with nothing stored (CPU 6x slower, 150 ms latency, 400 KB/s).
  - before: `/` shows the English home ("Think clearly. Build better."), then at about 1.0 s the
    URL becomes `/zh` and the English page is still shown, then at about 1.4 s it switches to Chinese.
  - after: `/` shows the Chinese home ("想清楚，再动手。") from the first frame and stays on `/`.

## Review fix 1 (head faa0415)

`fix1-{mobile,desktop}-*.png`, light, 390x844 and 1440x900, after the fix:

- `review-and-pr-sources-{zh,en}`: the sources list keeps the post and the show-me credit; the
  skills line with "Copyright (c) 2026 Matt Pocock" and the "complete MIT licence" pointer are gone.
- `cheat-sheets-handoff-{zh,en}`: the "Verification and handoff" table without the
  "adapted under MIT" lead-in or the SKILL.md source lines.
- `licenses-intro-{zh,en}`: the licences page intro now says the texts match the upstream LICENSE as
  it stood when the material was taken.
- `licenses-archify-{zh,en}`: the Archify entry; its "upstream LICENSE" link now points to commit
  7a16d30 (the last MIT version) instead of main.
