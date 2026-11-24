// Grants or revokes premium by email (BUILD F-7 `grant-premium`, FR-36, D5). The owner's tool:
// it runs as the database owner and is not callable from the app.
//   npm run grant-premium -- grant <email>                      # local Supabase
//   npm run grant-premium -- revoke <email> --target=production  # needs SUPABASE_DB_URL
// It never touches subscriptions (FR-36: revoke doesn't cancel a paid plan).
import postgres from "postgres";
import { z } from "zod";

export const LOCAL_DB_URL =
  "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

// The app's email rule is in src/lib/validation/auth.ts, which uses the "@/" alias Node's type
// stripping can't resolve; this is the same check without the catalogue message.
const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export type Outcome =
  "granted" | "already granted" | "revoked" | "no active grant";

export class GrantError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.exitCode = exitCode;
  }
}

/** Grants or revokes for the one account with that email; returns what happened and its id. */
export async function setPremium(
  sql: postgres.Sql,
  rawEmail: string,
  mode: "grant" | "revoke",
): Promise<{ outcome: Outcome; userId: string }> {
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) throw new GrantError("invalid email", 2);
  const users = await sql<{ id: string }[]>`
    select id from auth.users where lower(email) = ${email.data}`;
  if (users.length !== 1) throw new GrantError("unknown email", 1);
  const userId = users[0]!.id;

  if (mode === "grant") {
    // A new grant, or a revoked one turned back on; an active one is left as it is.
    const rows = await sql`
      insert into public.premium_grants (user_id) values (${userId})
      on conflict (user_id) do update
        set revoked_at = null, granted_at = now()
        where premium_grants.revoked_at is not null
      returning user_id`;
    return { outcome: rows.length ? "granted" : "already granted", userId };
  }
  const rows = await sql`
    update public.premium_grants set revoked_at = now()
    where user_id = ${userId} and revoked_at is null
    returning user_id`;
  return { outcome: rows.length ? "revoked" : "no active grant", userId };
}

export function parseArgs(argv: string[]) {
  const flags = argv.filter((a) => a.startsWith("--"));
  const [mode, email, ...extra] = argv.filter((a) => !a.startsWith("--"));
  if ((mode !== "grant" && mode !== "revoke") || !email || extra.length)
    throw new GrantError(
      "usage: grant-premium <grant|revoke> <email> [--target=production]",
      2,
    );
  let target: "local" | "production" = "local";
  for (const flag of flags) {
    const m = /^--target=(local|production)$/.exec(flag);
    if (!m) throw new GrantError(`unknown flag: ${flag}`, 2);
    target = m[1] as "local" | "production";
  }
  return { mode, email, target } as const;
}

/** Local never reads SUPABASE_DB_URL, so a shell with the production URL set can't write there. */
export function databaseUrl(
  target: "local" | "production",
  envUrl: string | undefined,
): string {
  if (target === "local") return LOCAL_DB_URL;
  if (!envUrl)
    throw new GrantError("--target=production needs SUPABASE_DB_URL", 1);
  return envUrl;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = databaseUrl(args.target, process.env.SUPABASE_DB_URL);
  const sql = postgres(url, {
    max: 1,
    onnotice: () => {},
    ssl: args.target === "production" ? "require" : false,
  });
  try {
    const { outcome, userId } = await setPremium(sql, args.email, args.mode);
    console.log(`${outcome} ${userId}`);
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    if (e instanceof GrantError) {
      console.error(`grant-premium: ${e.message}`);
      process.exit(e.exitCode);
    }
    // Never print connection details (as import-retailers): data errors only, else the code.
    const code = (e as { code?: unknown })?.code;
    console.error(
      `grant-premium: failed${typeof code === "string" ? ` (${code})` : ""}`,
    );
    process.exit(1);
  });
}
