import { existsSync } from "node:fs";

// The local Supabase URL and keys from .env.local (README "Local setup"). Next's own loader skips
// .env.local when NODE_ENV=test (Vitest's default), so it's loaded directly. Existing env wins.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
