"use server";

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import {
  currentPasswordSchema,
  emailSchema,
  newPasswordSchema,
  nextSchema,
  turnstileTokenSchema,
} from "@/lib/validation/auth";
import { parseForm } from "@/lib/validation/form";
import { requireUser } from "@/server/auth/guards";
import {
  clearRecoveryMarker,
  isRecoverySessionNow,
} from "@/server/auth/recovery";
import { sendWelcomeIfFirst } from "@/server/email/welcome";
import {
  logError,
  padToMinimum,
  toUserMessage,
  withNotice,
} from "@/server/errors";
import { runAction } from "@/server/run-action";
import { rateLimit } from "@/server/security/rate-limit";
import { getSiteUrl } from "@/server/site-url";
import { createClient } from "@/server/supabase/server";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { env } from "@/server/env";

// Auth server actions (BUILD F-6..F-9). Each is a public endpoint (CLAUDE.md rule 4): it
// validates its own input and runs its own guard, in the §0.2 order.

const reauthenticateSchema = z
  .object({
    password: currentPasswordSchema,
    turnstileToken: turnstileTokenSchema,
    next: nextSchema,
  })
  .strict();

/** S-11 (BUILD F-9, FR-56, D9): a fresh sign-in with the current password. */
export async function reauthenticateWithPassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Zod.
  const input = parseForm(reauthenticateSchema, formData);
  if (!input.ok) return input.result;
  const { password, turnstileToken, next } = input.data;

  return runAction("reauthenticateWithPassword", async () => {
    // 2. Guard: signed in (a stale session is exactly why the user is here, so not "recent").
    const { supabase, user } = await requireUser();

    // 3. Rate limit.
    const limit = await rateLimit("reauthenticateWithPassword", {
      userId: user.id,
    });
    if (!limit.ok) return limit;

    // 4. The email comes from the verified user, never from input.
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password,
      options: { captchaToken: turnstileToken },
    });

    // 5. Failure: M-19 (signed in already, so saying "wrong password" leaks nothing).
    if (error) {
      if (error.code === "invalid_credentials")
        return { ok: false, error: "M-19" };
      return { ok: false, error: toUserMessage(error.code) };
    }

    // 6. The new session is aal1: MFA users confirm their code first (D9, D8).
    const target = safeRedirectPath(next, "/settings");
    const mfaOn = (user.factors ?? []).some((f) => f.status === "verified");
    redirect(mfaOn ? `/auth/mfa?next=${encodeURIComponent(target)}` : target);
  });
}

// D24.10: signed-out answers that could reveal whether an account exists take at least this long.
const MIN_RESPONSE_MS = 500;
// Supabase's own "too soon / too many" answers, masked as success like everything else (D24.10).
const EXPECTED_OTP_ERRORS = new Set([
  "over_email_send_rate_limit",
  "over_request_rate_limit",
]);

const signUpSchema = z
  .object({ email: emailSchema, turnstileToken: turnstileTokenSchema })
  .strict();

/**
 * S-5 (BUILD F-6, FR-1, D10): email first, no password. Every outcome but a failed CAPTCHA is
 * M-1, for new and existing emails alike, after the same minimum time (NFR-12, D24.10).
 */
export async function signUp(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(signUpSchema, formData);
  if (!input.ok) return input.result;
  const { email, turnstileToken } = input.data;
  const start = Date.now();
  try {
    const limit = await rateLimit("signUp", { email });
    if (!limit.ok) return limit;

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        captchaToken: turnstileToken,
        emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
      },
    });
    if (error?.code === "captcha_failed") return { ok: false, error: "M-6" };
    if (error && !EXPECTED_OTP_ERRORS.has(error.code ?? ""))
      logError(error, { op: "signUp" });
    return { ok: true, message: "M-1" };
  } catch (error) {
    logError(error, { op: "signUp" });
    return { ok: false, error: "M-7" };
  } finally {
    await padToMinimum(start, MIN_RESPONSE_MS);
  }
}

const setPasswordSchema = newPasswordSchema
  .extend({ next: nextSchema })
  .strict();

