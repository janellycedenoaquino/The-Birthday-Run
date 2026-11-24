// Lists retailers not re-checked in 6 months (BUILD F-13 `check:stale-retailers`, FR-47, A-10,
// D14). Reads data/retailers.csv only: no database, no secrets besides the workflow's token.
//   npm run check:stale-retailers                 # prints the list (no GH_TOKEN: no issue)
// In the monthly Action it keeps one open issue labelled `stale-retailers` up to date, and writes
// "N stale" or "none stale" to the run summary so "didn't run" is visible (DESIGN §5.3).
import { appendFileSync, readFileSync } from "node:fs";
import {
  compareDates,
  monthsBefore,
  type LocalDate,
} from "../src/lib/birthday/timing.ts";
import {
  parseRetailerCsv,
  type RetailerRow,
} from "../src/lib/retailers/csv-schema.ts";
import { ghIssues, type IssueSink } from "./lib/issues.ts";

export const STALE_LABEL = "stale-retailers";
export const STALE_TITLE = "Retailers to re-check";
/** A-10: re-check every 6 months. */
export const STALE_AFTER_MONTHS = 6;

type Row = Pick<RetailerRow, "id" | "name" | "last_checked_on" | "source_url">;

/** Rows last checked before today minus 6 months (day clamped to month end), oldest first. */
export function staleRetailers<R extends Row>(
  rows: R[],
  today: LocalDate,
): R[] {
  const cutoff = monthsBefore(today, STALE_AFTER_MONTHS);
  return rows
    .filter((r) => compareDates(r.last_checked_on as LocalDate, cutoff) < 0)
    .sort(
      (a, b) =>
        compareDates(
          a.last_checked_on as LocalDate,
          b.last_checked_on as LocalDate,
        ) || a.id.localeCompare(b.id),
    );
}

const cell = (s: string) => s.replace(/\|/g, "\\|");

export function staleBody(rows: Row[]): string {
  return [
    `These retailers weren't re-checked in ${STALE_AFTER_MONTHS} months (FR-47). Fix each row in`,
    "data/retailers.csv (including last_checked_on) through a PR.",
    "",
    "| id | name | last checked | source_url |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${cell(r.id)} | ${cell(r.name)} | ${r.last_checked_on} | ${cell(r.source_url)} |`,
    ),
  ].join("\n");
}

export async function checkStale({
  csvText,
  today,
  sink,
}: {
  csvText: string;
  today: LocalDate;
  sink: IssueSink | null;
}): Promise<Row[]> {
  const csv = parseRetailerCsv(csvText, { today });
  if (!csv.ok) throw new Error("data/retailers.csv doesn't parse");
  const stale = staleRetailers(csv.rows, today);
  if (!stale.length || !sink) return stale;
  const body = staleBody(stale);
  const open = await sink.findOpen(STALE_LABEL, STALE_TITLE);
  if (open) await sink.editBody(open.number, body);
  else await sink.create(STALE_LABEL, STALE_TITLE, body);
  return stale;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10) as LocalDate;
  const stale = await checkStale({
    csvText: readFileSync("data/retailers.csv", "utf8"),
    today,
    sink: process.env.GH_TOKEN ? ghIssues : null,
  });
  const line = stale.length ? `${stale.length} stale` : "none stale";
  console.log(`check-stale-retailers: ${line}`);
  for (const r of stale) console.log(`  ${r.last_checked_on}  ${r.id}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Stale retailers: ${line}\n`,
    );
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(
      `check-stale-retailers: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  });
}
