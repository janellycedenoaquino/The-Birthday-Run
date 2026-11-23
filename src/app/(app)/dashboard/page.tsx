import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/server/auth/app-guards";

// S-12 Dashboard (SPEC §3.3, FR-19, NFR-24): still the Template placeholder until S-102 (Phase 2),
// but already at the app's `onboarded` level (FR-6).
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
      <div className="mt-6 rounded-lg border border-border/70 p-6">
        <p>This is your dashboard. Your app&apos;s main screen goes here.</p>
      </div>
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