/** S-9 (BUILD F-6, FR-1, FR-2, D10, D24.1): the verified owner chooses the first password. */
export async function setInitialPassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(setPasswordSchema, formData);
  if (!input.ok) return input.result;
  const { password, next } = input.data;

  return runAction("setInitialPassword", async () => {
    const { supabase, user } = await requireUser({
      allowPendingPassword: true,
    });
    // Only email-only accounts set a first password here; Google users add one by reset (D24.1).
    const emailOnly = (user.identities ?? []).every(
      (identity) => identity.provider === "email",
    );
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("password_set_at")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile)
      throw new Error("setInitialPassword: could not read the profile", {
        cause: profileError ?? "profile row missing",
      });
    if (profile.password_set_at) return { ok: false, error: "API-6" };
    if (!emailOnly)
      throw new Error("setInitialPassword: not an email-only account");

    const limit = await rateLimit("setInitialPassword", { userId: user.id });
    if (!limit.ok) return limit;

    const { error } = await supabase.auth.updateUser({ password });
    // secure_password_change (D9): a session older than ~24 h can't set a password without a
    // nonce email. The reset link gives a fresh session, so point there (SPEC S-9, M-41).
    if (error?.code === "reauthentication_needed")
      return { ok: false, error: "M-41" };
    if (error) {
      const id = toUserMessage(error.code);
      if (id === "API-7" || id === "M-32")
        return {
          ok: false,
          error: "API-4",
          fieldErrors: { password: [msg(id)] },
        };
      return { ok: false, error: id };
    }

    // Records that the owner chose it (D24.1). If this fails the password still works, and a
    // retry records it (mark_password_set is idempotent).
    const { data: marked, error: markError } =
      await supabase.rpc("mark_password_set");
    if (markError || marked !== true) {
      logError(markError ?? new Error("mark_password_set returned false"), {
        op: "setInitialPassword.mark",
        userId: user.id,
      });
      return { ok: false, error: "M-7" };
    }

    // Back to S-9 itself would redirect again and drop the notice: the dashboard instead.
    const target = safeRedirectPath(next);
    redirect(
      withNotice(
        target.startsWith("/auth/") ? "/dashboard" : target,
        "password_set",
      ),
    );
  });
}

/**
 * Sign out of this device (BUILD F-7, D24.2, D24.14): no guard, no input, no limit; a no-op
 * when signed out. Session cookies are cleared even if Supabase can't be reached.
 */
export async function signOut(): Promise<never> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) logError(error, { op: "signOut" });
  } catch (error) {
    logError(error, { op: "signOut" });
  }
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll())
    if (name.startsWith("sb-")) cookieStore.delete(name);
  // A pending destination belongs to this user's sign-in, not the next person's.
  cookieStore.delete({ name: "auth_next", path: "/auth" });
  // So does an unused reset marker (#15 review).
  await clearRecoveryMarker();
  redirect("/");
}

// `auth_next` (BUILD §0.7, D24.8): where a magic link or Google return should land. Only the
// callback routes under /auth read it; always a checked same-site path; 1 hour.
// No `next` clears any old value, so an earlier, abandoned flow can't steer this one (#14 review).
async function setAuthNext(next: string | undefined) {
  const cookieStore = await cookies();
  if (!next) {
    cookieStore.delete({ name: "auth_next", path: "/auth" });
    return;
  }
  cookieStore.set("auth_next", safeRedirectPath(next), {
    ...sessionCookieOptions(env.NEXT_PUBLIC_SITE_URL),
    path: "/auth",
    maxAge: 60 * 60,
  });
}

const signInSchema = z
  .object({
    email: emailSchema,
    password: currentPasswordSchema,
    turnstileToken: turnstileTokenSchema,
    next: nextSchema,
  })
  .strict();

/**
 * S-4 password sign-in (BUILD F-7, FR-3, NFR-12, D24.10): every credential failure (wrong
 * password, unknown email, unconfirmed, no password, Google-only) is the same M-4 after the same
 * minimum time.
 */
export async function signIn(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(signInSchema, formData);
  if (!input.ok) return input.result;
  const { email, password, turnstileToken, next } = input.data;
  const start = Date.now();

  let factors: { status: string }[] = [];
  try {
    const limit = await rateLimit("signIn", { email });
    if (!limit.ok) return limit;

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: turnstileToken },
    });
    if (error?.code === "captcha_failed") return { ok: false, error: "M-6" };
    if (error?.code === "over_request_rate_limit")
      return { ok: false, error: "M-5" };
    if (error || !data.user) {
      if (
        error &&
        error.code !== "invalid_credentials" &&
        error.code !== "email_not_confirmed"
      )
        logError(error, { op: "signIn" });
      await padToMinimum(start, MIN_RESPONSE_MS);
      return { ok: false, error: "M-4" };
    }

    // Success: the welcome email once (F-5), then MFA users confirm their code first.
    await sendWelcomeIfFirst(supabase, data.user);
    factors = data.user.factors ?? [];
  } catch (error) {
    logError(error, { op: "signIn" });
    return { ok: false, error: "M-7" };
  }

  const target = safeRedirectPath(next);
  redirect(
    factors.some((f) => f.status === "verified")
      ? `/auth/mfa?next=${encodeURIComponent(target)}`
      : target,
  );
}

const magicLinkSchema = z
  .object({
    email: emailSchema,
    turnstileToken: turnstileTokenSchema,
    next: nextSchema,
  })
  .strict();

/**
 * S-4 "Email link" (BUILD F-7, FR-4, D11): existing users only, never creates an account. Every
 * outcome but a failed CAPTCHA is M-2, after the same minimum time (NFR-12, D24.10).
 */
