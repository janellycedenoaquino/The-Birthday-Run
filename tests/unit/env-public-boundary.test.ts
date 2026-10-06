import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  e2eEnvSchema,
  serverEnvSchema,
  supabaseConfigEnvSchema,
} from "@/lib/env/schema";
import { publicEnvSchema } from "@/lib/env/public-schema";

// `src/lib/env/public.ts` is the one env module a client component may import (D6). Whatever it
// pulls in ends up in browser files, so its local import graph must not contain the server or
// secret schemas: not even their variable names.

const root = resolve(import.meta.dirname, "../..");

function localImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  // `from "…"`, side-effect `import "…"` and `import("…")`, either quote style.
  const specifiers = [
    ...source.matchAll(
      /(?:\bfrom|\bimport)\s*\(?\s*["']((?:\.|@\/)[^"']+)["']/g,
    ),
  ].map((m) => m[1]);
  return specifiers.map((spec) => {
    const base = spec.startsWith("@/")
      ? resolve(root, "src", spec.slice(2))
      : resolve(dirname(file), spec);
    const found = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]
      .map((ext) => base + ext)
      .find((path) => existsSync(path) && statSync(path).isFile());
    if (!found) throw new Error(`can't resolve ${spec} from ${file}`);
    return found;
  });
}

function importGraph(entry: string): string[] {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    localImports(file).forEach(walk);
  };
  walk(entry);
  return [...seen];
}

describe("public env module (D6)", () => {
  const graph = importGraph(resolve(root, "src/lib/env/public.ts"));
  // Every non-public name the env schemas know, not only the app server's.
  const serverOnlyNames = [
    ...Object.keys(serverEnvSchema.shape),
    ...Object.keys(supabaseConfigEnvSchema.shape),
    ...Object.keys(e2eEnvSchema.shape),
  ].filter((name) => !(name in publicEnvSchema.shape));

  it("knows the secret names it must keep out, from every schema", () => {
    for (const name of [
      "SUPABASE_SECRET_KEY",
      "RATE_LIMIT_HMAC_SECRET",
      "TURNSTILE_SECRET_KEY",
      "GOOGLE_CLIENT_SECRET",
      "E2E_EMAIL",
    ])
      expect(serverOnlyNames).toContain(name);
  });

  it("doesn't import the server schema module", () => {
    expect(graph).not.toContain(resolve(root, "src/lib/env/schema.ts"));
  });

  it("names no server or secret variable anywhere in its import graph", () => {
    for (const file of graph) {
      const source = readFileSync(file, "utf8");
      for (const name of serverOnlyNames)
        expect(source.includes(name), `${file} mentions ${name}`).toBe(false);
    }
  });
});
