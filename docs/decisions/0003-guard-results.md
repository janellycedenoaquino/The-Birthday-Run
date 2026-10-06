# 0003. Guards gain `not_onboarded` and `not_premium` results

Date: 2026-10-06 · Status: accepted

## Context
The app adds two access levels on top of the Template's `user` (BUILD §0.2): `onboarded` (FR-6) and `premium` (FR-35). Their refusals need to flow through the Template's `GuardFailure` type and `runAction` like the existing ones.

## Decision
Add `not_onboarded` (BR-1) and `not_premium` (BR-2) to `GuardFailure`, handled by `runAction`, with `requireOnboarded()` and `requirePremium()` next to the Template's guards.

## Alternatives
- Checks inside each action returning ad-hoc errors: easy to forget one (metric 2).

## Consequences
A small edit to Template code (`src/server/auth/guards.ts`, `src/server/run-action.ts`). Worth offering back to the Template as a generic "extra guard levels" hook.
