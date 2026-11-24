import { haversineMeters, type LatLng } from "@/lib/route/distance";

// Smart Grouping (FR-29, D12): complete-linkage agglomerative clustering by straight-line
// distance, capped at FR-25's size. Pure: the action passes the chosen stores.

export type GroupingLimits = {
  /** Offered only with at least this many rewards with a store (FR-29: 4). */
  minOffered: number;
  /** No group smaller than this (FR-29: 2). */
  minGroupSize: number;
  /** At most this many groups (FR-29: 4). */
  maxGroups: number;
  /** FR-25's premium item limit. */
  maxGroupSize: number;
};

type Stop = LatLng & { retailerId: string };

/** Complete linkage: the largest distance between any two members. */
function linkage<T extends Stop>(a: T[], b: T[]): number {
  let max = 0;
  for (const x of a)
    for (const y of b) max = Math.max(max, haversineMeters(x, y));
  return max;
}

const byId = <T extends Stop>(a: T, b: T) =>
  a.retailerId.localeCompare(b.retailerId);
const firstId = <T extends Stop>(c: T[]) => c[0]!.retailerId;
/** Clusters keep their members sorted by retailer ID, so every tie breaks the same way. */
const merge = <T extends Stop>(a: T[], b: T[]) => [...a, ...b].sort(byId);

/** The closest pair of clusters (complete linkage) whose union fits, optionally only pairs with a small one. */
function closestPair<T extends Stop>(
  clusters: T[][],
  maxSize: number,
  needsSmall?: number,
): { i: number; j: number } | null {
  let best: { i: number; j: number; d: number } | null = null;
  for (let i = 0; i < clusters.length; i++)
    for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i]!;
      const b = clusters[j]!;
      if (a.length + b.length > maxSize) continue;
      if (needsSmall && a.length >= needsSmall && b.length >= needsSmall)
        continue;
      const d = linkage(a, b);
      if (!best || d < best.d) best = { i, j, d };
    }
  return best;
}

/**
 * Groups of `minGroupSize`…`maxGroupSize` stops, at most `maxGroups` of them.
 * 1. Merge the two closest clusters (complete linkage) whose union fits, until `maxGroups` remain.
 * 2. While a cluster is still too small, merge it with its closest partner that has room.
 * 3. Clusters still too small are left out; past `maxGroups`, keep the largest, then the tightest.
 */
export function suggestGroups<T extends Stop>(
  stops: readonly T[],
  limits: GroupingLimits,
): { groups: T[][]; leftOut: T[] } {
  let clusters: T[][] = [...stops].sort(byId).map((s) => [s]);
  const join = (pair: { i: number; j: number }) => {
    const merged = merge(clusters[pair.i]!, clusters[pair.j]!);
    clusters = clusters.filter((_, k) => k !== pair.i && k !== pair.j);
    clusters.push(merged);
    clusters.sort((a, b) => firstId(a).localeCompare(firstId(b)));
  };
  while (clusters.length > limits.maxGroups) {
    const pair = closestPair(clusters, limits.maxGroupSize);
    if (!pair) break;
    join(pair);
  }
  for (;;) {
    const pair = closestPair(
      clusters,
      limits.maxGroupSize,
      limits.minGroupSize,
    );
    if (!pair) break;
    join(pair);
  }

  let groups = clusters.filter((c) => c.length >= limits.minGroupSize);
  const leftOut = clusters.filter((c) => c.length < limits.minGroupSize).flat();
  if (groups.length > limits.maxGroups) {
    const diameter = (g: T[]) => linkage(g, g);
    const ranked = [...groups].sort(
      (a, b) =>
        b.length - a.length ||
        diameter(a) - diameter(b) ||
        firstId(a).localeCompare(firstId(b)),
    );
    groups = ranked.slice(0, limits.maxGroups);
    leftOut.push(...ranked.slice(limits.maxGroups).flat());
  }
  groups.sort((a, b) => firstId(a).localeCompare(firstId(b)));
  return { groups, leftOut: leftOut.sort(byId) };
}
