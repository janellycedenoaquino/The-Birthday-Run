# 0006. The production database secret lives in a `production` environment limited to main

Date: 2026-11-23 · Status: proposed (accepted once the owner has moved the secret)

## Context
`SUPABASE_DB_URL` (database owner access) was a repository-level Actions secret, used by `backup.yml` and, from PR 2, `retailers-import.yml`. Any workflow file on any branch can read a repository secret. So anyone, or any bot, that can push a branch (Grace's overnight branches included) could add an `on: push` workflow that reads it. An `if: github.ref == 'refs/heads/main'` only guards the one workflow it's written in. Found by the fresh-eyes review of PR 2.

## Decision
- Create a GitHub environment named `production` with a deployment-branch rule allowing only `main`.
- Move `SUPABASE_DB_URL` into it and delete the repository-level copy.
- Both jobs that need the secret declare `environment: production`.

## Alternatives
- Keep the repository secret and rely on review: a workflow on an unmerged branch runs without review, so review doesn't help.
- Required reviewers on the environment: stronger, but every nightly backup would wait for a click. Add it later if a second person or bot gets push access.

## Consequences
- A dispatched or pushed run from a non-main branch fails at the environment check instead of getting the secret.
- The owner does the settings change (repository Settings → Environments); until then the jobs still read the repository secret, because GitHub creates an unprotected environment on first use.
- Template follow-up: the same change belongs in the Template's `backup.yml` and README.
