import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appConfig } from "@/config/app";

// Source-tree greps (BUILD F-3 "Tests"): config values live only in src/config/app.ts (FR-26,
// FR-51), and nothing app-specific is in the Template (NFR-24).

const root = resolve(import.meta.dirname, "../..");
const SCANNED = ["src", "supabase", "scripts", "public", ".github"];
const ROOT_FILES = /^[^/]+\.(ts|mts|mjs|json)$/;
// Logos are the only brand assets outside the config (D16); generated email templates copy the
// config on purpose (F-5); tests hold test values.
const SKIPPED = [
  "src/config/app.ts",
  "public/brand/",
  "supabase/templates/",
  "supabase/.temp/",
  "supabase/.branches/",
  "tests/",
  "package-lock.json",
];

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
  return sourceFiles().filter((file) =>
    pattern.test(readFileSync(join(root, file), "utf8")),
  );
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
  // "registry" alone is the D12 user-data registry's name, so the grep is for "gift"; it still
  // catches "gift registry" wording (BUILD F-3 "Tests").
  it("no 'gift' outside README and docs", () => {
    expect(filesContaining(/\bgifts?\b/i)).toEqual([]);
  });
});
