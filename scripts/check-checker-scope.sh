#!/usr/bin/env bash
# Checker branch scope (DESIGN D16, BUILD F-13 "Checker contract", NFR-11). Fails unless:
#   - the branch is named checker/<retailer-id>-<yyyy-mm-dd>,
#   - it changes no file but data/retailers.csv since it left <base>, and
#   - every changed CSV line is that retailer's row (starts with "<retailer-id>,").
# Usage: scripts/check-checker-scope.sh <branch-name> [base-ref, default origin/main]
# Runs in .github/workflows/checker-scope.yml.
set -euo pipefail

branch="${1:?usage: check-checker-scope.sh <branch-name> [base-ref]}"
base_ref="${2:-origin/main}"
csv="data/retailers.csv"
fail() {
  echo "::error::checker scope (D16): $1"
  exit 1
}

# The date is the last 10 characters; the ID is the slug before it (retailerIdSchema).
[[ "$branch" =~ ^checker/(.+)-([0-9]{4}-[0-9]{2}-[0-9]{2})$ ]] ||
  fail "branch '$branch' isn't checker/<retailer-id>-<yyyy-mm-dd>"
id="${BASH_REMATCH[1]}"
[[ "$id" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ && ${#id} -le 64 ]] ||
  fail "'$id' isn't a retailer ID"

base=$(git merge-base "$base_ref" HEAD)
others=$(git diff --name-only --no-renames "$base" HEAD | grep -vx "$csv" || true)
[[ -z "$others" ]] || fail "only $csv may change; also changed: $(echo $others)"

# Changed lines only (no context), without the +++/--- file headers.
bad=$(git diff -U0 "$base" HEAD -- "$csv" |
  grep -E '^[+-]' | grep -vE '^(\+\+\+|---) ' |
  grep -vE "^[+-]${id}," || true)
[[ -z "$bad" ]] || fail "only the '$id' row may change; other changed lines: $(echo "$bad" | head -3 | cut -c1-60 | tr "\n" " ")"

echo "checker scope: only the '$id' row of $csv changed"
