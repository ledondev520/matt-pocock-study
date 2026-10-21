# Art integration · 2026-10-21

Imported 100 SVGs: 25 art IDs, Chinese/English, light/dark. Every variant passed
the unchanged strict art validator before any file was copied into `public/art/`.
The delivery source was read only.

The direct import rejected all 100 original files with:
`SVG declarations, processing instructions and comments are forbidden`.
Each file began with an XML declaration. After that declaration was removed,
validation also rejected `lang`; the batch also contained non-allowlisted
`data-id` and `data-theme` metadata. No comments were present.

Local staging copies omit only the XML declaration and those three attributes.
Shapes, text, colours, dimensions, clipping and accessibility titles/descriptions
are preserved. The importer then validated the entire staged batch and imported
its re-serialized output. The validator was not relaxed for art.

The failure applies to all four filenames for every ID below:
`<id>.zh.svg`, `<id>.en.svg`, `<id>.zh-dark.svg`, `<id>.en-dark.svg`.

- home-routes
- s02-silent-success
- s03-card-anatomy
- s05-three-questions
- s06-tracer
- s06-ticket-anatomy
- s07-hitl-afk
- s07-evidence
- s08-two-axes
- s08-pr-blocks
- s09-handoff-card
- s10-index
- s11-two-kinds
- s11-error-message
- s12-adr-fields
- s13-unknown
- s13-generic
- s14-brand
- s15-booleans
- s15-deep-module
- s16-lesson-order
- s17-attribution
- s21-four-marks
- spot-empty
- spot-404

Reviewed all 25 registry descriptions against the delivery and its copy-change
log. Updated bilingual alt/caption text for false-success configuration checks,
the input/process/output tracer comparison, the six-field favorites ticket and
the generic identity-function example. The remaining descriptions still match.

`home-hero` retains its hand-written SVG. Delivered `s06-tracer` art takes
precedence over the hand-written missing-file fallback. Placeholder IDs: none.

Diagram note and decision surfaces use the card token so their labels retain
contrast in both site themes. The exporter emits the same token mapping and
omits unsupported language/runtime metadata; language comes from the page.
