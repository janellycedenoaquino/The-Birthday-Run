import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, today, type LocalDate } from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import { pickupStats } from "@/lib/rewards/history";
import { requireOnboarded } from "@/server/auth/app-guards";
import { enrolledTimings } from "@/server/rewards/enrolled";

// S-102 Dashboard (SPEC §3.3, BUILD F-4: FR-21), replacing the Template S-12 body. `onboarded`
// level (FR-6). Display name is always rendered as text.
// display_name (maybe Google's, D12) is always rendered as text.
export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false },
};

export default async function DashboardPage() {
  // `onboarded` level (BUILD §0.2): no birthday yet → /onboarding. The profile comes with it.
  const { supabase, profile } = await requireOnboarded();
  const name = profile.displayName;
  const [timings, { data: pickups, error: pError }] = await Promise.all([
    enrolledTimings(supabase),
    supabase.from("pickups").select("picked_up_on"),
  ]);
  if (pError) throw new Error("S-102: could not read", { cause: pError });
  const stats = pickupStats({
    birthday: profile.birthday,
    timings: timings,
    today: today(profile.timeZone, new Date()),
    dates: pickups.map((p) => p.picked_up_on as LocalDate),
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">
        {name ? `Welcome, ${name}` : "Welcome"}
      </h1>
      {/* FR-21: pickups this cycle (History's current cycle) and the last one. */}
      <div className="mt-6 rounded-lg border border-border/70 p-6">
        {stats.last ? (
          <>
            <p className="text-lg font-semibold">
              {msg("M-126").replace("{count}", String(stats.thisCycle))}
            </p>
            <p className="text-muted-foreground">
              {msg("M-127").replace("{date}", formatDate(stats.last, "long"))}
            </p>
          </>
        ) : (
          <p>{msg("M-128")}</p>
        )}
      </div>
      {/* Plan gets its card with its page (Phase 3). */}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {[
          { href: "/discover", title: msg("M-101"), text: msg("M-129a") },
          { href: "/rewards", title: msg("M-101b"), text: msg("M-129b") },
          { href: "/history", title: msg("M-101c"), text: msg("M-129d") },
        ].map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="block h-full rounded-lg border border-border/70 p-6 hover:bg-muted"
            >
              <span className="block font-semibold">{card.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {card.text}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {!name && (
        <p className="mt-4 text-sm">
          <Link
            href="/settings#profile"
            className="underline underline-offset-4"
          >
            Add your name in Settings
          </Link>
        </p>
      )}
    </div>
  );
}
