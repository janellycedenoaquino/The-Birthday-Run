"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { formatDate, type LocalDate } from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import { endingBefore, pickupProblem, type PlanRow } from "@/lib/rewards/plan";
import { z } from "zod";
import { formInput, parseForm } from "@/lib/validation/form";
import {
  addToGroupSchema,
  createGroupSchema,
  applySuggestionsSchema,
  copyNames,
  runNames,
  deleteGroupSchema,
  duplicateGroupSchema,
  removeFromGroupSchema,
  reorderSchema,
  updateGroupSchema,
} from "@/lib/validation/plan";
import { requireOnboarded, requirePremium } from "@/server/auth/app-guards";
import { loadPlanContext } from "@/server/rewards/plan-context";
import { runAction } from "@/server/run-action";
import { rateLimit } from "@/server/security/rate-limit";

// Plan group actions (BUILD F-6: FR-23–FR-27, D6). Public endpoints: each validates and guards
// itself (rule 4). The limits (FR-24, FR-25) are enforced by database triggers under a lock;
// the action maps their errors. Duplicate (FR-28) is premium only (requirePremium).

type Result = ActionResult<{ groupId: string }>;
type Refusal = Extract<ActionResult, { ok: false }>;
type Pg = { code?: string; message?: string; details?: string | null } | null;

/**
 * Form input with repeated keys (retailerIds, itemIds) read with getAll (BUILD §0.2); a Zod
 * failure gives API-4 with field errors, like parseForm.
 */
function parse<T extends z.ZodType>(
  schema: T,
  formData: FormData,
  lists: string[] = [],
) {
  const input = formInput(formData);
  for (const key of lists) {
    const all = formData.getAll(key);
    if (all.length) input[key] = all;
    else delete input[key];
  }
  const r = schema.safeParse(input);
  if (r.success) return { ok: true as const, data: r.data as z.infer<T> };
  const { fieldErrors } = z.flattenError(r.error);
  return {
    ok: false as const,
    result: {
      ok: false as const,
      error: "API-4",
      fieldErrors: fieldErrors as Record<string, string[]>,
    },
  };
}

/** Trigger and constraint errors → catalogue IDs (BUILD §0.2, F-6). */
function mapPgError(error: Pg): Refusal | null {
  if (!error) return null;
  if (error.message === "plan_group_limit")
    return {
      ok: false,
      error: "API-4",
      fieldErrors: {
        form: [msg("BR-4").replace("{limit}", error.details ?? "3")],
      },
    };
  if (error.message === "plan_item_limit")
    return {
      ok: false,
      error: "API-4",
      fieldErrors: {
        form: [msg("BR-5").replace("{limit}", error.details ?? "5")],
      },
    };
  if (error.message === "stale_group_order")
    return { ok: false, error: "BR-17" };
  if (error.message === "group_not_found") return { ok: false, error: "BR-11" };
  if (error.message === "retailer_retired") return { ok: false, error: "BR-3" };
  if (error.message === "pickup_exists") return { ok: false, error: "BR-10" };
  if (
    error.code === "23505" &&
    error.message?.includes("reward_groups_user_name_key")
  )
    return { ok: false, error: "API-4", fieldErrors: { name: [msg("BR-6")] } };
  if (error.code === "23505") return { ok: false, error: "BR-7" };
  // The group's FK (deleted meanwhile) vs the enrollment's FK (not one of their programs).
  // Postgres names them reward_group_items_group_id_user_id_fkey / …_user_id_retailer_id_fkey.
  if (error.code === "23503")
    return {
      ok: false,
      error: error.message?.includes("_group_id_user_id_fkey")
        ? "BR-11"
        : "BR-22",
    };
  return null;
}

const bad8 = (range: { start: LocalDate; end: LocalDate }): Refusal => ({
  ok: false,
  error: "API-4",
  fieldErrors: {
    pickupDate: [
      msg("BR-8")
        .replace("{start}", formatDate(range.start, "short"))
        .replace("{end}", formatDate(range.end, "short")),
    ],
  },
});

/** FR-26/FR-22: every reward must be enrolled, listed and plannable (not picked up). */
function chosenRows(rows: PlanRow[], ids: string[]) {
  const unique = [...new Set(ids)];
  const chosen = unique.map((id) => rows.find((r) => r.id === id));
  if (chosen.some((r) => !r)) return { error: "BR-22" as const };
  if (chosen.some((r) => r!.pickedUp)) return { error: "BR-10" as const };
  return { rows: chosen as PlanRow[] };
}

