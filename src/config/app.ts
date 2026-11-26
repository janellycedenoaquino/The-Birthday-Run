import { appConfigSchema } from "./schema";

// The one config file (D16, FR-26). Every app edits this, plus the two logo files in
// public/brand/. Validated at import: a bad value fails the build. The site URL is not here: it
// comes from NEXT_PUBLIC_SITE_URL through getSiteUrl() (D24.23).
//
// Still a placeholder: logo.svg in public/brand/ (replaced in the redesign, ROADMAP phase 8).
export const appConfig = Object.freeze(
  appConfigSchema.parse({
    name: "The Birthday Run",
    shortName: "Birthday Run",
    description: "Find free birthday rewards and pick them all up in time.",
    supportEmail: "hello@thebirthdayrun.com",
    // Pairs must reach 4.5:1 (D24.24; the config test checks). Decision 0016: sky-blue button
    // with navy text (7.5:1), the same in light and cocoa.
    brand: {
      primary: "#8ec5ff",
      primaryForeground: "#1f2a5c",
      primaryDark: "#8ec5ff",
      primaryForegroundDark: "#1f2a5c",
    },
    logo: {
      svg: "/brand/logo.svg",
      // The owner's doll alone, transparent (2026-11-26): the emails' header logo. A new file name,
      // not logo.png, because mail apps cache images by address.
      png: "/brand/doll-logo.png",
      alt: "The Birthday Run logo",
    },
    legal: { entityName: "The Birthday Run" },
  }),
);
