# Font subsets

`scripts/fonts.mjs` subsets the upright Latin wght WOFF2 from `@fontsource-variable/source-sans-3` 5.3.1 with subset-font (HarfBuzz). It preserves the 200–900 variable weight axis, GSUB/GPOS, and licence name IDs 13/14. The package LICENSE ships byte-for-byte in `public/font-licenses/source-sans-3.txt` under OFL-1.1.

The collector walks content, data, src, scripts, server, diagrams and public/art, including parsed JSON keys and strings. It collects non-CJK characters plus printable ASCII, U+00A0–00FF, U+2010–2027, U+2030–203A, U+20AC, U+2122 and U+2190–2193. Only characters present in the source cmap enter the subset; missing characters use the system fallback.

One deterministic WOFF2 and one CSS face are generated under ignored `generated/fonts/`. The face uses swap and a precise cmap unicode-range. `src/main.tsx` imports the CSS; Vite emits hashed assets, and static rendering resolves the Latin preload from the built CSS. Chinese uses OS fonts only; no CJK web font is shipped. JetBrains Mono remains unchanged for code.

Unit tests check coverage, determinism, variation, layout and licence tables. Static tests check the shipped families, files and preload; browser tests check every built route in both themes for local WOFF2 requests, and verify Source Sans 3 actually draws Latin text through CDP.
