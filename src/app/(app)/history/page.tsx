import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PickupActions } from "@/components/history/pickup-entry";
import { Illustration } from "@/components/layout/illustration";
import { Button } from "@/components/ui/button";
import { formatDate, today, type LocalDate } from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import { historySections } from "@/lib/rewards/history";
import { deletePickup, updatePickup } from "@/server/actions/pickups";
import { requireOnboarded } from "@/server/auth/app-guards";
import { enrolledTimings } from "@/server/rewards/enrolled";

// S-107 History (SPEC §3.3, BUILD F-5: FR-19, FR-20). `onboarded` level. Every pickup, retired
// retailers included (D3: signed-in users read them), grouped by cycle with the timing module.
export const metadata: Metadata = {
  title: "History",
  robots: { index: false },
};

const searchSchema = z.object({
  confirm: z.uuid().optional().catch(undefined),
  // Decision 0016: one Birthday Run at a time; an unknown year shows the newest.
  year: z.coerce.number().int().min(2000).max(2200).optional().catch(undefined),
});

/** The no-JS confirm block's action: delete (deletePickup checks everything), then a clean URL. */
async function confirmDelete(formData: FormData) {
  "use server";
  await deletePickup(null, formData);
  redirect("/history");
}

export default async function HistoryPage({
  searchParams,
}: PageProps<"/history">) {
  const { supabase, profile } = await requireOnboarded();
  const { confirm, year } = searchSchema.parse(await searchParams);
  const [timings, { data: pickups, error: pError }] = await Promise.all([
    enrolledTimings(supabase),
    supabase
      .from("pickups")
      .select(
        "id, picked_up_on, note, location_label, retailer:retailers(name, reward_description)",
      ),
  ]);
  if (pError)
    throw new Error("S-107: could not read history", { cause: pError });

  const sections = historySections({
    birthday: profile.birthday,
    timings,
    today: today(profile.timeZone, new Date()),
    pickups: pickups.map((p) => ({
      id: p.id,
      retailer: p.retailer.name,
      reward: p.retailer.reward_description,
      date: p.picked_up_on as LocalDate,
      note: p.note,
      locationLabel: p.location_label,
    })),
  });
  const shown = sections.find((s) => s.year === year) ?? sections[0];
  // The no-JS delete confirmation (C-108's text), for one of the user's own pickups only.
  const confirming = confirm
    ? pickups.find((p) => p.id === confirm)
    : undefined;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="headline text-[34px] sm:text-[42px]">{msg("M-250")}</h1>
      {confirming ? (
        <section
          aria-labelledby="confirm-title"
          className="mt-6 grid gap-3 rounded-lg border border-destructive/60 p-6"
        >
          <h2 id="confirm-title" className="font-semibold">
            {msg("M-185")}
          </h2>
          <p>{msg("M-186")}</p>
          {/* A plain form posting a server action, so it works without JS (FR-20). */}
          <form action={confirmDelete} className="flex gap-2">
            <input type="hidden" name="pickupId" value={confirming.id} />
            <input type="hidden" name="intent" value="delete" />
            <Button asChild variant="outline">
              <Link href="/history">Cancel</Link>
            </Button>
            <Button type="submit" variant="destructive">
              Delete
            </Button>
          </form>
        </section>
      ) : null}
      {sections.length > 1 ? (
        <nav aria-label={msg("M-304")} className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {sections.map((s) => {
              const current = s.year === shown?.year;
              return (
                <li key={s.year}>
                  <Link
                    href={`/history?year=${s.year}`}
                    aria-current={current ? "page" : undefined}
                    className={`inline-flex h-10 items-center rounded-xl px-4 font-extrabold text-[var(--navy)] ${current ? "bg-[var(--bubblegum)] shadow-[inset_0_0_0_2px_var(--navy),2px_2px_0_var(--navy)]" : "bg-white shadow-[inset_0_0_0_1.5px_var(--border)] dark:bg-white/10 dark:text-foreground"}`}
                  >
                    {s.year}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
      {sections.length === 0 ? (
        <div className="frosted mt-8 grid max-w-2xl gap-4 rounded-[22px] p-6">
          {/* Decision 0016: no pickups ever → the three girls above M-253. */}
          <Illustration name="girlsRunning" />
          <p>{msg("M-253")}</p>
          <div>
            <Button asChild size="lg">
              <Link href="/rewards">{msg("M-101b")}</Link>
            </Button>
          </div>
        </div>
      ) : (
        [shown!].map((section) => (
          <section
            key={section.year}
            className="mt-8"
            aria-labelledby={`cycle-${section.year}`}
          >
            <h2 id={`cycle-${section.year}`} className="text-xl font-extrabold">
              {msg("M-251").replace("{year}", String(section.year))}
            </h2>
            {section.items.length === 0 ? (
              <p className="mt-2 text-muted-foreground">{msg("M-252")}</p>
            ) : (
              // Decision 0016: a timeline, a dotted pink line with a pink dot per pickup.
              <ul className="relative mt-4 grid gap-4 pl-7 before:absolute before:top-2 before:bottom-2 before:left-[9px] before:border-l-[3px] before:border-dotted before:border-[var(--bubblegum)]">
                {section.items.map((p) => (
                  <li
                    key={p.id}
                    className="relative flex items-start justify-between gap-3 rounded-[20px] bg-white/85 p-4 shadow-[0_0_0_1.5px_var(--border)] before:absolute before:top-6 before:-left-[25px] before:size-3.5 before:rounded-full before:bg-[var(--bubblegum)] before:shadow-[0_0_0_1.5px_var(--navy)] dark:bg-white/5"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3.5">
                      <DateBlock date={p.date} />
                      <div className="grid min-w-0 gap-1">
                        <p className="font-extrabold">{p.retailer}</p>
                        {/* The date is in the block; its full form for screen readers. */}
                        <p className="sr-only">{formatDate(p.date, "long")}</p>
                        <p className="text-sm text-muted-foreground">
                          {p.reward}
                        </p>
                        {p.note ? (
                          <p className="w-fit rounded-md bg-[#fff4c2] px-1.5 text-sm whitespace-pre-line text-[var(--navy)]">
                            {p.note}
                          </p>
                        ) : null}
                        {p.locationLabel ? (
                          <p className="text-sm text-muted-foreground">
                            {p.locationLabel}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <PickupActions
                      pickupId={p.id}
                      retailer={p.retailer}
                      note={p.note}
                      locationLabel={p.locationLabel}
                      updatePickup={updatePickup}
                      deletePickup={deletePickup}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}

/** Month, day and weekday in a small block (decision 0016). */
function DateBlock({ date }: { date: LocalDate }) {
  const [month, day] = formatDate(date, "short").split(" ");
  const weekday = formatDate(date, "long").split(",")[0];
  return (
    <span
      aria-hidden="true"
      className="grid w-14 shrink-0 overflow-hidden rounded-xl bg-white text-center text-[var(--navy)] shadow-[0_0_0_1.5px_var(--navy)]"
    >
      <span className="bg-[var(--glow-pink)] text-[11px] font-extrabold tracking-[0.12em] uppercase">
        {month}
      </span>
      <span className="text-xl leading-tight font-extrabold">{day}</span>
      <span className="pb-0.5 text-[10px] font-bold">
        {weekday?.slice(0, 3)}
      </span>
    </span>
  );
}
