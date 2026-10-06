import postgres from "postgres";
import { LOCAL_DB_URL } from "../rls/global-setup";

// Before the e2e run (BUILD §0.4): locally every request shares the IP "unknown", so the
// limiter's counters from earlier runs would refuse the sign-ups here. Local database only.
export default async function globalSetup() {
  const sql = postgres(LOCAL_DB_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`truncate private.rate_limits`;
  } catch (error) {
    throw new Error(
      `e2e tests need local Supabase: run \`npm run db:start\` first (${(error as Error).message})`,
    );
  } finally {
    await sql.end();
  }
}
