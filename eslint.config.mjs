import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Import boundaries from BUILD §0.1 (D20, rules 5 and 6). ESLint can't select files by
// their contents, so the two "which file is this" checks are small local rules.

const isServerPath = (source) =>
  /^@\/server(\/|$)/.test(source) || /(^|\/)src\/server(\/|$)/.test(source);

const hasUseClient = (program) =>
  program.body.some(
    (node) =>
      node.type === "ExpressionStatement" && node.directive === "use client",
  );

/** Blocks `@/server/*` imports in files that start with "use client". */
const noServerImportInClient = {
  meta: {
    type: "problem",
    messages: {
      serverInClient:
        'A "use client" file can\'t import "{{source}}": src/server/** is server-only (BUILD §0.1, rule 5).',
    },
    schema: [],
  },
  create(context) {
    let client = false;
    const check = (node) => {
      const source = node.source?.value;
      if (client && typeof source === "string" && isServerPath(source)) {
        context.report({ node, messageId: "serverInClient", data: { source } });
      }
    };
    return {
      Program(program) {
        client = hasUseClient(program);
      },
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

/** Every src/server/** file must start with `import "server-only"`. */
const serverOnlyFirst = {
  meta: {
    type: "problem",
    messages: {
      missing:
        'Files in src/server/ must start with: import "server-only"; (BUILD §0.1, rule 5).',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        const first = program.body.find(
          (node) => node.type !== "ExpressionStatement" || !node.directive,
        );
        const ok =
          first?.type === "ImportDeclaration" &&
          first.source.value === "server-only" &&
          first.specifiers.length === 0;
        if (!ok)
          context.report({ node: first ?? program, messageId: "missing" });
      },
    };
  },
};

export const localRules = {
  "no-server-import-in-client": noServerImportInClient,
  "server-only-first": serverOnlyFirst,
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { local: { rules: localRules } },
    rules: {
      "local/no-server-import-in-client": "error",
      "react/no-danger": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|/)supabase/admin$",
              message:
                "The secret-key client is only for security/rate-limit.ts, email/welcome.ts and actions/account.ts (BUILD §0.1, rule 6).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/**/*.{ts,tsx}"],
    rules: { "local/server-only-first": "error" },
  },
  {
    // The only files allowed to use the secret-key client (rule 6).
    files: [
      "src/server/supabase/admin.ts",
      "src/server/security/rate-limit.ts",
      "src/server/email/welcome.ts",
      "src/server/actions/account.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/lib/types/database.types.ts",
  ]),
]);

export default eslintConfig;
