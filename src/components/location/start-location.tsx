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
// `state` is FR-5's filter: the start's state while the user has the filter on, also memory only
// (decision 0014). A new start, or clearing it, turns the filter off.

type Ctx = {
  start: StartLocation | null;
  setStart: (start: StartLocation) => void;
  clear: () => void;
  state: string | null;
  setState: (state: string | null) => void;
};

const StartLocationContext = createContext<Ctx | null>(null);

export function StartLocationProvider({ children }: { children: ReactNode }) {
  const [start, set] = useState<StartLocation | null>(null);
  const [state, setState] = useState<string | null>(null);
  const value = useMemo<Ctx>(
    () => ({
      start,
      setStart: (s) => {
        setState(null);
        set(
          s.kind === "coords"
            ? { kind: "coords", lat: roundCoord(s.lat), lng: roundCoord(s.lng) }
            : { kind: "zip", zip: s.zip.trim() },
        );
      },
      clear: () => {
        setState(null);
        set(null);
      },
      state,
      setState,
    }),
    [start, state],
  );
  return <StartLocationContext value={value}>{children}</StartLocationContext>;
}

export function useStartLocation(): Ctx {
  const ctx = useContext(StartLocationContext);
  if (!ctx) throw new Error("useStartLocation needs StartLocationProvider");
  return ctx;
}
