import { CSV_COLUMNS } from "@/lib/retailers/csv-schema";

// A valid data/retailers.csv row and builders, shared by the CSV and F-13 script tests.
export const HEADER = CSV_COLUMNS.join(",");

export type Cells = Partial<Record<(typeof CSV_COLUMNS)[number], string>>;
export const base: Record<(typeof CSV_COLUMNS)[number], string> = {
  id: "cafe-one",
  name: "Cafe One",
  category: "food_drink",
  description: "Coffee shop",
  reward_description: "Free drink",
  timing_type: "from_birthday",
  days_before: "",
  days_after: "7",
  reward_type: "free_item",
  requires_purchase: "no",
  purchase_requirement: "",
  membership_requirement: "Rewards member",
  other_requirement: "",
  signup_lead_days: "",
  logo_file: "cafe-one.png",
  website_url: "https://cafe.example",
  store_finder_url: "",
  states: "all",
  is_popular: "yes",
  last_checked_on: "2026-11-01",
  source_url: "https://cafe.example/rewards",
};
export const line = (cells: Cells = {}) =>
  CSV_COLUMNS.map((c) => {
    const v = cells[c] ?? base[c];
    return /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  }).join(",");
export const csv = (...rows: string[]) => [HEADER, ...rows].join("\n") + "\n";
