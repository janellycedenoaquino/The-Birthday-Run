import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalPage,
  legalLinkClass as linkClass,
} from "@/components/layout/legal-page";
import { appConfig } from "@/config/app";

// Template S-2 Privacy policy, this app's text (SPEC §3.3, FR-17; the data it lists: DESIGN §4.3, §4.4).
// Change it whenever a table, provider or retention period changes, and update "updated".
export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${appConfig.name} handles your data.`,
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="2026-11-26">
      <section>
        <p>
          {appConfig.name} lists the free birthday rewards from the loyalty
          programs you belong to and helps you plan when to pick them up. This
          page says what we keep about you, why, who else handles it, and how to
          get it back or delete it. We don&apos;t sell your data, show ads or
          share your data with advertisers.
        </p>
      </section>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            Your account: email address, display name if you add one, how you
            sign in (password, email link or Google), when you sign in, and
            whether you turned on two-step sign-in.
          </li>
          <li>
            Your birthday: month and day only, never the year. Also your time
            zone, so &quot;today&quot; is right for you.
          </li>
          <li>
            The loyalty programs you add. This can say something about where you
            shop, so only you can see it.
          </li>
          <li>
            Your plan: the names you give your pickup groups, their dates and
            times, and the rewards in them.
          </li>
          <li>
            Your pickups: which reward, the date, and any note or place name you
            write.
          </li>
          <li>
            Reminder emails: whether they&apos;re on, and which ones we sent you
            (so we never send the same one twice).
          </li>
          <li>
            Reports: when you report a reward as wrong, the retailer and the
            reason you picked. There&apos;s no free text.
          </li>
          <li>Premium: whether you have it and since when.</li>
        </ul>
        <p>
          We don&apos;t store your location. The start point you use for the map
          or directions (your device&apos;s location or a ZIP code) stays in
          your browser and is gone when you reload the page.
        </p>
      </section>
      <section>
        <h2>Why we collect it</h2>
        <p>
          To run your account and keep it secure, to work out when each of your
          rewards opens and closes, to show your plan and history, to send the
          reminder emails you turned on, and to fix reward information people
          report as wrong. We use only what each of those needs.
        </p>
      </section>
      <section>
        <h2>Cookies and analytics</h2>
        <p>
          We use only the cookies that keep you signed in. They can&apos;t be
          read by scripts on the page. Vercel Web Analytics counts page views
          without cookies and without identifying you. There are no ad or
          tracking cookies.
        </p>
      </section>
      <section>
        <h2>Services that process it</h2>
        <ul>
          <li>Supabase: accounts and database</li>
          <li>
            Vercel: hosting, and Web Analytics (anonymous page views, no
            cookies)
          </li>
          <li>
            Resend: sending our emails. Reminder emails list your rewards, so
            Resend handles that list too.
          </li>
          <li>Cloudflare Turnstile: telling people from bots on our forms</li>
          <li>Sentry: error reports, with personal data removed</li>
          <li>Google: only if you sign in with Google</li>
          <li>
            OpenFreeMap: map images for the area a Premium map shows. Your
            browser asks OpenFreeMap for them directly, so OpenFreeMap sees your
            IP address and the area on the map. Your start location stays on
            your device and is never stored.
          </li>
          <li>
            Google Maps: only when you open a directions link. The stops, and a
            ZIP code start if you used one, are part of the link; your
            device&apos;s location never is.
          </li>
          <li>
            GitHub: when people report a reward as wrong, GitHub gets only the
            retailer and how many reports it had. Nothing about you.
          </li>
          <li>
            Stripe: only if paid Premium is offered and you choose it. Stripe
            takes the payment and keeps its own payment records; we never see
            your card.
          </li>
        </ul>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>
          As long as you have an account. When you delete your account, your
          data is removed from the app right away. Backup copies are kept for up
          to 30 days and then deleted automatically. Supabase, which runs our
          accounts, keeps a security log of account activity (such as signing
          up, signing in and deleting your account) that can include your email
          and IP address; it stays after you delete your account.
        </p>
      </section>
      <section>
        <h2>Your choices</h2>
        <p>
          You can{" "}
          <Link href="/settings#your-data" className={linkClass}>
            download your data
          </Link>{" "}
          or{" "}
          <Link href="/settings#delete-account" className={linkClass}>
            delete your account
          </Link>{" "}
          at any time in Settings. You can turn reminder emails off in{" "}
          <Link href="/settings#reminders" className={linkClass}>
            Settings
          </Link>{" "}
          or with the link at the bottom of any reminder.
        </p>
      </section>
      <section>
        <h2>Children</h2>
        <p>
          {appConfig.name} is for people 13 and older. If you think a child
          under 13 has made an account, email us and we&apos;ll delete it.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>
          If we change what we collect or who handles it, we&apos;ll update this
          page and its date first. For a big change, we&apos;ll email you before
          it applies.
        </p>
      </section>
    </LegalPage>
  );
}
