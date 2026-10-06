import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";

// Action input (BUILD §0.2): the form's fields minus Next's `$ACTION_*` keys, with Turnstile's
// `cf-turnstile-response` renamed `turnstileToken`, parsed by the action's `.strict()` schema.

export function formInput(formData: FormData): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [key, value] of formData) {
    if (key.startsWith("$ACTION_")) continue;
    input[key === "cf-turnstile-response" ? "turnstileToken" : key] = value;
  }
  return input;
}

type Parsed<T> =
  | { ok: true; data: T }
  | { ok: false; result: Extract<ActionResult, { ok: false }> };

/**
 * Zod failure → `{ ok: false, error: "API-4", fieldErrors }`; a missing or invalid
 * `turnstileToken` → `{ ok: false, error: "M-6" }` as a form alert instead (§0.2).
 */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): Parsed<z.infer<T>> {
  const parsed = schema.safeParse(formInput(formData));
  if (parsed.success) return { ok: true, data: parsed.data };
  if (parsed.error.issues.some((issue) => issue.path[0] === "turnstileToken"))
    return { ok: false, result: { ok: false, error: "M-6" } };
  const { fieldErrors } = z.flattenError(parsed.error);
  return {
    ok: false,
    result: {
      ok: false,
      error: "API-4",
      fieldErrors: fieldErrors as Record<string, string[]>,
    },
  };
}
