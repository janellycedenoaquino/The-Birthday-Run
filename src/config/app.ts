import { appConfigSchema } from "./schema";

// The one config file (D16, FR-26). Every app edits this, plus the two logo files in
// public/brand/. Validated at import: a bad value fails the build. The site URL is not here: it
// comes from NEXT_PUBLIC_SITE_URL through getSiteUrl() (D24.23).
//
// Still a placeholder: the logo files in public/brand/ (replaced in the redesign, ROADMAP phase 8).
export const appConfig = Object.freeze(
  appConfigSchema.parse({
    name: "The Birthday Run",
    shortName: "Birthday Run",
    description: "Find free birthday rewards and pick them all up in time.",
    supportEmail: "hello@thebirthdayrun.com",
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
      alt: "The Birthday Run logo",
    },
    legal: { entityName: "The Birthday Run" },
  }),
);
