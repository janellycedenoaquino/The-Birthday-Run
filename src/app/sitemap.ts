import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { env } from "@/server/env";
import { getSiteUrl } from "@/server/site-url";

// /sitemap.xml (BUILD F-3, FR-24): the public pages only. Discover and every non-retired
// retailer's page are public (decision 0017), so search engines can find each one. Read with
// the publishable key and no cookies, so Postgres runs it as `anon`: RLS itself keeps out any
// page a signed-out visitor can't open, whoever requests the sitemap, and no session is touched.
export const dynamic = "force-dynamic"; // read at request time; the build has no database

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const anon = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const { data: retailers, error } = await anon
    .from("retailers")
    .select("id, updated_at")
    .is("retired_at", null)
    .order("id");
  if (error)
    throw new Error("sitemap: could not read retailers", { cause: error });
  return [
    ...["/", "/discover", "/privacy", "/terms"].map((path) => ({
      url: `${site}${path === "/" ? "" : path}`,
    })),
    ...retailers.map((r) => ({
      url: `${site}/discover/${encodeURIComponent(r.id)}`,
      lastModified: r.updated_at,
    })),
  ];
}