/** M-227, filled in (a catalogue text, not an ID: ActionResult allows either, D17). */
function warning(rows: PlanRow[], pickupDate: string) {
  const names = endingBefore(rows, pickupDate as LocalDate);
  return names.length
    ? msg("M-227").replace("{retailers}", names.join(", "))
    : undefined;
}

const done = () => revalidatePath("/plan");

/**
 * The shared start of the actions that set a pickup (FR-23): the guard, the limit, the plan
 * context, and the pickup date/time check (BR-8).
 */
async function openPlan(
  op: "createGroup" | "updateGroup",
  pickupDate: string,
  pickupTime: string,
  groupId?: string,
) {
  const { supabase, user, profile } = await requireOnboarded();
  const limit = await rateLimit(op, { userId: user.id });
  if (!limit.ok) return { ok: false as const, refusal: limit };
  const ctx = await loadPlanContext(supabase, profile);
  // FR-27: renaming alone is always allowed; the pickup rules apply only when it changes.
  if (groupId) {
    const { data: saved } = await supabase
      .from("reward_groups")
      .select("pickup_date, pickup_time")
      .eq("id", groupId)
      .maybeSingle();
    if (!saved)
      return {
        ok: false as const,
        refusal: { ok: false, error: "BR-11" } as Refusal,
      };
    if (
      saved.pickup_date === pickupDate &&
      saved.pickup_time.slice(0, 5) === pickupTime
    )
      return { ok: true as const, supabase, user, ctx };
  }
  const problem = pickupProblem(
    ctx.window,
    pickupDate as LocalDate,
    pickupTime,
    ctx.nowTime,
  );
  if (problem) return { ok: false as const, refusal: bad8(problem) };
  return { ok: true as const, supabase, user, ctx };
}

export async function createGroup(
  _prev: Result | null,
  formData: FormData,
): Promise<Result> {
  const input = parse(createGroupSchema, formData, ["retailerIds"]);
  if (!input.ok) return input.result;
  const { name, pickupDate, pickupTime, retailerIds = [] } = input.data;

  return runAction("createGroup", async () => {
    const checked = await openPlan("createGroup", pickupDate, pickupTime);
    if (!checked.ok) return checked.refusal;
    const { supabase, user, ctx } = checked;
    const chosen = chosenRows(ctx.rows, retailerIds);
    if ("error" in chosen) return { ok: false, error: chosen.error! };

    const { data: group, error } = await supabase
      .from("reward_groups")
      .insert({
        user_id: user.id,
        name,
        pickup_date: pickupDate,
        pickup_time: pickupTime,
      })
      .select("id")
      .single();
    const refused = mapPgError(error);
    if (refused) return refused;
    if (error) throw new Error("createGroup failed", { cause: error });

    if (chosen.rows.length) {
      const { error: itemsError } = await supabase
        .from("reward_group_items")
        .insert(
          chosen.rows.map((r, i) => ({
            group_id: group.id,
            user_id: user.id,
            retailer_id: r.id,
            position: i + 1,
          })),
        );
      if (itemsError) {
        // No orphan and no partial add: the new group goes too.
        const { error: undoError } = await supabase
          .from("reward_groups")
          .delete()
          .eq("id", group.id);
        if (undoError)
          throw new Error("createGroup: could not undo the new group", {
            cause: undoError,
          });
        const mapped = mapPgError(itemsError);
        if (mapped) return mapped;
        throw new Error("createGroup items failed", { cause: itemsError });
      }
    }
    done();
    return {
      ok: true,
      data: { groupId: group.id },
      message: warning(chosen.rows, pickupDate),
    };
  });
}

export async function addToGroup(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parse(addToGroupSchema, formData, ["retailerIds"]);
  if (!input.ok) return input.result;
  const { groupId, retailerIds } = input.data;

  return runAction("addToGroup", async () => {
    const { supabase, user, profile } = await requireOnboarded();
    const limit = await rateLimit("addToGroup", { userId: user.id });
    if (!limit.ok) return limit;
    const ctx = await loadPlanContext(supabase, profile);
    const chosen = chosenRows(ctx.rows, retailerIds);
    if ("error" in chosen) return { ok: false, error: chosen.error! };
    const { data: group } = await supabase
      .from("reward_groups")
      .select("pickup_date, reward_group_items(position)")
      .eq("id", groupId)
      .maybeSingle();
    if (!group) return { ok: false, error: "BR-11" };
    const last = Math.max(
      0,
      ...group.reward_group_items.map((i) => i.position),
    );
    const { error } = await supabase.from("reward_group_items").insert(
      chosen.rows.map((r, i) => ({
        group_id: groupId,
        user_id: user.id,
        retailer_id: r.id,
        position: last + i + 1,
      })),
    );
    const refused = mapPgError(error);
    if (refused) return refused;
    if (error) throw new Error("addToGroup failed", { cause: error });
    done();
    return { ok: true, message: warning(chosen.rows, group.pickup_date) };
  });
}

