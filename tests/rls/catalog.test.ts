import { existsSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { NON_USER_DATA_TABLES, USER_DATA_TABLES } from "@/server/data/registry";
import { publicClient, sql } from "./helpers";

// Catalog tests (NFR-1, NFR-2, D8, D12, D24.18, rule 6; BUILD F-1 "Tests"). They read Postgres's
// own catalogs, so a new table or function that skips a rule fails here even without its own test.

// Schemas Supabase manages; everything else is an app schema (BUILD F-1 "Tests").
const MANAGED = [
  "auth",
  "storage",
  "realtime",
  "_realtime",
  "extensions",
  "graphql",
  "graphql_public",
  "vault",
  "pgsodium",
  "pgsodium_masks",
  "net",
  "supabase_functions",
  "supabase_migrations",
  "cron",
  "pgbouncer",
  "_analytics",
  "pg_catalog",
  "information_schema",
  "pg_toast",
];

const db = sql();
afterAll(() => db.end());

async function appTables() {
  return db<{ schema: string; table: string; rls: boolean }[]>`
    select n.nspname as schema, c.relname as table, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname <> all(${MANAGED})
      and n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast_temp%'
    order by 1, 2`;
}
const name = (t: { schema: string; table: string }) => `${t.schema}.${t.table}`;

describe("every app table (NFR-1, NFR-2)", () => {
  it("has RLS enabled", async () => {
    const off = (await appTables()).filter((t) => !t.rls).map(name);
    expect(off).toEqual([]);
  });

  it("is in exactly one registry list", async () => {
    const registered = [...USER_DATA_TABLES, ...NON_USER_DATA_TABLES].map(name);
    expect(new Set(registered).size).toBe(registered.length);
    expect((await appTables()).map(name).sort()).toEqual(
      [...registered].sort(),
    );
  });

  it("gives anon no table privileges", async () => {
    const grants = await db<{ table: string; privilege: string }[]>`
      select table_schema || '.' || table_name as table, privilege_type as privilege
      from information_schema.role_table_grants
      where grantee = 'anon' and table_schema <> all(${MANAGED})`;
    expect(grants).toEqual([]);
  });
});

describe.each(USER_DATA_TABLES.map((t) => [name(t), t] as const))(
  "user-data table %s (D8, D12)",
  (_, t) => {
    it("lives in public and has its own RLS test file (D24.18, metric 3)", () => {
      expect(t.schema).toBe("public");
      expect(existsSync(`tests/rls/${name(t)}.test.ts`)).toBe(true);
    });

    it("has the restrictive MFA policy", async () => {
      const policies = await db`
      select policyname from pg_policies
      where schemaname = ${t.schema} and tablename = ${t.table}
        and permissive = 'RESTRICTIVE' and qual like '%mfa_satisfied%'`;
      expect(policies.length).toBeGreaterThanOrEqual(1);
    });

    it("has an ON DELETE CASCADE path to auth.users", async () => {
      const [row] = await db<{ reaches: boolean }[]>`
      with recursive chain(relid, depth) as (
        select ${`${t.schema}.${t.table}`}::regclass::oid, 0
        union
        select con.confrelid, chain.depth + 1
        from chain join pg_constraint con on con.conrelid = chain.relid
        where con.contype = 'f' and con.confdeltype = 'c' and chain.depth < 10
      )
      select exists (select 1 from chain where relid = 'auth.users'::regclass) as reaches`;
      expect(row?.reaches).toBe(true);
    });
  },
);

describe("functions (D3, D24.11, rule 6)", () => {
  const can = async (role: string, fn: string) =>
    (
      await db<
        { ok: boolean }[]
      >`select has_function_privilege(${role}, ${fn}, 'execute') as ok`
    )[0]!.ok;

  it.each([
    ["anon", "public.rate_limit_hit(text,integer,integer)"],
    ["authenticated", "public.rate_limit_hit(text,integer,integer)"],
    ["anon", "public.release_welcome_email(uuid)"],
    ["authenticated", "public.release_welcome_email(uuid)"],
    ["anon", "public.claim_welcome_email()"],
    ["anon", "public.mark_password_set()"],
  ])("%s can't execute %s", async (role, fn) => {
    expect(await can(role, fn)).toBe(false);
  });

  it("every security definer function in an app schema sets search_path = ''", async () => {
    const loose = await db<{ fn: string }[]>`
      select n.nspname || '.' || p.proname as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.prosecdef and n.nspname <> all(${MANAGED})
        and not coalesce(p.proconfig @> array['search_path=""'], false)`;
    expect(loose).toEqual([]);
  });
});

// Week-1 check 15: `private` must not be reachable through the Data API.
describe("the private schema", () => {
  it("isn't exposed through the Data API", async () => {
    // Untyped on purpose: `private` isn't in the generated API types, which is the point.
    const client = publicClient() as unknown as SupabaseClient;
    const { data, error } = await client
      .schema("private")
      .from("rate_limits")
      .select("*");
    expect(data).toBeNull();
    expect(error?.code).toBe("PGRST106");
  });
});
