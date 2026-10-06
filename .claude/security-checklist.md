# Security checklist

Shared by the `pre-commit-review` and `pre-push-review` skills. It lists what to look for in a diff, on top of the rules in `CLAUDE.md`. Keep it generic: it applies to every app made from this template. When a new kind of risk turns up, add it here so both reviews catch it.

**Secrets and config**
- Keys, tokens, passwords, private URLs or real emails in code, tests, fixtures, docs or comments
- Real values in `.env.example`; any `.env*` file (other than `.env.example`) being committed
- A secret moved into a `NEXT_PUBLIC_` variable, or a server-only module imported from client code
- Service-role client used where a user client would do, or with user-supplied IDs without an ownership check

**Database access**
- A new table in a migration **without** `enable row level security`, or without policies
- Policies that are too open: `using (true)`, missing `with check`, `to public`/`anon` on user data
- `security definer` functions without `set search_path`, or callable by anyone
- Raw SQL built by joining strings with user input
- New or changed tables with user data but no RLS test, or not covered by data export and account deletion
- *Supabase traps (from Supabase's official agent-skills, MIT):*
  - A new table left with Supabase's default grants: it's reachable through the Data API by `anon`/`authenticated`. Revoke first, then grant only the columns each role needs.
  - A view over user data without `with (security_invoker = true)`: views bypass RLS by default.
  - An UPDATE policy on a table with no matching SELECT policy for the same user: updates silently change 0 rows.
  - `auth.role()` in a policy (deprecated): use `to authenticated` / `to anon`. And `to authenticated` alone only checks that someone is signed in; it also needs an ownership condition like `(select auth.uid()) = owner_id`.
  - Authorization based on `user_metadata` / `raw_user_meta_data`: users can edit it.
  - A classic Supabase personal access token (full account access) in CI, scripts or an MCP config, instead of a scoped one.
- *Performance traps in the database* (a **should fix**, not a blocker): no index on the columns an RLS policy filters by, no index on a foreign key column, a list query with no limit or pagination, or a query per row in a loop (N+1).

**Server code leaking data** *(from Vercel's agent-skills `react-best-practices`, MIT)*
- Request or user data kept in a variable at module (file) level on the server: requests run concurrently, so one user's data can show up in another user's response. Keep it inside the request (function scope, React `cache()`).
- A whole database row or object passed to a client component or returned from a server action when the screen needs a few fields: every field is serialized into the page. Select and pass only the fields the screen shows, never private ones (payment handles, emails, internal IDs).

**Auth and input**
- Server actions, route handlers or protected pages without a server-side auth check, or trusting `getSession()` on the server
- Inputs not validated with Zod on the server (forms, params, search params, webhook bodies)
- Webhooks without signature verification
- `dangerouslySetInnerHTML` with anything a user can influence
- Redirects to a user-supplied URL without allowing only same-site paths
- Raw errors, stack traces or internal IDs sent back to the user; secrets or personal data written to logs or sent to Sentry (emails, tokens, request bodies, cookies)

**Protections weakened**
- Security headers or CSP loosened (e.g. `unsafe-inline`, `unsafe-eval`, wildcard sources), CORS set to `*`
- Rate limits or Turnstile removed or bypassed; sign-in errors that reveal whether an email exists
- Tokens stored in `localStorage`; cookie flags changed
- Storage buckets made public, or uploads without type and size checks
- CI checks, git hooks, `.gitignore` entries, tests or lint rules disabled or deleted

**Server-side fetches and file operations** *(from Addy Osmani's agent-skills `security-and-hardening`, MIT)*
- **SSRF:** the server fetches a URL a user can influence (add-an-item-by-link, link previews, image proxies, webhooks to user URLs) without: only `http`/`https`; resolving **all** DNS records and rejecting private, loopback, link-local (`169.254.169.254`) and unique-local addresses, IPv4 and IPv6; no redirects (or re-check each hop); a timeout and a response-size cap. Store-page fetches also return untrusted HTML: extract fields, never render it.
- **Destructive operations on derived paths:** a delete, move or overwrite whose target comes from a request, the database, a file name or another process, without all three: the resolved path (symlinks resolved) is under an allowlisted root, at least one level below that root, and ownership was checked before the operation. On refusal, log it and stop; never fall back to a broader path.

**Dependencies**
- New packages: is each one needed, well known and maintained? Watch for look-alike names (typosquats) and new `postinstall` scripts.
- Before adding one, check it isn't abandoned or archived (last release, open security advisories, `npm view <pkg> time repository`), and that it doesn't pull in a large tree of packages for a small job. *(Idea from Trail of Bits' supply-chain-risk-auditor.)*

**Things that break or get messy later** (mostly for commits)
- Files that shouldn't be in git: build output (`.next/`, `dist/`), `node_modules/`, logs, local database dumps, `.DS_Store`, editor folders, large binaries (over ~5 MB)
- Private key or certificate files (`*.pem`, `*.key`, `*.p12`, `id_rsa*`)
- Leftover merge conflict markers (`<<<<<<<`, `>>>>>>>`)
- Debug leftovers: `console.log` of data or secrets, `debugger`, `.only` / `.skip` in tests
- **An already-applied migration edited** instead of a new migration added. Migrations that ran on any database must never change; add a new one.
- Migrations changed without regenerating the Supabase TypeScript types
- `package.json` changed without the lockfile, or the lockfile changed with no `package.json` change and no reason
- Security code commented out "for now", or `TODO`s that disable a check
- New storage (tables in a new schema, buckets) not added to the backup script
