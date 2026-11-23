"use client";

import { useSyncExternalStore } from "react";

// Recent pickups that can still be undone (FR-18: 60 seconds). The card itself leaves the list as
// soon as the server re-renders without it, so the undo row lives here, outside the list.
export const UNDO_MS = 60_000;

export type Recent = { pickupId: string; retailer: string; until: number };

let recent: Recent[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function addRecent(pickupId: string, retailer: string) {
  recent = [...recent, { pickupId, retailer, until: Date.now() + UNDO_MS }];
  emit();
  setTimeout(() => removeRecent(pickupId), UNDO_MS);
}

export function removeRecent(pickupId: string) {
  recent = recent.filter((r) => r.pickupId !== pickupId);
  emit();
}

const EMPTY: Recent[] = [];
export function useRecent(): Recent[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => recent,
    () => EMPTY,
  );
}
