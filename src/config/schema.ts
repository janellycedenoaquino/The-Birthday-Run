import { z } from "zod";

// The config file's schema (D16; fields and limits: DESIGN §3 `appConfig`). `src/config/app.ts`
// parses at import, so a bad value fails the build. Colours are strict #rrggbb: they go into a
// <style> element, the manifest, the OG image and emails, so nothing else may get through.

const hex = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "must be a hex colour like #1a2b3c");
const brandPath = (ext: string) =>
  z
    .string()
    .regex(
      new RegExp(`^/brand/[a-z0-9-]+\\.${ext}$`),
      `must be a file in public/brand/, like /brand/logo.${ext}`,
    );

// WCAG 2.2 relative luminance and contrast ratio (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio).
function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// D24.24: text on each brand colour must reach 4.5:1 (NFR-23), in both themes.
const MIN_CONTRAST = 4.5;

const brand = z
  .strictObject({
    primary: hex,
    primaryForeground: hex,
    primaryDark: hex.optional(),
    primaryForegroundDark: hex.optional(),
  })
  .superRefine((colors, ctx) => {
    if (!!colors.primaryDark !== !!colors.primaryForegroundDark) {
      ctx.addIssue({
        code: "custom",
        path: [colors.primaryDark ? "primaryForegroundDark" : "primaryDark"],
        message:
          "set primaryDark and primaryForegroundDark together, or neither",
      });
      return;
    }
    const pairs: [keyof typeof colors, keyof typeof colors][] = [
      ["primary", "primaryForeground"],
    ];
    if (colors.primaryDark)
      pairs.push(["primaryDark", "primaryForegroundDark"]);
    for (const [bg, fg] of pairs) {
      const ratio = contrastRatio(colors[bg]!, colors[fg]!);
      if (ratio < MIN_CONTRAST)
        ctx.addIssue({
          code: "custom",
          path: [fg],
          message: `${fg} on ${bg} has contrast ${Math.floor(ratio * 100) / 100}:1; needs ${MIN_CONTRAST}:1 (D24.24)`,
        });
    }
  });

// The auth emails are Go templates once built (F-5): a `{{` or `}}` in a value would break
// GoTrue's parse of every auth email.
const noGoDelimiters = (value: string) => !/\{\{|\}\}/.test(value);
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(noGoDelimiters, "can't contain {{ or }} (email templates)");

export const appConfigSchema = z.strictObject({
  name: text(60),
  shortName: text(12),
  description: text(200),
  supportEmail: z
    .email()
    .refine(noGoDelimiters, "can't contain {{ or }} (email templates)"),
  brand,
  logo: z.strictObject({
    svg: brandPath("svg"),
    png: brandPath("png"),
    alt: z.string().min(1).max(100),
  }),
  legal: z.strictObject({
    entityName: text(100),
  }),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
