import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import { routeFormFields } from "@/lib/validation/form";
import {
  clearPending,
  heldIdSchema,
  readPending,
  revokeHeld,
  sameId,
  setPending,
} from "@/server/auth/pending-sign-in";
import { setRecoveryMarker } from "@/server/auth/recovery";
import { sendWelcomeIfFirst } from "@/server/email/welcome";
import { logError } from "@/server/errors";
import { rateLimit } from "@/server/security/rate-limit";
import { createClient, createDetachedClient } from "@/server/supabase/server";

// /auth/confirm (BUILD F-6, FR-2, D7, D10, D24.7; decision 0026): where every auth email link
// lands (E-1 sign-up, E-2 magic link, E-3 reset). Public: the link itself is the credential.
// Nothing signs in on GET. The link is verified into `auth_pending` and the visitor is asked
// S-113 "Is this you?"; only the POST "yes" puts the session in the sign-in cookies (T-118).
// Never shows a bare error: failures go to S-8. `next` never comes from the query, only from
// `auth_next`.

const query = z.object({
  token_hash: z.string().min(1).max(512),
  // Only the types our templates bake in (week-1 check 3, decisions/0013).
  type: z.enum(["signup", "magiclink", "recovery"]),
});

// Not strict: only these decide the path. `held` is the ID of the sign-in the page showed.
const answer = z.object({ choice: z.enum(["yes", "no"]), held: heldIdSchema });

// A link that's expired, already used or wrong: the user's problem to retry, not ours to log.
const EXPECTED_LINK_ERRORS = new Set(["otp_expired", "otp_disabled"]);

function to(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  // 1. Rate limit (IP). The limiter failing also sends the user to wait (fails closed).
  if (!(await rateLimit("authConfirm")).ok)
    return to(request, "/auth/error?reason=rate_limited");

  // 2. The query.
  const parsed = query.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return to(request, "/auth/error?reason=link");
  const { token_hash, type } = parsed.data;

  // 3. Verify, without touching the sign-in cookies: the session waits in `auth_pending`.
  const { data, error } = await createDetachedClient().auth.verifyOtp({
    token_hash,
    type,
  });
  if (error || !data.session || !data.user?.email) {
    if (error && !EXPECTED_LINK_ERRORS.has(error.code ?? ""))
      logError(error, { op: "authConfirm" });
    return to(request, "/auth/error?reason=link");
  }

  // 4. A sign-in already held here (an earlier link, never answered) is replaced: end it first.
  await revokeHeld(await readPending(), "authConfirmReplace");
  const held = await setPending({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    type,
    email: data.user.email,
    issuedAt: Date.now(),
  });
  if (!held) {
    // Too big for a cookie: say so in Sentry (no token or email), end it, and fail visibly.
    logError(new Error("auth_pending too large for a cookie"), {
      op: "authConfirm",
    });
    await clearPending();
    await createDetachedClient().auth.admin.signOut(
      data.session.access_token,
      "local",
    );
    return to(request, "/auth/error?reason=link");
  }
  return to(request, "/auth/is-this-you");
}

export async function POST(request: NextRequest) {
  // 1. Same-origin forms only: another site's POST could otherwise clear the held sign-in and
  // `auth_next` (it can't answer: its request carries no `auth_pending`).
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin")
    return to(request, "/auth/error?reason=link");

  // 2. Rate limit (IP), a key of its own so the GET's count doesn't use it up.
  if (!(await rateLimit("authConfirmAnswer")).ok)
    return to(request, "/auth/error?reason=rate_limited");

  // 3. The form.
  const parsed = answer.safeParse(await routeFormFields(request));
  if (!parsed.success) return to(request, "/auth/error?reason=link");

  // 4. The held sign-in: read once and cleared on every path, like `auth_next`.
  const held = await readPending();
  await clearPending();
  const cookieStore = await cookies();
  const next = cookieStore.get("auth_next")?.value;
  cookieStore.delete({ name: "auth_next", path: "/auth" });

  // 5. Only the sign-in the page showed, inside its window. Anything else (expired, or replaced
  // by a later link in another tab) is ended, and the link has to be opened again.
  if (!held || !held.fresh || !sameId(held.id, parsed.data.held)) {
    await revokeHeld(held, "authConfirmStale");
    return to(request, "/auth/error?reason=link");
  }
  const pending = held.payload;

  // 6. "No": end that session on the server (its refresh token stops working).
  if (parsed.data.choice === "no") {
    await revokeHeld(held, "authConfirmDecline");
    return to(request, "/auth/is-this-you?declined=1");
  }

  // 7. "Yes": the session moves into the sign-in cookies.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.setSession({
    access_token: pending.accessToken,
    refresh_token: pending.refreshToken,
  });
  if (error || !data.user) {
    if (error) logError(error, { op: "authConfirmAccept" });
    await revokeHeld(held, "authConfirmAccept");
    return to(request, "/auth/error?reason=link");
  }

  // 8. The welcome email, once per account, for every link type (F-5). Never fails the sign-in.
  await sendWelcomeIfFirst(supabase, data.user);

  // 9. Where to: a reset goes to S-7; otherwise where the user was headed, then the guards take
  // over (password-unset → S-9, MFA → S-10).
  if (pending.type === "recovery") {
    // GoTrue records a reset as amr "otp" (week-1 check 5): mark this session, signed
    // (decisions/0014). No session id → no marker, so S-7 shows the expired content.
    const { data: claimsData } = await supabase.auth.getClaims();
    const sessionId = claimsData?.claims.session_id;
    if (typeof sessionId === "string")
      await setRecoveryMarker(data.user.id, sessionId);
    return to(request, "/reset-password");
  }
  return to(request, safeRedirectPath(next, "/rewards"));
}
