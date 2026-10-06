import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import { sendWelcomeIfFirst } from "@/server/email/welcome";
import { logError } from "@/server/errors";
import { rateLimit } from "@/server/security/rate-limit";
import { createClient } from "@/server/supabase/server";

// GET /auth/callback (BUILD F-7, FR-5, D24.8, D24.27): Google's return. Public. A cancel always
// goes back to sign-in (re-auth included); other failures to S-8; never a bare error page.

const query = z.object({
  code: z.string().min(1).max(512).optional(),
  error: z.string().max(200).optional(),
  error_description: z.string().max(1000).optional(),
});

function to(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  // auth_next is read once and cleared on every path, so an abandoned flow's destination can't
  // steer a later sign-in (#14 review).
  const cookieStore = await cookies();
  const next = cookieStore.get("auth_next")?.value;
  cookieStore.delete({ name: "auth_next", path: "/auth" });

  if (!(await rateLimit("authCallback")).ok)
    return to(request, "/auth/error?reason=rate_limited");

  // Any provider error means a cancel, even one whose text is too long for the schema (D24.8).
  if (request.nextUrl.searchParams.has("error"))
    return to(request, "/sign-in?error=oauth_cancelled");
  const parsed = query.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return to(request, "/auth/error?reason=oauth");
  const { code } = parsed.data;
  if (!code) return to(request, "/sign-in?error=oauth_cancelled");

  const supabase = await createClient();
  const { data, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !data.user) {
    logError(exchangeError ?? new Error("no user after the code exchange"), {
      op: "authCallback",
    });
    return to(request, "/auth/error?reason=oauth");
  }

  // A Google sign-up's first sign-in gets the welcome email (FR-30).
  await sendWelcomeIfFirst(supabase, data.user);

  // MFA users are sent to S-10 by the destination's guard.
  return to(request, safeRedirectPath(next, "/dashboard"));
}
