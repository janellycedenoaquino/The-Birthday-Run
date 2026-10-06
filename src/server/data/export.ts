import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { appConfig } from "@/config/app";
import type { Database } from "@/lib/types/database.types";
import { USER_DATA_TABLES } from "./registry";

// The data export (BUILD F-11, FR-15, D13, NFR-16): every user-data registry table, read with the
// user's OWN client so RLS decides what's theirs (never the service role). No tokens, factor
// secrets or provider data (identity_data) in the file.

export type AccountDataExport = {
  format: "account-data-export";
  version: 1;
  exported_at: string;
  app: string;
  account: {
    id: string;
    email: string;
    created_at: string;
    email_confirmed_at: string | null;
    last_sign_in_at: string | null;
    providers: string[];
    mfa_enabled: boolean;
  };
  data: Record<string, Record<string, unknown>[]>;
};

export async function buildExport(
  supabase: SupabaseClient<Database>,
  user: User,
  now: Date,
): Promise<AccountDataExport> {
  const data: AccountDataExport["data"] = {};
  for (const { schema, table, ownerColumn } of USER_DATA_TABLES) {
    const { data: rows, error } = await supabase
      .from(table)
      .select("*")
      .eq(ownerColumn, user.id);
    if (error)
      throw new Error(`export: ${schema}.${table} failed`, { cause: error });
    data[`${schema}.${table}`] = rows ?? [];
  }
  return {
    format: "account-data-export",
    version: 1,
    exported_at: now.toISOString(),
    app: appConfig.name,
    account: {
      id: user.id,
      email: user.email ?? "",
      created_at: user.created_at,
      email_confirmed_at: user.email_confirmed_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      providers: [...new Set((user.identities ?? []).map((i) => i.provider))],
      mfa_enabled: (user.factors ?? []).some((f) => f.status === "verified"),
    },
    data,
  };
}

/** `<app-slug>-data-<YYYY-MM-DD>.json` (BUILD F-11; slug: name lowercased and hyphenated). */
export function exportFilename(now: Date): string {
  const slug =
    appConfig.name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "account";
  return `${slug}-data-${now.toISOString().slice(0, 10)}.json`;
}
