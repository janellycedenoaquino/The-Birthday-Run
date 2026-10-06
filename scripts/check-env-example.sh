#!/usr/bin/env bash
# Fails if .env.example contains anything that looks like a real value.
# .env.example must only hold variable names with placeholders:
#   KEY=                      (empty)
#   KEY=<your-something>      (angle-bracket placeholder)
#   KEY=http://localhost:3000 (local default; also 127.0.0.1)
#   KEY=true | false | development | test | production | a short number (e.g. a port)
# Runs in the pre-commit hook (.githooks/pre-commit) and in CI.
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
EXAMPLE=".env.example"

if [[ ! -f "$EXAMPLE" ]]; then
  echo "check-env-example: no $EXAMPLE yet, nothing to check."
  exit 0
fi

fail=0
report() { echo "  $EXAMPLE:$1: $2"; fail=1; }

is_allowed() {
  local v="$1"
  [[ -z "$v" ]] && return 0
  [[ "$v" =~ ^\<[^\>]+\>$ ]] && return 0
  [[ "$v" =~ ^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?(/.*)?$ ]] && return 0
  [[ "$v" =~ ^(true|false|development|test|production)$ ]] && return 0
  [[ "$v" =~ ^[0-9]{1,5}$ ]] && return 0
  return 1
}

is_plain_default() {
  [[ "$1" =~ ^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/?$ ]] && return 0
  [[ "$1" =~ ^(true|false|development|test|production)$ ]] && return 0
  [[ "$1" =~ ^[0-9]{1,5}$ ]]
}

# Values from local env files, to catch copies of real values.
declare -A local_values=()
for f in .env .env.local .env.development.local .env.production.local .env.test.local; do
  [[ -f "$f" ]] || continue
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == *=* ]] || continue
    v="${line#*=}"; v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
    [[ ${#v} -ge 6 ]] && local_values["$v"]="$f"
  done < "$f"
done

n=0
while IFS= read -r line || [[ -n "$line" ]]; do
  n=$((n + 1))
  # Real-looking secrets anywhere, including comments: JWTs, Resend, Stripe, GitHub, Google keys.
  if [[ "$line" =~ eyJ[A-Za-z0-9_-]{10,}\. || "$line" =~ (re_|sk_live_|sk_test_|rk_live_|ghp_|github_pat_|AIza)[A-Za-z0-9_-]{8,} ]]; then
    report "$n" "looks like a real key or token"
    continue
  fi
  [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
  if [[ "$line" != *=* ]]; then
    report "$n" "not a KEY=value line"
    continue
  fi
  key="${line%%=*}"; v="${line#*=}"
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  # Plain local defaults may match .env.local: a bare localhost address (no path or query, which
  # could carry a token), true/false-style words and short numbers. Anything else that matches was copied.
  if [[ -n "$v" && -n "${local_values[$v]:-}" ]] && ! is_plain_default "$v"; then
    report "$n" "$key has the same value as in ${local_values[$v]} (real value copied)"
  elif ! is_allowed "$v"; then
    report "$n" "$key has a value that isn't a placeholder. Use empty, <your-...> or a localhost default"
  fi
done < "$EXAMPLE"

if [[ $fail -ne 0 ]]; then
  echo "check-env-example: FAILED. $EXAMPLE must only contain placeholders, never real values."
  echo "If a real key was ever committed, rotate it in its service; deleting it from git is not enough."
  exit 1
fi
echo "check-env-example: OK"
