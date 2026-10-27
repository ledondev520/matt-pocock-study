#!/bin/bash
# Decide whether a PR may auto-merge as a knowledge-base data PR.
# Usage: scripts/ci/data-pr-policy.sh <base-sha> <head-sha>
# Env: HEAD_REF and HEAD_REPO (the PR's head branch and repository) and GITHUB_REPOSITORY.
#
# Reads git objects only; nothing from the PR is checked out or executed. Prints the allowlist
# report, then `sync=`, `allowlisted=`, `touches_data=` and `eligible=` (each true|false).
# eligible=true means: a same-repository sync/knowledge-* branch that only modifies allow-listed
# data files in place. Exit 1 when a sync branch changes anything else (a sync branch exists only
# to carry data), 2 on bad input, 0 otherwise.
set -euo pipefail
export LC_ALL=C
here=$(cd -- "$(dirname -- "$0")" && pwd)

: "${HEAD_REF?HEAD_REF is not set}" "${HEAD_REPO?HEAD_REPO is not set}" "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"

report=$("$here/data-pr-allowlist.sh" "${1:-}" "${2:-}")
printf '%s\n' "$report"
allowlisted=false
grep -qx 'allowlisted=true' <<< "$report" && allowlisted=true

# HEAD_REF is chosen by whoever opened the PR: only ever matched, never printed or evaluated.
sync=false
if [ "$HEAD_REPO" = "$GITHUB_REPOSITORY" ] && [[ $HEAD_REF =~ ^sync/knowledge-[A-Za-z0-9._-]+$ ]]; then sync=true; fi
eligible=false
if [ "$sync" = true ] && [ "$allowlisted" = true ]; then eligible=true; fi

echo "sync=$sync"
echo "eligible=$eligible"
if [ "$sync" = true ] && [ "$allowlisted" != true ]; then
  echo "sync/knowledge-* PRs may only modify allow-listed data files in place" >&2
  exit 1
fi
