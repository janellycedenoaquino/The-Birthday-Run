import { describe, expect, it } from "vitest";
import { z } from "zod";
import { msg } from "@/lib/messages";
import {
  currentPasswordSchema,
  emailSchema,
  passwordSchema,
  turnstileTokenSchema,
} from "@/lib/validation/auth";
import { formInput, parseForm } from "@/lib/validation/form";

// BUILD §0.5 shared schemas (D22, D24.15) and §0.2 action input.
const errorsOf = (schema: z.ZodType, value: unknown) => {
  const r = schema.safeParse(value);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("password schemas (D22: 12 characters, 72 UTF-8 bytes)", () => {
  it("new passwords: 11 characters fail with M-32, 12 pass", () => {
    expect(errorsOf(passwordSchema, "a".repeat(11))).toEqual([msg("M-32")]);
    expect(errorsOf(passwordSchema, "a".repeat(12))).toEqual([]);
  });

  it("counts bytes, not characters, at the top (bcrypt)", () => {
    expect(errorsOf(passwordSchema, "a".repeat(72))).toEqual([]);
    expect(errorsOf(passwordSchema, "a".repeat(73))).toEqual([msg("M-33")]);
    // 24 × "€" = 24 characters but 72 bytes; one more is over.
    expect(errorsOf(passwordSchema, "€".repeat(24))).toEqual([]);
    expect(errorsOf(passwordSchema, "€".repeat(25))).toEqual([msg("M-33")]);
  });

  it("current passwords: empty → M-31; short is fine; bytes still capped", () => {
    expect(errorsOf(currentPasswordSchema, "")).toEqual([msg("M-31")]);
    expect(errorsOf(currentPasswordSchema, "short")).toEqual([]);
    expect(errorsOf(currentPasswordSchema, "a".repeat(73))).toEqual([
      msg("M-33"),
    ]);
  });
});

describe("emailSchema", () => {
  it("trims and lower-cases", () => {
    expect(emailSchema.parse("  Someone@Example.COM ")).toBe(
      "someone@example.com",
    );
  });
  it("empty → M-29; not an address → M-30", () => {
    expect(errorsOf(emailSchema, "")).toEqual([msg("M-29")]);
    expect(errorsOf(emailSchema, "nope")).toContain(msg("M-30"));
  });
});

describe("formInput and parseForm (§0.2)", () => {
  const schema = z
    .object({
      password: currentPasswordSchema,
      turnstileToken: turnstileTokenSchema,
    })
    .strict();
  const form = (entries: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(entries)) fd.set(k, v);
    return fd;
  };

  it("drops Next's $ACTION_ keys and renames Turnstile's field", () => {
    expect(
      formInput(
        form({
          $ACTION_ID_abc: "",
          "cf-turnstile-response": "tok",
          password: "p",
        }),
      ),
    ).toEqual({ turnstileToken: "tok", password: "p" });
  });

  it("valid input parses", () => {
    expect(
      parseForm(
        schema,
        form({ password: "p", "cf-turnstile-response": "tok" }),
      ),
    ).toEqual({ ok: true, data: { password: "p", turnstileToken: "tok" } });
  });

  it("a missing Turnstile token is the M-6 form alert, not a field error", () => {
    expect(parseForm(schema, form({ password: "p" }))).toEqual({
      ok: false,
      result: { ok: false, error: "M-6" },
    });
  });

  it("other failures → API-4 with field errors; unknown fields are refused (.strict)", () => {
    const parsed = parseForm(
      schema,
      form({ password: "", "cf-turnstile-response": "tok", extra: "x" }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.result.error).toBe("API-4");
    expect(parsed.result.fieldErrors?.password).toEqual([msg("M-31")]);
  });
});
