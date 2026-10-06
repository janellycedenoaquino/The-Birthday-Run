import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createElement } from "react";
import { render } from "react-email";
import { appConfig } from "@/config/app";
import Welcome from "@/emails/welcome";
import type { Database } from "@/lib/types/database.types";
import { logError } from "@/server/errors";
import { getSiteUrl } from "@/server/site-url";
import { getAdminClient } from "@/server/supabase/admin";
import { sendEmail } from "./send";

// The welcome email, at most once per account (BUILD F-5, FR-30, D7, D24.11). Called after a
// verified sign-in; never fails it. The claim is atomic in Postgres, so two sign-ins at once
// send one email; a failed send releases the claim (service role, id from getUser()).

const SUBJECT = "Welcome"; // E-4, SPEC §3.4

export async function sendWelcomeIfFirst(
  supabase: SupabaseClient<Database>,
  user: Pick<User, "id" | "email">,
): Promise<void> {
  // No address, nothing to send: don't use up the one claim (#17 review).
  if (!user.email) return;

  // 1-2. Claim with the user's own client; only the first verified sign-in gets `true`.
  const { data: claimed, error } = await supabase.rpc("claim_welcome_email");
  if (error) {
    logError(error, { op: "welcome.claim", userId: user.id });
    return;
  }
  if (claimed !== true) return;

  // 3. Render and send.
  let ok = false;
  try {
    const element = createElement(Welcome, { siteUrl: getSiteUrl() });
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);
    ok = (
      await sendEmail({
        to: user.email,
        subject: SUBJECT,
        html,
        text,
        // E-4 says "Reply to {supportEmail}": replies go there, not to the sender address.
        replyTo: appConfig.supportEmail,
      })
    ).ok;
  } catch (renderError) {
    logError(renderError, { op: "welcome.render", userId: user.id });
  }
  if (ok) return;

  // 4. Release, so a later sign-in tries again. Never throws: the sign-in must go on.
  try {
    const { error: releaseError } = await getAdminClient().rpc(
      "release_welcome_email",
      { p_user_id: user.id },
    );
    logError(
      releaseError ?? new Error("welcome email not sent; claim released"),
      { op: "welcome.release", userId: user.id },
    );
  } catch (releaseError) {
    logError(releaseError, { op: "welcome.release", userId: user.id });
  }
}
