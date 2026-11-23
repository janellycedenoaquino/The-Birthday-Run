// The retailer CSV checker (BUILD F-1, FR-1, FR-46, D2). Pure and isomorphic: imports only `zod`
// and relative `.ts` files, so `scripts/import-retailers.ts` can run it on Node's type stripping.
// The SQL checks in the `retailers` migration are the last line of defence; this gives row numbers.
import { z } from "zod";

/** FR-1 / A-1: a reward lasts 1–31 days in total. */
export const REWARD_DAYS_MIN = 1;
export const REWARD_DAYS_MAX = 31;

/** A-8: the 50 states plus DC. */
export const US_STATE_CODES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;
const STATE_SET = new Set<string>(US_STATE_CODES);

/** DESIGN §3 `retailers` column order; `states` stands for `states_scope` + `state_codes`. */
export const CSV_COLUMNS = [
  "id",
  "name",
  "category",
  "description",
  "reward_description",
  "timing_type",
  "days_before",
  "days_after",
  "reward_type",
  "requires_purchase",
  "purchase_requirement",
  "membership_requirement",
  "other_requirement",
  "logo_file",
  "website_url",
  "store_finder_url",
  "states",
  "is_popular",
  "last_checked_on",
  "source_url",
] as const;
type CsvColumn = (typeof CSV_COLUMNS)[number];

export type CsvErrorCode =
  | "malformed_csv"
  | "missing_header"
  | "unknown_header"
  | "duplicate_header"
  | "column_count"
  | "required"
  | "invalid"
  | "invalid_enum"
  | "timing"
  | "state_code"
  | "url_scheme"
  | "date_format"
  | "future_date"
  | "duplicate_id"
  | "duplicate_name";
export type CsvError = { row: number; column?: string; code: CsvErrorCode };

// ---- RFC 4180 reader -------------------------------------------------------------------------

type Record_ = { line: number; fields: string[] };

/** Splits CSV text into records. `line` is the 1-based line where each record starts. */
export function readCsv(
  text: string,
): { ok: true; records: Record_[] } | { ok: false; line: number } {
  const s = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const records: Record_[] = [];
  let fields: string[] = [];
  let field = "";
  let line = 1;
  let start = 1;
  let quoted = false; // inside "…"
  let closed = false; // just after a closing quote: only , or a line end may follow
  let touched = false; // the record has a comma or a quote, so it isn't a blank line

  const endRecord = () => {
    fields.push(field);
    if (touched || fields.length > 1 || field !== "")
      records.push({ line: start, fields });
    fields = [];
    field = "";
    touched = false;
    closed = false;
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else {
        if (c === "\n") line++;
        field += c;
      }
    } else if (c === ",") {
      fields.push(field);
      field = "";
      touched = true;
      closed = false;
    } else if (c === "\n" || (c === "\r" && s[i + 1] === "\n")) {
      if (c === "\r") i++;
      endRecord();
      line++;
      start = line;
    } else if (closed || (c === '"' && field !== "")) {
      return { ok: false, line }; // text after a closing quote, or a quote mid-field
    } else if (c === '"') {
      quoted = true;
      touched = true;
    } else {
      field += c;
    }
  }
  if (quoted) return { ok: false, line: start };
  if (touched || fields.length > 0 || field !== "") endRecord();
  return { ok: true, records };
}

// ---- Row schema ------------------------------------------------------------------------------

/** https:// plus a host, same as the migration's URL checks. */
const HTTPS_URL = /^https:\/\/[^/\s]+/;

const text = z.string().transform((v) => v.trim());
const required = text.pipe(z.string().min(1, "required"));
const optional = text.transform((v) => (v === "" ? null : v));
const httpsUrl = optional.refine(
  (v) => v === null || HTTPS_URL.test(v),
  "url_scheme",
);
const yesNo = text
  .pipe(z.enum(["yes", "no"], "invalid_enum"))
  .transform((v) => v === "yes");
const days = optional.transform((v, ctx) => {
  if (v === null) return null;
  if (!/^\d{1,3}$/.test(v)) {
    ctx.addIssue({ code: "custom", message: "invalid" });
    return z.NEVER;
  }
  return Number(v);
});