export async function updateGroup(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(updateGroupSchema, formData);
  if (!input.ok) return input.result;
  const { groupId, name, pickupDate, pickupTime } = input.data;

  return runAction("updateGroup", async () => {
    const checked = await openPlan(
      "updateGroup",
      pickupDate,
      pickupTime,
      groupId,
    );
    if (!checked.ok) return checked.refusal;
    const { supabase, ctx } = checked;
    const { data, error } = await supabase
      .from("reward_groups")
      .update({ name, pickup_date: pickupDate, pickup_time: pickupTime })
      .eq("id", groupId)
      .select("reward_group_items(retailer_id)");
    const refused = mapPgError(error);
    if (refused) return refused;
    if (error) throw new Error("updateGroup failed", { cause: error });
    if (data.length !== 1) return { ok: false, error: "BR-11" };
    const ids = data[0]!.reward_group_items.map((i) => i.retailer_id);
    done();
    return {
      ok: true,
      message: warning(
        ctx.all.filter((r) => ids.includes(r.id)),
        pickupDate,
      ),
    };
  });
}

export async function removeFromGroup(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(removeFromGroupSchema, formData);
  if (!input.ok) return input.result;
  return runAction("removeFromGroup", async () => {
    const { supabase, user } = await requireOnboarded();
    const limit = await rateLimit("removeFromGroup", { userId: user.id });
    if (!limit.ok) return limit;
    const { data, error } = await supabase
      .from("reward_group_items")
      .delete()
      .eq("id", input.data.itemId)
      .eq("group_id", input.data.groupId)
      .select("id");
    if (error) throw new Error("removeFromGroup failed", { cause: error });
    if (data.length !== 1) return { ok: false, error: "BR-11" };
    done();
    return { ok: true };
  });
}

export async function reorderGroupItems(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parse(reorderSchema, formData, ["expected", "itemIds"]);
  if (!input.ok) return input.result;
  return runAction("reorderGroupItems", async () => {
    const { supabase, user } = await requireOnboarded();
    const limit = await rateLimit("reorderGroupItems", { userId: user.id });
    if (!limit.ok) return limit;
    const { error } = await supabase.rpc("reorder_group_items", {
      p_group_id: input.data.groupId,
      p_expected: input.data.expected,
      p_item_ids: input.data.itemIds,
    });
    const refused = mapPgError(error);
    if (refused) return refused;
    if (error) throw new Error("reorderGroupItems failed", { cause: error });
    done();
    return { ok: true };
  });
}

export async function deleteGroup(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(deleteGroupSchema, formData);
  if (!input.ok) return input.result;
  return runAction("deleteGroup", async () => {
    const { supabase, user } = await requireOnboarded();
    const limit = await rateLimit("deleteGroup", { userId: user.id });
    if (!limit.ok) return limit;
    const { data, error } = await supabase
      .from("reward_groups")
      .delete()
      .eq("id", input.data.groupId)
      .select("id");
    if (error) throw new Error("deleteGroup failed", { cause: error });
    if (data.length !== 1) return { ok: false, error: "BR-11" };
    done();
    return { ok: true };
  });
}

/**
 * FR-28 (premium): a copy named "<name> (Copy)" (then "(Copy 2)"… on a name clash, BR-6 after
 * 20), with the same pickup and the same rewards in the same order. Rewards a new group couldn't
 * hold any more (picked up, retired, no longer enrolled: FR-26) are left out; expired ones stay. The copy counts
 * toward FR-24 (the trigger refuses it with BR-4); a failed item copy deletes the new group.
 */
