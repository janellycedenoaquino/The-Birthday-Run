"use client";

import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type Account = {
  email: string;
  displayName: string | null;
  /** The `signOut` server action (F-7): a form button, so it works before hydration. */
  signOut: () => Promise<void>;
};

// C-1's account menu (SPEC §3.2). The trigger is a round initial (decision 0016 prototype; owner,
// 2026-11-25, decision 0022). D24.9 wanted the email always visible, so someone signed into
// another account by a crafted link notices: the initial is of that email, its accessible name
// and tooltip carry the email, and the open menu shows it first. Every value is rendered as text.
export function AccountMenu({ email, displayName, signOut }: Account) {
  return (
    // Not modal: Radix's modal mode locks scrolling with an injected <style> that carries no
    // nonce, which the CSP blocks (D5; BUILD F-3). A small menu doesn't need the page frozen.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={email}
          aria-label={`Account: ${email}`}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[#ffd6e5] font-extrabold text-[var(--navy)] uppercase shadow-[0_0_0_1.5px_var(--navy)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span aria-hidden="true">
            {(displayName || email).trim().charAt(0)}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {displayName && (
            <span className="block truncate font-medium">{displayName}</span>
          )}
          <span className="block break-all text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit">Sign out</button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
