"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import {
  compareDates,
  formatDate,
  pickupDateRange,
  rewardStatus,
  timingOf,
  today,
  windowFor,
  type LocalDate,
} from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import { parseForm } from "@/lib/validation/form";
import {
  createPickupSchema,
  deletePickupSchema,
  updatePickupSchema,
} from "@/lib/validation/pickups";
import { requireOnboarded } from "@/server/auth/app-guards";
import { runAction } from "@/server/run-action";
import { rateLimit } from "@/server/security/rate-limit";

// Pickup actions (BUILD F-5: FR-17, FR-18, FR-20; D7). Public endpoints: each validates and
// guards itself (rule 4). The rules come from the timing module; create_pickup re-checks the
// one-per-cycle rule under a lock in the database.

const PAGES = ["/rewards", "/history", "/dashboard", "/plan"];
const TIMING_COLUMNS = "id, retired_at, timing_type, days_before, days_after";

// create_pickup's raised messages → catalogue IDs (BUILD §0.2's list).
const SQL_ERRORS: Record<string, string> = {
  pickup_exists: "BR-9",
  not_enrolled: "BR-22",
  // The date was checked against the window just before; this only fires if the reward closed
  // in between, so it reads as "not open".
  pickup_out_of_cycle: "BR-10",
  not_allowed: "API-2",
};

/** S-105 C-109: mark an available reward picked up (FR-17). */
export async function createPickup(
  _prev: ActionResult<{ pickupId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ pickupId: string }>> {
  const input = parseForm(createPickupSchema, formData);
  if (!input.ok) return input.result;
  const { retailerId, pickedUpOn, note, locationLabel } = input.data;

  return runAction("createPickup", async () => {
    const { supabase, user, profile } = await requireOnboarded();
    const limit = await rateLimit("createPickup", { userId: user.id });
    if (!limit.ok) return limit;

    const [{ data: enrolled, error }, { data: pickups, error: pError }] =
      await Promise.all([
        supabase
          .from("enrollments")
          .select(`retailer:retailers!inner(${TIMING_COLUMNS})`)
          .is("retailer.retired_at", null),
        supabase
          .from("pickups")
          .select("picked_up_on")
          .eq("retailer_id", retailerId),
      ]);
    if (error || pError)
      throw new Error("createPickup: could not read", {
        cause: error ?? pError,
      });
    const rows = enrolled.map((e) => e.retailer);
    const row = rows.find((r) => r.id === retailerId);
    if (!row) {
      // Not joined, or the retailer has left the list since (BR-3).
      const { data: listed } = await supabase
        .from("retailers")
        .select("retired_at")
        .eq("id", retailerId)
        .maybeSingle();
      return {
        ok: false,
        error: !listed || listed.retired_at ? "BR-3" : "BR-22",
      };
    }

    const w = windowFor(
      profile.birthday,
      rows.map(timingOf),
      today(profile.timeZone, new Date()),
    );
    const status = rewardStatus(
      timingOf(row),
      w,
      pickups.map((p) => p.picked_up_on as LocalDate),
    );
    if (status === "picked_up") return { ok: false, error: "BR-9" };
    if (status !== "available") return { ok: false, error: "BR-10" };

    // FR-17: today by default; an earlier day of this window, never the future.
    const range = pickupDateRange(w);
    if (!range) return { ok: false, error: "BR-10" };
    const date = (pickedUpOn as LocalDate | undefined) ?? w.today;
    if (compareDates(date, range.min) < 0 || compareDates(date, range.max) > 0)
      return {
        ok: false,
        error: "API-4",
        fieldErrors: {
          pickedUpOn: [
            msg("BR-8b")
              .replace("{start}", formatDate(range.min, "short"))
              .replace("{end}", formatDate(range.max, "short")),
          ],
        },
      };

    const { data: pickupId, error: rpcError } = await supabase.rpc(
      "create_pickup",
      {
        p_retailer_id: retailerId,
        p_picked_up_on: date,
        p_note: note ?? null,
        p_location_label: locationLabel ?? null,
        p_cycle_start: w.planning.cycleStart,
        p_cycle_end: w.planning.cycleEnd,
      } as never,
    );
    if (rpcError) {
      const id = SQL_ERRORS[rpcError.message];
      if (id) return { ok: false, error: id };
      throw new Error("createPickup failed", { cause: rpcError });
    }
    for (const path of PAGES) revalidatePath(path);
    return {
      ok: true,
      message: "M-254",
      data: { pickupId: pickupId as string },
    };
  });
}

/** S-105 "Undo" (FR-18) and S-107 "Delete" (FR-20): the caller's own pickup only (RLS). */
export async function deletePickup(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(deletePickupSchema, formData);
  if (!input.ok) return input.result;

  return runAction("deletePickup", async () => {
    const { supabase, user } = await requireOnboarded();
    const limit = await rateLimit("deletePickup", { userId: user.id });
    if (!limit.ok) return limit;
    const { data, error } = await supabase
      .from("pickups")
      .delete()
      .eq("id", input.data.pickupId)
      .select("id");
    if (error) throw new Error("deletePickup failed", { cause: error });
    if (data.length !== 1) return { ok: false, error: "BR-11" };
    for (const path of PAGES) revalidatePath(path);
    return {
      ok: true,
      message: input.data.intent === "undo" ? "BR-21" : "M-255",
    };
  });
}

/** S-107 "Edit": note and label only (FR-20); the date never changes (column grant). */
export async function updatePickup(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(updatePickupSchema, formData);
  if (!input.ok) return input.result;

  return runAction("updatePickup", async () => {
    const { supabase, user } = await requireOnboarded();
    const limit = await rateLimit("updatePickup", { userId: user.id });
    if (!limit.ok) return limit;
    const { data, error } = await supabase
      .from("pickups")
      .update({
        note: input.data.note ?? null,
        location_label: input.data.locationLabel ?? null,
      })
      .eq("id", input.data.pickupId)
      .select("id");
    if (error) throw new Error("updatePickup failed", { cause: error });
    if (data.length !== 1) return { ok: false, error: "BR-11" };
    revalidatePath("/history");
    return { ok: true, message: "M-254" };
  });
}
