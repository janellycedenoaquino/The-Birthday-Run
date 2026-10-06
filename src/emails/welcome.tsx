import { appConfig } from "../config/app";
import { EmailLayout } from "./components/email-layout";

// E-4 welcome (SPEC §3.4, BUILD F-5, FR-30). Sent by the app (sendWelcomeIfFirst), not
// Supabase, so it gets the real site URL from getSiteUrl().
type Props = { siteUrl: string };

export default function Welcome({ siteUrl }: Props) {
  return (
    <EmailLayout
      siteUrl={siteUrl}
      preview="Your account is ready."
      heading={`Welcome to ${appConfig.name}`}
      intro="Your account is ready."
      buttonLabel="Go to your dashboard"
      url={`${siteUrl}/dashboard`}
      footnote={`Questions? Reply to ${appConfig.supportEmail}.`}
    />
  );
}

Welcome.PreviewProps = { siteUrl: "http://localhost:3000" } satisfies Props;
