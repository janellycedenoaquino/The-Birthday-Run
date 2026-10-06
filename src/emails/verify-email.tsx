import { appConfig } from "../config/app";
import { EmailLayout } from "./components/email-layout";

// E-1 verify email (SPEC §3.4, BUILD F-5). Exported by `npm run email:build` into
// supabase/templates/confirmation.html with Supabase's Go placeholders, so the link is filled in by GoTrue.
// No props: `react-email export` renders without PreviewProps (week-1 check 8, decision 0013), and
// GoTrue fills these Go placeholders when it sends.
const SITE_URL = "{{ .SiteURL }}";
const TOKEN_HASH = "{{ .TokenHash }}";

export default function Email() {
  return (
    <EmailLayout
      siteUrl={SITE_URL}
      preview={"Confirm your email"}
      heading={"Confirm your email"}
      intro={`Confirm this address to finish creating your ${appConfig.name} account. You'll choose a password next.`}
      buttonLabel="Confirm email"
      url={`${SITE_URL}/auth/confirm?token_hash=${TOKEN_HASH}&type=signup`}
      footnote="If you didn't ask for this, you can ignore this email."
    />
  );
}
