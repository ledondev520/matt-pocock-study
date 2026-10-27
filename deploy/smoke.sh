#!/bin/bash
# Public smoke test after a deploy: every path must answer 200 (retries for up to ~60 s).
# Usage: deploy/smoke.sh https://matt.withkeya.com
set -uo pipefail
base=${1:?usage: smoke.sh <base-url>}
paths=(/ /zh /en /llms.txt /api/health)
fail=0
for path in "${paths[@]}"; do
  code=000
  for _ in $(seq 1 12); do
    code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -H 'Cache-Control: no-cache' "$base$path" 2>/dev/null) || code=000
    [ "$code" = 200 ] && break
    sleep 5
  done
  echo "$code $path"
  [ "$code" = 200 ] || fail=1
done
exit "$fail"
