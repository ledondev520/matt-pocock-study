#!/bin/bash
# Decide whether a PR only touches allow-listed data files.
# Usage: scripts/ci/data-pr-allowlist.sh <base-sha> <head-sha>
# Prints one line per changed path (shell-quoted with %q, so a file name can never start a
# line or smuggle a newline into the log) and finally `allowlisted=true|false` and
# `touches_data=true|false`. Exit 0 either way; exit 2 on bad input.
#
# A change counts as allow-listed only when it is a plain in-place modification (status M,
# regular file mode 100644 before and after) of a path in ALLOWLIST. Renames, copies, new or
# deleted files, mode changes, symlinks and submodules are never allow-listed, and neither is
# anything under .github/ (workflows are not data).
#
# CI runs the copy of this script from the base branch (pull_request_target, see
# .github/workflows/data-pr-policy.yml) and only reads the PR's git objects, so a PR cannot
# change the rules it is judged by.
set -euo pipefail
export LC_ALL=C
readonly ALLOWLIST=(data/knowledge-base.json)

base=${1:?usage: data-pr-allowlist.sh <base-sha> <head-sha>}
head=${2:?usage: data-pr-allowlist.sh <base-sha> <head-sha>}
for ref in "$base" "$head"; do
  [[ $ref =~ ^[0-9a-f]{40}$ ]] || { echo "not a full sha: $ref" >&2; exit 2; }
done

allowed() {
  local path=$1 item
  for item in "${ALLOWLIST[@]}"; do [ "$path" = "$item" ] && return 0; done
  return 1
}

ok=true data=false count=0
# -z keeps odd file names intact; -M/-C report renames and copies instead of hiding them.
while IFS= read -r -d '' meta; do
  IFS= read -r -d '' path
  # meta = ":<oldmode> <newmode> <oldsha> <newsha> <status>"
  read -r old_mode new_mode _ _ status <<< "${meta#:}"
  if [[ $status == R* || $status == C* ]]; then
    IFS= read -r -d '' to
    printf 'not allowed (%s rename/copy): %q -> %q\n' "$status" "$path" "$to"; ok=false; count=$((count + 1)); continue
  fi
  count=$((count + 1))
  if allowed "$path"; then data=true; fi
  if [ "$status" = M ] && [ "$old_mode" = 100644 ] && [ "$new_mode" = 100644 ] && allowed "$path"; then
    printf 'allowed: %q\n' "$path"
  else
    printf 'not allowed (%s %s->%s): %q\n' "$status" "$old_mode" "$new_mode" "$path"; ok=false
  fi
done < <(git diff --raw -z --no-abbrev --no-ext-diff --no-textconv -M -C "$base...$head")

[ "$count" -gt 0 ] || ok=false
echo "allowlisted=$ok"
echo "touches_data=$data"
