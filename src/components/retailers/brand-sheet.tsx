"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// S-104 as a pop-up card over Discover (decision 0016): an intercepted route, so the URL changes
// and Back closes it; opening the URL directly shows the full page. A bottom sheet on phones.
// Radix moves focus into it. There's no DialogTrigger (the card's link opened it), so the card
// that had focus is remembered on mount and focused again on close (WCAG 2.4.3). Escape and the
// close button go back; a click on a toast (outside the sheet) doesn't close it.
export function BrandSheet({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [opener] = useState(() =>
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement | null),
  );
  return (
    <Dialog defaultOpen onOpenChange={(open) => !open && router.back()}>
      <DialogContent
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          if (!opener?.isConnected) return;
          event.preventDefault();
          opener.focus();
        }}
        onPointerDownOutside={(event) => {
          const target = event.target as Element | null;
          if (target?.closest("[data-sonner-toaster]")) event.preventDefault();
        }}
        className="max-h-[88dvh] overflow-y-auto rounded-[28px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-background p-5 text-base sm:max-w-xl sm:p-6 max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none"
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
