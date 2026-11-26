import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { PALETTES, pastelStyle, ROUTE_SOURCE } from "@/lib/map/pastel-style";

// A slice of OpenFreeMap's liberty style: one layer of each kind the recolour handles.
const layer = (
  id: string,
  type: string,
  paint: Record<string, unknown> = {},
): LayerSpecification =>
  ({ id, type, source: "openmaptiles", paint }) as LayerSpecification;
const liberty: StyleSpecification = {
  version: 8,
  sources: { openmaptiles: { type: "vector", url: "https://x.test/tiles" } },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#f8f4f0" },
    },
    { id: "natural_earth", type: "raster", source: "ne" } as LayerSpecification,
    layer("park", "fill", { "fill-color": "#d8e8c8", "fill-opacity": 0.7 }),
    layer("landuse_residential", "fill", {
      "fill-color": "hsla(0,3%,85%,0.84)",
    }),
    layer("water", "fill", { "fill-color": "rgb(158,189,255)" }),
    layer("waterway_river", "line", { "line-color": "#a0c8f0" }),
    layer("road_trunk_primary_casing", "line", { "line-color": "#e9ac77" }),
    layer("road_minor_casing", "line", { "line-color": "#cfcdca" }),
    layer("road_trunk_primary", "line", { "line-color": "#fea" }),
    layer("road_major_rail", "line", { "line-color": "#bbb" }),
    layer("building", "fill", { "fill-color": "hsl(35,8%,85%)" }),
    layer("label_city", "symbol", {
      "text-color": "#000",
      "text-halo-color": "#fff",
    }),
    layer("road_shield_us", "symbol"),
  ],
};
const route = [
  { lng: -74.03, lat: 40.74 },
  { lng: -74.02, lat: 40.75 },
];
const color = (s: StyleSpecification, id: string, key: string) =>
  (s.layers.find((l) => l.id === id) as { paint: Record<string, unknown> })
    .paint[key];

describe("pastelStyle (decision 0016 map look)", () => {
  it.each(["light", "dark"] as const)(
    "%s: every layer takes the palette",
    (mode) => {
      const p = PALETTES[mode];
      const s = pastelStyle(liberty, mode, route);
      expect(color(s, "background", "background-color")).toBe(p.land);
      expect(color(s, "park", "fill-color")).toBe(p.green);
      expect(color(s, "park", "fill-opacity")).toBe(0.7); // other paint kept
      expect(color(s, "landuse_residential", "fill-color")).toBe(p.landTint);
      expect(color(s, "water", "fill-color")).toBe(p.water);
      expect(color(s, "waterway_river", "line-color")).toBe(p.water);
      expect(color(s, "road_trunk_primary_casing", "line-color")).toBe(
        p.casingMajor,
      );
      expect(color(s, "road_minor_casing", "line-color")).toBe(p.casingMinor);
      expect(color(s, "road_trunk_primary", "line-color")).toBe(p.road);
      expect(color(s, "road_major_rail", "line-color")).toBe(p.rail);
      expect(color(s, "building", "fill-color")).toBe(p.building);
      expect(color(s, "label_city", "text-color")).toBe(p.label);
      expect(color(s, "label_city", "text-halo-color")).toBe(p.halo);
    },
  );

  it("light mode: cream land, white roads with pink edges", () => {
    const s = pastelStyle(liberty, "light", route);
    expect(color(s, "background", "background-color")).toBe("#fffcf7");
    expect(color(s, "road_trunk_primary", "line-color")).toBe("#ffffff");
  });

  it("hides the relief raster and leaves icon-only symbols alone", () => {
    const s = pastelStyle(liberty, "light", route);
    const ne = s.layers.find((l) => l.id === "natural_earth")!;
    expect(ne.layout).toMatchObject({ visibility: "none" });
    expect(s.layers.find((l) => l.id === "road_shield_us")).toEqual(
      liberty.layers.find((l) => l.id === "road_shield_us"),
    );
  });

  it("draws the route through every point, under the first label", () => {
    const s = pastelStyle(liberty, "light", route);
    expect(s.sources[ROUTE_SOURCE]).toMatchObject({
      type: "geojson",
      data: {
        geometry: {
          type: "LineString",
          coordinates: [
            [-74.03, 40.74],
            [-74.02, 40.75],
          ],
        },
      },
    });
    const ids = s.layers.map((l) => l.id);
    expect(ids.indexOf(`${ROUTE_SOURCE}-line`)).toBe(
      ids.indexOf("label_city") - 1,
    );
    expect(ids.indexOf(`${ROUTE_SOURCE}-casing`)).toBe(
      ids.indexOf("label_city") - 2,
    );
  });

  it("doesn't change the style it was given", () => {
    const before = structuredClone(liberty);
    pastelStyle(liberty, "dark", route);
    expect(liberty).toEqual(before);
  });
});
