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
// here (the guards still enforce it); S-4/S-5 hide their own button.
const STEP_PAGES = ["/auth/set-password", "/auth/mfa", "/auth/reauthenticate"];

/**
 * C-1's frame. On the landing page (S-1) it floats over the logo tunnel, full width, and leaves
 * the top-right corner to the page's "Pause motion" (decision 0016 prototype). Only its links
 * take clicks there, so the gaps reach the tunnel and the pause button below.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const landing = usePathname() === "/";
  return (
    <header
      className={
        landing
          ? "pointer-events-none absolute inset-x-0 top-0 z-40"
          : "relative z-40"
      }
    >
      <div
        className={`mx-auto flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6 ${landing ? "pr-16 sm:pr-[184px] [&>*]:pointer-events-auto" : "max-w-5xl"}`}
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
  // The landing card has "Browse rewards" and the sign-up button, so signed out only "Sign in"
  // stays up here (decision 0016).
  if (path === "/" && !account) {
    return (
      <nav aria-label="Account" className="flex shrink-0 items-center">
        <Link href="/sign-in" className="pill-link">
          Sign in
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Account" className="flex shrink-0 items-center gap-2">
      {/* C-101's first app link (M-101); the others arrive with their pages (Phase 2). */}
      {path !== "/onboarding" && (
        <Button asChild variant="ghost" size="lg" className={CURRENT}>
          <Link
            href="/discover"
            aria-current={path.startsWith("/discover") ? "page" : undefined}
          >
            {msg("M-101")}
          </Link>
        </Button>
      )}
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
        <AccountMenu {...account} />
      ) : (
        <>
          {path !== "/sign-in" && (
            <Link href="/sign-in" className="pill-link">
              Sign in
            </Link>
          )}
          {path !== "/sign-up" && (
            <Button asChild size="lg">
              <Link href="/sign-up">Sign up</Link>
            </Button>
          )}
        </>
      )}
    </nav>
  );
}
