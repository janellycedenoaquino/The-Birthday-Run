import { env } from "@/server/env";
import { tunnelEnvelope } from "@/server/observability/sentry-tunnel";

// The /monitoring tunnel for the browser SDK (BUILD F-4). Public: it carries error reports from
// signed-out visitors too. It checks its input itself (size, envelope header, our DSN only); no
// rate limit, as D24.16 documents. Excluded from the proxy matcher (F-2), so it gets no nonce.
export async function POST(request: Request) {
  return tunnelEnvelope(request, { dsn: env.NEXT_PUBLIC_SENTRY_DSN });
}
