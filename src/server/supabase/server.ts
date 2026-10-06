import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import type { Database } from "@/lib/types/database.types";
import { env } from "@/server/env";

// The user's Supabase client (BUILD §0.7, D21): the publishable key plus the session cookies, so
// RLS applies as that user. Cookie flags are forced (HttpOnly, Secure, SameSite=Lax; rule 17),
// the same object the proxy uses. There is no browser client.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: sessionCookieOptions(env.NEXT_PUBLIC_SITE_URL),
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet)
              cookieStore.set(name, value, {
                ...options,
                ...sessionCookieOptions(env.NEXT_PUBLIC_SITE_URL),
              });
          } catch {
            // Server Components can't set cookies; the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}
