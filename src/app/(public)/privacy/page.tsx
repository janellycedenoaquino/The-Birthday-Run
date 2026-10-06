import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/layout/legal-page";
import { appConfig } from "@/config/app";

// S-2 Privacy policy placeholder (SPEC §3.3, FR-17, D24.20, D14, U1). Replace before launch.
export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${appConfig.name} handles your data.`,
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="2026-09-29">
      <section>
        <h2>What we collect</h2>
        <p>
          Your email address, your display name if you add one, how you sign in
          (password, email link or Google), and when you sign in.
        </p>
      </section>
      <section>
        <h2>Why we collect it</h2>
        <p>
          To create and secure your account, sign you in, and contact you about
          it.
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
          <li>Resend: sending our emails</li>
          <li>Cloudflare Turnstile: telling people from bots on our forms</li>
          <li>Sentry: error reports, with personal data removed</li>
          <li>Google: only if you sign in with Google</li>
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
          <Link
            href="/settings#your-data"
            className="underline underline-offset-4"
          >
            download your data
          </Link>{" "}
          or{" "}
          <Link
            href="/settings#delete-account"
            className="underline underline-offset-4"
          >
            delete your account
          </Link>{" "}
          at any time in Settings.
        </p>
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
