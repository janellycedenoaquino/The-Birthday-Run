import type { Breadcrumb, Event } from "@sentry/nextjs";

// Sentry's last line of defence (BUILD F-4, D15, NFR-17, rule 20): runs as beforeSend,
// beforeSendTransaction and beforeBreadcrumb in every runtime. `dataCollection` already stops the
// SDK collecting most of this; the scrubber catches what arrives anyway (error messages that
// quote an email, a URL carrying `token_hash`). Pure, and a bug in it drops the event instead of
// sending it raw.

const MAX_DEPTH = 6;

// Secret-bearing names, as a key in text: `name=…` (also `%3D`), `name: …`, `"name":"…"`.
const SECRET_NAMES =
  "token_hash|access_token|refresh_token|token|password|secret|api[_-]?key|otp";

const PATTERNS: [RegExp, string][] = [
  [/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[jwt]"],
  [/[\w.%+-]+(?:@|%40)[\w-]+(?:\.[\w-]+)+/gi, "[email]"],
  [/\bsb_(?:secret|publishable)_[\w-]+/g, "[key]"],
  [/\bre_\w{8,}/g, "[key]"], // Resend API keys
  [
    new RegExp(
      `\\b(${SECRET_NAMES})(["']?\\s*(?:=|%3D|:)\\s*["']?)[^&\\s#"',;}]*`,
      "gi",
    ),
    "$1$2[redacted]",
  ],
  // `code` only in query form: as a JSON key it's usually an error code worth keeping.
  [/\bcode(=|%3D)[^&\s#"']*/gi, "code$1[redacted]"],
];

// Values under these keys are dropped whatever they look like (a refresh token has no shape).
const SECRET_KEY =
  /pass(word)?|secret|token|cookie|authorization|api[_-]?key|private[_-]?key|service[_-]?role|otp/i;

/** Replaces emails, JWTs, `sb_`/`re_` keys and token query values in free text. */
export function redactString(text: string): string {
  return PATTERNS.reduce((s, [re, to]) => s.replace(re, to), text);
}

/** Drops `?query` and `#fragment` (they carry `token_hash`, `code` and `next`). */
export function stripQuery(url: string): string {
  return url.replace(/[?#][\s\S]*$/, "");
}

function redactDeep(value: unknown, depth = 0, seen = new WeakSet()): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[depth]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value))
    return value.map((v) => redactDeep(v, depth + 1, seen));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      redactString(k), // a map keyed by email would leak it through the key
      SECRET_KEY.test(k) ? "[redacted]" : redactDeep(v, depth + 1, seen),
    ]),
  );
}

const redactRecord = <T>(value: T): T => redactDeep(value) as T;

const URL_FIELDS = ["url", "from", "to"] as const;

function scrubCrumb(crumb: Breadcrumb): Breadcrumb {
  const out: Breadcrumb = { ...crumb };
  if (out.message) out.message = redactString(out.message);
  if (out.data) {
    const data = { ...out.data };
    delete data.body;
    // Sentry 11 also puts an outgoing request's query and fragment in their own fields.
    for (const key of Object.keys(data))
      if (/query|fragment/i.test(key)) delete data[key];
    for (const field of URL_FIELDS)
      if (typeof data[field] === "string")
        data[field] = stripQuery(data[field]);
    out.data = redactRecord(data);
  }
  return out;
}

/** beforeSend / beforeSendTransaction: the scrubbed event, or null to drop it. */
export function scrubEvent<T extends Event>(event: T): T | null {
  try {
    delete event.user;
    if (event.request) {
      const { url, method } = event.request;
      event.request = {
        ...(url !== undefined && { url: redactString(stripQuery(url)) }),
        ...(method !== undefined && { method }),
      };
    }
    if (event.transaction)
      event.transaction = redactString(stripQuery(event.transaction));
    if (event.message) event.message = redactString(event.message);
    if (event.logentry) event.logentry = redactRecord(event.logentry);
    for (const ex of event.exception?.values ?? []) {
      if (ex.value) ex.value = redactString(ex.value);
      if (ex.mechanism?.data)
        ex.mechanism.data = redactRecord(ex.mechanism.data);
      for (const frame of ex.stacktrace?.frames ?? []) delete frame.vars;
    }
    for (const thread of event.threads?.values ?? [])
      for (const frame of thread.stacktrace?.frames ?? []) delete frame.vars;
    if (event.extra) event.extra = redactRecord(event.extra);
    if (event.contexts) event.contexts = redactRecord(event.contexts);
    if (event.tags) event.tags = redactRecord(event.tags);
    if (event.breadcrumbs)
      event.breadcrumbs = event.breadcrumbs.map(scrubCrumb);
    return event;
  } catch {
    return null;
  }
}

/** beforeBreadcrumb: the scrubbed breadcrumb, or null to drop it. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  try {
    return scrubCrumb(breadcrumb);
  } catch {
    return null;
  }
}