export async function requestMagicLink(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(magicLinkSchema, formData);
  if (!input.ok) return input.result;
  const { email, turnstileToken, next } = input.data;
  const start = Date.now();
  try {
    const limit = await rateLimit("requestMagicLink", { email });
    if (!limit.ok) return limit;
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        captchaToken: turnstileToken,
        emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
      },
    });
    if (error?.code === "captcha_failed") return { ok: false, error: "M-6" };
    // Only once the request passed the CAPTCHA (#14 review).
    await setAuthNext(next);
    // Unknown email (otp_disabled: "Signups not allowed for otp") and Supabase's resend/429
    // rules are expected, and masked as success like the rest.
    if (
      error &&
      error.code !== "otp_disabled" &&
      !EXPECTED_OTP_ERRORS.has(error.code ?? "")
    )
      logError(error, { op: "requestMagicLink" });
    return { ok: true, message: "M-2" };
  } catch (error) {
    logError(error, { op: "requestMagicLink" });
    return { ok: false, error: "M-7" };
  } finally {
    await padToMinimum(start, MIN_RESPONSE_MS);
  }
}

const googleSchema = z.object({ next: nextSchema }).strict();

/** "Continue with Google" on S-4, S-5 and S-11 (BUILD F-7, FR-5). No Turnstile (D4). */
export async function signInWithGoogle(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(googleSchema, formData);
  if (!input.ok) return input.result;

  let url: string | undefined;
  try {
    const limit = await rateLimit("signInWithGoogle");
    if (!limit.ok) return limit;
    await setAuthNext(input.data.next);
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${getSiteUrl()}/auth/callback`,
        skipBrowserRedirect: true,
      },
    });
    if (error) logError(error, { op: "signInWithGoogle" });
    url = data?.url ?? undefined;
  } catch (error) {
    logError(error, { op: "signInWithGoogle" });
  }
  if (!url) return { ok: false, error: "M-7" };
  redirect(url);
}

const resetRequestSchema = z
  .object({ email: emailSchema, turnstileToken: turnstileTokenSchema })
  .strict();

/**
 * S-6 (BUILD F-8, FR-7, NFR-12, D24.10): every outcome but a failed CAPTCHA is M-3 after the same
 * minimum time. Signed-in callers are allowed; it's also how a Google-only user adds a password.
 */
export async function requestPasswordReset(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(resetRequestSchema, formData);
  if (!input.ok) return input.result;
  const { email, turnstileToken } = input.data;
  const start = Date.now();
  try {
    const limit = await rateLimit("requestPasswordReset", { email });
    if (!limit.ok) return limit;
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      captchaToken: turnstileToken,
      redirectTo: `${getSiteUrl()}/auth/confirm`,
    });
    if (error?.code === "captcha_failed") return { ok: false, error: "M-6" };
    if (error && !EXPECTED_OTP_ERRORS.has(error.code ?? ""))
      logError(error, { op: "requestPasswordReset" });
    return { ok: true, message: "M-3" };
  } catch (error) {
    logError(error, { op: "requestPasswordReset" });
    return { ok: false, error: "M-7" };
  } finally {
    await padToMinimum(start, MIN_RESPONSE_MS);
  }
}

const resetPasswordSchema = newPasswordSchema.strict();

/**
 * S-7 (BUILD F-8, FR-8, D24.1, D24.4, D24.5, D24.6): a new password in a recovery session. The
 * old one stops working, other sessions are signed out, and the marker is cleared.
 */
export async function updatePasswordFromReset(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(resetPasswordSchema, formData);
  if (!input.ok) return input.result;
  const { password } = input.data;

  return runAction("updatePasswordFromReset", async () => {
    // MFA users have passed S-10 already (D24.5): the guard requires it.
    const { supabase, user, claims } = await requireUser({
      allowPendingPassword: true,
    });
    if (!(await isRecoverySessionNow(user.id, claims)))
      return { ok: false, error: "M-13" };

    const limit = await rateLimit("updatePasswordFromReset", {
      userId: user.id,
    });
    if (!limit.ok) return limit;

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      const id = toUserMessage(error.code);
      if (id === "API-7" || id === "M-32")
        return {
          ok: false,
          error: "API-4",
          fieldErrors: { password: [msg(id)] },
        };
      return { ok: false, error: id };
    }

    // Google-only users get their first password this way (D24.1): record it either way.
    const { data: marked, error: markError } =
      await supabase.rpc("mark_password_set");
    if (markError || marked !== true)
      logError(markError ?? new Error("mark_password_set returned false"), {
        op: "updatePasswordFromReset.mark",
        userId: user.id,
      });

    // D24.4: every other session ends; a failure is logged, not shown.
    const { error: othersError } = await supabase.auth.signOut({
      scope: "others",
    });
    if (othersError)
      logError(othersError, {
        op: "updatePasswordFromReset.signOutOthers",
        userId: user.id,
      });

    await clearRecoveryMarker();
    redirect(withNotice("/dashboard", "password_changed"));
  });
}
