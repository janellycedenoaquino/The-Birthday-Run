# 0005. Podman works with the Supabase CLI (week-1 check 4)

Date: 2026-09-28 · Status: accepted

## Context
D23 made Podman the first choice on Fedora 44 and left Docker as the fallback if the Supabase CLI failed on it (supabase/cli #3099). Week-1 check 4 (BUILD "Week-1 checks") asks for a tested README Podman section, or Docker required.

## Decision
Podman stays the default; Docker isn't required. Tested on Fedora 44 with rootless Podman 5.8.7 and Supabase CLI 2.118.0 (npm devDependency), using the user socket and `DOCKER_HOST` from BUILD "README and CLAUDE.md deliverables", storage disabled (as F-1 plans) and the CI service exclusions: `supabase start` succeeded with no `--ignore-health-check` (about 1 minute on the first run, mostly image downloads), Auth health and Mailpit returned 200, Postgres reported 17.6 (D1), and `supabase db reset` and `supabase stop` succeeded. The test used a throwaway project; the repo's own `supabase/config.toml` comes with F-1 (#4).

## Alternatives
- Docker Engine: not needed; stays documented as the fallback (D23).

## Consequences
The README's "Local setup on Fedora" has the tested Podman steps. If a later CLI or Podman version breaks this, try `--ignore-health-check` first (#3099), then Docker, and record it in a new decision.
