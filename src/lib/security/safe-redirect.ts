// Redirect targets from input (`next`, `redirectTo`, …) must be same-site paths (BUILD F-2,
// NFR-8, rule 11). Pure: used by actions, route handlers and pages alike.

const MAX_LENGTH = 2048;
const DECODE_ROUNDS = 3;
const BASE = "http://x.invalid";

// Sending someone back to these would loop through sign-in again. The exceptions are steps a
// signed-in user is sent to on purpose (BUILD F-2 step 5), so an MFA step in between doesn't lose
// where they were going (e.g. /auth/mfa?next=/auth/reauthenticate?next=/settings).
const LOOP_PREFIXES = ["/auth", "/sign-in", "/sign-up"];
const LOOP_EXCEPTIONS = [
  "/auth/set-password",
  "/auth/mfa",
  "/auth/reauthenticate",
];

const isUnder = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

// A path we'd send the browser to, after one layer of decoding.
function isSameSitePath(value: string): boolean {
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  if (value.includes("\\")) return false;
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  const url = new URL(value, BASE);
  if (url.origin !== BASE) return false;
  // The normalised pathname, so `/dashboard/../sign-in` counts as `/sign-in`.
  if (LOOP_EXCEPTIONS.includes(url.pathname)) return true;
  return !LOOP_PREFIXES.some((prefix) => isUnder(url.pathname, prefix));
}

/**
 * `input` if it's a safe same-site path, else `fallback`. Checks the value and up to three rounds
 * of URL-decoding, so encoded tricks (`%2F%2Fevil`, `%252F…`, `/%5Cevil`) fall back too.
 */
export function safeRedirectPath(input: unknown, fallback = "/dashboard") {
  if (typeof input !== "string" || input.length > MAX_LENGTH) return fallback;

  let value = input;
  for (let round = 0; ; round++) {
    if (!isSameSitePath(value)) return fallback;
    let decoded: string;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      return fallback;
    }
    if (decoded === value) break;
    // Still encoded after every checked round: nothing legitimate is, so don't guess.
    if (round === DECODE_ROUNDS) return fallback;
    value = decoded;
  }

  return input;
}
