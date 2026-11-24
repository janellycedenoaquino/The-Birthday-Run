// Straight-line distances for the route (BUILD F-10, D12). Pure: no imports, safe anywhere.

export type LatLng = { lat: number; lng: number };

/** Mean Earth radius in metres (IUGG), the one the BUILD names. */
const R = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two points (haversine). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Metres → miles, one decimal (M-163). */
export function toMiles(meters: number): number {
  return Math.round((meters / 1609.344) * 10) / 10;
}