/** One CSV record, keyed by header. `.strict()`: unknown columns are refused. */
export const retailerCsvRowSchema = z
  .object({
    id: required.pipe(
      z
        .string()
        .max(64, "invalid")
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "invalid"),
    ),
    name: required,
    category: required.pipe(
      z.enum(
        ["food_drink", "entertainment", "retail", "beauty"],
        "invalid_enum",
      ),
    ),
    description: required,
    reward_description: required,
    timing_type: required.pipe(
      z.enum(
        ["from_birthday", "birth_month", "around_birthday"],
        "invalid_enum",
      ),
    ),
    days_before: days,
    days_after: days,
    reward_type: required.pipe(
      z.enum(
        ["free_item", "discount", "bogo", "points", "free_with_purchase"],
        "invalid_enum",
      ),
    ),
    requires_purchase: yesNo,
    purchase_requirement: optional,
    membership_requirement: optional,
    other_requirement: optional,
    logo_file: optional.refine(
      (v) => v === null || /^[a-z0-9-]+\.(png|svg)$/.test(v),
      "invalid",
    ),
    website_url: httpsUrl,
    store_finder_url: httpsUrl,
    states: text.transform((v, ctx) => {
      if (v === "")
        return {
          states_scope: "unknown" as const,
          state_codes: [] as string[],
        };
      if (v === "all")
        return { states_scope: "all" as const, state_codes: [] as string[] };
      const codes = v.split(";").map((c) => c.trim());
      if (
        codes.some((c) => !STATE_SET.has(c)) ||
        new Set(codes).size !== codes.length
      ) {
        ctx.addIssue({ code: "custom", message: "state_code" });
        return z.NEVER;
      }
      return { states_scope: "listed" as const, state_codes: codes };
    }),
    is_popular: yesNo,
    last_checked_on: required.pipe(
      z.string().refine(isRealDate, "date_format"),
    ),
    source_url: required.pipe(z.string().regex(HTTPS_URL, "url_scheme")),
  } satisfies Record<CsvColumn, z.ZodType>)
  .strict()
  .superRefine((r, ctx) => {
    // FR-11's three types, same rule as the SQL check `retailers_timing_columns`.
    const b = r.days_before;
    const a = r.days_after;
    const ok =
      (r.timing_type === "from_birthday" &&
        b === null &&
        a !== null &&
        a >= REWARD_DAYS_MIN &&
        a <= REWARD_DAYS_MAX) ||
      (r.timing_type === "birth_month" && b === null && a === null) ||
      (r.timing_type === "around_birthday" &&
        b !== null &&
        a !== null &&
        b >= 1 &&
        a >= 0 &&
        b + a + 1 <= REWARD_DAYS_MAX);
    if (!ok)
      ctx.addIssue({
        code: "custom",
        message: "timing",
        path: ["timing_type"],
      });
  });

type Parsed = z.output<typeof retailerCsvRowSchema>;
/** A row as the import writes it (DESIGN §3 columns, minus the timestamps). */
export type RetailerRow = Omit<Parsed, "states"> & Parsed["states"];

function isRealDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.toISOString().slice(0, 10) === v;
}

const KNOWN_CODES = new Set<string>([
  "required",
  "invalid",
  "invalid_enum",
  "timing",
  "state_code",
  "url_scheme",
  "date_format",
]);

// ---- Whole file ------------------------------------------------------------------------------

/**
 * Parses and checks `data/retailers.csv`. `row` in each error is the 1-based line where the
 * record starts (header = 1). `today` (YYYY-MM-DD, UTC) bounds `last_checked_on` (FR-46).
 */
export function parseRetailerCsv(
  input: string,
  options: { today?: string } = {},
): { ok: true; rows: RetailerRow[] } | { ok: false; errors: CsvError[] } {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const read = readCsv(input);
  if (!read.ok)
    return { ok: false, errors: [{ row: read.line, code: "malformed_csv" }] };
  const [header, ...records] = read.records;
  if (!header)
    return { ok: false, errors: [{ row: 1, code: "missing_header" }] };

  const errors: CsvError[] = [];
  const names = header.fields.map((f) => f.trim());
  const seenHeader = new Set<string>();
  for (const n of names) {
    if (seenHeader.has(n))
      errors.push({ row: 1, column: n, code: "duplicate_header" });
    seenHeader.add(n);
    if (!(CSV_COLUMNS as readonly string[]).includes(n))
      errors.push({ row: 1, column: n, code: "unknown_header" });
  }
  for (const c of CSV_COLUMNS)
    if (!seenHeader.has(c))
      errors.push({ row: 1, column: c, code: "missing_header" });
  if (errors.length) return { ok: false, errors };

  const rows: RetailerRow[] = [];
  const ids = new Set<string>();
  const nameSet = new Set<string>();
  for (const rec of records) {
    if (rec.fields.length !== names.length) {
      errors.push({ row: rec.line, code: "column_count" });
      continue;
    }
    const obj = Object.fromEntries(names.map((n, i) => [n, rec.fields[i]]));
    const parsed = retailerCsvRowSchema.safeParse(obj);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const code = KNOWN_CODES.has(issue.message)
          ? (issue.message as CsvErrorCode)
          : "invalid";
        errors.push({
          row: rec.line,
          column: String(issue.path[0] ?? ""),
          code,
        });
      }
      continue;
    }
    const { states, ...rest } = parsed.data;
    const row: RetailerRow = { ...rest, ...states };
    if (row.last_checked_on > today)
      errors.push({
        row: rec.line,
        column: "last_checked_on",
        code: "future_date",
      });
    if (ids.has(row.id))
      errors.push({ row: rec.line, column: "id", code: "duplicate_id" });
    const key = row.name.toLowerCase();
    if (nameSet.has(key))
      errors.push({ row: rec.line, column: "name", code: "duplicate_name" });
    ids.add(row.id);
    nameSet.add(key);
    rows.push(row);
  }
  return errors.length ? { ok: false, errors } : { ok: true, rows };
}
