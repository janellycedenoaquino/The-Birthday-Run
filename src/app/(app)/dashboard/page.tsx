import type { Metadata } from "next";
import Link from "next/link";
import { msg } from "@/lib/messages";
import { requireOnboarded } from "@/server/auth/app-guards";

// S-102 Dashboard (SPEC §3.3, BUILD F-4: FR-21), replacing the Template S-12 body. `onboarded`
// level (FR-6). Display name is always rendered as text.
// display_name (maybe Google's, D12) is always rendered as text.
export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false },
};

export default async function DashboardPage() {
  // `onboarded` level (BUILD §0.2): no birthday yet → /onboarding. The profile comes with it.
  const { profile } = await requireOnboarded();
  const name = profile.displayName;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">
        {name ? `Welcome, ${name}` : "Welcome"}
      </h1>
      {/* FR-21: pickups this cycle and the last one. F-5 (next PR) fills these from pickups. */}
      <div className="mt-6 rounded-lg border border-border/70 p-6">
        <p>{msg("M-128")}</p>
      </div>
      {/* Plan (Phase 3) and History (F-5) get their cards with their pages. */}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {[
          { href: "/discover", title: msg("M-101"), text: msg("M-129a") },
          { href: "/rewards", title: msg("M-101b"), text: msg("M-129b") },
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
