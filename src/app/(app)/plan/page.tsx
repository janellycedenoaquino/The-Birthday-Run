import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { GroupCard, type GroupCardData } from "@/components/plan/group-card";
import { PlanRewards, type PlanListRow } from "@/components/plan/plan-rewards";
import { Button } from "@/components/ui/button";
import { formatDate, planRange, type LocalDate } from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import {
  defaultPickup,
  outsideWindow,
  PLAN_LIMITS,
  SMART_GROUPING,
} from "@/lib/rewards/plan";
import {
  addToGroup,
  createGroup,
  applySuggestions,
  deleteGroup,
  duplicateGroup,
  removeFromGroup,
  reorderGroupItems,
  updateGroup,
} from "@/server/actions/groups";
import { requireOnboarded } from "@/server/auth/app-guards";
import { getEntitlement } from "@/server/premium/entitlement";
import { UpgradePrompt } from "@/components/billing/upgrade-prompt";
import { GroupRoute, LockedRoute } from "@/components/map/group-route";
import { SmartGrouping } from "@/components/plan/smart-grouping";
import {
  getGroupRoute,
  lookupZip,
  suggestGroups,
} from "@/server/actions/route";
import { loadPlanContext } from "@/server/rewards/plan-context";

// S-106 Plan (SPEC §3.3, BUILD F-6: FR-22–FR-27, FR-9, FR-40). `onboarded` level. Group routes
// (FR-33, F-10), Duplicate (FR-28) and Smart Grouping (FR-29, F-11) are premium.
export const metadata: Metadata = {
  title: "Plan",
  robots: { index: false },
};

const {
  freeGroups: FREE_GROUPS,
  freeItems: FREE_ITEMS,
  premiumItems: PREMIUM_ITEMS,
} = PLAN_LIMITS;
/** FR-29: offered at 4 or more ungrouped rewards (suggestGroups checks again, with stores). */
const SMART_GROUPING_MIN = SMART_GROUPING.minOffered;

const searchSchema = z.object({
  deleteGroup: z.uuid().optional().catch(undefined),
});

