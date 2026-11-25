import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShowcaseRetailer } from "@/lib/retailers/showcase";
import type { Database } from "@/lib/types/database.types";
import { logError } from "@/server/errors";

// The live retailers the decorative backgrounds show (decision 0016: the landing tunnel, the
// sign-in wall, the rotating reward). Public catalogue (decision 0017): RLS returns only live
// retailers, whoever asks. Retailers without a logo are counted but not shown.

export async function getShowcase(
  supabase: SupabaseClient<Database>,
): Promise<{ total: number; withLogos: ShowcaseRetailer[] }> {
  const { data, error } = await supabase
    .from("retailers")
    .select("id, name, logo_file, reward_description")
    .is("retired_at", null);
  // Decoration only: a failed read leaves the background empty, logged, never an error page.
  if (error) logError(error, { op: "catalog.showcase" });
  const rows = data ?? [];
  return {
    total: rows.length,
    withLogos: rows.flatMap((r) =>
      r.logo_file
        ? [
            {
              id: r.id,
              name: r.name,
              logoFile: r.logo_file,
              reward: r.reward_description,
            },
          ]
        : [],
    ),
  };
}

/** A fresh order per request (Fisher–Yates). */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
