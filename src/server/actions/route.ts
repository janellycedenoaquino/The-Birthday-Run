"use server";

import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "@/lib/action-result";
import {
  today as todayIn,
  timingOf,
  windowFor,
  type LocalDate,
} from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import { availableRewards } from "@/lib/rewards/my-rewards";
import { haversineMeters, toMiles, type LatLng } from "@/lib/route/distance";
import { deviceFromHeaders, googleLegs } from "@/lib/route/google-links";
import { orderStops } from "@/lib/route/order";
import type { RouteResult } from "@/lib/route/result";
import { chooseStops } from "@/lib/route/stops";
import type { Database } from "@/lib/types/database.types";
import {
  findStopsSchema,
  groupRouteSchema,
  lookupZipSchema,
  roundCoord,
  type StartLocation,
} from "@/lib/validation/route";
import { requirePremium } from "@/server/auth/app-guards";
import { loadPlanContext } from "@/server/rewards/plan-context";
import { runAction } from "@/server/run-action";
import { rateLimit } from "@/server/security/rate-limit";
import {
  findNearbyStores,
  NotPremiumError,
  stateAt,
  zipLocation,
} from "@/server/stores/nearby";

// Start location, stops and route (BUILD F-10: FR-30–FR-34, D10–D12). Premium only: each action
// checks itself (requirePremium), and nearby_stores / zip_location refuse free users again in
// the database (T-101). The start is never logged, stored or returned except as the map pin.

type Refusal = Extract<ActionResult, { ok: false }>;
type Db = SupabaseClient<Database>;

const bad = (input: {
  success: false;
  error: { issues: { path: PropertyKey[]; message: string }[] };
}): Refusal => {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of input.error.issues) {
    // `start.zip` → `zip`, the C-105 field (BR-12); anything else by its top-level key.
    const key = String(
      (issue.path[0] === "start" ? issue.path.at(-1) : issue.path[0]) ?? "form",
    );
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, error: "API-4", fieldErrors };
};
const unknownZip: Refusal = {
  ok: false,
  error: "API-4",
  fieldErrors: { zip: [msg("BR-12")] },
};

/** The start as a point: coordinates re-rounded (A-11), a ZIP through zip_location. */
async function resolveStart(
  supabase: Db,
  start: StartLocation,
): Promise<{ at: LatLng; state?: string } | null> {
  if (start.kind === "coords")
    return { at: { lat: roundCoord(start.lat), lng: roundCoord(start.lng) } };
  const z = await zipLocation(supabase, start.zip);
  return z ? { at: { lat: z.lat, lng: z.lng }, state: z.state } : null;
}

/** NotPremiumError from an RPC (premium ended mid-request) → BR-2; anything else rethrows. */
async function premiumOnly<T>(
  fn: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof NotPremiumError) return { ok: false, error: "BR-2" };
    throw error;
  }
}

type Brand = { id: string; name: string; finderUrl: string | null };

/** Stops, the no-pin list and the legs for brands in order (BUILD F-10 flow steps 7–9). */
async function buildRoute(
  supabase: Db,
  start: StartLocation,
  at: LatLng,
  brands: Brand[],
  ordered: boolean,
): Promise<ActionResult<RouteResult>> {
  if (!brands.length)
    return { ok: true, data: { start: at, stops: [], noPin: [], legs: [] } };
  const byId = new Map(brands.map((b) => [b.id, b]));
  const nearby = await findNearbyStores(supabase, at, [...byId.keys()]);
  if (nearby.failed && nearby.notPremium) return { ok: false, error: "BR-2" };
  if (nearby.failed)
    return {
      ok: true,
      message: "BR-13",
      data: { start: at, stops: [], noPin: brands.map(noPinRow), legs: [] },
    };
  const { chosen, noPin } = chooseStops(
    brands.map((b) => b.id),
    nearby.stores,
    at,
    { ordered },
  );
  const path = ordered ? chosen : orderStops(chosen, at);
  let prev = at;
  const stops = path.map((s, i) => {
    const miles = toMiles(haversineMeters(prev, s));
    prev = s;
    return {
      n: i + 1,
      retailerId: s.retailerId,
      retailerName: byId.get(s.retailerId)!.name,
      storeName: s.storeName,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      milesFromPrevious: miles,
    };
  });
  const legs = googleLegs(
    stops,
    start.kind === "zip" ? { kind: "zip", zip: start.zip } : { kind: "coords" },
    deviceFromHeaders(await headers()),
  );
  return {
    ok: true,
    data: {
      start: at,
      stops,
      noPin: noPin.map((id) => noPinRow(byId.get(id)!)),
      legs,
    },
  };
}

const noPinRow = (b: Brand) => ({
  retailerId: b.id,
  retailerName: b.name,
  finderUrl: b.finderUrl,
});

/** FR-31: the brand's store finder, else its website. */
const finder = (r: {
  store_finder_url: string | null;
  website_url: string | null;
}) => r.store_finder_url ?? r.website_url ?? null;

