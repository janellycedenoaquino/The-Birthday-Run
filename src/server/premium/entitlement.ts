import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import type { Database } from "@/lib/types/database.types";
import { logError } from "@/server/errors";

/**
 * FR-35 (D5): the one premium answer for the signed-in caller, once per request (React cache,
 * keyed on the request's client). An error is logged and reads as free: it fails closed.
 */
export const getEntitlement = cache(
  async (supabase: SupabaseClient<Database>): Promise<{ premium: boolean }> => {
    const { data, error } = await supabase.rpc("is_premium");
    if (error) {
      logError(error, { op: "getEntitlement" });
      return { premium: false };
    }
    return { premium: data === true };
  },
);
