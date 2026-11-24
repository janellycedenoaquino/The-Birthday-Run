"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { roundCoord, type StartLocation } from "@/lib/validation/route";

// The start location (BUILD F-10, D10, NFR-3): React memory only, gone on reload. Never written
// to storage, cookies or URLs. Coordinates are rounded to 3 decimals before they're kept (A-11).

type Ctx = {
  start: StartLocation | null;
  setStart: (start: StartLocation) => void;
  clear: () => void;
};

const StartLocationContext = createContext<Ctx | null>(null);

export function StartLocationProvider({ children }: { children: ReactNode }) {
  const [start, set] = useState<StartLocation | null>(null);
  const value = useMemo<Ctx>(
    () => ({
      start,
      setStart: (s) =>
        set(
          s.kind === "coords"
            ? { kind: "coords", lat: roundCoord(s.lat), lng: roundCoord(s.lng) }
            : { kind: "zip", zip: s.zip.trim() },
        ),
      clear: () => set(null),
    }),
    [start],
  );
  return <StartLocationContext value={value}>{children}</StartLocationContext>;
}

export function useStartLocation(): Ctx {
  const ctx = useContext(StartLocationContext);
  if (!ctx) throw new Error("useStartLocation needs StartLocationProvider");
  return ctx;
}
