"use client";

import { useState } from "react";
import { StartLocationForm } from "@/components/location/start-location-form";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import type { RouteResult } from "@/lib/route/result";
import { RouteView } from "./route-view";

type Action<T> = (input: unknown) => Promise<ActionResult<T>>;

// S-106's collapsible group route (SPEC §3.3: FR-33, premium, groups of 2 or more): C-105, then
// C-106 in the group's order. Nothing is asked for until the section is opened.
export function GroupRoute({
  groupId,
  orderKey,
  getGroupRoute,
  lookupZip,
}: {
  groupId: string;
  /** The saved order, so a reorder re-runs the route. */
  orderKey: string;
  getGroupRoute: Action<RouteResult>;
  lookupZip: Action<{ state: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rounded-md border border-border/70 p-3"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">{msg("M-238")}</summary>
      {open ? (
        <div className="mt-3 grid gap-4">
          <StartLocationForm lookupZip={lookupZip} />
          <RouteView
            runKey={orderKey}
            load={(start) => getGroupRoute({ start, groupId })}
          />
        </div>
      ) : null}
    </details>
  );
}

/** The free version: the same "Show route" spot, collapsed, with C-104 inside (FR-39). */
export function LockedRoute({ children }: { children: React.ReactNode }) {
  return (
    <details className="rounded-md border border-border/70 p-3">
      <summary className="cursor-pointer font-medium">{msg("M-238")}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