/** C-105: the start's state (FR-5). Also confirms an unknown ZIP before the route asks. */
export async function lookupZip(
  input: unknown,
): Promise<ActionResult<{ state: string | null }>> {
  const parsed = lookupZipSchema.safeParse(input);
  if (!parsed.success) return bad(parsed);
  return runAction("lookupZip", () =>
    premiumOnly(async () => {
      const { supabase, user } = await requirePremium();
      const limit = await rateLimit("lookupZip", { userId: user.id });
      if (!limit.ok) return limit;
      const { start } = parsed.data;
      if (start.kind === "zip") {
        const z = await zipLocation(supabase, start.zip);
        if (!z) return unknownZip;
        return { ok: true, data: { state: z.state } };
      }
      const state = await stateAt(supabase, {
        lat: roundCoord(start.lat),
        lng: roundCoord(start.lng),
      });
      return { ok: true, data: { state } };
    }),
  );
}

/** S-105's route (FR-31, FR-32): the chosen available rewards, in the shortest order found. */
export async function findStops(
  input: unknown,
): Promise<ActionResult<RouteResult>> {
  const parsed = findStopsSchema.safeParse(input);
  if (!parsed.success) return bad(parsed);
  return runAction("findStops", () =>
    premiumOnly(async () => {
      const { supabase, user, profile } = await requirePremium();
      const limit = await rateLimit("findStops", { userId: user.id });
      if (!limit.ok) return limit;
      const { start, retailerIds } = parsed.data;
      const resolved = await resolveStart(supabase, start);
      if (!resolved) return unknownZip;

      // Step 6: only rewards the user is enrolled in and that are available today; the rest
      // are dropped silently (RLS: own enrollments only). The window comes from every enrolled
      // program, as on S-105, so both agree on what's available.
      const { data, error } = await supabase
        .from("enrollments")
        .select(
          "retailer:retailers!inner(id, name, timing_type, days_before, days_after, store_finder_url, website_url)",
        )
        .is("retailer.retired_at", null);
      if (error)
        throw new Error("findStops: could not read programs", { cause: error });
      const enrolled = data.map((row) => row.retailer);
      const now = todayIn(profile.timeZone, new Date());
      const cycleStart = windowFor(
        profile.birthday,
        enrolled.map(timingOf),
        now,
      ).planning.cycleStart;
      const { data: pickups, error: pError } = await supabase
        .from("pickups")
        .select("retailer_id, picked_up_on")
        .gte("picked_up_on", cycleStart);
      if (pError)
        throw new Error("findStops: could not read pickups", { cause: pError });
      const { open } = availableRewards({
        birthday: profile.birthday,
        today: now,
        enrolled,
        pickups: pickups.map((p) => ({
          retailerId: p.retailer_id,
          date: p.picked_up_on as LocalDate,
        })),
      });
      const wanted = new Set(retailerIds);
      const brands = open
        .filter((r) => wanted.has(r.id))
        .map((r) => ({ id: r.id, name: r.name, finderUrl: finder(r) }));
      return buildRoute(supabase, start, resolved.at, brands, false);
    }),
  );
}

/** S-106's group route (FR-33): the group's rewards in the group's own order (FR-27). */
export async function getGroupRoute(
  input: unknown,
): Promise<ActionResult<RouteResult>> {
  const parsed = groupRouteSchema.safeParse(input);
  if (!parsed.success) return bad(parsed);
  return runAction("getGroupRoute", () =>
    premiumOnly(async () => {
      const { supabase, user, profile } = await requirePremium();
      const limit = await rateLimit("getGroupRoute", { userId: user.id });
      if (!limit.ok) return limit;
      const { start, groupId } = parsed.data;
      // RLS: someone else's group reads as missing (BR-11).
      const { data: group, error } = await supabase
        .from("reward_groups")
        .select("id, items:reward_group_items(id, retailer_id, position)")
        .eq("id", groupId)
        .maybeSingle();
      if (error)
        throw new Error("getGroupRoute: could not read the group", {
          cause: error,
        });
      if (!group) return { ok: false, error: "BR-11" };
      const resolved = await resolveStart(supabase, start);
      if (!resolved) return unknownZip;
      // F-6's order: position, then item ID (as S-106 shows it). Rewards already picked up this
      // cycle are left out: no stop to make (owner, 2026-11-24).
      const ctx = await loadPlanContext(supabase, profile);
      const pickedUp = new Set(
        ctx.all.filter((r) => r.pickedUp).map((r) => r.id),
      );
      const order = [...group.items]
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .map((i) => i.retailer_id)
        .filter((id) => !pickedUp.has(id));
      const { data: retailers, error: rError } = order.length
        ? await supabase
            .from("retailers")
            .select("id, name, store_finder_url, website_url")
            .is("retired_at", null) // as findStops: retired brands drop out
            .in("id", order)
        : { data: [], error: null };
      if (rError)
        throw new Error("getGroupRoute: could not read retailers", {
          cause: rError,
        });
      const info = new Map(retailers.map((r) => [r.id, r]));
      const brands = order.flatMap((id) => {
        const r = info.get(id);
        return r ? [{ id, name: r.name, finderUrl: finder(r) }] : [];
      });
      return buildRoute(supabase, start, resolved.at, brands, true);
    }),
  );
}
