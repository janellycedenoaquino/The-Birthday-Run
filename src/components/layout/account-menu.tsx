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

/**
 * The circle's letter: the first character of the EMAIL, never the display name. The name is
 * the user's (or an attacker's, T22) free text, so it could copy someone else's initial; the
 * email can't be chosen to look like the victim's. A whole character (not half an emoji), upper
 * case in English, "?" if there's none.
 */
export function accountInitial(email: string): string {
  const first = Array.from(email.trim())[0];
  // Upper-casing can make two letters ("ß" → "SS"): keep the first whole character.
  return first ? Array.from(first.toLocaleUpperCase("en-US"))[0]! : "?";
}

// C-1's account menu (SPEC §3.2). The trigger is a round initial (decision 0016 prototype;
// decision 0022, which weakens D24.9's always-visible email). The initial is of the email, the
// button's name starts with that letter (WCAG 2.5.3) and carries the email, and the open menu
// shows the email first, in full, above any display name. Every value is rendered as text.
export function AccountMenu({ email, displayName, signOut }: Account) {
  const initial = accountInitial(email);
  return (
    // Not modal: Radix's modal mode locks scrolling with an injected <style> that carries no
    // nonce, which the CSP blocks (D5; BUILD F-3). A small menu doesn't need the page frozen.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={email}
          aria-label={`${initial}, account ${email}`}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[#ffd6e5] font-extrabold text-[var(--navy)] shadow-[0_0_0_1.5px_var(--navy)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:shadow-[0_0_0_1.5px_var(--foreground)]"
        >
          <span aria-hidden="true">{initial}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {/* The email first and strongest: a display name can't pose as it (T22). */}
        <DropdownMenuLabel>
          <span className="block font-medium break-all">{email}</span>
          {displayName?.trim() ? (
            <span className="block truncate text-muted-foreground">
              {displayName}
            </span>
          ) : null}
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
