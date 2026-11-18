# 0004. Own local Supabase name and ports

Date: 2026-10-06 · Status: accepted

## Context
The Template's local Supabase uses `project_id = "template"` and ports 54320–54329. WishJar (also from the Template) uses the same ports, so both local stacks can't run at once ("address already in use"), and the owner works on both every day.

## Decision
This repo's local stack is `project_id = "thebirthdayrun"` on ports **54420–54429** (API 54421, DB 54422, Studio 54423, Mailpit 54424, analytics 54427, pooler 54429, shadow 54420). `.env.example`, CI and the local test fallbacks use them. Production is unaffected.

## Alternatives
- Stop one stack before starting the other: works, but a daily chore.

## Consequences
Local URLs differ from the Template's README by 100. Note (2026-10-06): with both stacks up, rootless Podman + Supabase CLI 2.118–2.120 fails to start the **second** stack's PostgREST ("failed to copy secret file into container … broken pipe"); everything else starts. Until that's solved, start one stack at a time. Worth offering back to the Template: each new app picks its own port range.
