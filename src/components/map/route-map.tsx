"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { MAP_STYLE_URL, maplibreWorkerPath } from "@/config/map";
import { msg } from "@/lib/messages";
import type { RouteResult } from "@/lib/route/result";

// The C-106 map (BUILD F-10, D11, NFR-7). Loaded with next/dynamic for premium users only, after
// the stop list. Pins are DOM built with textContent (never HTML strings). If the style or tiles
// fail, the map area shows M-162; the list and links above and below don't depend on it.
export default function RouteMap({
  route,
}: {
  route: Pick<RouteResult, "start" | "stops">;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl(
        new URL(maplibreWorkerPath(maplibregl.getVersion()), location.origin)
          .href,
      );
      map = new maplibregl.Map({
        container: container.current,
        style: MAP_STYLE_URL,
        attributionControl: { compact: false },
        center: [route.start.lng, route.start.lat],
        zoom: 11,
      });
      map.on("error", () => setFailed(true));
      const bounds = new maplibregl.LngLatBounds();
      const pin = (text: string, start: boolean) => {
        const el = document.createElement("div");
        el.textContent = text;
        el.className = start
          ? "rounded-md bg-background px-2 py-1 text-xs font-semibold text-foreground shadow ring-1 ring-border"
          : "grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow ring-2 ring-background";
        el.setAttribute("aria-hidden", "true");
        return el;
      };
      new maplibregl.Marker({ element: pin(msg("M-160"), true) })
        .setLngLat([route.start.lng, route.start.lat])
        .addTo(map);
      bounds.extend([route.start.lng, route.start.lat]);
      for (const s of route.stops) {
        new maplibregl.Marker({ element: pin(String(s.n), false) })
          .setLngLat([s.lng, s.lat])
          .addTo(map);
        bounds.extend([s.lng, s.lat]);
      }
      if (route.stops.length)
        map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
    })().catch(() => setFailed(true));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [route]);

  return (
    <div
      role="img"
      aria-label={msg("M-161").replace("{count}", String(route.stops.length))}
      className="relative h-72 w-full overflow-hidden rounded-lg border border-border/70 sm:h-96"
    >
      <div ref={container} className="absolute inset-0" />
      {failed ? (
        <p className="absolute inset-0 grid place-items-center bg-background/90 p-6 text-center text-sm">
          {msg("M-162")}
        </p>
      ) : null}
    </div>
  );
}
