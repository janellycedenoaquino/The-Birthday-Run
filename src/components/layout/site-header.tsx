import Image from "next/image";
import Link from "next/link";
import { appConfig } from "@/config/app";
import type { Account } from "./account-menu";
import { HeaderNav } from "./header-nav";

// C-1 (SPEC §3.2). Sticky; the root layout's scroll padding matches its height (WCAG 2.4.11).
// What shows on the right depends on the current path, so that part is the client HeaderNav.
export function SiteHeader({ account }: { account: Account | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={account ? "/dashboard" : "/"}
          className="flex min-w-0 items-center gap-2.5 rounded-md font-semibold tracking-tight transition-opacity outline-none hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Image
            src={appConfig.logo.svg}
            alt={appConfig.logo.alt}
            width={28}
            height={28}
            unoptimized
            className="size-7 shrink-0"
          />
          <span translate="no" className="truncate">
            {appConfig.name}
          </span>
        </Link>
        <HeaderNav account={account} />
      </div>
    </header>
  );
}
