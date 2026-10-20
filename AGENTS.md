# AGENTS.md

- Run before pushing: `npm run lint && npm run typecheck && npm test && npm run build`.
- Content lives in `content/{zh,en}/*.md` (same slug in both). Our own words only; quotes ≤ 2 sentences with a source link; reuse only MIT material, under `third_party/`.
- Never commit secrets, `.env`, raw scraped data (`.corpus-raw/`) or build output.
- Changes to `main` go through a PR (template in `.github/`); reviewers use `CODING_STANDARDS.md`.
