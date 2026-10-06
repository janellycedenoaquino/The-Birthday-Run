# 0009. CI hardening after the first independent review

Date: 2026-09-28 · Status: accepted

## Context
D18 set CI to run on push and pull request, cancel in-progress runs and skip docs-only changes, and BUILD had gitleaks checked against the release's own checksum file. An independent code review of #27 (the first CI build, #6), then a fresh-eyes review of the first fix, found that together these leave gaps: a docs-only change (e.g. a key pasted into a README) was never secret-scanned; a replaced gitleaks release would pass its own checksum file; every commit on a PR branch ran CI twice (the first run hit container-image rate limits); and quick merges could cancel `main`'s runs, including queued ones (GitHub keeps one pending run per concurrency group). Dependabot also proposed `@types/node` 26 for Node 24, which passes CI and could be merged by mistake.

## Decision
- The secret scan moves to its own workflow, `secrets.yml`, on every push to any branch or tag, with no `paths-ignore`: a key is leaked the moment it reaches GitHub, merged or not. `ci.yml` keeps skipping docs-only changes.
- Both workflows run `on: push` only. That keeps FR-40 ("every push") and runs each commit once: a PR shows its branch's push runs, so no `pull_request` trigger.
- On a branch a newer push cancels the older run. On `main` each push has its own concurrency group (`github.sha`), so no run there is cancelled or dropped from the queue. CI checks the newest commit of each push, as usual; commits inside a multi-commit push have no result of their own.
- The gitleaks tarball's SHA-256 is pinned in `secrets.yml`. The value was taken from the v8.30.1 release checksums on 2026-09-28 (trust on first use): any later change to the asset fails the run. Dependabot can't track it, so the version and hash are bumped together by hand.
- Dependabot ignores major versions of `@types/node` (must match Node in `.nvmrc`) and `eslint` (`eslint-plugin-react`, bundled by `eslint-config-next`, crashes under ESLint 10: `contextOrFilename.getFilename is not a function` on the Dependabot PR). Other majors still arrive one PR each, for a D1 decision.
- The local-key export fails if `supabase status` fails or the keys are missing, and masks both keys (in case an app configures its own local keys).

## Alternatives
- Keep one workflow and drop `paths-ignore` entirely: every docs edit would pay for the full integration job (about 5 billed minutes).
- `pull_request` instead of branch pushes: a branch pushed without a PR would get no CI and no secret scan, against FR-40.
- The official gitleaks action: a licence question for organisation repos (D18's reason for the CLI).

## Consequences
About half the CI minutes per PR commit. A PR's checks test the branch as pushed, not its merge with `main`; the run on `main` after the merge catches the difference. D18's "push and PR, cancel-in-progress, docs-only skipped" is refined as above. BUILD "CI, deployment and migrations" and "Dependabot, hooks, `vercel.json`" updated. Revisit the two Dependabot ignores when `.nvmrc` moves to a new Node major and when a release of `eslint-plugin-react` supports ESLint 10 (Dependabot won't say). Week-1 check 14 (CI minutes) should be measured again on the next PR.
