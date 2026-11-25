import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appConfig } from "@/config/app";

// Source-tree greps (BUILD F-3 "Tests"): config values live only in src/config/app.ts (FR-26,
// FR-51), and nothing app-specific is in the Template (NFR-24).

const root = resolve(import.meta.dirname, "../..");
const SCANNED = ["src", "supabase", "scripts", "public", ".github"];
const ROOT_FILES = /^[^/]+\.(ts|mts|mjs|json)$/;
// Logos are the only brand assets outside the config (D16); retailer logos are other brands'
// files, so their colours can match ours by chance (F-1); generated email templates copy the
// config on purpose (F-5); tests hold test values.
const SKIPPED = [
  "src/config/app.ts",
  "public/brand/",
  "public/retailers/",
  "public/vendor/", // third-party build copies, gitignored (decision 0013)
  "supabase/templates/",
  "supabase/.temp/",
  "supabase/.branches/",
  "tests/",
  "package-lock.json",
];
// Supabase reads config.toml, not the config: its production SMTP sender repeats the name and
// support email on purpose. Only those two lines are exempt; any other copy there still fails.
const EXEMPT_LINES: Record<string, RegExp> = {
  "supabase/config.toml": /^(sender_name|admin_email) = .*$/gm,
};

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root)) {
    if (ROOT_FILES.test(name)) files.push(name);
  }
  for (const dir of SCANNED) {
    let entries: string[];
    try {
      entries = readdirSync(join(root, dir), { recursive: true }) as string[];
    } catch {
      continue; // a folder the template doesn't have yet
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      if (statSync(join(root, path)).isFile()) files.push(path);
    }
  }
  return files.filter(
    (file) => !SKIPPED.some((skip) => file === skip || file.startsWith(skip)),
  );
}

function filesContaining(pattern: RegExp): string[] {
  return sourceFiles().filter((file) => {
    const text = readFileSync(join(root, file), "utf8");
    const exempt = EXEMPT_LINES[file];
    return pattern.test(exempt ? text.replace(exempt, "") : text);
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("config values appear only in src/config/app.ts (FR-26, FR-51)", () => {
  it("scans the real source tree", () => {
    const files = sourceFiles();
    expect(files).toContain("src/proxy.ts");
    expect(files).not.toContain("src/config/app.ts");
  });

  const values: [string, string][] = [
    ["name", appConfig.name],
    ["description", appConfig.description],
    ["supportEmail", appConfig.supportEmail],
    ["legal.entityName", appConfig.legal.entityName],
    ...Object.entries(appConfig.brand).map(
      ([key, hex]) => [`brand.${key}`, hex] as [string, string],
    ),
  ];

  it.each(values)("%s has no copy elsewhere", (_field, value) => {
    expect(filesContaining(new RegExp(escape(value), "i"))).toEqual([]);
  });
});

describe("nothing app-specific (NFR-24)", () => {
  // "registry" alone is the D12 user-data registry's name, so the grep is for gift-registry
  // wording (BUILD F-3 "Tests"). "Gift" alone is this app's word for a birthday reward
  // (decision 0016: "Your birthday gift"), so it isn't banned.
  it("no gift-registry wording outside README and docs", () => {
    expect(
      filesContaining(/\bgift[\s-]*(registry|registries|lists?)\b/i),
    ).toEqual([]);
  });
});
