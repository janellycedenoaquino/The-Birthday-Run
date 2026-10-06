import { describe, expect, it } from "vitest";
import { appConfig } from "@/config/app";
import { appConfigSchema } from "@/config/schema";

// BUILD F-3 "Tests": the schema's limits (D16, DESIGN §3 `appConfig`) and the brand contrast
// rule (D24.24, NFR-23). Test values only.
const valid = {
  name: "Test App",
  shortName: "Test",
  description: "A test app.",
  supportEmail: "support@example.com",
  brand: { primary: "#000000", primaryForeground: "#ffffff" },
  logo: { svg: "/brand/logo.svg", png: "/brand/logo.png", alt: "Test App" },
  legal: { entityName: "Test Entity" },
};

const withBrand = (brand: Record<string, string>) => ({ ...valid, brand });

function issues(input: unknown) {
  const result = appConfigSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
}

describe("appConfigSchema (D16)", () => {
  it("accepts a valid config", () => {
    expect(issues(valid)).toEqual([]);
  });

  it.each(["#fff", "000000", "#00000g", "#0000000", "red", "#000000;}"])(
    "rejects brand colour %j (not #rrggbb)",
    (bad) => {
      const found = issues(
        withBrand({ primary: bad, primaryForeground: "#ffffff" }),
      );
      expect(found.map((i) => i.path)).toContain("brand.primary");
    },
  );

  it("accepts upper-case hex", () => {
    expect(
      issues(withBrand({ primary: "#1A1A1A", primaryForeground: "#FFFFFF" })),
    ).toEqual([]);
  });

  it.each([
    ["name", "", 61],
    ["shortName", "", 13],
    ["description", "", 201],
  ] as const)("limits %s to its DESIGN §3 length", (field, empty, tooLong) => {
    const max = tooLong - 1;
    expect(issues({ ...valid, [field]: empty })).not.toEqual([]);
    expect(issues({ ...valid, [field]: "x".repeat(tooLong) })).not.toEqual([]);
    expect(issues({ ...valid, [field]: "x".repeat(max) })).toEqual([]);
    expect(issues({ ...valid, [field]: "x" })).toEqual([]);
  });

  it("rejects a support email that isn't an address", () => {
    expect(issues({ ...valid, supportEmail: "support" })).not.toEqual([]);
  });

  it("keeps logo files in /brand/ (public/brand)", () => {
    expect(
      issues({
        ...valid,
        logo: { ...valid.logo, svg: "https://x.test/l.svg" },
      }),
    ).not.toEqual([]);
    expect(
      issues({ ...valid, logo: { ...valid.logo, png: "/brand/../x.png" } }),
    ).not.toEqual([]);
    expect(issues({ ...valid, logo: { ...valid.logo, alt: "" } })).not.toEqual(
      [],
    );
  });

  it("rejects unknown fields (a typo would silently do nothing)", () => {
    expect(issues({ ...valid, colour: "#000000" })).not.toEqual([]);
  });
});

describe("brand contrast ≥ 4.5:1 (D24.24, NFR-23)", () => {
  // #767676 on white is the classic WCAG boundary: 4.54:1 passes, #777777 (4.477:1) fails.
  it("passes a pair just above 4.5:1", () => {
    expect(
      issues(withBrand({ primary: "#767676", primaryForeground: "#ffffff" })),
    ).toEqual([]);
  });

  it("fails a pair just below 4.5:1 and names the pair", () => {
    const found = issues(
      withBrand({ primary: "#777777", primaryForeground: "#ffffff" }),
    );
    expect(found).toHaveLength(1);
    expect(found[0].path).toBe("brand.primaryForeground");
    expect(found[0].message).toMatch(/primaryForeground on primary/);
    // 4.477…:1, rounded down so a failing ratio never reads as "4.50".
    expect(found[0].message).toMatch(/4\.47:1/);
  });

  it("checks the dark pair too, naming it", () => {
    const found = issues(
      withBrand({
        primary: "#000000",
        primaryForeground: "#ffffff",
        primaryDark: "#777777",
        primaryForegroundDark: "#ffffff",
      }),
    );
    expect(found).toHaveLength(1);
    expect(found[0].path).toBe("brand.primaryForegroundDark");
    expect(found[0].message).toMatch(/primaryForegroundDark on primaryDark/);
  });

  it("needs both dark colours or neither", () => {
    expect(
      issues(
        withBrand({
          primary: "#000000",
          primaryForeground: "#ffffff",
          primaryDark: "#ffffff",
        }),
      ),
    ).not.toEqual([]);
  });
});

describe("appConfig (the shipped placeholder)", () => {
  it("passes its own schema, contrast included", () => {
    expect(issues(appConfig)).toEqual([]);
  });

  // Guards the Template's own placeholders; an app made from it has renamed them (README step 4).
  it.runIf(appConfig.name === "Template App")(
    "marks the per-app values as placeholders (FR-27)",
    () => {
      expect(appConfig.name).toBe("Template App");
      expect(appConfig.supportEmail).toBe("support@example.com");
      expect(appConfig.legal.entityName).toBe("<Your legal entity>");
    },
  );
});

describe("config values that become Go templates (F-5, #17 review)", () => {
  it.each(["name", "shortName", "description"] as const)(
    "rejects {{ or }} in %s (GoTrue would fail to parse every auth email)",
    (field) => {
      expect(issues({ ...valid, [field]: "My {{ App" })).not.toEqual([]);
      expect(issues({ ...valid, [field]: "App }}" })).not.toEqual([]);
    },
  );

  it("still allows single braces", () => {
    expect(issues({ ...valid, name: "A {b} app" })).toEqual([]);
  });
});
