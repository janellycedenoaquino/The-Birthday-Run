import { z } from "zod";
import { msg } from "@/lib/messages";

// Shared auth schemas (BUILD §0.5), used by forms and actions alike. Error texts are the SPEC §3.4
// catalogue's (via msg); limits are D22's.

// D22 + D24.15: characters minimum, UTF-8 bytes maximum (bcrypt reads only 72 bytes).
const PASSWORD_MIN_CHARS = 12;
const PASSWORD_MAX_BYTES = 72;
const withinBytes = (p: string) =>
  new TextEncoder().encode(p).length <= PASSWORD_MAX_BYTES;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, msg("M-29"))
  .max(254, msg("M-30"))
  .pipe(z.email(msg("M-30")));

/** New passwords. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_CHARS, msg("M-32"))
  .refine(withinBytes, msg("M-33"));

/** signIn, reauthenticateWithPassword: any length the user may have, still within bcrypt's. */
export const currentPasswordSchema = z
  .string()
  .min(1, msg("M-31"))
  .refine(withinBytes, msg("M-33"));

/** No confirm field (SPEC C-5). */
export const newPasswordSchema = z.object({ password: passwordSchema });

/** A missing or invalid token is an M-6 form alert, not a field error (§0.2). */
export const turnstileTokenSchema = z.string().min(1).max(2048);

/** Never rejected: always passed through safeRedirectPath() before use. */
export const nextSchema = z.string().max(2048).optional();

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, msg("M-34"));
