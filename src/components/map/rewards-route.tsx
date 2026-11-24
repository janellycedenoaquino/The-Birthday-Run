"use client";

import { useId, useState } from "react";
import { StartLocationForm } from "@/components/location/start-location-form";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import type { RouteResult } from "@/lib/route/result";
import { RouteView } from "./route-view";

/** FR-32: the default selection is the 10 most urgent available rewards. */
export const DEFAULT_ROUTE_SIZE = 10;

type Action<T> = (input: unknown) => Promise<ActionResult<T>>;

// S-105's Route section (SPEC §3.3: FR-32, premium only): a checklist of the available rewards,
// most urgent first, then C-105 and C-106. Changing the checklist applies on "Show route".
export function RewardsRoute({
  rewards,
  findStops,
  lookupZip,
}: {
  rewards: { id: string; name: string }[];
  findStops: Action<RouteResult>;
  lookupZip: Action<{ state: string | null }>;
}) {
  const initial = rewards.slice(0, DEFAULT_ROUTE_SIZE).map((r) => r.id);
  const [draft, setDraft] = useState<string[]>(initial);
  const [chosen, setChosen] = useState<string[]>(initial);
  const id = useId();
  // Rewards picked up or ended since (the page re-renders with a new list) drop out.
  const available = rewards.map((r) => r.id);
  const live = chosen.filter((x) => available.includes(x));
  const toggle = (rid: string, on: boolean) =>
    setDraft((d) =>
      on
        ? rewards.map((r) => r.id).filter((x) => x === rid || d.includes(x))
        : d.filter((x) => x !== rid),
    );

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setChosen(draft.filter((x) => available.includes(x)));
        }}
      >
        <fieldset className="grid gap-2">
          <legend className="sr-only">Rewards to map</legend>
          {rewards.map((r) => (
            <label
              key={r.id}
              htmlFor={`${id}-${r.id}`}
              className="flex min-h-11 items-center gap-3"
            >
              <input
                id={`${id}-${r.id}`}
                type="checkbox"
                className="size-5"
                checked={draft.includes(r.id)}
                onChange={(e) => toggle(r.id, e.target.checked)}
              />
              {r.name}
            </label>
          ))}
        </fieldset>
        <div>
          <Button
            type="submit"
            variant="outline"
            size="lg"
            disabled={!draft.some((x) => available.includes(x))}
          >
            {msg("M-238")}
          </Button>
        </div>
      </form>
      <StartLocationForm lookupZip={lookupZip} />
      {live.length ? (
        <RouteView
          // The available list is in the key too: a pickup elsewhere on the page re-runs it.
          runKey={`${live.join()}|${available.join()}`}
          load={(start) => findStops({ start, retailerIds: live })}
        />
      ) : null}
    </div>
  );
}
