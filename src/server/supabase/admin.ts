import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { env } from "@/server/env";

// The secret-key client (BUILD §0.7, D21, rule 6): bypasses RLS. Only three callers, enforced by
// ESLint (BUILD §0.1): the rate limiter's RPC, the welcome-email release (F-5) and deleteAccount
// (F-11). Never with a user-supplied ID. No session of its own.
let client: ReturnType<typeof createClient<Database>> | undefined;

export function getAdminClient() {
  client ??= createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  return client;
}
