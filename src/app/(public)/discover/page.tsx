import type { Metadata } from "next";
import Link from "next/link";
import { Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { z } from "zod";
import {
  RetailerCard,
  type CardRetailer,
} from "@/components/retailers/retailer-card";
import { UpgradePrompt } from "@/components/billing/upgrade-prompt";
import { Button } from "@/components/ui/button";
import {
  formatDate,
  today,
  windowFor,
  type LocalDate,
} from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import { filterRetailers, type FilterRow } from "@/lib/retailers/filter";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/retailers/labels";
import { enroll, unenroll } from "@/server/actions/enrollments";
import { getEntitlement } from "@/server/premium/entitlement";
import {
  StateCount,
  StateFilter,
  StateScoped,
} from "@/components/location/state-filter";
import { lookupZip } from "@/server/actions/route";
import { createClient } from "@/server/supabase/server";

// S-103 Discover (SPEC §3.3, BUILD F-3: FR-2, FR-3). Public. RLS decides the data (D3, decision
// 0017): signed out, every non-retired retailer comes back; the role here only picks what to render.
export const metadata: Metadata = {
  title: msg("M-171a"),
  description: msg("M-171b"),
};

const CARD_COLUMNS =
  "id, name, category, reward_description, reward_type, logo_file, requires_purchase, timing_type, days_before, days_after, states_scope, state_codes";

// BUILD F-3: bad values are dropped, never an error. The premium filters (FR-45: length and
// "starts early") are read only for premium users; free users' URLs with them get the plain list
// and C-104 (FR-39, metric 2). The state filter (FR-5) runs in the browser (decision 0014): it
// is never a URL parameter, so the server never sees a location (NFR-3).
const searchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z
    .enum(["food_drink", "entertainment", "retail", "beauty"])
    .optional()
    .catch(undefined),
  length: z.enum(["day", "week", "longer"]).optional().catch(undefined),
  early: z.literal("1").optional().catch(undefined),
});

type Row = CardRetailer & FilterRow;

