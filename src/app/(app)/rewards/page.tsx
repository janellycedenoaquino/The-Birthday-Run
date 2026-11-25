import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { DaysLeftBadge } from "@/components/rewards/days-left-badge";
import { PickupDialog } from "@/components/rewards/pickup-dialog";
import { ReportDialog } from "@/components/rewards/report-dialog";
import { UndoBar } from "@/components/rewards/undo-bar";
import { RetailerLogo } from "@/components/retailers/retailer-logo";
import { Button } from "@/components/ui/button";
import {
  formatDate,
  compareDates,
  pickupDateRange,
  rewardDays,
  timingOf,
  today,
  windowFor,
  type LocalDate,
} from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import { joinByLine, timingLabel } from "@/lib/retailers/labels";
import { UpgradePrompt } from "@/components/billing/upgrade-prompt";
import { RewardsRoute } from "@/components/map/rewards-route";
import {
  availableRewards,
  myRewards,
  type RewardItem,
} from "@/lib/rewards/my-rewards";
import { createPickup, deletePickup } from "@/server/actions/pickups";
import { reportReward } from "@/server/actions/reports";
import { findStops, lookupZip } from "@/server/actions/route";
import { reportedThisCycle } from "@/server/reports/own";
import { getEntitlement } from "@/server/premium/entitlement";
import { requireOnboarded } from "@/server/auth/app-guards";

// S-105 My Rewards (SPEC §3.3, BUILD F-4: FR-12–FR-16). `onboarded` level. The rules live in
// src/lib/rewards/my-rewards.ts; this page loads rows and renders. The Route section is premium
// (FR-32, BUILD F-10); free users get C-104 there. Each card's "More" menu holds C-107 (F-13).
export const metadata: Metadata = {
  title: "My Rewards",
  robots: { index: false },
};

const searchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  within: z.enum(["1", "7", "14"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(50).catch(1),
});

const RETAILER_COLUMNS =
  "id, name, reward_description, logo_file, timing_type, days_before, days_after, signup_lead_days";

