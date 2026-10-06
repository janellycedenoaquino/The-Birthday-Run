"use server";

import "server-only";
import type { Factor } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { appConfig } from "@/config/app";
import { msg } from "@/lib/messages";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import { nextSchema, totpCodeSchema } from "@/lib/validation/auth";
import { parseForm } from "@/lib/validation/form";
import { requireRecentSignIn, requireUser } from "@/server/auth/guards";
import { logError } from "@/server/errors";
import { runAction } from "@/server/run-action";
import { rateLimit } from "@/server/security/rate-limit";

// Two-step sign-in (BUILD F-10, FR-57..FR-59, D8, D24.3, D24.21, D24.22). Factors always come
// from the Auth server's user record (getUser), never from the cookie; the one exception is the
// new factor's id on confirm, which must be an unverified TOTP factor of this user (rule 6).
// Secrets, QR codes and URIs are never logged.

const verifiedTotp = (factors: Factor[] | undefined) =>
  (factors ?? []).filter(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
const codeError = (): ActionResult => ({
  ok: false,
  error: "API-4",
  fieldErrors: { code: [msg("M-14")] },
});

export type EnrollmentData = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

/** S-16 "Set up": a new unverified TOTP factor (D24.3: recent sign-in). */
export async function startMfaEnrollment(
  _prev: ActionResult<EnrollmentData> | null,
  formData: FormData,
): Promise<ActionResult<EnrollmentData>> {
  const input = parseForm(z.object({}).strict(), formData);
  if (!input.ok) return input.result;

  return runAction("startMfaEnrollment", async () => {
    const { supabase, user } = await requireRecentSignIn();
    const limit = await rateLimit("startMfaEnrollment", { userId: user.id });
    if (!limit.ok) return limit;
    if (verifiedTotp(user.factors).length) return { ok: false, error: "API-5" };

    // An abandoned setup leaves an unverified factor: remove it first (D8).
    for (const factor of user.factors ?? [])
      if (factor.factor_type === "totp" && factor.status !== "verified") {
        const { error } = await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });
        if (error)
          logError(error, {
            op: "startMfaEnrollment.unenrollStale",
            userId: user.id,
          });
      }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator",
      // The name authenticator apps show; S-10 asks for the code "for {appConfig.name}".
      issuer: appConfig.name,
    });
    if (error || !data) {
      logError(error ?? new Error("no factor"), {
        op: "startMfaEnrollment",
        userId: user.id,
      });
      return { ok: false, error: "M-15" };
    }
    return {
      ok: true,
      data: {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      },
    };
  });
}

const confirmInput = z
  .object({ factorId: z.uuid(), code: totpCodeSchema })
  .strict();

/** S-16 "Turn on": the first code proves the app has the secret; the session becomes aal2. */
export async function confirmMfaEnrollment(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(confirmInput, formData);
  if (!input.ok) return input.result;
  const { factorId, code } = input.data;

  return runAction("confirmMfaEnrollment", async () => {
    const { supabase, user } = await requireRecentSignIn();
    const limit = await rateLimit("confirmMfaEnrollment", { userId: user.id });
    if (!limit.ok) return limit;

    // One verified factor per user (D8): never a second one next to it.
    if (verifiedTotp(user.factors).length) return { ok: false, error: "API-5" };
    const owned = (user.factors ?? []).some(
      (f) =>
        f.id === factorId &&
        f.factor_type === "totp" &&
        f.status !== "verified",
    );
    if (!owned) return codeError();

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error) return codeError();
    revalidatePath("/settings");
    return { ok: true, message: "M-16" };
  });
}

const verifyInput = z
  .object({ code: totpCodeSchema, next: nextSchema })
  .strict();

/** S-10: the code after any first factor (FR-58). The factor is never taken from input. */
export async function verifyMfaSignIn(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(verifyInput, formData);
  if (!input.ok) return input.result;
  const { code, next } = input.data;
  const target = safeRedirectPath(next);

  return runAction("verifyMfaSignIn", async () => {
    const { supabase, user, claims } = await requireUser({
      allowPendingMfa: true,
    });
    const limit = await rateLimit("verifyMfaSignIn", { userId: user.id });
    if (!limit.ok) return limit;

    const [factor] = verifiedTotp(user.factors);
    if (!factor || claims.aal === "aal2") redirect(target);

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });
    if (error) return codeError();
    redirect(target);
  });
}

const disableInput = z.object({ code: totpCodeSchema }).strict();

/** S-16 "Turn off" (FR-59): a recent session and a current code. */
export async function disableMfa(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(disableInput, formData);
  if (!input.ok) return input.result;

  return runAction("disableMfa", async () => {
    const { supabase, user } = await requireRecentSignIn();
    const limit = await rateLimit("disableMfa", { userId: user.id });
    if (!limit.ok) return limit;

    const [factor] = verifiedTotp(user.factors);
    if (!factor) return { ok: true, message: "M-17" }; // already off

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: input.data.code,
    });
    if (error) return codeError();
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({
      factorId: factor.id,
    });
    if (unenrollError)
      throw new Error("disableMfa: unenroll failed", { cause: unenrollError });
    revalidatePath("/settings");
    return { ok: true, message: "M-17" };
  });
}
