"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { StyleSpecification } from "maplibre-gl";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import {
  MAP_ATTRIBUTION,
  MAP_STYLE_URL,
  maplibreWorkerPath,
} from "@/config/map";
import { pastelStyle, type MapMode } from "@/lib/map/pastel-style";
import { msg } from "@/lib/messages";
import type { RouteResult } from "@/lib/route/result";
import { initialsOf } from "@/lib/retailers/labels";

// The C-106 map (BUILD F-10, D11, NFR-7; look: decision 0016). Loaded with next/dynamic for
// premium users only, after the stop list. The liberty style is loaded once and recoloured to
// the pastels (cocoa in dark mode); the route is a pink line, stops are white logo pins with a
// pink number matching the list, the start is a navy "S". Pins are DOM built with textContent
// and attributes (never HTML strings). If the style or first render fails, the map area shows
// M-162; the list and links don't depend on it. The map is one labelled image (M-161) with
// nothing to tab into; clicking a pin is a mouse shortcut for the list row's own button.
type Stop = RouteResult["stops"][number];

const PIN =
  "relative grid size-9 cursor-pointer place-items-center rounded-full bg-white shadow-md ring-2 transition-[scale]";
const PIN_IDLE = "ring-white";
// The selected pin: bigger, with a navy ring (cream in dark mode, where navy wouldn't show).

/**
 * The marker element MapLibre moves with an inline transform, holding the visible pin. The pin is
 * an inner element because CSS `scale` on the marker itself would also scale that translate.
 */
function stopPin(s: Stop, onClick: () => void) {
  const marker = document.createElement("div");
  marker.setAttribute("aria-hidden", "true");
  const el = document.createElement("div");
  el.className = `${PIN} ${PIN_IDLE}`;
  marker.append(el);
  const fallback = () => {
    const t = document.createElement("span");
    t.className = "text-[10px] font-semibold text-[var(--navy)]";
    t.textContent = initialsOf(s.retailerName);
    return t;
  };
  if (s.logoFile) {
    const img = document.createElement("img");
    img.setAttribute("src", `/retailers/${s.logoFile}`);
    img.setAttribute("alt", "");
    img.className = "size-6 rounded-full object-contain";
    img.addEventListener("error", () => img.replaceWith(fallback()), {
      once: true,
    });
    el.append(img);
  } else el.append(fallback());
  const badge = document.createElement("span");
  badge.className =
    "absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-[var(--bubblegum)] text-[10px] font-bold text-[var(--navy)] ring-2 ring-white";
  badge.textContent = String(s.n);
  el.append(badge);
  marker.addEventListener("click", onClick);
  return { marker, pin: el };
}

function startPin() {
  const el = document.createElement("div");
  el.className =
    "grid size-8 place-items-center rounded-full bg-[var(--navy)] text-xs font-bold text-white shadow-md ring-2 ring-white";
  el.textContent = "S";
  el.title = msg("M-160");
  el.setAttribute("aria-hidden", "true");
  return el;
}

export default function RouteMap({
  route,
  selected,
  onSelect,
}: {
  route: Pick<RouteResult, "start" | "stops">;
  /** The stop number picked in the list or on the map, if any. */
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | undefined>(undefined);
  const baseStyle = useRef<StyleSpecification | undefined>(undefined);
  const pins = useRef(new Map<number, HTMLElement>());
  const onSelectRef = useRef(onSelect);
  const [failed, setFailed] = useState(false);
  const { resolvedTheme } = useTheme();
  const mode: MapMode = resolvedTheme === "dark" ? "dark" : "light";
  const modeRef = useRef(mode);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const points = [route.start, ...route.stops];

  useEffect(() => {
    let cancelled = false;
    const markers = pins.current;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl(
        new URL(maplibreWorkerPath(maplibregl.getVersion()), location.origin)
          .href,
      );
      const map = new maplibregl.Map({
        container: container.current,
        attributionControl: false,
        center: [route.start.lng, route.start.lat],
        zoom: 11,
      });
      // MapLibre fetches the style itself; it's kept so a theme switch recolours it without a
      // second request.
      map.setStyle(MAP_STYLE_URL, {
        transformStyle: (_previous, next) => {
          baseStyle.current = next;
          return pastelStyle(next, modeRef.current, points);
        },
      });
      mapRef.current = map;
      // NFR-7: the map counts as failed when the first render can't load. A single tile
      // failing later leaves the working map in place.
      let loaded = false;
      map.on("load", () => {
        loaded = true;
      });
      map.on("error", () => {
        if (!loaded) setFailed(true);
      });
      map.getCanvas().tabIndex = -1;
      map.keyboard.disable();
      const bounds = new maplibregl.LngLatBounds();
      new maplibregl.Marker({ element: startPin() })
        .setLngLat([route.start.lng, route.start.lat])
        .addTo(map);
      bounds.extend([route.start.lng, route.start.lat]);
      for (const s of route.stops) {
        const { marker, pin } = stopPin(s, () => onSelectRef.current(s.n));
        markers.set(s.n, pin);
        new maplibregl.Marker({ element: marker })
          .setLngLat([s.lng, s.lat])
          .addTo(map);
        bounds.extend([s.lng, s.lat]);
      }
      if (route.stops.length)
        map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 0 });
    })().catch(() => setFailed(true));
    return () => {
      cancelled = true;
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = undefined;
    };
    // `points` is derived from `route`.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when the route changes
  }, [route]);

  // Theme switch: recolour from the style already fetched (no new request).
  useEffect(() => {
    modeRef.current = mode;
    if (mapRef.current && baseStyle.current)
      mapRef.current.setStyle(pastelStyle(baseStyle.current, mode, points));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `points` changes rebuild the map above
  }, [mode]);

  useEffect(() => {
    for (const [n, el] of pins.current) {
      const on = n === selected;
      el.classList.toggle("scale-125", on);
      el.classList.toggle("ring-[var(--navy)]", on);
      el.classList.toggle("dark:ring-[var(--cream)]", on);
      el.classList.toggle("ring-white", !on);
      el.parentElement?.classList.toggle("z-10", on);
    }
    const s = route.stops.find((x) => x.n === selected);
    if (s && mapRef.current)
      mapRef.current.easeTo({
        center: [s.lng, s.lat],
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 500,
      });
  }, [selected, route]);

  return (
    <div className="grid gap-1">
      <div
        role="img"
        aria-label={msg("M-161").replace("{count}", String(route.stops.length))}
        className="relative h-72 w-full overflow-hidden rounded-lg border border-border/70 sm:h-96"
      >
        {/* size-full, not absolute: MapLibre's unlayered CSS sets position: relative on it. */}
        <div ref={container} className="size-full" />
        {failed ? (
          <p className="absolute inset-0 grid place-items-center bg-background/90 p-6 text-center text-sm">
            {msg("M-162")}
          </p>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {MAP_ATTRIBUTION.map((a, i) => (
          <span key={a.href}>
            {i ? " · " : null}
            <a
              href={a.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {a.text}
            </a>
          </span>
        ))}
      </p>
    </div>
  );
}
