import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { EnrollToggle } from "@/components/retailers/enroll-toggle";
import { RetailerLogo } from "@/components/retailers/retailer-logo";
import { Button } from "@/components/ui/button";
import { timingOf, today, windowFor } from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import {
  CATEGORY_LABELS,
  joinByLine,
  REWARD_TYPE_LABELS,
  timingLabel,
} from "@/lib/retailers/labels";
import { retailerIdSchema } from "@/lib/validation/retailers";
import { enroll, unenroll } from "@/server/actions/enrollments";
import { createClient } from "@/server/supabase/server";

// S-104 Retailer details (SPEC §3.3, BUILD F-3: FR-4, FR-8, FR-49). Public for popular retailers,
// signed in for all (D3: RLS returns nothing else, so it's a 404 like an unknown ID).

const load = cache(async (raw: string) => {
  const id = retailerIdSchema.safeParse(raw);
  if (!id.success) notFound();
  const supabase = await createClient();
  const { data: retailer, error } = await supabase
    .from("retailers")
    .select("*")
    .eq("id", id.data)
    .is("retired_at", null)
    .maybeSingle();
  if (error)
    throw new Error("S-104: could not read the retailer", { cause: error });
  if (!retailer) notFound();
  return { supabase, retailer };
});

export async function generateMetadata({
  params,
}: PageProps<"/discover/[retailerId]">): Promise<Metadata> {
  const { retailer } = await load((await params).retailerId);
  return { title: retailer.name, description: retailer.reward_description };
}

export default async function RetailerPage({
  params,
}: PageProps<"/discover/[retailerId]">) {
  const { supabase, retailer: r } = await load((await params).retailerId);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let enrolled = false;
  let more = 0;
  let joinBy: string | null = null;
  if (!user) {
    // M-111 compact: the real number of other rewards (FR-2).
    const { data: counts, error: countError } = await supabase
      .rpc("retailer_counts")
      .single();
    if (countError)
      throw new Error("S-104: could not count retailers", {
        cause: countError,
      });
    more = counts.total - counts.popular;
  } else {
    const [{ data: row }, { data: profile }] = await Promise.all([
      supabase
        .from("enrollments")
        .select("retailer_id")
        .eq("retailer_id", r.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("birth_month, birth_day, time_zone")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    enrolled = Boolean(row);
    // FR-49: the join-by date before the user's next birthday, when the brand has a lead time.
    if (
      r.signup_lead_days &&
      profile?.birth_month &&
      profile.birth_day &&
      profile.time_zone
    ) {
      const now = today(profile.time_zone, new Date());
      const w = windowFor(
        { month: profile.birth_month, day: profile.birth_day },
        [],
        now,
      );
      joinBy = joinByLine({
        brand: r.name,
        leadDays: r.signup_lead_days,
        nextBirthday: w.nextBirthday,
        today: now,
      });
    }
  }

  const type = REWARD_TYPE_LABELS[r.reward_type];
  const requirements = [
    r.purchase_requirement &&
      msg("M-189a").replace("{text}", r.purchase_requirement),
    r.membership_requirement &&
      msg("M-189b").replace("{text}", r.membership_requirement),
    r.other_requirement && msg("M-189c").replace("{text}", r.other_requirement),
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/discover" className="text-sm underline underline-offset-4">
        {msg("M-171c")}
      </Link>
      <div className="mt-6 flex items-center gap-4">
        <RetailerLogo name={r.name} logoFile={r.logo_file} size={64} />
        <div>
          <h1 className="text-2xl font-semibold">{r.name}</h1>
          <p className="text-muted-foreground">{CATEGORY_LABELS[r.category]}</p>
        </div>
      </div>
      <p className="mt-6 text-lg">{r.reward_description}</p>
      <dl className="mt-6 grid gap-3">
        <div>
          <dt className="text-sm text-muted-foreground">When</dt>
          <dd>{timingLabel(timingOf(r))}</dd>
          {joinBy ? <dd className="text-sm">{joinBy}</dd> : null}
        </div>
        {type ? (
          <div>
            <dt className="text-sm text-muted-foreground">Reward type</dt>
            <dd>
              {type.label}: {type.explanation}
            </dd>
          </div>
        ) : null}
        {requirements.length ? (
          <div>
            <dt className="text-sm text-muted-foreground">Requirements</dt>
            {requirements.map((text) => (
              <dd key={text}>{text}</dd>
            ))}
          </div>
        ) : null}
      </dl>
      {r.website_url ? (
        <p className="mt-6">
          <a
            href={r.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            {r.name} website
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      ) : null}
      <div className="mt-8">
        {user ? (
          <EnrollToggle
            retailerId={r.id}
            name={r.name}
            enrolled={enrolled}
            enroll={enroll}
            unenroll={unenroll}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4">
            {more > 0 ? (
              <p className="text-sm">
                {msg("M-111").replace("{count}", String(more))}
              </p>
            ) : null}
            <Button asChild size="sm">
              <Link
                href={`/sign-up?next=${encodeURIComponent(`/discover/${r.id}`)}`}
              >
                Sign up free
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
