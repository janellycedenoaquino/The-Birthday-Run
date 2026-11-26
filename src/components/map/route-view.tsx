"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useTransition } from "react";
import { errorText } from "@/components/location/start-location-form";
import { useStartLocation } from "@/components/location/start-location";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import type { RouteResult } from "@/lib/route/result";
import type { StartLocation } from "@/lib/validation/route";

// C-106 Route view (SPEC §3.3: FR-31–FR-34, NFR-7). Order: map, stop list, "no map pin" list,
// Google Maps links. The list and links are plain HTML from the action's result, so they work
// when the map can't load.

const RouteMap = dynamic(() => import("./route-map"), { ssr: false });

/** Runs the route for a start; the caller binds its action and inputs (findStops / getGroupRoute). */
export type LoadRoute = (
  start: StartLocation,
) => Promise<ActionResult<RouteResult>>;

export function RouteView({
  load,
  runKey,
}: {
  load: LoadRoute;
  runKey: string;
}) {
  const { start } = useStartLocation();
  // The result is kept with the start and rewards it was for, so a stale one never shows.
  const [saved, setSaved] = useState<{
    key: string;
    result: ActionResult<RouteResult>;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  // The stop picked in the list or on the map (decision 0016: either shows it on the other).
  const [selected, setSelected] = useState<{ key: string; n: number } | null>(
    null,
  );
  const key = start ? `${JSON.stringify(start)}|${runKey}` : null;

  useEffect(() => {
    if (!start || !key) return;
    startTransition(async () => {
      let r: ActionResult<RouteResult>;
      try {
        r = await load(start);
      } catch {
        // A network failure stays inside C-106 (NFR-7), never the page's error boundary.
        r = { ok: false, error: "M-7" };
      }
      setSaved({ key, result: r });
    });
    // `load` is rebuilt every render; the key holds what the route depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when the key changes only
  }, [key]);

  if (!start) return null;
  const result = saved?.key === key ? saved.result : null;
  if (pending || !result)
    return (
      <div className="grid gap-2" aria-busy="true">
        <p className="text-sm text-muted-foreground" role="status">
          {msg("M-169")}
        </p>
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  if (!result.ok)
    return (
      <p role="alert" className="text-sm text-destructive">
        {/* An unknown ZIP (BR-12) reads as its field text; "Change" above clears it. */}
        {result.fieldErrors?.zip?.[0] ?? errorText(result.error)}
      </p>
    );
  const route = result.data!;
  const picked = selected?.key === key ? selected.n : null;
  const pick = (n: number) => setSelected({ key: key!, n });
  return (
    <div className="grid gap-4">
      {result.message ? <p role="status">{errorText(result.message)}</p> : null}
      {route.stops.length ? (
        <RouteMap route={route} selected={picked} onSelect={pick} />
      ) : null}
      {route.stops.length ? (
        <ol className="grid gap-3">
          {route.stops.map((s) => (
            <li key={s.retailerId}>
              <button
                type="button"
                aria-pressed={picked === s.n}
                onClick={() => pick(s.n)}
                className="flex w-full gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted aria-pressed:bg-secondary"
              >
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--bubblegum)] text-xs font-bold text-[var(--navy)]"
                >
                  {s.n}
                </span>
                <span className="grid gap-0.5">
                  <span className="block font-medium">
                    <span className="sr-only">{s.n}. </span>
                    {s.retailerName}
                  </span>
                  <span className="block text-sm">{s.storeName}</span>
                  {s.address ? (
                    <span className="block text-sm text-muted-foreground">
                      {s.address}
                    </span>
                  ) : null}
                  <span className="block text-sm text-muted-foreground">
                    {msg(s.n === 1 ? "M-163b" : "M-163").replace(
                      "{distance}",
                      s.milesFromPrevious.toFixed(1),
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      {route.noPin.length ? (
        <section className="grid gap-2">
          <h3 className="font-semibold">{msg("M-164")}</h3>
          <ul className="grid gap-1">
            {route.noPin.map((p) => (
              <li key={p.retailerId}>
                <span className="font-medium">{p.retailerName}</span>
                {": "}
                {p.finderUrl ? (
                  <a
                    href={p.finderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    {msg("M-165")}
                  </a>
                ) : (
                  msg("M-165")
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {route.legs.length ? (
        <ul className="grid gap-2">
          {route.legs.map((url, i) => (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center rounded-md bg-primary px-4 font-medium text-primary-foreground"
              >
                {route.legs.length === 1
                  ? msg("M-167")
                  : msg("M-168")
                      .replace("{n}", String(i + 1))
                      .replace("{total}", String(route.legs.length))}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
