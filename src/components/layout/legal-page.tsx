import type { ReactNode } from "react";
import { appConfig } from "@/config/app";

export const legalLinkClass = "underline underline-offset-4";

// S-2 / S-3 frame (Template SPEC §3.3): h1, date, prose, and the closing Contact section. This app's text is filled in, so the
// Template's placeholder banner (M-40) is gone (SPEC §3.3 "Template S-2 and S-3").
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
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: {updated}
      </p>
      <div className="mt-8 space-y-6 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
        <section>
          <h2>Contact</h2>
          <p>
            <a
              href={`mailto:${appConfig.supportEmail}`}
              className={legalLinkClass}
            >
              {appConfig.supportEmail}
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
