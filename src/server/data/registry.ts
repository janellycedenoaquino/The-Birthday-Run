import "server-only";

// Every app table, in exactly one list (D12, DESIGN §3). USER_DATA_TABLES drives data export,
// account deletion and the coverage test (tests/rls/catalog.test.ts): each entry needs RLS,
// the restrictive MFA policy, a cascade path to auth.users and tests/rls/<schema>.<table>.test.ts.
// User-data tables live in `public` (D24.18).

type UserDataTable = { schema: "public"; table: string; ownerColumn: string };
type NonUserDataTable = { schema: string; table: string; reason: string };

export const USER_DATA_TABLES = [
  { schema: "public", table: "profiles", ownerColumn: "id" },
  { schema: "public", table: "enrollments", ownerColumn: "user_id" },
  { schema: "public", table: "pickups", ownerColumn: "user_id" },
  { schema: "public", table: "reward_groups", ownerColumn: "user_id" },
  { schema: "public", table: "reward_group_items", ownerColumn: "user_id" },
  { schema: "public", table: "premium_grants", ownerColumn: "user_id" },
  { schema: "public", table: "subscriptions", ownerColumn: "user_id" },
  { schema: "public", table: "reminder_log", ownerColumn: "user_id" },
  { schema: "public", table: "reward_reports", ownerColumn: "user_id" },
] as const satisfies readonly UserDataTable[];

export const NON_USER_DATA_TABLES = [
  {
    schema: "private",
    table: "rate_limits",
    reason: "hashed keys, 24 h retention",
  },
  { schema: "public", table: "retailers", reason: "CSV catalogue (D2)" },
  {
    schema: "public",
    table: "retailer_stores",
    reason: "public store locations (D9)",
  },
  {
    schema: "public",
    table: "zip_centroids",
    reason: "Census ZIP centroids (D10)",
  },
] as const satisfies readonly NonUserDataTable[];