export default async function DiscoverPage({
  searchParams,
}: PageProps<"/discover">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows, error } = await supabase
    .from("retailers")
    .select(CARD_COLUMNS)
    .is("retired_at", null)
    .order("name");
  if (error)
    throw new Error("S-103: could not read retailers", { cause: error });

  if (!user) {
    return (
      <Shell
        title={msg("M-294")}
        block={msg("M-294b")}
        lead={msg("M-294c")}
        count={msg("M-294d").replace("{count}", String(rows.length))}
      >
        <ul className={GRID}>
          {(rows as Row[]).map((r) => (
            <RetailerCard key={r.id} retailer={r} />
          ))}
          <SignUpPrompt />
        </ul>
      </Shell>
    );
  }

  const filters = searchSchema.parse(await searchParams);
  const { data: enrolled, error: enrollError } = await supabase
    .from("enrollments")
    .select("retailer_id");
  if (enrollError)
    throw new Error("S-103: could not read enrollments", {
      cause: enrollError,
    });
  const enrolledIds = new Set(enrolled.map((e) => e.retailer_id));
  // The next birthday: named in the line under the headline (owner, 2026-11-25), and what the
  // premium filters measure from (FR-45).
  const { premium } = await getEntitlement(supabase);
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("birth_month, birth_day, time_zone")
    .eq("id", user.id)
    .maybeSingle();
  // A failed read must not look like "no birthday saved".
  if (profileError)
    throw new Error("S-103: could not read the profile", {
      cause: profileError,
    });
  const birthday: LocalDate | undefined =
    profile?.birth_month && profile.birth_day && profile.time_zone
      ? windowFor(
          { month: profile.birth_month, day: profile.birth_day },
          [],
          today(profile.time_zone, new Date()),
        ).planning.birthday
      : undefined;
  const occurrence = premium ? birthday : undefined;
  const { shown, total } = filterRetailers(
    rows as Row[],
    premium
      ? { ...filters, early: filters.early === "1" }
      : { q: filters.q, category: filters.category },
    { occurrence },
  );
  const filtered = Boolean(
    filters.q ||
    filters.category ||
    // Length/early only filter with a birthday to measure from (filterRetailers ignores them).
    (premium && occurrence && (filters.length || filters.early)),
  );
  /** The current filters as a query, `over` replacing some (premium ones only for premium). */
  const query = (over: { category?: string }) => {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    const category = "category" in over ? over.category : filters.category;
    if (category) p.set("category", category);
    if (premium && occurrence && filters.length)
      p.set("length", filters.length);
    if (premium && occurrence && filters.early) p.set("early", "1");
    const s = p.toString();
    return s ? `/discover?${s}` : "/discover";
  };
  const href = (category?: string) => query({ category });
  // FR-5 in the browser: only what the filter needs, for premium users only.
  const stateRows = premium
    ? shown.map(({ id, states_scope, state_codes }) => ({
        id,
        states_scope,
        state_codes,
      }))
    : [];

  return (
    <Shell
      compact
      side={
        // A search button inside the field, for phones without an Enter key (owner, 2026-11-25).
        <form
          method="get"
          role="search"
          className="relative w-full sm:w-[300px]"
        >
          {filters.category ? (
            <input type="hidden" name="category" value={filters.category} />
          ) : null}
          <label htmlFor="discover-q" className="sr-only">
            Search by name
          </label>
          <input
            id="discover-q"
            name="q"
            type="search"
            enterKeyHint="search"
            defaultValue={filters.q ?? ""}
            placeholder="Search by name"
            maxLength={100}
            className="h-12 w-full rounded-xl border-0 bg-white pr-12 pl-3.5 text-base text-[var(--navy)] shadow-[inset_0_0_0_1.5px_var(--border)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--navy),0_0_0_4px_color-mix(in_srgb,var(--primary)_45%,transparent)]"
          />
          <button
            type="submit"
            aria-label="Search"
            className="absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-lg bg-primary text-[var(--navy)] shadow-[0_0_0_1.5px_var(--navy)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <SearchIcon aria-hidden="true" className="size-4" />
          </button>
        </form>
      }
      title={msg("M-294")}
      block={msg("M-294b")}
      lead={
        birthday
          ? msg("M-295c").replace("{date}", formatDate(birthday, "short"))
          : msg("M-295d")
      }
      action={
        birthday ? undefined : (
          // Only a signed-in user who left onboarding before saving a birthday sees this.
          <Button asChild size="lg" className="mt-4 h-11 px-5">
            <Link href="/onboarding">{msg("M-295e")}</Link>
          </Button>
        )
      }
    >
      <nav aria-label="Categories" className="mt-5">
        <ul className="flex flex-wrap gap-2 text-sm">
          {[undefined, ...CATEGORIES].map((c) => {
            const current = filters.category === c;
            const n = c
              ? rows.filter((r) => r.category === c).length
              : rows.length;
            return (
              <li key={c ?? "all"}>
                <Link
                  href={href(c)}
                  aria-current={current ? "page" : undefined}
                  style={
                    c
                      ? ({
                          "--chip": `var(--cat-${c})`,
                        } as React.CSSProperties)
                      : undefined
                  }
                  className={`inline-flex h-9 items-center gap-1 rounded-[10px] bg-[var(--chip,#fff)] px-3.5 font-bold text-[var(--navy)] ${current ? "shadow-[inset_0_0_0_2px_var(--navy),2px_2px_0_var(--navy)]" : "shadow-[inset_0_0_0_1.5px_var(--border)]"}`}
                >
                  {c ? CATEGORY_LABELS[c] : "All"}
                  {/* The brand count per tab (decision 0016 prototype). */}
                  <small className="font-semibold text-[#4c557d]">{n}</small>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {premium ? (
        // Premium: "Showing" on the left and a "More filters" button on the right that drops down
        // the length, early-start and state filters (owner, 2026-11-25). The button shows how
        // many of the URL filters are on.
        <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2">
          <StateCount rows={stateRows} total={total} />
          <details className="group">
            <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-[10px] bg-white/80 px-3.5 text-sm font-bold text-[var(--navy)] shadow-[inset_0_0_0_1.5px_var(--navy)] outline-none group-open:bg-[var(--bubblegum)] focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-white/10 dark:text-foreground [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              {msg("M-177b")}
              {filters.length || filters.early ? (
                <span className="rounded-full bg-[var(--navy)] px-1.5 text-xs text-white">
                  {(filters.length ? 1 : 0) + (filters.early ? 1 : 0)}
                  <span className="sr-only"> on</span>
                </span>
              ) : null}
            </summary>
            <div className="absolute inset-x-0 top-full z-20 mt-2 grid gap-4 rounded-[18px] bg-background/95 p-4 shadow-[0_0_0_1.5px_var(--border),0_16px_30px_-14px_rgb(0_0_0/25%)] backdrop-blur-md">
              <form
                method="get"
                className="flex flex-wrap items-center gap-2"
                aria-label="Premium filters"
              >
                {filters.q ? (
                  <input type="hidden" name="q" value={filters.q} />
                ) : null}
                {filters.category ? (
                  <input
                    type="hidden"
                    name="category"
                    value={filters.category}
                  />
                ) : null}
                <label htmlFor="discover-length" className="sr-only">
                  Length
                </label>
                <select
                  id="discover-length"
                  name="length"
                  defaultValue={filters.length ?? ""}
                  className="h-11 rounded-xl border-0 bg-white px-3 text-base text-[var(--navy)] shadow-[inset_0_0_0_1.5px_var(--border)]"
                >
                  <option value="">{msg("M-174")}</option>
                  <option value="day">{msg("M-175")}</option>
                  <option value="week">{msg("M-176")}</option>
                  <option value="longer">{msg("M-177")}</option>
                </select>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    name="early"
                    value="1"
                    defaultChecked={filters.early === "1"}
                    className="size-4"
                  />
                  {msg("M-177a")}
                </label>
                <Button type="submit" size="lg" className="h-11 px-4">
                  Apply
                </Button>
              </form>
              <section aria-label="Your state">
                <StateFilter lookupZip={lookupZip} rows={stateRows} />
              </section>
            </div>
          </details>
        </div>
      ) : (
        // "Showing" on the left, the Premium tag on the right (decision 0016 prototype).
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {msg("M-178")
              .replace("{shown}", String(shown.length))
              .replace("{total}", String(total))}
          </p>
          <UpgradePrompt supabase={supabase} feature="M-131" tag />
        </div>
      )}
      {shown.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border/70 p-6">
          <p>{filtered ? msg("M-179") : msg("M-171")}</p>
          {filtered ? (
            <Link
              href="/discover"
              className="mt-2 inline-block underline underline-offset-4"
            >
              Clear filters
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className={GRID}>
          {shown.map((r) => {
            const card = (
              <RetailerCard
                key={r.id}
                retailer={r}
                toggle={{ enrolled: enrolledIds.has(r.id), enroll, unenroll }}
              />
            );
            return premium ? (
              <StateScoped key={r.id} row={r}>
                {card}
              </StateScoped>
            ) : (
              card
            );
          })}
        </ul>
      )}
    </Shell>
  );
}

const GRID =
  "mt-6 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-[18px]";

// Decision 0016: a big centred headline with the tilted block, the lead and (signed out) the
// brand count; the glow background comes from the root layout. `compact` (signed in, as in the
// prototype): the headline on the left and `side` (the search) on the right.
function Shell({
  title,
  block,
  lead,
  count,
  action,
  compact = false,
  side,
  children,
}: {
  title: string;
  block: string;
  lead: string;
  count?: string;
  action?: React.ReactNode;
  compact?: boolean;
  side?: React.ReactNode;
  children: React.ReactNode;
}) {
  const heading = (
    <h1
      className={`headline ${compact ? "text-[34px] sm:text-[44px]" : "text-[40px] sm:text-[clamp(40px,5.5vw,60px)]"}`}
    >
      {title} <span className="headline-block">{block}</span>
    </h1>
  );
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pt-6 pb-12 sm:px-6">
      {compact ? (
        <header className="flex flex-wrap items-end justify-between gap-[18px] pt-3">
          <div>
            {heading}
            <p className="mt-2 text-muted-foreground">{lead}</p>
            {action}
          </div>
          {side}
        </header>
      ) : (
        <header className="text-center">
          {heading}
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed whitespace-pre-line text-muted-foreground sm:text-lg">
            {lead}
          </p>
          {action}
          {count ? (
            <p className="mt-3.5 text-[13px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
              {count}
            </p>
          ) : null}
        </header>
      )}
      {children}
    </div>
  );
}

/** M-111: the way in (FR-2): what signing up adds to the public list. */
function SignUpPrompt() {
  return (
    <li className="col-span-2 flex flex-col justify-center gap-3.5 rounded-[18px] bg-background/70 p-5 font-bold shadow-[inset_0_0_0_2px_var(--bubblegum)] sm:col-span-1">
      <p>{msg("M-111")}</p>
      <div className="flex gap-2">
        <Button asChild size="sm">
          <Link href="/sign-up?next=%2Fdiscover">Sign up free</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/sign-in?next=%2Fdiscover">Sign in</Link>
        </Button>
      </div>
    </li>
  );
}
