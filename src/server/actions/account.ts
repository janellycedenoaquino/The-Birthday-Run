"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { displayNameSchema } from "@/lib/validation/account";
import { emailSchema, newPasswordSchema } from "@/lib/validation/auth";
import { parseForm } from "@/lib/validation/form";
import { requireRecentSignIn, requireUser } from "@/server/auth/guards";
import { logError, toUserMessage } from "@/server/errors";
import { runAction } from "@/server/run-action";
import { getAdminClient } from "@/server/supabase/admin";
import { rateLimit } from "@/server/security/rate-limit";

// Account actions (BUILD F-11). Public endpoints: each validates and guards itself (rule 4).

const displayNameInput = z.object({ displayName: displayNameSchema }).strict();

/** S-14 (FR-12): the user's own display name, through their own client (RLS). */
export async function updateDisplayName(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(displayNameInput, formData);
  if (!input.ok) return input.result;

  return runAction("updateDisplayName", async () => {
    const { supabase, user } = await requireUser();
    const limit = await rateLimit("updateDisplayName", { userId: user.id });
    if (!limit.ok) return limit;

    // Exactly one row, or RLS filtered it out (e.g. the MFA policy): never a false "saved".
    const { data: rows, error } = await supabase
      .from("profiles")
      .update({ display_name: input.data.displayName })
      .eq("id", user.id)
      .select("id");
    if (error || rows?.length !== 1)
      throw new Error("updateDisplayName: not exactly one row", {
        cause: error ?? `${rows?.length ?? 0} rows`,
      });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true, message: "M-21" };
  });
}

/**
 * S-15 (FR-14, D9, D24.1, D24.4): a new password in a recent session, no current-password field.
 * Other sessions are signed out.
 */
export async function changePassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(newPasswordSchema.strict(), formData);
  if (!input.ok) return input.result;

  return runAction("changePassword", async () => {
    const { supabase, user } = await requireRecentSignIn();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("password_set_at")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile)
      throw new Error("changePassword: could not read the profile", {
        cause: profileError ?? "profile row missing",
      });
    if (!profile.password_set_at) return { ok: false, error: "M-23" };

    const limit = await rateLimit("changePassword", { userId: user.id });
    if (!limit.ok) return limit;

    const { error } = await supabase.auth.updateUser({
      password: input.data.password,
    });
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

    const { error: markError } = await supabase.rpc("mark_password_set");
    if (markError)
      logError(markError, { op: "changePassword.mark", userId: user.id });
    const { error: othersError } = await supabase.auth.signOut({
      scope: "others",
    });
    if (othersError)
      logError(othersError, {
        op: "changePassword.signOutOthers",
        userId: user.id,
      });
    return { ok: true, message: "M-22" };
  });
}

const deleteInput = z.object({ email: emailSchema }).strict();

/**
 * S-18 (FR-16, D12, rule 6): delete the account in a recent session, confirmed by typing the email.
 * Guard first (D12 order). The auth user is deleted with the secret-key client by the id from
 * getUser(), never input; the cascade removes every registry row.
 */
export async function deleteAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction("deleteAccount", async () => {
    const { supabase, user } = await requireRecentSignIn();

    const input = parseForm(deleteInput, formData);
    if (!input.ok) return input.result;
    if (input.data.email !== (user.email ?? "").trim().toLowerCase())
      return {
        ok: false,
        error: "API-4",
        fieldErrors: { email: [msg("M-24")] },
      };

    const limit = await rateLimit("deleteAccount", { userId: user.id });
    if (!limit.ok) return limit;

    const { error } = await getAdminClient().auth.admin.deleteUser(user.id);
    if (error) throw new Error("deleteAccount failed", { cause: error });

    // The account is gone; end this device's session whatever Supabase answers.
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    const cookieStore = await cookies();
    for (const { name } of cookieStore.getAll())
      if (name.startsWith("sb-")) cookieStore.delete(name);
    redirect("/?notice=account_deleted");
  });
}
