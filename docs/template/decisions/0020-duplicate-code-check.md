# 0020. CI fails on new duplicate code

Date: 2026-11-23 · Status: accepted (user, 2026-11-23)

## Context
Copied code drifts: a fix lands in one copy and not the other. The daily refactor scan (`~/Projects/Refactor_Scans`) finds duplicates, but only as backlog tickets after the code is merged. The user wants a copy caught before merging, in every app.

## Decision
The `checks` job runs `npm run check:duplicates`: jscpd 5.4.3 (exact devDependency) with `--baseline-from-ref origin/main --fail-on-new-clones`.
- jscpd scans `origin/main` and the pushed commit with the same settings. **It fails only on clones `main` doesn't have**, so existing duplicates don't block work; they stay refactor-scan tickets. Moving code that is already duplicated doesn't count as new.
- Settings live in `.jscpd.json`. Left out: Markdown, JSON, `.github/**` (workflow jobs repeat their setup steps and YAML can't share them without a composite action), `supabase/migrations/**` (applied migrations are never edited, so a repeated policy block can't be refactored), `supabase/templates/**` and `src/lib/types/database.types.ts` (both generated).
- The `checks` checkout uses `fetch-depth: 0`, so `origin/main` exists in the runner.
- **Fix a failure** by moving the shared code into one function or component and calling it from both places. Run `npm run check:duplicates` locally to see the clone (compares against your local `origin/main`, so `git fetch` first).

## Limits
- It finds code that looks the same (exact copies, at least 5 lines and 50 tokens by default), not code that does the same thing written differently. Those stay with the refactor scan.
- Editing a block that is already duplicated can change its fingerprint, so it counts as new. Fix it then: the code is open anyway.
- On `main` itself it compares `main` with `main`, so it never fails there. A copy made by two branches merged around the same time isn't caught until the refactor scan.

## Alternatives
- **A committed baseline file** (`--baseline .jscpd-baseline.json`): has to be regenerated whenever duplicates are fixed. `--baseline-from-ref` builds it fresh each run.
- **Fail on any duplicate:** every app would need its existing duplicates cleaned up before anything else could merge. Refused by the user.
- **A Claude review in CI for same-purpose code:** API cost per push and an `ANTHROPIC_API_KEY` secret in each repo. Refused by the user; the daily refactor scan covers it.
