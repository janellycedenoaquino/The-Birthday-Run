import type { LatLng } from "@/lib/route/distance";

// "Open in Google Maps" links (FR-34, D10, D12). No API key: plain Maps URLs
// (developers.google.com/maps/documentation/urls/get-started, checked 2026-11-24).

export type Device = "mobile" | "desktop";

/** Google's waypoint limit per link: 3 on mobile browsers, 9 otherwise. */
export const WAYPOINTS: Record<Device, number> = { mobile: 3, desktop: 9 };
/** Google's URL length limit. */
export const MAX_URL = 2048;

/** The start as the link sees it. A browser location is never put in a URL (D10). */
export type LinkStart = { kind: "coords" } | { kind: "zip"; zip: string };

const point = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

/**
 * One URL per leg. A leg is origin + up to W waypoints + destination, so it covers up to W + 1
 * stops; the next leg starts at the previous leg's destination. Leg 1 has no origin for a
 * browser-location start (Google then uses the device's location or asks) and `origin=<zip>` for
 * a ZIP start. Throws if a URL would pass 2,048 characters (can't happen at 5 decimals).
 */
export function googleLegs(stops: readonly LatLng[], start: LinkStart, device: Device): string[] {
  const per = WAYPOINTS[device] + 1;
  const legs: string[] = [];
  for (let i = 0; i < stops.length; i += per) {
    const chunk = stops.slice(i, i + per);
    const params = new URLSearchParams({ api: "1", travelmode: "driving" });
    if (i > 0) params.set("origin", point(stops[i - 1]!));
    else if (start.kind === "zip") params.set("origin", start.zip);
    params.set("destination", point(chunk[chunk.length - 1]!));
    const waypoints = chunk.slice(0, -1);
    if (waypoints.length) params.set("waypoints", waypoints.map(point).join("|"));
    // URLSearchParams encodes "," as %2C and "|" as %7C, as Google asks.
    const url = `https://www.google.com/maps/dir/?${params.toString()}`;
    if (url.length > MAX_URL) throw new Error("googleLegs: URL over 2,048 characters");
    legs.push(url);
  }
  return legs;
}

/** FR-34: `Sec-CH-UA-Mobile: ?1`, or a phone user agent → mobile; else desktop. */
export function deviceFromHeaders(headers: Pick<Headers, "get">): Device {
  if (headers.get("sec-ch-ua-mobile") === "?1") return "mobile";
  return /Mobi|Android|iPhone|iPod/.test(headers.get("user-agent") ?? "") ? "mobile" : "desktop";
}