export async function duplicateGroup(
  _prev: Result | null,
  formData: FormData,
): Promise<Result> {
  const input = parseForm(duplicateGroupSchema, formData);
  if (!input.ok) return input.result;
  const { groupId } = input.data;

  return runAction("duplicateGroup", async () => {
    const { supabase, user, profile } = await requirePremium();
    const limit = await rateLimit("duplicateGroup", { userId: user.id });
    if (!limit.ok) return limit;
    // RLS: someone else's group reads as missing (BR-11).
    const { data: source, error: readError } = await supabase
      .from("reward_groups")
      .select(
        "name, pickup_date, pickup_time, reward_group_items(id, retailer_id, position)",
      )
      .eq("id", groupId)
      .maybeSingle();
    if (readError)
      throw new Error("duplicateGroup: could not read the group", {
        cause: readError,
      });
    if (!source) return { ok: false, error: "BR-11" };
    const ctx = await loadPlanContext(supabase, profile);
    // `all`, not `rows`: an expired reward can stay in a group, so the copy keeps it too.
    const open = new Set(ctx.all.filter((r) => !r.pickedUp).map((r) => r.id));
    const items = [...source.reward_group_items]
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .filter((i) => open.has(i.retailer_id));

    let copyId: string | null = null;
    for (const name of copyNames(source.name)) {
      const { data, error } = await supabase
        .from("reward_groups")
        .insert({
          user_id: user.id,
          name,
          pickup_date: source.pickup_date,
          pickup_time: source.pickup_time,
        })
        .select("id")
        .single();
      if (!error) {
        copyId = data.id;
        break;
      }
      const isNameClash =
        error.code === "23505" &&
        error.message?.includes("reward_groups_user_name_key");
      if (isNameClash) continue;
      const refused = mapPgError(error);
      if (refused) return refused;
      throw new Error("duplicateGroup failed", { cause: error });
    }
    if (!copyId)
      return {
        ok: false,
        error: "API-4",
        fieldErrors: { form: [msg("BR-6")] },
      };

    if (items.length) {
      const { error: itemsError } = await supabase
        .from("reward_group_items")
        .insert(
          items.map((item, i) => ({
            group_id: copyId,
            user_id: user.id,
            retailer_id: item.retailer_id,
            position: i + 1,
          })),
        );
      if (itemsError) {
        // No half-made copy: the new group goes too.
        const { error: undoError } = await supabase
          .from("reward_groups")
          .delete()
          .eq("id", copyId);
        if (undoError)
          throw new Error("duplicateGroup: could not undo the copy", {
            cause: undoError,
          });
        const mapped = mapPgError(itemsError);
        if (mapped) return mapped;
        throw new Error("duplicateGroup items failed", { cause: itemsError });
      }
    }
    done();
    return { ok: true, data: { groupId: copyId } };
  });
}

/**
 * FR-29 "Apply all" (premium, BUILD F-11 flow 7): creates every suggested group in one database
 * call, so the limit triggers and FR-26 run for each and the first refusal creates nothing.
 * Names are M-215's "Run n", made unique; each pickup is checked like FR-23's (BR-8).
 */
export async function applySuggestions(
  input: unknown,
): Promise<ActionResult<{ groupIds: string[] }>> {
  const parsed = applySuggestionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "API-4" };
  const { groups } = parsed.data;

  return runAction("applySuggestions", async () => {
    const { supabase, user, profile } = await requirePremium();
    const limit = await rateLimit("applySuggestions", { userId: user.id });
    if (!limit.ok) return limit;
    const ctx = await loadPlanContext(supabase, profile);
    for (const g of groups) {
      const problem = pickupProblem(
        ctx.window,
        g.pickupDate as LocalDate,
        g.pickupTime,
        ctx.nowTime,
      );
      if (problem) return bad8(problem);
      const chosen = chosenRows(ctx.rows, g.retailerIds);
      if ("error" in chosen) return { ok: false, error: chosen.error! };
    }
    const { data: existing, error: readError } = await supabase
      .from("reward_groups")
      .select("name");
    if (readError)
      throw new Error("applySuggestions: could not read group names", {
        cause: readError,
      });
    const names = runNames(
      groups.length,
      existing.map((g) => g.name),
    );
    const { data: ids, error } = await supabase.rpc("apply_group_suggestions", {
      p_groups: groups.map((g, i) => ({ ...g, name: names[i]! })),
    });
    const refused = mapPgError(error);
    if (refused) return refused;
    if (error) throw new Error("applySuggestions failed", { cause: error });
    done();
    return { ok: true, data: { groupIds: ids } };
  });
}