/** The no-JS delete confirmation's action (FR-27): delete (deleteGroup checks everything). */
async function confirmDeleteGroup(formData: FormData) {
  "use server";
  await deleteGroup(null, formData);
  redirect("/plan");
}

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const { supabase, profile } = await requireOnboarded();
  const { deleteGroup: confirming } = searchSchema.parse(await searchParams);
  const ctx = await loadPlanContext(supabase, profile);
  const { premium } = await getEntitlement(supabase);
  const { data: groups, error } = await supabase
    .from("reward_groups")
    .select(
      "id, name, pickup_date, pickup_time, reward_group_items(id, retailer_id, position)",
    )
    .order("pickup_date")
    .order("name");
  if (error) throw new Error("S-106: could not read groups", { cause: error });

  // From every enrolled reward, expired ones too: a group can still hold them.
  const names = new Map(ctx.all.map((r) => [r.id, r.name]));
  const range = planRange(ctx.window);
  const start = defaultPickup(ctx.window, ctx.nowTime);
  const rows: PlanListRow[] = ctx.rows.map((r) => ({
    id: r.id,
    name: r.name,
    logo_file: r.logo_file,
    pickedUp: r.pickedUp,
    daysLeft: r.daysLeft,
    groups: groups
      .filter((g) => g.reward_group_items.some((i) => i.retailer_id === r.id))
      .map((g) => g.name),
  }));
  const cards: GroupCardData[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    pickupDate: g.pickup_date,
    pickupTime: g.pickup_time.slice(0, 5),
    pickupLabel: msg("M-234")
      .replace("{date}", formatDate(g.pickup_date as LocalDate, "long"))
      .replace("{time}", g.pickup_time.slice(0, 5)),
    outside: outsideWindow(ctx.window, g.pickup_date as LocalDate),
    items: [...g.reward_group_items]
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .map((i) => ({
        id: i.id,
        name: names.get(i.retailer_id) ?? i.retailer_id,
      })),
  }));
  // FR-40: more than the free plan allows (after premium ends).
  // FR-24 counts only this birthday year's groups (from today's cycle start), as the trigger does.
  const thisYear = groups.filter(
    (g) => g.pickup_date >= ctx.window.current.cycleStart,
  );
  const overLimit =
    !premium &&
    (thisYear.length > FREE_GROUPS ||
      groups.some((g) => g.reward_group_items.length > FREE_ITEMS));
  // C-104 where the free limits bite (FR-39): at the group limit, and at a full group.
  const groupsFull = !premium && thisYear.length >= FREE_GROUPS;
  const groupFull =
    !premium && groups.some((g) => g.reward_group_items.length >= FREE_ITEMS);
  // FR-29: plannable, not picked up, in no group this birthday year. Stores are checked in the dialog.
  const grouped = new Set(
    thisYear.flatMap((g) => g.reward_group_items.map((i) => i.retailer_id)),
  );
  const ungrouped = ctx.rows.filter(
    (r) => !r.pickedUp && !grouped.has(r.id),
  ).length;
  const confirmGroup = confirming
    ? groups.find((g) => g.id === confirming)
    : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="headline text-[34px] sm:text-[42px]">{msg("M-220")}</h1>
      <p className="mt-1 text-muted-foreground">
        {msg("M-221")
          .replace("{start}", formatDate(range.min, "long"))
          .replace("{end}", formatDate(range.max, "long"))}
      </p>
      {overLimit ? (
        <p className="mt-4 rounded-lg border border-border/70 p-4">
          {msg("M-222")}
        </p>
      ) : null}
      {groupsFull || groupFull ? (
        <div className="mt-4 grid gap-2">
          {groupsFull ? (
            <UpgradePrompt
              supabase={supabase}
              feature="M-133"
              limit={FREE_GROUPS}
              compact
            />
          ) : null}
          {groupFull ? (
            <UpgradePrompt
              supabase={supabase}
              feature="M-134"
              limit={PREMIUM_ITEMS}
              compact
            />
          ) : null}
        </div>
      ) : null}

      {confirmGroup ? (
        <section
          aria-labelledby="confirm-group"
          className="mt-6 grid gap-3 rounded-lg border border-destructive/60 p-6"
        >
          <h2 id="confirm-group" className="font-semibold">
            {msg("M-187").replace("{name}", confirmGroup.name)}
          </h2>
          <p>{msg("M-188")}</p>
          <form action={confirmDeleteGroup} className="flex gap-2">
            <input type="hidden" name="groupId" value={confirmGroup.id} />
            <Button asChild variant="outline">
              <Link href="/plan">Cancel</Link>
            </Button>
            <Button type="submit" variant="destructive">
              Delete
            </Button>
          </form>
        </section>
      ) : null}

      {/* Decision 0016: side by side on wide screens, "Rewards to plan" staying in view. */}
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <div className="lg:sticky lg:top-20">
          {rows.length === 0 ? (
            <div className="frosted grid gap-4 rounded-[22px] p-6">
              <p>{msg("M-239")}</p>
              <div>
                <Button asChild size="lg">
                  <Link href="/discover">{msg("M-102")}</Link>
                </Button>
              </div>
            </div>
          ) : (
            <PlanRewards
              rows={rows}
              groups={groups.map((g) => ({ id: g.id, name: g.name }))}
              defaultDate={start.date}
              defaultTime={start.time}
              range={{ min: range.min, max: range.max }}
              createGroup={createGroup}
              addToGroup={addToGroup}
            />
          )}
        </div>
        <div>
          <section
            aria-labelledby="smart-grouping"
            className="grid gap-3 rounded-[22px] bg-[linear-gradient(90deg,var(--glow-pink),var(--glow-blue))] p-5 text-[var(--navy)] shadow-[0_0_0_1.5px_var(--border)] dark:text-foreground"
          >
            <h2 id="smart-grouping" className="text-lg font-extrabold">
              {msg("M-135")}
            </h2>
            {!premium ? (
              <UpgradePrompt supabase={supabase} feature="M-135" compact />
            ) : ungrouped >= SMART_GROUPING_MIN ? (
              <div>
                <SmartGrouping
                  range={{ min: range.min, max: range.max }}
                  suggestGroups={suggestGroups}
                  applySuggestions={applySuggestions}
                  lookupZip={lookupZip}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {msg("M-230").replace("{needed}", String(SMART_GROUPING_MIN))}
              </p>
            )}
          </section>

          <section aria-labelledby="plan-groups" className="mt-8">
            <h2 id="plan-groups" className="text-xl font-extrabold">
              {msg("M-233")}
            </h2>
            {cards.length === 0 ? (
              <p className="mt-2 text-muted-foreground">{msg("M-240")}</p>
            ) : (
              <ul className="mt-4 grid gap-4">
                {cards.map((g) => (
                  <GroupCard
                    key={`${g.id}:${g.items.map((i) => i.id).join()}`}
                    group={g}
                    range={{ min: range.min, max: range.max }}
                    actions={{
                      updateGroup,
                      deleteGroup,
                      removeFromGroup,
                      reorderGroupItems,
                      // FR-28: premium only; free users get no control (metric 2).
                      duplicateGroup: premium ? duplicateGroup : undefined,
                    }}
                    route={
                      g.items.length < 2 ? null : premium ? (
                        <GroupRoute
                          groupId={g.id}
                          orderKey={g.items.map((i) => i.id).join()}
                          getGroupRoute={getGroupRoute}
                          lookupZip={lookupZip}
                        />
                      ) : (
                        <LockedRoute>
                          <UpgradePrompt
                            supabase={supabase}
                            feature="M-136"
                            compact
                          />
                        </LockedRoute>
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
