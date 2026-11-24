# 0015. Reminder job: definer reads and fail-closed optional secrets

Date: 2026-11-24 · Status: accepted (F-12 build)

## Context
BUILD F-12 has the daily job batch-read enrollments and pickups with the admin (service_role)
client. In production the Supabase project has auto-grant off, and no migration grants
service_role anything on `enrollments` or `pickups`, so those reads would fail there while
passing locally (local still auto-grants). BUILD §0.6 also lists `CRON_SECRET` and
`REMINDER_UNSUBSCRIBE_SECRET` as server secrets; making them required would break the
production build, and every local setup without them, the moment this merged.

## Decision
- Two definer functions, `reminder_rewards(uuid[])` and `reminder_pickups(uuid[], date)`,
  executable by service_role only, return exactly the columns the job needs. No new table
  grants. `reminder_log` gets explicit service_role select/insert/delete.
- Both secrets are optional in the env schema and fail closed: without `CRON_SECRET` the cron
  route refuses every call (401); without `REMINDER_UNSUBSCRIBE_SECRET` no turn-off link can be
  made, so no reminder is sent and every token reads as invalid. CI generates both. The
  launch checklist has the Vercel step.

## Alternatives
- Grant service_role `select` on enrollments and pickups: wider than the job needs.
- Required secrets: forget-proof, but they would block deploys until set.

## Consequences
- Until the owner adds the two Vercel variables, the cron runs and answers 401; nothing sends.
