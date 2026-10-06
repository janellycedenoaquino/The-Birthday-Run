import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import type { Database } from "@/lib/types/database.types";
import { LOCAL_DB_URL } from "./global-setup";

// Fixtures for the rls project (BUILD F-1 "Tests"): users through the admin API, clients on
// the publishable key so every query goes through PostgREST, grants and RLS like the app.

// Cloudflare's dummy token: accepted by the always-pass test secret in local .env.local (D4).
export const CAPTCHA_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
export const PASSWORD = "a-long-test-password-123";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`RLS tests need ${name} (README "Local setup")`);
  return value;
};
const options = { auth: { persistSession: false, autoRefreshToken: false } };

export type Client = SupabaseClient<Database>;
export const publicClient = (): Client =>
  createClient<Database>(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    options,
  );
export const adminClient = (): Client =>
  createClient<Database>(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SECRET_KEY"),
    options,
  );

/** Direct database access for catalog queries (as `postgres`). */
export const sql = () => postgres(LOCAL_DB_URL, { max: 1, onnotice: () => {} });

export const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

export type TestUser = { id: string; email: string; client: Client };

/** A signed-in client for an existing user (password sign-in, aal1). */
export async function signIn(
  email: string,
  password = PASSWORD,
): Promise<Client> {
  const client = publicClient();
  const { error } = await client.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: CAPTCHA_TOKEN },
  });
  if (error)
    throw new Error(
      `sign-in failed for ${email}: ${error.code ?? error.message}`,
    );
  return client;
}

/** A confirmed user with a password, signed in, with `mark_password_set` done. */
export async function createUser(label: string): Promise<TestUser> {
  const email = uniqueEmail(label);
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    email_confirm: true,
    password: PASSWORD,
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  const client = await signIn(email);
  const { error: markError } = await client.rpc("mark_password_set");
  if (markError)
    throw new Error(`mark_password_set failed: ${markError.message}`);
  return { id: data.user.id, email, client };
}

export async function deleteUsers(
  ...users: (TestUser | { id: string } | undefined)[]
) {
  const admin = adminClient();
  for (const user of users)
    if (user) await admin.auth.admin.deleteUser(user.id);
}

/**
 * Confirms through the newest local Mailpit email to `email`, the way the app's /auth/confirm
 * does (BUILD F-6): our templates link to `/auth/confirm?token_hash=…&type=…` (F-5), so this
 * reads those two values and calls verifyOtp. Returns the signed-in client.
 */
export async function confirmFromEmail(email: string): Promise<Client> {
  const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const { messages } = (await search.json()) as {
      messages?: { ID: string }[];
    };
    if (messages?.length) {
      const message = (await (
        await fetch(`${mailpit}/api/v1/message/${messages[0]!.ID}`)
      ).json()) as { HTML: string };
      const href = /href="([^"]*\/auth\/confirm\?[^"]*)"/.exec(
        message.HTML,
      )?.[1];
      if (!href) throw new Error(`no confirm link in the email to ${email}`);
      const link = new URL(href.replace(/&amp;/g, "&"));
      const type = link.searchParams.get("type");
      if (type !== "signup" && type !== "magiclink" && type !== "recovery")
        throw new Error(`unexpected link type: ${type}`);
      const client = publicClient();
      const { error } = await client.auth.verifyOtp({
        token_hash: link.searchParams.get("token_hash") ?? "",
        type,
      });
      if (error)
        throw new Error(`verifyOtp failed: ${error.code ?? error.message}`);
      return client;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no email to ${email} in Mailpit`);
}
