import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  timingOf,
  today,
  windowFor,
  type Birthday,
} from "@/lib/birthday/timing";
import { joinByLine } from "@/lib/retailers/labels";
import { yourDates, yourDatesLine } from "@/lib/rewards/your-dates";
import { retailerIdSchema } from "@/lib/validation/retailers";
import { logError } from "@/server/errors";
import { reportedThisCycle } from "@/server/reports/own";
import { createClient } from "@/server/supabase/server";

// S-104's data (SPEC §3.3, BUILD F-3: FR-4, FR-8, FR-49; decision 0017), shared by the full page
// and Discover's pop-up. Public for every non-retired retailer; retired and unknown IDs are a 404.
// Signed in: enrollment, the user's own dates (M-279), the join-by line (FR-49) and, with a
// birthday, whether they reported it this cycle (C-107, F-13).

const MORE = 4;

/** `withMore`: the full page's 4 more brands and the catalogue count (the pop-up shows neither). */
export const loadBrand = cache(async (raw: string, withMore: boolean) => {
  const id = retailerIdSchema.safeParse(raw);
  if (!id.success) notFound();
  const supabase = await createClient();
  const [{ data: retailer, error }, { data: auth }] = await Promise.all([
    supabase
      .from("retailers")
      .select("*")
      .eq("id", id.data)
      .is("retired_at", null)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (error)
    throw new Error("S-104: could not read the retailer", { cause: error });
  if (!retailer) notFound();
  const user = auth.user;

  const [more, total] = withMore
    ? await Promise.all([
        supabase
          .from("retailers")
          .select("id, name, logo_file, reward_description")
          .eq("category", retailer.category)
          .neq("id", retailer.id)
          .is("retired_at", null)
          .order("is_popular", { ascending: false })
          .order("name")
          .limit(MORE),
        supabase
          .from("retailers")
          .select("id", { count: "exact", head: true })
          .is("retired_at", null),
      ])
    : [null, null];
  // Extras only: a failed read leaves them out, logged, never an error page.
  if (more?.error) logError(more.error, { op: "brand.more" });
  if (total?.error) logError(total.error, { op: "brand.total" });

  let enrolled = false;
  let joinBy: string | null = null;
  let dates: string | null = null;
  // null: not signed in or no birthday yet, so no report button (reportReward needs a birthday).
  let reported: boolean | null = null;
  if (user) {
    const [{ data: row }, { data: profile }] = await Promise.all([
      supabase
        .from("enrollments")
        .select("retailer_id")
        .eq("retailer_id", retailer.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("birth_month, birth_day, time_zone")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    enrolled = Boolean(row);
    if (profile?.birth_month && profile.birth_day && profile.time_zone) {
      const birthday: Birthday = {
        month: profile.birth_month,
        day: profile.birth_day,
      };
      const now = today(profile.time_zone, new Date());
      reported = (
        await reportedThisCycle(supabase, {
          birthday,
          timeZone: profile.time_zone,
        })
      ).has(retailer.id);
      dates = yourDatesLine(yourDates(timingOf(retailer), birthday, now));
      // FR-49: the join-by date before the user's next birthday, when the brand has a lead time.
      if (retailer.signup_lead_days)
        joinBy = joinByLine({
          brand: retailer.name,
          leadDays: retailer.signup_lead_days,
          nextBirthday: windowFor(birthday, [], now).nextBirthday,
          today: now,
        });
    }
  }

  return {
    retailer,
    signedIn: Boolean(user),
    enrolled,
    joinBy,
    dates,
    reported,
    more: more?.data ?? [],
    total: total?.count ?? 0,
  };
});

export type Brand = Awaited<ReturnType<typeof loadBrand>>;
