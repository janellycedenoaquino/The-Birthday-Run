import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PickupActions } from "@/components/history/pickup-entry";
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
  const { confirm } = searchSchema.parse(await searchParams);
  const [timings, { data: pickups, error: pError }] = await Promise.all([
    enrolledTimings(supabase),
    supabase
      .from("pickups")
      .select(
        "id, picked_up_on, note, location_label, retailer:retailers(name)",
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
      date: p.picked_up_on as LocalDate,
      note: p.note,
      locationLabel: p.location_label,
    })),
  });
  // The no-JS delete confirmation (C-108's text), for one of the user's own pickups only.
  const confirming = confirm
    ? pickups.find((p) => p.id === confirm)
    : undefined;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">{msg("M-250")}</h1>
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
      {sections.length === 0 ? (
        <div className="mt-8 grid gap-4 rounded-lg border border-border/70 p-6">
          <p>{msg("M-253")}</p>
          <div>
            <Button asChild size="lg">
              <Link href="/rewards">{msg("M-101b")}</Link>
            </Button>
          </div>
        </div>
      ) : (
        sections.map((section) => (
          <section
            key={section.year}
            className="mt-8"
            aria-labelledby={`cycle-${section.year}`}
          >
            <h2 id={`cycle-${section.year}`} className="text-lg font-semibold">
              {msg("M-251").replace("{year}", String(section.year))}
            </h2>
            {section.items.length === 0 ? (
              <p className="mt-2 text-muted-foreground">{msg("M-252")}</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {section.items.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/70 p-4"
                  >
                    <div className="grid gap-1">
                      <p className="font-medium">{p.retailer}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(p.date, "long")}
                      </p>
                      {p.note ? <p className="text-sm">{p.note}</p> : null}
                      {p.locationLabel ? (
                        <p className="text-sm">{p.locationLabel}</p>
                      ) : null}
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
