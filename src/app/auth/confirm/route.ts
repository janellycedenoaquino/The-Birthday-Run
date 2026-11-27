import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import {
  clearPending,
  readPending,
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

// Not strict: only `choice` decides the path.
const answer = z.object({ choice: z.enum(["yes", "no"]) });

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
  await setPending({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    type,
    email: data.user.email,
    issuedAt: Date.now(),
  });
  return to(request, "/auth/is-this-you");
}

export async function POST(request: NextRequest) {
  // 1. Rate limit (IP), a key of its own so the GET's count doesn't use it up.
  if (!(await rateLimit("authConfirmAnswer")).ok)
    return to(request, "/auth/error?reason=rate_limited");

  // 2. The form.
  let form: Record<string, string> = {};
  try {
    const fd = await request.formData();
    form = Object.fromEntries(
      [...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]),
    );
  } catch {
    // Not a form: fails the parse below.
  }
  const parsed = answer.safeParse(form);
  if (!parsed.success) return to(request, "/auth/error?reason=link");

  // 3. The held session: read once and cleared on every path, like `auth_next`. Missing,
  // altered or older than its window → the link has to be opened again.
  const pending = await readPending();
  await clearPending();
  const cookieStore = await cookies();
  const next = cookieStore.get("auth_next")?.value;
  cookieStore.delete({ name: "auth_next", path: "/auth" });
  if (!pending) return to(request, "/auth/error?reason=link");

  // 4. "No": end that session on the server, so its tokens are worth nothing.
  if (parsed.data.choice === "no") {
    const { error } = await createDetachedClient().auth.admin.signOut(
      pending.accessToken,
      "local",
    );
    if (error) logError(error, { op: "authConfirmDecline" });
    return to(request, "/auth/is-this-you?declined=1");
  }

  // 5. "Yes": the session moves into the sign-in cookies.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.setSession({
    access_token: pending.accessToken,
    refresh_token: pending.refreshToken,
  });
  if (error || !data.user) {
    if (error) logError(error, { op: "authConfirmAccept" });
    return to(request, "/auth/error?reason=link");
  }

  // 6. The welcome email, once per account, for every link type (F-5). Never fails the sign-in.
  await sendWelcomeIfFirst(supabase, data.user);

  // 7. Where to: a reset goes to S-7; otherwise where the user was headed, then the guards take
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
