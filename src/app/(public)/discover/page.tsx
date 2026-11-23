import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import {
  RetailerCard,
  type CardRetailer,
} from "@/components/retailers/retailer-card";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/messages";
import { filterRetailers, type FilterRow } from "@/lib/retailers/filter";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/retailers/labels";
import { enroll, unenroll } from "@/server/actions/enrollments";
import { createClient } from "@/server/supabase/server";

// S-103 Discover (SPEC §3.3, BUILD F-3: FR-2, FR-3). Public. RLS decides the data (D3): signed
// out, only popular retailers come back; the role here only picks what to render.
export const metadata: Metadata = {
  title: "Discover",
  description: "Free birthday rewards from popular loyalty programs.",
};

const CARD_COLUMNS =
  "id, name, category, reward_description, reward_type, logo_file, timing_type, days_before, days_after, states_scope, state_codes";

// BUILD F-3: bad values are dropped, never an error. The premium filters (length, early, state;
// FR-5, FR-45) wait for the entitlement check (F-7, Phase 4): until then everyone gets the free
// view, and those parameters aren't read at all ("the server ignores the filter").
const searchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z
    .enum(["food_drink", "entertainment", "retail", "beauty"])
    .optional()
    .catch(undefined),
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
    const { data: counts, error: countError } = await supabase
      .rpc("retailer_counts")
      .single();
    if (countError)
      throw new Error("S-103: could not count retailers", {
        cause: countError,
      });
    return (
      <Shell>
        <p className="mt-2 text-muted-foreground">{msg("M-171b")}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(rows as Row[]).map((r) => (
            <RetailerCard key={r.id} retailer={r} />
          ))}
          <SignUpPrompt more={counts.total - counts.popular} />
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
  const { shown, total } = filterRetailers(rows as Row[], filters, {});
  const filtered = Boolean(filters.q || filters.category);
  const href = (category?: string) => {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (category) p.set("category", category);
    const s = p.toString();
    return s ? `/discover?${s}` : "/discover";
  };

  return (
    <Shell>
      <form method="get" className="mt-6 flex gap-2" role="search">
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
          defaultValue={filters.q ?? ""}
          placeholder="Search by name"
          maxLength={100}
          className="h-11 w-full max-w-sm rounded-md border border-input bg-background px-3 text-base"
        />
        <Button type="submit" size="lg" variant="outline">
          Search
        </Button>
      </form>
      <nav aria-label="Categories" className="mt-4">
        <ul className="flex flex-wrap gap-2 text-sm">
          {[undefined, ...CATEGORIES].map((c) => {
            const current = filters.category === c;
            return (
              <li key={c ?? "all"}>
                <Link
                  href={href(c)}
                  aria-current={current ? "page" : undefined}
                  className={`inline-flex h-9 items-center rounded-full border px-3 ${current ? "border-primary bg-primary text-primary-foreground" : "border-border/70"}`}
                >
                  {c ? CATEGORY_LABELS[c] : "All"}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
        {msg("M-178")
          .replace("{shown}", String(shown.length))
          .replace("{total}", String(total))}
      </p>
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
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => (
            <RetailerCard
              key={r.id}
              retailer={r}
              toggle={{ enrolled: enrolledIds.has(r.id), enroll, unenroll }}
            />
          ))}
        </ul>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">{msg("M-171a")}</h1>
      {children}
    </div>
  );
}

/** M-111: the real number of other rewards, and the way in (FR-2). */
function SignUpPrompt({ more }: { more: number }) {
  if (more <= 0) return null;
  return (
    <li className="flex flex-col justify-center gap-3 rounded-lg border border-dashed border-border p-4">
      <p>{msg("M-111").replace("{count}", String(more))}</p>
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
