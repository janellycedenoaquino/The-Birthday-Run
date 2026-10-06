import "server-only";
import { z } from "zod";
import { logError } from "@/server/errors";

// Server-side Turnstile check for PUBLIC NON-AUTH forms an app adds later (BUILD F-2, D4, rule 14).
// Auth forms never call this: Supabase's own CAPTCHA checks their token (single-use, so both
// can't). Unused in the Template itself. Fails closed on every error.

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5_000;
const MAX_TOKEN_LENGTH = 2048; // Cloudflare's documented maximum

const siteverifyResponse = z.looseObject({
  success: z.boolean(),
  action: z.string().optional(),
  hostname: z.string().optional(),
});

export async function verifyTurnstile(
  token: string,
  {
    remoteIp,
    expectedAction,
    expectedHostname,
    fetchFn = fetch,
  }: {
    remoteIp?: string;
    expectedAction?: string;
    /** The site's hostname, so a token solved on another site with the same key is refused. */
    expectedHostname?: string;
    fetchFn?: typeof fetch;
  } = {},
): Promise<boolean> {
  // Read lazily: TURNSTILE_SECRET_KEY is a Supabase config value (§0.6), not in serverEnvSchema,
  // so an app only needs it in the app's env once it has such a form.
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    logError(
      new Error(
        "verifyTurnstile: TURNSTILE_SECRET_KEY is not set; add it to serverEnvSchema and the app's server env (Vercel) to use this",
      ),
      { op: "verifyTurnstile" },
    );
    return false;
  }
  if (!token || token.length > MAX_TOKEN_LENGTH) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);
    const res = await fetchFn(SITEVERIFY, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const parsed = siteverifyResponse.safeParse(await res.json());
    if (!parsed.success || !parsed.data.success) return false;
    if (expectedAction !== undefined && parsed.data.action !== expectedAction)
      return false;
    return (
      expectedHostname === undefined ||
      parsed.data.hostname === expectedHostname
    );
  } catch (error) {
    logError(error, { op: "verifyTurnstile" });
    return false;
  }
}
