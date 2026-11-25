"use client";

import { CalendarRange, Compass, History, Ticket } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { msg, type MessageId } from "@/lib/messages";

// C-101 on phones (decision 0016): a bottom tab bar on every signed-in page, with an icon and a
// label per tab; the current tab sits on the pink block with a navy outline. Laptops keep the links
// in the top bar (the header hides them below `sm`). Hidden on onboarding and the step pages, like
// the rest of C-101. The spacer keeps the footer clear of the fixed bar.
const TABS: { href: string; label: MessageId; Icon: typeof Ticket }[] = [
  { href: "/discover", label: "M-101", Icon: Compass },
  { href: "/rewards", label: "M-101b", Icon: Ticket },
  { href: "/plan", label: "M-101d", Icon: CalendarRange },
  { href: "/history", label: "M-101c", Icon: History },
];
const HIDDEN_ON = [
  "/onboarding",
  "/auth/set-password",
  "/auth/mfa",
  "/auth/reauthenticate",
];

export function PhoneTabBar() {
  const path = usePathname();
  if (HIDDEN_ON.includes(path)) return null;
  return (
    <>
      <div aria-hidden="true" className="h-[76px] sm:hidden" />
      <nav
        aria-label={msg("M-299")}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t-[1.5px] border-border bg-background/95 px-1.5 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] backdrop-blur-md sm:hidden"
      >
        {TABS.map(({ href, label, Icon }) => {
          const current = path === href || path.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`flex flex-col items-center gap-[3px] py-1 text-[11px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${current ? "text-foreground" : "text-muted-foreground"}`}
            >
              <span
                className={`grid h-[30px] w-11 place-items-center rounded-[10px] ${current ? "bg-[var(--bubblegum)] text-[var(--navy)] shadow-[0_0_0_1.5px_var(--navy)]" : ""}`}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              {msg(label)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
