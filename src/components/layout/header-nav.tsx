"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AccountMenu, type Account } from "./account-menu";

// C-1's right side (SPEC §3.2). A client component because it depends on the current path, and
// the root layout isn't re-rendered on client-side navigation: a path read on the server would
// stay at the first page loaded. The step pages show no nav, so the step can't be skipped from
// here (the guards still enforce it); S-4/S-5 hide their own button.
const STEP_PAGES = ["/auth/set-password", "/auth/mfa", "/auth/reauthenticate"];

export function HeaderNav({ account }: { account: Account | null }) {
  const path = usePathname();
  if (STEP_PAGES.includes(path)) return null;

  return (
    <nav aria-label="Account" className="flex shrink-0 items-center gap-2">
      {account ? (
        <AccountMenu {...account} />
      ) : (
        <>
          {path !== "/sign-in" && (
            <Button asChild variant="ghost" size="lg">
              <Link href="/sign-in">Sign in</Link>
            </Button>
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
