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
  const { start, clear } = useStartLocation();
  // The result is kept with the start and rewards it was for, so a stale one never shows.
  const [saved, setSaved] = useState<{
    key: string;
    result: ActionResult<RouteResult>;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const key = start ? `${JSON.stringify(start)}|${runKey}` : null;

  useEffect(() => {
    if (!start || !key) return;
    startTransition(async () => {
      const r = await load(start);
      // The ZIP went unknown between C-105's check and now: ask for it again.
      if (!r.ok && r.fieldErrors?.zip) clear();
      setSaved({ key, result: r });
    });
    // `load` and `clear` are rebuilt every render; the key holds what the route depends on.
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
        {errorText(result.error)}
      </p>
    );
  const route = result.data!;
  return (
    <div className="grid gap-4">
      {result.message ? <p role="status">{errorText(result.message)}</p> : null}
      {route.stops.length ? <RouteMap route={route} /> : null}
      {route.stops.length ? (
        <ol className="grid gap-3">
          {route.stops.map((s) => (
            <li key={s.retailerId} className="flex gap-3">
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
              >
                {s.n}
              </span>
              <div className="grid gap-0.5">
                <p className="font-medium">
                  <span className="sr-only">{s.n}. </span>
                  {s.retailerName}
                </p>
                <p className="text-sm">{s.storeName}</p>
                {s.address ? (
                  <p className="text-sm text-muted-foreground">{s.address}</p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {msg(s.n === 1 ? "M-163b" : "M-163").replace(
                    "{distance}",
                    s.milesFromPrevious.toFixed(1),
                  )}
                </p>
              </div>
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
