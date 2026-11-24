import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LatLng } from "@/lib/route/distance";
import type { StoreCandidate } from "@/lib/route/stops";
import type { Database } from "@/lib/types/database.types";
import { logError } from "@/server/errors";

// Store search (BUILD F-10, §0.8; D11): nearby_stores is a definer function that refuses free
// users. supabase-js sends rpc as POST, so the coordinates never reach query logs (T-111).

/** A-15: the most stores per brand the swap rounds choose from. */
const PER_BRAND = 5;

export type NearbyResult =
  | { failed: false; stores: Map<string, StoreCandidate[]> }
  | { failed: true; notPremium: boolean };

export async function findNearbyStores(
  supabase: SupabaseClient<Database>,
  start: LatLng,
  retailerIds: string[],
): Promise<NearbyResult> {
  const { data, error } = await supabase.rpc("nearby_stores", {
    p_lat: start.lat,
    p_lng: start.lng,
    p_retailer_ids: retailerIds,
    p_per_brand: PER_BRAND,
  });
  if (error) {
    if (error.message === "not_premium") return { failed: true, notPremium: true };
    // Logged without the arguments: the start point never goes to Sentry (NFR-3).
    logError(new Error(`nearby_stores failed: ${error.code ?? "unknown"}`), {
      op: "findNearbyStores",
    });
    return { failed: true, notPremium: false };
  }
  const stores = new Map<string, StoreCandidate[]>();
  for (const s of data ?? []) {
    const address = [s.address, s.city, [s.state, s.postal_code].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
    const list = stores.get(s.retailer_id) ?? [];
    list.push({
      retailerId: s.retailer_id,
      storeId: s.store_id,
      storeName: s.name,
      address: address || null,
      lat: s.lat,
      lng: s.lng,
    });
    stores.set(s.retailer_id, list);
  }
  return { failed: false, stores };
}

/** A ZIP's centroid and state, or null if unknown. Throws on not_premium/other errors. */
export async function zipLocation(
  supabase: SupabaseClient<Database>,
  zip: string,
): Promise<{ lat: number; lng: number; state: string } | null> {
  const { data, error } = await supabase.rpc("zip_location", { p_zip: zip });
  if (error) throw rpcError("zip_location", error);
  const row = data?.[0];
  return row ? { lat: row.lat, lng: row.lng, state: row.state } : null;
}

/** The state of the ZIP nearest to a point (FR-5), or null. */
export async function stateAt(
  supabase: SupabaseClient<Database>,
  at: LatLng,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("zip_location", { p_lat: at.lat, p_lng: at.lng });
  if (error) throw rpcError("zip_location", error);
  return data?.[0]?.state ?? null;
}

export class NotPremiumError extends Error {}

function rpcError(fn: string, error: { message: string; code?: string }) {
  if (error.message === "not_premium") return new NotPremiumError(fn);
  // No arguments in the message: they're a location (NFR-3).
  return new Error(`${fn} failed: ${error.code ?? "unknown"}`);
}
