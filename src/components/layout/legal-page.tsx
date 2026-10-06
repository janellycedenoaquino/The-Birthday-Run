import type { ReactNode } from "react";
import { msg } from "@/lib/messages";

// S-2 / S-3 frame (SPEC §3.3): the non-dismissible placeholder banner (M-40), h1, date, prose.
// Each app replaces the text before launch (FR-17, LAUNCH_CHECKLIST).
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <p className="mb-8 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
        {msg("M-40")}
      </p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: {updated}
      </p>
      <div className="mt-8 space-y-6 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}
