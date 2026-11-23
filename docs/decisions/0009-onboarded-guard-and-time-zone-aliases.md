# 0009. The `onboarded` guard, Phase 1 onboarding, and time-zone aliases

Date: 2026-11-23 · Status: accepted (owner, day session)

## Context
BUILD F-2 adds the app's `onboarded` level to the Template guards (a `not_onboarded` failure, its page target and its refusal), and asks for a decision entry because it changes Template code. Two more things came up while building PR 4:
- The owner moved onboarding step 2 (programs) to Phase 2, so Phase 1 has step 1 only.
- Node's ICU lists older time-zone names (`Asia/Calcutta`, `Europe/Kiev`) while browsers report the current ones (`Asia/Kolkata`, `Europe/Kyiv`). Checking against `Intl.supportedValuesOf("timeZone")` would refuse those users' detected zone.

## Decision
- **Guard:** `GuardFailure` gains `not_onboarded`. Pages go to `/onboarding` with no `next` (it's a destination, not a step to come back from); `runAction` maps it to BR-1. `requireOnboarded()` lives in `src/server/auth/app-guards.ts` and reads the profile once per request.
- **Phase 1 onboarding:** step 1 saves birthday and time zone and goes to the dashboard. `onboarded_at` stays empty; Phase 2's step 2 sets it, and `/onboarding` will show step 2 to anyone whose `onboarded_at` is empty, including everyone who signed up before it existed.
- **Time zones:** accept any IANA name (Area/Location, or UTC) the runtime's `Intl.DateTimeFormat` recognizes and store its `resolvedOptions().timeZone`, so an alias and its current name are stored the same way. Offsets (`+05:30`) and abbreviations (`EST`), which `Intl` also accepts, get BR-19, as do unknown names.
- **The database checks the zone too.** The column grant lets a signed-in user write `time_zone` straight through the Data API, past Zod. A bad value would break every date page for that user and the shared reminder job, so `profiles.time_zone` has the same pattern as a check and a trigger that refuses names Postgres's `pg_timezone_names` doesn't know (it knows old and new names).
- **Step 1 runs once:** `saveOnboarding` is a no-op once birthday and zone are saved, so it isn't a second birthday endpoint with its own rate limit; Settings is the place to change them (FR-9). A birthday saved without a zone is pre-filled on `/onboarding`.

## Alternatives
- Keep the list check (BUILD's first version): Kolkata and Kyiv users would see the picker instead of their detected zone, every time.
- Build step 2 now: it needs F-3's enroll operation and the retailer list, which are Phase 2.

## Consequences
- Template follow-up: the `not_onboarded`-style extension point may be worth moving into the Template's guards.
- BUILD F-2 "States and edge cases" updated for aliases.
- Test users made by `tests/rls/helpers.createUser` get a birthday by default, so Template-era e2e tests still land on the dashboard; UI sign-ups go through `/onboarding`.
