import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Runs the real eslint.config.mjs on small samples, so the import boundaries in
// BUILD §0.1 are proven to fail lint, not just configured.
const eslint = new ESLint();

async function ruleIds(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((m) => m.ruleId);
}

describe("import boundaries (BUILD §0.1)", () => {
  it('blocks @/server imports in a "use client" file', async () => {
    const code =
      '"use client";\nimport { env } from "@/server/env";\nexport const x = env;\n';
    expect(await ruleIds(code, "src/components/auth/form.tsx")).toContain(
      "local/no-server-import-in-client",
    );
  });

  it("allows @/server imports in a server component", async () => {
    const code = 'import { env } from "@/server/env";\nexport const x = env;\n';
    expect(
      await ruleIds(code, "src/app/(app)/dashboard/page.tsx"),
    ).not.toContain("local/no-server-import-in-client");
  });

  it('requires import "server-only" first in src/server files', async () => {
    expect(
      await ruleIds("export const x = 1;\n", "src/server/env.ts"),
    ).toContain("local/server-only-first");
    expect(
      await ruleIds(
        'import "server-only";\nexport const x = 1;\n',
        "src/server/env.ts",
      ),
    ).not.toContain("local/server-only-first");
  });

  it("allows the secret-key client only in its three files", async () => {
    const code =
      'import "server-only";\nimport { admin } from "@/server/supabase/admin";\nexport const x = admin;\n';
    expect(await ruleIds(code, "src/server/actions/auth.ts")).toContain(
      "no-restricted-imports",
    );
    expect(await ruleIds(code, "src/server/actions/account.ts")).not.toContain(
      "no-restricted-imports",
    );
  });

  it("makes dangerouslySetInnerHTML an error", async () => {
    const code =
      'export const X = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />;\n';
    expect(await ruleIds(code, "src/components/x.tsx")).toContain(
      "react/no-danger",
    );
  });
});

// Decision 0007: civil dates only through the timing module.
describe("Date parsing outside the timing module", () => {
  it.each([
    'export const a = new Date("2026-06-15");\n',
    "export const a = (s: string) => new Date(s);\n",
    'export const a = Date.parse("2026-06-15");\n',
  ])("blocks %s", async (code) => {
    expect(await ruleIds(code, "src/components/rewards/card.tsx")).toContain(
      "no-restricted-syntax",
    );
  });

  it("allows now, Date.now() and the timing module itself", async () => {
    const code = "export const a = new Date();\nexport const b = Date.now();\n";
    expect(
      await ruleIds(code, "src/components/rewards/card.tsx"),
    ).not.toContain("no-restricted-syntax");
    expect(
      await ruleIds(
        "export const a = new Date(0);\n",
        "src/lib/birthday/timing.ts",
      ),
    ).not.toContain("no-restricted-syntax");
  });
});
