import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import { setRecoveryMarker } from "@/server/auth/recovery";
import { sendWelcomeIfFirst } from "@/server/email/welcome";
import { logError } from "@/server/errors";
import { rateLimit } from "@/server/security/rate-limit";
import { createClient } from "@/server/supabase/server";

// GET /auth/confirm (BUILD F-6, FR-2, D7, D10, D24.7): where every auth email link lands (E-1
// sign-up, E-2 magic link, E-3 reset). Public: the link itself is the credential. Never shows a
// bare error: failures go to S-8. `next` never comes from the query, only from `auth_next`.

const query = z.object({
  token_hash: z.string().min(1).max(512),
  // Only the types our templates bake in (week-1 check 3, decisions/0013).
  type: z.enum(["signup", "magiclink", "recovery"]),
});

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

  // 3. Verify: sets the session cookies.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error || !data.user) {
    if (error && !EXPECTED_LINK_ERRORS.has(error.code ?? ""))
      logError(error, { op: "authConfirm" });
    return to(request, "/auth/error?reason=link");
  }

  // 4. The welcome email, once per account, for every link type (F-5). Never fails the sign-in.
  await sendWelcomeIfFirst(supabase, data.user);

  // 5. Where to: a reset goes to S-7; otherwise where the user was headed, then the guards take
  // over (password-unset → S-9, MFA → S-10).
  if (type === "recovery") {
    // GoTrue records a reset as amr "otp" (week-1 check 5): mark this session, signed
    // (decisions/0014). No session id → no marker, so S-7 shows the expired content.
    const { data: claimsData } = await supabase.auth.getClaims();
    const sessionId = claimsData?.claims.session_id;
    if (typeof sessionId === "string")
      await setRecoveryMarker(data.user.id, sessionId);
    return to(request, "/reset-password");
  }
  const cookieStore = await cookies();
  const next = cookieStore.get("auth_next")?.value;
  cookieStore.delete({ name: "auth_next", path: "/auth" });
  return to(request, safeRedirectPath(next, "/dashboard"));
}
