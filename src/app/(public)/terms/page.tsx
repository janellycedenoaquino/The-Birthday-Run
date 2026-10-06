import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { appConfig } from "@/config/app";

// S-3 Terms placeholder (SPEC §3.3, FR-17). Replace before launch.
export const metadata: Metadata = {
  title: "Terms",
  description: `The terms for using ${appConfig.name}.`,
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="2026-09-29">
      <section>
        <h2>Using the service</h2>
        <p>Describe what the service is and who may use it.</p>
      </section>
      <section>
        <h2>Your account</h2>
        <p>
          Describe the user&apos;s responsibilities for their account and its
          security.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>Describe what isn&apos;t allowed.</p>
      </section>
      <section>
        <h2>Ending your account</h2>
        <p>
          Describe how either side can end the account, and what happens to the
          data.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>Describe how users are told about changes to these terms.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          <a
            href={`mailto:${appConfig.supportEmail}`}
            className="underline underline-offset-4"
          >
            {appConfig.supportEmail}
          </a>
        </p>
      </section>
    </LegalPage>
  );
}
