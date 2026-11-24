# 0012. Plan ships before premium: everyone gets the free limits for now

Date: 2026-11-23 · Status: accepted (owner, day session)

## Context
F-6's limit triggers call `private.is_premium()` (FR-24, FR-25), which belongs to F-7 (premium
grants and subscriptions, Phase 4). BUILD orders the migrations F-7 before F-6, but the roadmap
builds Plan (Phase 3) first.

## Decision
- The `reward_groups` migration adds `private.is_premium(uuid)` returning false. F-7's migration
  replaces it with the real check (`create or replace`), so nobody is premium until then and
  the free limits (3 groups, 5 rewards each) apply to everyone.
- "Duplicate group" (FR-28, premium only) waits for F-7; free users never see the control.
- The limit triggers first refuse a row for anyone but the caller: BEFORE triggers run before
  RLS's WITH CHECK, so without it a user could lock another user's profile and learn from the
  error whether they were at the limit.

## Alternatives
- Build F-7's grants first (2–3 h extra before Plan): no user is premium yet, so nothing gained.

## Consequences
- F-7's PR replaces `private.is_premium`, adds Duplicate and the C-104 prompts (M-133, M-134).
- Over-limit (FR-40) can't happen before premium exists; the M-222 notice is wired anyway.