export default async function RewardsPage({
  searchParams,
}: PageProps<"/rewards">) {
  const { supabase, profile } = await requireOnboarded();
  const filters = searchSchema.parse(await searchParams);
  const { data, error } = await supabase
    .from("enrollments")
    .select(`retailer:retailers!inner(${RETAILER_COLUMNS})`)
    .is("retailer.retired_at", null);
  if (error) throw new Error("S-105: could not read rewards", { cause: error });

  const now = today(profile.timeZone, new Date());
  const enrolled = data.map((row) => row.retailer);
  // Only pickups that can count: on or after the planning cycle's start (decision 0008).
  const cycleStart = windowFor(profile.birthday, enrolled.map(timingOf), now)
    .planning.cycleStart;
  const { data: pickups, error: pError } = await supabase
    .from("pickups")
    .select("retailer_id, picked_up_on")
    .gte("picked_up_on", cycleStart);
  if (pError)
    throw new Error("S-105: could not read pickups", { cause: pError });
  const picked = pickups.map((p) => ({
    retailerId: p.retailer_id,
    date: p.picked_up_on as LocalDate,
  }));
  const r = myRewards({
    birthday: profile.birthday,
    today: now,
    enrolled,
    pickups: picked,
    filters: {
      q: filters.q,
      within: filters.within
        ? (Number(filters.within) as 1 | 7 | 14)
        : undefined,
      page: filters.page,
    },
  });
  const w = r.window;
  const [{ premium }, reported] = await Promise.all([
    getEntitlement(supabase),
    reportedThisCycle(supabase, profile),
  ]);
  // FR-32: every available reward, most urgent first, whatever the list's filters (premium only:
  // free pages carry no route data, FR-39).
  const routeRewards =
    premium && r.view === "list"
      ? availableRewards({
          birthday: profile.birthday,
          today: now,
          enrolled,
          pickups: picked,
        }).open.map(({ id, name }) => ({ id, name }))
      : [];
  // In the list view the window is open, so the pickup date range exists (FR-17).
  const range = pickupDateRange(w);
  const name = profile.displayName;
  const heading = {
    birthday: name ? msg("M-201").replace("{name}", name) : msg("M-201b"),
    birth_month: name ? msg("M-202").replace("{name}", name) : msg("M-202b"),
    window_open: msg("M-203"),
    other: msg("M-204"),
  }[r.header];
  const query = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const all = { q: filters.q, within: filters.within, ...over };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/rewards?${s}` : "/rewards";
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="headline text-[34px] sm:text-[42px]">{heading}</h1>
      {w.dayNumber < 0 ? (
        <p className="mt-1 text-muted-foreground">
          {w.daysUntilBirthday === 1
            ? msg("M-206")
            : msg("M-205").replace("{days}", String(w.daysUntilBirthday))}
        </p>
      ) : null}

      {/* FR-18: recent pickups with "Undo", kept outside the list (the card leaves it at once). */}
      <UndoBar deletePickup={deletePickup} />

      {r.view === "none" ? (
        <Notice text={msg("M-211")} />
      ) : r.view === "outside" ? (
        <Notice
          start={w.planning.start}
          text={msg("M-207").replace(
            "{date}",
            formatDate(w.planning.start, "long"),
          )}
        />
      ) : r.view === "done" ? (
        <p className="mt-8 rounded-[22px] bg-[#effaf2] p-6 font-bold text-[var(--navy)] shadow-[inset_0_0_0_2px_var(--spring)]">
          {msg("M-212")}
        </p>
      ) : (
        <>
          <form
            method="get"
            className="mt-8 flex flex-wrap items-end gap-3"
            role="search"
          >
            <div className="grid gap-1">
              <label htmlFor="rewards-q" className="text-sm">
                Search rewards
              </label>
              <input
                id="rewards-q"
                name="q"
                type="search"
                defaultValue={filters.q ?? ""}
                maxLength={100}
                className="h-11 w-56 rounded-xl border-0 bg-white px-3.5 text-base text-[var(--navy)] shadow-[inset_0_0_0_1.5px_var(--border)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--navy),0_0_0_4px_color-mix(in_srgb,var(--primary)_45%,transparent)]"
              />
            </div>
            {filters.within ? (
              <input type="hidden" name="within" value={filters.within} />
            ) : null}
            <Button type="submit" size="lg" variant="outline">
              {msg("M-302e")}
            </Button>
          </form>
          {/* Decision 0016: "Ends within" as chips (links, so they work without JS). */}
          <nav aria-label={msg("M-302")} className="mt-4">
            <p className="mb-2 text-sm font-bold">{msg("M-302")}</p>
            <ul className="flex flex-wrap gap-2 text-sm">
              {(
                [
                  [undefined, "M-302a"],
                  ["1", "M-302b"],
                  ["7", "M-302c"],
                  ["14", "M-302d"],
                ] as const
              ).map(([value, label]) => {
                const current = filters.within === value;
                return (
                  <li key={label}>
                    <Link
                      href={query({ within: value, page: undefined })}
                      aria-current={current ? "page" : undefined}
                      className={`inline-flex h-9 items-center rounded-[10px] px-3.5 font-bold ${current ? "bg-[var(--bubblegum)] text-[var(--navy)] shadow-[inset_0_0_0_2px_var(--navy),2px_2px_0_var(--navy)]" : "bg-white text-[var(--navy)] shadow-[inset_0_0_0_1.5px_var(--border)] dark:bg-white/90"}`}
                    >
                      {msg(label)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
            {msg("M-178")
              .replace("{shown}", String(r.matched))
              .replace("{total}", String(r.available))}
          </p>
          {r.items.length === 0 ? (
            <div className="mt-6 rounded-lg border border-border/70 p-6">
              <p>{msg("M-179")}</p>
              <Link
                href="/rewards"
                className="mt-2 inline-block underline underline-offset-4"
              >
                Clear filters
              </Link>
            </div>
          ) : (
            <ul className="mt-6 grid gap-4">
              {r.items.map((item) => (
                <RewardCard
                  key={item.id}
                  item={item}
                  reported={reported.has(item.id)}
                  range={{
                    // Not before this reward itself opened (FR-17; createPickup checks again).
                    min: latest(
                      range!.min,
                      rewardDays(timingOf(item), w.planning.birthday).opens,
                    ),
                    max: range!.max,
                  }}
                  joinBy={
                    item.signup_lead_days && w.dayNumber < 0
                      ? joinByLine({
                          brand: item.name,
                          leadDays: item.signup_lead_days,
                          nextBirthday: w.nextBirthday,
                          today: now,
                        })
                      : null
                  }
                />
              ))}
            </ul>
          )}
          {r.hasMore ? (
            <div className="mt-6">
              {/* A plain link: the next page renders the first n+1 pages, so no client state. */}
              <Button asChild variant="outline" size="lg">
                <Link
                  href={query({ page: String(filters.page + 1) })}
                  scroll={false}
                >
                  {msg("M-209")}
                </Link>
              </Button>
            </div>
          ) : null}
          <section aria-labelledby="route-heading" className="mt-12 grid gap-4">
            <h2 id="route-heading" className="text-xl font-semibold">
              {msg("M-210")}
            </h2>
            {premium ? (
              <RewardsRoute
                rewards={routeRewards}
                findStops={findStops}
                lookupZip={lookupZip}
              />
            ) : (
              // Decision 0016: the upgrade card over a blurred, made-up route picture (no real
              // stores or location), so people see what Premium adds.
              <div className="relative grid min-h-[240px] place-items-center overflow-hidden rounded-[22px] shadow-[0_0_0_1.5px_var(--border)]">
                <RoutePreview />
                <div className="relative z-[1] m-4 rounded-2xl bg-background/90 p-4 backdrop-blur-sm sm:m-8">
                  <UpgradePrompt supabase={supabase} feature="M-132" />
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const latest = (a: LocalDate, b: LocalDate) =>
  compareDates(a, b) >= 0 ? a : b;

/** FR-15 / FR-16: a message with the way forward: Discover and Plan. Outside the window
 *  (decision 0016): a calendar tile with the start date and "Your next run starts {date}". */
function Notice({ text, start }: { text: string; start?: LocalDate }) {
  return (
    <div className="frosted mt-8 grid gap-4 rounded-[22px] p-6 sm:grid-cols-[auto_1fr] sm:items-center">
      {start ? (
        <div
          aria-hidden="true"
          className="grid w-24 overflow-hidden rounded-2xl bg-white text-center text-[var(--navy)] shadow-[0_0_0_1.5px_var(--navy)]"
        >
          <span className="bg-[var(--bubblegum)] py-1 text-xs font-extrabold tracking-[0.12em] uppercase">
            {formatDate(start, "short").split(" ")[0]}
          </span>
          <span className="py-2 text-4xl font-extrabold">
            {formatDate(start, "short").split(" ")[1]}
          </span>
        </div>
      ) : null}
      <div className="grid gap-4">
        {start ? (
          <h2 className="text-xl font-extrabold">
            {msg("M-303").replace("{date}", formatDate(start, "long"))}
          </h2>
        ) : null}
        <p>{text}</p>
        <div>
          <Button asChild size="lg">
            <Link href="/discover">{msg("M-102")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="ml-2">
            <Link href="/plan">Start planning</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A made-up route for the free preview: pastel streets, a pink line and numbered pins. */
function RoutePreview() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 600 260"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full blur-[3px]"
    >
      <rect width="600" height="260" className="fill-[var(--cream)]" />
      <path
        d="M0 190 C120 160 200 230 330 200 S520 140 600 170 V260 H0Z"
        className="fill-[var(--glow-blue)]"
      />
      <circle cx="470" cy="70" r="46" className="fill-[var(--glow-mint)]" />
      <g stroke="#ffffff" strokeWidth="10" fill="none">
        <path d="M-10 60 H610 M-10 130 H610 M120 -10 V270 M300 -10 V270 M450 -10 V270" />
      </g>
      <path
        d="M80 150 L180 90 L320 120 L430 60 L520 120"
        className="stroke-[var(--bubblegum)]"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      {[
        [180, 90, 1],
        [320, 120, 2],
        [430, 60, 3],
        [520, 120, 4],
      ].map(([x, y, n]) => (
        <g key={n}>
          <circle
            cx={x}
            cy={y}
            r="15"
            fill="#fff"
            className="stroke-[var(--navy)]"
            strokeWidth="2"
          />
          <text
            x={x}
            y={y + 5}
            textAnchor="middle"
            fontSize="14"
            fontWeight="800"
            className="fill-[var(--navy)]"
          >
            {n}
          </text>
        </g>
      ))}
    </svg>
  );
}

function RewardCard({
  item,
  joinBy,
  range,
  reported,
}: {
  item: RewardItem;
  joinBy: string | null;
  reported: boolean;
  range: { min: string; max: string };
}) {
  return (
    <li className="flex gap-4 rounded-[20px] bg-white/80 p-4 shadow-[0_0_0_1.5px_var(--border)] dark:bg-white/5">
      <RetailerLogo name={item.name} logoFile={item.logo_file} size={56} />
      <div className="grid min-w-0 gap-1">
        <h2 className="font-extrabold">
          <Link
            href={`/discover/${item.id}`}
            className="underline-offset-4 hover:underline"
          >
            {item.name}
          </Link>
        </h2>
        <p className="text-lg leading-snug font-bold">
          {item.reward_description}
        </p>
        <p className="text-sm text-muted-foreground">
          {timingLabel(timingOf(item))}
        </p>
        {joinBy ? <p className="text-sm">{joinBy}</p> : null}
        <DaysLeftBadge daysLeft={item.daysLeft} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PickupDialog
            retailerId={item.id}
            retailer={item.name}
            minDate={range.min}
            maxDate={range.max}
            createPickup={createPickup}
          />
          <ReportDialog
            retailerId={item.id}
            retailer={item.name}
            reported={reported}
            reportReward={reportReward}
            trigger="menu"
          />
        </div>
      </div>
    </li>
  );
}
