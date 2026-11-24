import { haversineMeters, type LatLng } from "@/lib/route/distance";

// Stop order for My Rewards (FR-32, D12): nearest-neighbour from the start, then 2-opt on the
// open path. Groups keep their own order and never call this (FR-33).

/** Total length in metres of start → stops[0] → … → stops[n-1] (open path, no return). */
export function pathLength(start: LatLng, stops: readonly LatLng[]): number {
  let total = 0;
  let prev = start;
  for (const s of stops) {
    total += haversineMeters(prev, s);
    prev = s;
  }
  return total;
}

/** Nearest-neighbour order from the start; ties keep the input order. */
export function nearestNeighbour<T extends LatLng>(stops: readonly T[], start: LatLng): T[] {
  const left = [...stops];
  const out: T[] = [];
  let at: LatLng = start;
  while (left.length) {
    let best = 0;
    let bestD = Infinity;
    left.forEach((s, i) => {
      const d = haversineMeters(at, s);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    at = left[best]!;
    out.push(left.splice(best, 1)[0]!);
  }
  return out;
}

/** Shorter than this (metres) doesn't count as an improvement, so rounding can't loop. */
const MIN_GAIN = 1;

/**
 * Nearest-neighbour, then 2-opt: reverse a segment when that shortens the open path by more than
 * 1 m, until no reversal helps (at most n² × 10 passes). Never longer than nearest-neighbour.
 */
export function orderStops<T extends LatLng>(stops: readonly T[], start: LatLng): T[] {
  const path = nearestNeighbour(stops, start);
  const n = path.length;
  if (n < 3) return path;
  const d = haversineMeters;
  const at = (i: number): LatLng => (i === 0 ? start : path[i - 1]!); // 0 = start, 1..n = stops
  const maxPasses = n * n * 10;
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (let i = 1; i < n; i++) {
      for (let j = i + 1; j <= n; j++) {
        // Reverse path positions i..j (1-based over stops). Edges (i-1,i) and (j,j+1) change.
        const before = d(at(i - 1), at(i)) + (j < n ? d(at(j), at(j + 1)) : 0);
        const after = d(at(i - 1), at(j)) + (j < n ? d(at(i), at(j + 1)) : 0);
        if (before - after > MIN_GAIN) {
          const seg = path.slice(i - 1, j).reverse();
          path.splice(i - 1, seg.length, ...seg);
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return path;
}
