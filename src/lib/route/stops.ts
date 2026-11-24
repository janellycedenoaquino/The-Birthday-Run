import { haversineMeters, type LatLng } from "@/lib/route/distance";
import { pathLength } from "@/lib/route/order";

// Which store of each brand to visit (FR-31, D12, A-15). Pure.

export type StoreCandidate = LatLng & {
  retailerId: string;
  storeId: number;
  storeName: string;
  address: string | null;
};

/** Rounds of swapping after the nearest pick; stops early when a round changes nothing. */
const MAX_ROUNDS = 3;

const byNearest = (start: LatLng) => (a: StoreCandidate, b: StoreCandidate) =>
  haversineMeters(start, a) - haversineMeters(start, b) ||
  a.storeId - b.storeId;

/**
 * `brands` lists the rewards in order (the group's order with `ordered`); `candidates` holds each
 * brand's stores. Each brand starts at its nearest store; then, up to 3 rounds, each brand swaps to
 * the store that minimises its cost: distance to the start plus to every other chosen stop, or,
 * for an ordered group, the whole path length. Ties go to the lower store ID. Brands with no
 * candidate come back in `noPin`, in input order.
 */
export function chooseStops(
  brands: readonly string[],
  candidates: ReadonlyMap<string, readonly StoreCandidate[]>,
  start: LatLng,
  { ordered = false }: { ordered?: boolean } = {},
): { chosen: StoreCandidate[]; noPin: string[] } {
  const unique = [...new Set(brands)];
  const noPin = unique.filter((b) => !candidates.get(b)?.length);
  const pinned = unique.filter((b) => candidates.get(b)?.length);
  const pools = pinned.map((b) =>
    [...candidates.get(b)!].sort(byNearest(start)),
  );
  const chosen = pools.map((p) => p[0]!);

  const cost = (k: number, c: StoreCandidate) => {
    if (ordered)
      return pathLength(
        start,
        chosen.map((s, i) => (i === k ? c : s)),
      );
    let total = haversineMeters(start, c);
    chosen.forEach((s, i) => {
      if (i !== k) total += haversineMeters(c, s);
    });
    return total;
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let changed = false;
    pools.forEach((pool, k) => {
      let best = chosen[k]!;
      let bestCost = cost(k, best);
      for (const c of pool) {
        const cc = cost(k, c);
        if (cc < bestCost || (cc === bestCost && c.storeId < best.storeId)) {
          best = c;
          bestCost = cc;
        }
      }
      if (best !== chosen[k]) {
        chosen[k] = best;
        changed = true;
      }
    });
    if (!changed) break;
  }
  return { chosen, noPin };
}
