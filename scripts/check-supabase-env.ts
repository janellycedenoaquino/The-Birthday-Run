// Checks the values `supabase config push` reads through config.toml env() (D24.28).
// Run by the README "config push" step and by CI before `supabase start`:
//   npm run check:supabase-env
import {
  formatEnvError,
  supabaseConfigEnvSchema,
} from "../src/lib/env/schema.ts";

const parsed = supabaseConfigEnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(`check-supabase-env: ${formatEnvError(parsed.error)}`);
  process.exit(1);
}
console.log("check-supabase-env: ok");
