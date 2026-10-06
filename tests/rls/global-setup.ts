import postgres from "postgres";

// Local Supabase database (BUILD F-1 "Tests"). Clears the limiter so earlier runs can't trip it.
export const LOCAL_DB_URL =
  "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

export default async function setup() {
  const sql = postgres(LOCAL_DB_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`truncate private.rate_limits`;
  } catch (error) {
    throw new Error(
      `RLS tests need local Supabase: run \`npm run db:start\` first (${(error as Error).message})`,
    );
  } finally {
    await sql.end();
  }
}
