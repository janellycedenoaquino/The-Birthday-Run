"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// S-104 as a pop-up card over Discover (decision 0016): an intercepted route, so the URL changes
// and Back closes it; opening the URL directly shows the full page. A bottom sheet on phones.
// Radix moves focus into it and back to the card that opened it; Escape and the close button
// go back.
export function BrandSheet({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <Dialog defaultOpen onOpenChange={(open) => !open && router.back()}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[88dvh] overflow-y-auto rounded-[28px] bg-background p-5 text-base sm:max-w-xl sm:p-6 max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none"
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
