import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalPage,
  legalLinkClass as linkClass,
} from "@/components/layout/legal-page";
import { appConfig } from "@/config/app";

// Template S-3 Terms, this app's text (SPEC §3.3, FR-17; DESIGN §4.4 "Terms" and "Attribution").
// Before payments go on, add the paid-plan terms (LAUNCH-CHECKLIST "Before turning payments on").
export const metadata: Metadata = {
  title: "Terms",
  description: `The terms for using ${appConfig.name}.`,
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="2026-11-26">
      <section>
        <h2>Using the service</h2>
        <p>
          {appConfig.name} lists the free birthday rewards that loyalty programs
          offer, works out when each one opens and closes for you, and helps you
          plan when to pick them up. It&apos;s free. Premium adds the map, Smart
          Grouping, more room in your plan and reminder emails. You need to be
          13 or older to make an account.
        </p>
        <p>
          We&apos;re not part of, or paid by, any of the brands listed. Their
          names and logos belong to them and are shown only to say which reward
          is which.
        </p>
      </section>
      <section>
        <h2>Reward information</h2>
        <p>
          We check each reward against the brand&apos;s own pages, but brands
          change their rewards without telling us. What we show can be out of
          date or wrong, and a store can decide not to honour it. The
          brand&apos;s own terms always win. Check the brand&apos;s app or site
          before you go. If something is wrong, report it on the reward&apos;s
          page and we&apos;ll check it.
        </p>
        <p>
          Store locations, distances and directions are a guide only. Distances
          are in a straight line, not by road. We aren&apos;t responsible for a
          reward you miss or a trip that doesn&apos;t work out.
        </p>
      </section>
      <section>
        <h2>Your account</h2>
        <p>
          Keep your sign-in details to yourself, and use an email address you
          can open. You&apos;re responsible for what happens in your account. If
          you think someone else got in, change your password and email us.
          Turning on two-step sign-in in Settings makes this much harder.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>Please don&apos;t:</p>
        <ul>
          <li>try to get into someone else&apos;s account or data</li>
          <li>
            test, scan or overload the service, or get around its limits or bot
            checks
          </li>
          <li>copy the reward list in bulk with scripts or bots</li>
          <li>send false reports about rewards</li>
          <li>use the service for anything illegal</li>
        </ul>
        <p>
          If you find a security problem, email us instead of testing it on
          other people&apos;s accounts.
        </p>
      </section>
      <section>
        <h2>Ending your account</h2>
        <p>
          You can delete your account at any time in{" "}
          <Link href="/settings#delete-account" className={linkClass}>
            Settings
          </Link>
          . Your data is removed from the app right away, as the{" "}
          <Link href="/privacy" className={linkClass}>
            privacy policy
          </Link>{" "}
          explains. We can close an account that breaks these terms, and
          we&apos;ll email you first unless it&apos;s putting other people at
          risk. We may also change or stop the service; if we stop it,
          we&apos;ll give you at least 30 days&apos; notice by email so you can
          download your data.
        </p>
      </section>
      <section>
        <h2>No guarantee</h2>
        <p>
          The service is provided as it is, without any promise that it will
          always be available, correct or free of errors. As far as the law
          allows, we aren&apos;t liable for losses that come from using it.
        </p>
      </section>
      <section>
        <h2>Credits</h2>
        <ul>
          <li>
            Map: OpenFreeMap © OpenMapTiles. Data from OpenStreetMap
            contributors, available under the Open Database License (ODbL).
          </li>
          <li>
            Store locations: All The Places (CC0), and Overture Maps Foundation
            Places. Data from Overture Maps Foundation, available under CDLA
            Permissive 2.0; Foursquare data available under the Apache License
            2.0.
          </li>
          <li>ZIP code areas: U.S. Census Bureau.</li>
        </ul>
      </section>
      <section>
        <h2>Changes</h2>
        <p>
          If we change these terms, we&apos;ll update this page and its date.
          For a big change, we&apos;ll email you before it applies. Using the
          service after that means you accept the new terms.
        </p>
      </section>
    </LegalPage>
  );
}
