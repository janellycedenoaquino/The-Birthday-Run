"use client";

import { useState } from "react";

/** A set of selected IDs with an on/off toggle (S-101 programs, S-106 rewards). */
export function useSelection(initial: Iterable<string> = []) {
  const [selected, setSelected] = useState(() => new Set(initial));
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return { selected, toggle, clear: () => setSelected(new Set()) };
}
