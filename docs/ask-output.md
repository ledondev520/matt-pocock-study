# Ask output contract

The model returns JSON. It writes its own explanation and may select a quote using a marker:

```json
{"found":true,"title":"Review changes","points":[{"title":"Check scope","text":"Review one reversible change at a time.","sources":["S1"],"quote":{"chunk_id":"S1","start":0,"end":12}}]}
```

`buildMessages` supplies `quote_chunks` with request-local ids and exact JSON text. A post's
body is `S1`; verified methodology anchors are `S1:Q1`, `S1:Q2`, etc. Offsets use JavaScript
UTF-16 indexing into the **decoded quote chunk text**, start inclusive and end exclusive.
JSON escaping does not change those offsets. The generated post-chunk heading is excluded.
Only a chunk owned by one of the point's cited sources may be selected. Method explanations,
notes and summaries are never quote chunks. A model-written quote string is discarded.

The server slices the original text without normalizing or rewriting it and adds the original
post URL from retrieval metadata. Invalid markers are discarded, including unsafe integers,
out-of-range offsets, surrogate splits and extra fields. An individual quote must fit 240
Unicode code points, 25 words, 50 Han characters and two sentences. The same limits apply to
the sum of all emitted quotes from one original post. Query strings, fragments and a trailing
slash do not create a new budget. Repeated or overlapping extracts consume budget each time
they are emitted. Exceeding a combined budget rejects the answer.

Explanations do not have a copying allowance. A conservative fixed-size character fingerprint
guard checks the answer title, point titles/text and citation titles against **all** retrieved
post bodies/titles and verified anchors, including uncited sources. It uses NFKC/case folding,
letter/number fingerprints with punctuation and format characters removed, and a separate
symbol stream. It checks across response fields and scan slices. It does not reconstruct or
count copied intervals. Common text can trigger a conservative downgrade; it is a fallback
check, not a proof that every possible transformation is independent prose.

On suspicion, the server drops every explanation and title together. Only validated extracts
and links survive. If there are no extracts, the response contains source links only. Search
fallbacks also contain links only. Degraded and rejected responses are never cached. Normal
independent explanations and short marker quotes remain cacheable. The policy version is
`methodology-v7-extract-markers`; retrieval content and source metadata still participate in
the cache digest, so corrected inputs and this policy change invalidate previous answers.

The guard scans linearly in the total retrieved/output length and yields every 4096 source
UTF-16 units. It fails closed above one million source units or 24,000 explanation units;
model JSON is capped at 32,000 units and the upstream envelope at 65,536 bytes. Performance
regressions cover eight 20k sources, repeated 8k text, eight 100k sources, scan boundaries,
unmatched Markdown/HTML, total runtime and timer latency. Timings have a CI margin; the
validation never performs the former answer-length × source-length dynamic program.

No chunk schema change or JSONL rebuild is required. Quote ids are generated after retrieval.
The existing optional rebuild command remains:

```sh
npm run build:ask-chunks -- --dataset "$ASK_DATASET_DIR" --out "$ASK_CHUNKS_OUT"
# Add --rules "$ASK_RULES_FILE" when using methodology mapping rules.
```

Keep the dataset and generated JSONL outside the repository. Deploy the matching site manifest
and index and restart the ask service. When rolling back, empty only the answer cache while
stopped; preserve rate counters and metadata.
