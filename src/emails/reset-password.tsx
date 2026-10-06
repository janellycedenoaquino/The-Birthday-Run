import { EmailLayout } from "./components/email-layout";

// E-3 reset password (SPEC §3.4, BUILD F-5). Exported by `npm run email:build` into
// supabase/templates/recovery.html with Supabase's Go placeholders, so the link is filled in by GoTrue.
// No props: `react-email export` renders without PreviewProps (week-1 check 8, decision 0013), and
// GoTrue fills these Go placeholders when it sends.
const SITE_URL = "{{ .SiteURL }}";
const TOKEN_HASH = "{{ .TokenHash }}";

export default function Email() {
  return (
    <EmailLayout
      siteUrl={SITE_URL}
      preview={"Reset your password"}
      heading={"Reset your password"}
      intro={"Choose a new password for your account."}
      buttonLabel="Reset password"
      url={`${SITE_URL}/auth/confirm?token_hash=${TOKEN_HASH}&type=recovery`}
      footnote="If you didn't ask for this, your password hasn't changed and you can ignore this email."
    />
  );
}
