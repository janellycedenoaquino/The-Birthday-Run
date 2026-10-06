import "server-only";
import { z } from "zod";

// The /monitoring tunnel (BUILD F-4, D24.16, decisions/0012): the browser SDK posts envelopes here
// (same origin, so ad blockers and connect-src 'self' allow them) and we forward them to our own
// Sentry project only. The upstream URL is built from OUR DSN, never from the request, so this
// can't relay to another project or host. Only the body goes on: no cookies, headers or visitor IP.

// Error events are capped at 1 MB by Sentry; with tracing and Replay off (D15), nothing bigger is sent.
export const MAX_ENVELOPE_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;
// Passed back so the SDK honours Sentry's rate limits (spike protection, D24.16).
const RELAYED_RESPONSE_HEADERS = ["x-sentry-rate-limits", "retry-after"];

type Dsn = { host: string; publicKey: string; projectId: string };

function parseDsn(value: string): Dsn | null {
  try {
    const url = new URL(value);
    const projectId = url.pathname.replace(/^\/+|\/+$/g, "");
    if (url.protocol !== "https:" || !url.username || !/^\d+$/.test(projectId))
      return null;
    return { host: url.host, publicKey: url.username, projectId };
  } catch {
    return null;
  }
}

// The envelope's first line is a JSON header; with a tunnel, the SDK puts its DSN there.
const envelopeHeader = z.looseObject({ dsn: z.string().max(500) });

const empty = (status: number, headers?: HeadersInit) =>
  new Response(null, { status, headers });

async function readCapped(
  request: Request,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Number(request.headers.get("content-length")) > MAX_ENVELOPE_BYTES)
    return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ENVELOPE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function tunnelEnvelope(
  request: Request,
  { dsn, fetchFn = fetch }: { dsn: string | undefined; fetchFn?: typeof fetch },
): Promise<Response> {
  const ours = dsn ? parseDsn(dsn) : null;
  if (!ours) return empty(404); // Sentry off (no DSN): nothing to forward to

  const body = await readCapped(request);
  if (!body) return empty(413);

  const text = new TextDecoder().decode(body);
  const newline = text.indexOf("\n");
  const firstLine = newline === -1 ? text : text.slice(0, newline);
  let header: z.infer<typeof envelopeHeader>;
  try {
    const parsed = envelopeHeader.safeParse(JSON.parse(firstLine));
    if (!parsed.success) return empty(400);
    header = parsed.data;
  } catch {
    return empty(400);
  }
  const theirs = parseDsn(header.dsn);
  if (!theirs) return empty(400);
  if (
    theirs.host !== ours.host ||
    theirs.publicKey !== ours.publicKey ||
    theirs.projectId !== ours.projectId
  )
    return empty(403);

  let upstream: Response;
  try {
    upstream = await fetchFn(
      `https://${ours.host}/api/${ours.projectId}/envelope/`,
      {
        method: "POST",
        body,
        headers: { "content-type": "application/x-sentry-envelope" },
        redirect: "error", // never follow a redirect off Sentry's ingest host
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );
  } catch (error) {
    // Not through logError: that reports to Sentry, which is what just failed.
    console.error(
      "sentry tunnel: upstream unreachable",
      error instanceof Error ? error.name : "unknown",
    );
    return empty(502);
  }
  // Release the connection: Sentry's answer body is never passed on.
  await upstream.body?.cancel().catch(() => {});
  const relayed = new Headers();
  for (const name of RELAYED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) relayed.set(name, value);
  }
  const status =
    upstream.status >= 200 && upstream.status <= 599 ? upstream.status : 502;
  return empty(status, relayed);
}
