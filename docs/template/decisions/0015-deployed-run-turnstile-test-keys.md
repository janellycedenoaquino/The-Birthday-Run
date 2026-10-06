# 0015. The deployed journey runs with Turnstile's test keys (v1 sign-off)

Date: 2026-09-29 · Status: accepted

## Context
Metric 2 (SPEC §2.1) needs the FR-39 journey to pass once against the deployed throwaway app. On the sign-off run, Turnstile with the app's real keys showed Playwright's Chromium the "Verify you are human" box, and still failed ("The security check didn't work", M-6) after a person ticked it, headed. Cloudflare refuses automated browsers by design, so no test setting fixes that.

## Decision
- For the deployed run only, the app uses Cloudflare's documented always-pass pair: site key `1x00000000000000000000AA` (Vercel, then redeploy) and secret `1x0000000000000000000000000000000AA` (Supabase Auth CAPTCHA). Only before real users arrive; the real keys go back afterwards and the widget is checked (README "start a new app", step 9; `docs/LAUNCH_CHECKLIST.md`: no test keys).
- The real Turnstile is checked by a person instead: the manual sign-up in the Orca pass (NFR-23) used the real keys, and the widget, hostnames and CSP (`challenges.cloudflare.com`) all worked.
- Deployed runs wait up to 15 minutes for each pasted email link (was 5) and 30 minutes for the whole journey (was 3): a person finds each email (it may land in spam) and pastes its link.

## Alternatives
- Real keys with a person ticking the box: refused by Cloudflare, as above.
- A Turnstile bypass in the app for tests: a hole that would ship with every app. Rejected (rule 14).

## Consequences
The deployed run shows everything but Turnstile working on the live stack; Turnstile on the live stack is a manual check. Leaving the test keys on turns bot protection off, so the README step ends with putting the real keys back.
