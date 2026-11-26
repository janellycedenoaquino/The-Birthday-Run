// C-106's map look (decision 0016): OpenFreeMap's liberty style recoloured to the brand pastels,
// with the route drawn as a pink line under the labels. Pure: it takes the fetched style and
// returns a new one, so MapLibre's setStyle({ transformStyle }) can use it and it can be tested.
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

export type MapMode = "light" | "dark";

type Palette = {
  land: string;
  landTint: string;
  green: string;
  water: string;
  road: string;
  casingMajor: string;
  casingMinor: string;
  rail: string;
  building: string;
  boundary: string;
  label: string;
  halo: string;
  route: string;
  routeCasing: string;
};

/** Light: cream land, baby-blue water, mint parks, white roads with pink edges, navy-grey labels. */
const LIGHT: Palette = {
  land: "#fffcf7",
  landTint: "#fbf3ec",
  green: "#d3f5e1",
  water: "#c7e3ff",
  road: "#ffffff",
  casingMajor: "#ffb8d3",
  casingMinor: "#f6dfe6",
  rail: "#e4dad6",
  building: "#f3ebe4",
  boundary: "#c9bfd0",
  label: "#4c557d",
  halo: "#fffcf7",
  route: "#ff6fa8",
  routeCasing: "#ffffff",
};

/** Dark: the cocoa page colours (decision 0016), with the same pastels dimmed. */
const DARK: Palette = {
  land: "#231a18",
  landTint: "#2a201e",
  green: "#2b3b31",
  water: "#2c3b4c",
  road: "#4a3438",
  casingMajor: "#8a4d63",
  casingMinor: "#3d2f31",
  rail: "#3d2f31",
  building: "#33272a",
  boundary: "#5a4a4c",
  label: "#e8d9d2",
  halo: "#231a18",
  route: "#ff9ec4",
  routeCasing: "#231a18",
};

export const PALETTES: Record<MapMode, Palette> = { light: LIGHT, dark: DARK };

const GREEN =
  /^(park|landcover_(wood|grass|wetland)|landuse_(pitch|track|cemetery))/;
const TINT = /^(landuse_|landcover_|aeroway_fill)/;
const MAJOR = /(motorway|trunk|primary|secondary|link)/;

/** Which colour a non-label layer takes, or null to leave it as it is. */
function paintFor(layer: LayerSpecification, p: Palette) {
  const id = layer.id;
  switch (layer.type) {
    case "background":
      return { "background-color": p.land };
    case "fill":
      if (id === "water") return { "fill-color": p.water };
      if (GREEN.test(id))
        return { "fill-color": p.green, "fill-outline-color": p.green };
      if (id === "building")
        return { "fill-color": p.building, "fill-outline-color": p.building };
      if (TINT.test(id)) return { "fill-color": p.landTint };
      return null;
    case "fill-extrusion":
      return { "fill-extrusion-color": p.building };
    case "line":
      if (id.startsWith("waterway")) return { "line-color": p.water };
      if (id === "park_outline") return { "line-color": p.green };
      if (id.startsWith("boundary")) return { "line-color": p.boundary };
      if (/rail/.test(id)) return { "line-color": p.rail };
      if (id.endsWith("_casing"))
        return {
          "line-color": MAJOR.test(id) ? p.casingMajor : p.casingMinor,
        };
      if (/^(road|tunnel|bridge|aeroway)_/.test(id))
        return { "line-color": p.road };
      return null;
    case "symbol":
      // Shields and arrows are icons with no text colour of their own: left alone.
      if (!layer.paint || !("text-color" in layer.paint)) return null;
      return { "text-color": p.label, "text-halo-color": p.halo };
    default:
      return null;
  }
}

/** The route: start, then each stop in order, as straight segments (the list's miles). */
export type RoutePoints = { lng: number; lat: number }[];

export const ROUTE_SOURCE = "birthday-route";

/**
 * The liberty style in the pastels for `mode`, with the shaded-relief raster hidden and the route
 * line added just under the first label layer, so street names stay readable on top of it.
 */
export function pastelStyle(
  style: StyleSpecification,
  mode: MapMode,
  route: RoutePoints,
): StyleSpecification {
  const p = PALETTES[mode];
  const layers: LayerSpecification[] = style.layers.map((layer) => {
    if (layer.type === "raster")
      return { ...layer, layout: { ...layer.layout, visibility: "none" } };
    const paint = paintFor(layer, p);
    return paint
      ? ({
          ...layer,
          paint: { ...layer.paint, ...paint },
        } as LayerSpecification)
      : layer;
  });
  const line: LayerSpecification[] = [
    {
      id: `${ROUTE_SOURCE}-casing`,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": p.routeCasing, "line-width": 7 },
    },
    {
      id: `${ROUTE_SOURCE}-line`,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": p.route, "line-width": 4 },
    },
  ];
  const firstLabel = layers.findIndex((l) => l.type === "symbol");
  const at = firstLabel === -1 ? layers.length : firstLabel;
  return {
    ...style,
    sources: {
      ...style.sources,
      [ROUTE_SOURCE]: {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: route.map((pt) => [pt.lng, pt.lat]),
          },
        },
      },
    },
    layers: [...layers.slice(0, at), ...line, ...layers.slice(at)],
  };
}
