// Pure parsing for the ZIP import (BUILD F-9 "ZIPs", D10, A-13). No I/O here.

/** State FIPS → USPS code: 50 states, DC and the territories the Census files use. */
export const FIPS_TO_USPS: Readonly<Record<string, string>> = {
  "01": "AL",
  "02": "AK",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  "10": "DE",
  "11": "DC",
  "12": "FL",
  "13": "GA",
  "15": "HI",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
  "60": "AS",
  "66": "GU",
  "69": "MP",
  "72": "PR",
  "78": "VI",
};

export type ZipPoint = { zip: string; lat: number; lng: number };

function rowsOf(text: string): { header: string[]; rows: string[][] } {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  const header = (lines[0] ?? "").split("|").map((h) => h.trim());
  return {
    header,
    rows: lines.slice(1).map((l) => l.split("|").map((c) => c.trim())),
  };
}

/** Gazetteer ZCTA file: GEOID + INTPTLAT/INTPTLONG (the internal point, D10). */
export function parseGazetteer(text: string): ZipPoint[] {
  const { header, rows } = rowsOf(text);
  const iZip = header.indexOf("GEOID");
  const iLat = header.indexOf("INTPTLAT");
  const iLng = header.indexOf("INTPTLONG");
  if (iZip < 0 || iLat < 0 || iLng < 0)
    throw new Error("gazetteer: missing GEOID/INTPTLAT/INTPTLONG");
  const out: ZipPoint[] = [];
  for (const r of rows) {
    const zip = r[iZip] ?? "";
    const lat = Number(r[iLat]);
    const lng = Number(r[iLng]);
    if (
      /^\d{5}$/.test(zip) &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    )
      out.push({ zip, lat, lng });
  }
  return out;
}

/**
 * ZCTA → county relationship file: each ZCTA's state is the county FIPS prefix of its row with
 * the largest land area (A-13). Rows with an empty ZCTA are skipped.
 */
export function parseZctaStates(text: string): Map<string, string> {
  const { header, rows } = rowsOf(text);
  const iZip = header.indexOf("GEOID_ZCTA5_20");
  const iCounty = header.indexOf("GEOID_COUNTY_20");
  const iLand = header.indexOf("AREALAND_PART");
  if (iZip < 0 || iCounty < 0 || iLand < 0)
    throw new Error(
      "relationship file: missing GEOID_ZCTA5_20/GEOID_COUNTY_20/AREALAND_PART",
    );
  const best = new Map<string, { land: number; state: string }>();
  for (const r of rows) {
    const zip = r[iZip] ?? "";
    if (!/^\d{5}$/.test(zip)) continue;
    const state = FIPS_TO_USPS[(r[iCounty] ?? "").slice(0, 2)];
    if (!state) continue;
    const land = Number(r[iLand]) || 0;
    const cur = best.get(zip);
    if (!cur || land > cur.land) best.set(zip, { land, state });
  }
  return new Map([...best].map(([z, v]) => [z, v.state]));
}

/** Joins points with states; points without a state are reported, not stored (state is required). */
export function joinZips(points: ZipPoint[], states: Map<string, string>) {
  const rows: (ZipPoint & { state: string })[] = [];
  const noState: string[] = [];
  for (const p of points) {
    const state = states.get(p.zip);
    if (state) rows.push({ ...p, state });
    else noState.push(p.zip);
  }
  return { rows, noState };
}

/** BUILD F-9: a broken download never empties the table (new count under 90% of current → refuse). */
export function zipGuard(
  newCount: number,
  currentCount: number,
): string | null {
  if (newCount === 0) return "no ZIP rows parsed";
  if (currentCount > 0 && newCount < currentCount * 0.9)
    return `only ${newCount} ZIPs vs ${currentCount} stored (under 90%); nothing was written`;
  return null;
}
