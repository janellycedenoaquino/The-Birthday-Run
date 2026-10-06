import { NextResponse, type NextRequest } from "next/server";
import { GuardError, requireUser, withRefusals } from "@/server/auth/guards";
import { buildExport, exportFilename } from "@/server/data/export";
import { logError } from "@/server/errors";
import { rateLimit } from "@/server/security/rate-limit";

// GET /account/export (BUILD F-11, FR-15, D13, D24.19): the user's data as a JSON download.
// Failures are 303 redirects to a page with a message, never data or a bare error.

const GUARD_TARGETS = {
  signed_out: "/sign-in?next=%2Fsettings",
  mfa_required: "/auth/mfa?next=%2Fsettings",
  password_required: "/auth/set-password",
  reauth_required: "/auth/reauthenticate?next=%2Fsettings",
} as const;

function to(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  let session;
  try {
    session = await withRefusals(() => requireUser());
  } catch (error) {
    if (error instanceof GuardError)
      return to(request, GUARD_TARGETS[error.code]);
    logError(error, { op: "accountExport.guard" });
    return to(request, "/settings?export=failed#your-data");
  }
  const { supabase, user } = session;

  const limit = await rateLimit("accountExport", { userId: user.id });
  if (!limit.ok)
    return to(
      request,
      `/settings?export=${limit.error === "M-5" ? "rate_limited" : "failed"}#your-data`,
    );

  try {
    const now = new Date();
    const body = JSON.stringify(
      await buildExport(supabase, user, now),
      null,
      2,
    );
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(now)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logError(error, { op: "accountExport", userId: user.id });
    return to(request, "/settings?export=failed#your-data");
  }
}
