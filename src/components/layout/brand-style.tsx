import type { AppConfig } from "@/config/schema";

// Brand tokens over shadcn's (D16, SPEC §3.6). The schema already allows only #rrggbb; this
// re-checks, because the value lands inside a <style> element. `:root:root` / `:root.dark` beat
// globals.css's `:root` / `.dark` whatever order the two stylesheets load in. Without a dark pair,
// the light pair applies in both themes (SPEC §3.6: "dark: primaryDark if set").

const HEX = /^#[0-9a-f]{6}$/i;

function vars(primary: string, foreground: string) {
  for (const color of [primary, foreground])
    if (!HEX.test(color)) throw new Error("brand colour must be #rrggbb");
  return `{--primary:${primary};--primary-foreground:${foreground}}`;
}

export function BrandStyle({
  nonce,
  brand,
}: {
  nonce: string;
  brand: AppConfig["brand"];
}) {
  const css =
    `:root:root${vars(brand.primary, brand.primaryForeground)}` +
    (brand.primaryDark && brand.primaryForegroundDark
      ? `:root.dark${vars(brand.primaryDark, brand.primaryForegroundDark)}`
      : "");
  return <style nonce={nonce}>{css}</style>;
}
