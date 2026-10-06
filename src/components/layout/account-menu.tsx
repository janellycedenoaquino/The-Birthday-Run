"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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

// C-1's account menu (SPEC §3.2). The trigger always shows the signed-in email, so someone signed
// into another account by a crafted link notices (D24.9). Every value is rendered as text.
export function AccountMenu({ email, displayName, signOut }: Account) {
  return (
    // Not modal: Radix's modal mode locks scrolling with an injected <style> that carries no
    // nonce, which the CSP blocks (D5; BUILD F-3). A small menu doesn't need the page frozen.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className="max-w-[55vw] sm:max-w-72"
        >
          <span className="truncate">{email}</span>
          <ChevronDown aria-hidden="true" className="opacity-60" />
        </Button>
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
