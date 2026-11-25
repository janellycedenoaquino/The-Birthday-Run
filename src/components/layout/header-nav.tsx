"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/messages";
import { AccountMenu, type Account } from "./account-menu";

// C-1's right side (SPEC §3.2). A client component because it depends on the current path, and
// the root layout isn't re-rendered on client-side navigation: a path read on the server would
// stay at the first page loaded. The step pages show no nav, so the step can't be skipped from
// here (the guards still enforce it). The Discover page's link reads "Rewards" (M-101).
const STEP_PAGES = ["/auth/set-password", "/auth/mfa", "/auth/reauthenticate"];
// Pages whose own motion fills the screen (decision 0016): C-1 floats over it, and the page puts
// "Pause motion" in the top-right corner. Sign in and sign up switch with tabs in their card.
const FLOATING = ["/", "/sign-in", "/sign-up"];
const CARD_TABS = ["/sign-in", "/sign-up"];

/**
 * C-1's frame, full width as in the prototypes. On the FLOATING pages it floats over the page's
 * motion and leaves the top-right corner to the page's "Pause motion" (decision 0016
 * prototypes). Only its links take clicks there, so the gaps reach the motion and the pause
 * button below.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const floating = FLOATING.includes(usePathname());
  return (
    <header
      className={
        floating
          ? "pointer-events-none absolute inset-x-0 top-0 z-40"
          : "relative z-40"
      }
    >
      <div
        className={`mx-auto flex h-16 w-full items-center justify-between ${floating ? "gap-2 pr-[60px] pl-3 sm:gap-4 sm:pr-[184px] sm:pl-6 [&>*]:pointer-events-auto" : "gap-4 px-4 sm:px-6"}`}
      >
        {children}
      </div>
    </header>
  );
}

// Bold links; the current page's sits on a white pill with the navy ring (decision 0016 prototypes).
const CURRENT =
  "font-bold aria-[current=page]:bg-white aria-[current=page]:text-[var(--navy)] aria-[current=page]:shadow-[0_0_0_1.5px_var(--navy)]";

export function HeaderNav({ account }: { account: Account | null }) {
  const path = usePathname();
  if (STEP_PAGES.includes(path)) return null;
  // The floating pages, signed out (decision 0016): "Rewards" (Discover) and, on the landing
  // page, "Sign in". Sign in and sign up switch with their card's tabs.
  if (FLOATING.includes(path) && !account) {
    return (
      <nav
        aria-label="Account"
        className="flex shrink-0 items-center gap-1.5 sm:gap-2"
      >
        <Link href="/discover" className="pill-link">
          {msg("M-101")}
        </Link>
        {CARD_TABS.includes(path) ? null : (
          <Link href="/sign-in" className="pill-link">
            Sign in
          </Link>
        )}
      </nav>
    );
  }

  // Signed in, the links sit next to the name and the account's round initial goes far right
  // (decision 0016 prototype).
  return (
    <nav
      aria-label="Account"
      className={
        account
          ? "ml-1 flex min-w-0 flex-1 items-center gap-1"
          : "flex shrink-0 items-center gap-2"
      }
    >
      {/* C-101's first app link (M-101). Signed out it looks like the pills beside it, and it's
          left out on Rewards itself, as in the prototype. */}
      {path !== "/onboarding" &&
        (account ? (
          <Button asChild variant="ghost" size="lg" className={CURRENT}>
            <Link
              href="/discover"
              aria-current={path.startsWith("/discover") ? "page" : undefined}
            >
              {msg("M-101")}
            </Link>
          </Button>
        ) : path === "/discover" ? null : (
          <Link
            href="/discover"
            aria-current={path.startsWith("/discover") ? "page" : undefined}
            className="pill-link"
          >
            {msg("M-101")}
          </Link>
        ))}
      {account && path !== "/onboarding" && (
        <Button asChild variant="ghost" size="lg" className={CURRENT}>
          <Link
            href="/rewards"
            aria-current={path.startsWith("/rewards") ? "page" : undefined}
          >
            {msg("M-101b")}
          </Link>
        </Button>
      )}
      {account && path !== "/onboarding" && (
        <Button asChild variant="ghost" size="lg" className={CURRENT}>
          <Link
            href="/plan"
            aria-current={path.startsWith("/plan") ? "page" : undefined}
          >
            {msg("M-101d")}
          </Link>
        </Button>
      )}
      {account && path !== "/onboarding" && (
        <Button asChild variant="ghost" size="lg" className={CURRENT}>
          <Link
            href="/history"
            aria-current={path.startsWith("/history") ? "page" : undefined}
          >
            {msg("M-101c")}
          </Link>
        </Button>
      )}
      {account ? (
        <div className="ml-auto">
          <AccountMenu {...account} />
        </div>
      ) : (
        // Signed out: one "Get started" → sign up; the card there has a "Sign in" tab (owner).
        <Button asChild size="lg">
          <Link href="/sign-up">{msg("M-101f")}</Link>
        </Button>
      )}
    </nav>
  );
}
