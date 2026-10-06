import { appConfigSchema } from "./schema";

// The one config file (D16, FR-26). Every app edits this, plus the two logo files in
// public/brand/. Validated at import: a bad value fails the build. The site URL is not here: it
// comes from NEXT_PUBLIC_SITE_URL through getSiteUrl() (D24.23).
//
// PLACEHOLDERS (FR-27): replace name, shortName, description, supportEmail, legal.entityName and the
// logo before launch (README, "Start a new app").
export const appConfig = Object.freeze(
  appConfigSchema.parse({
    name: "Template App",
    shortName: "Template",
    description: "A secure starting point for a new web app.",
    supportEmail: "support@example.com",
    // Pairs must reach 4.5:1 (D24.24; the config test checks). Placeholder: soft sage neutrals.
    brand: {
      primary: "#4a5d56",
      primaryForeground: "#ffffff",
      primaryDark: "#b8c9c1",
      primaryForegroundDark: "#1f2925",
    },
    logo: {
      svg: "/brand/logo.svg",
      png: "/brand/logo.png",
      alt: "Template App logo",
    },
    legal: { entityName: "<Your legal entity>" },
  }),
);
