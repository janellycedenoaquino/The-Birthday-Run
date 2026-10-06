import "server-only";

// Every app table, in exactly one list (D12, DESIGN §3). USER_DATA_TABLES drives data export,
// account deletion and the coverage test (tests/rls/catalog.test.ts): each entry needs RLS,
// the restrictive MFA policy, a cascade path to auth.users and tests/rls/<schema>.<table>.test.ts.
// User-data tables live in `public` (D24.18).

type UserDataTable = { schema: "public"; table: string; ownerColumn: string };
type NonUserDataTable = { schema: string; table: string; reason: string };

export const USER_DATA_TABLES = [
  { schema: "public", table: "profiles", ownerColumn: "id" },
] as const satisfies readonly UserDataTable[];

export const NON_USER_DATA_TABLES = [
  {
    schema: "private",
    table: "rate_limits",
    reason: "hashed keys, 24 h retention",
  },
] as const satisfies readonly NonUserDataTable[];
