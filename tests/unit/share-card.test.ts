import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fitInside, logoSize } from "@/lib/og/logo-size";
import { SHARE_BRANDS } from "@/lib/og/share-brands";

// The share card (src/app/opengraph-image.tsx, FR-24): its logos are sized exactly, because
// next/og crops an image it has to shrink; and it only shows brands that are live.

const png = (w: number, h: number) => {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const v = new DataView(b.buffer);
  v.setUint32(8, 13);
  v.setUint32(12, 0x49484452); // "IHDR"
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
};
const svg = (s: string) => new TextEncoder().encode(s);

describe("logoSize", () => {
  it("reads a PNG's width and height from its header", () => {
    expect(logoSize("a.png", png(512, 288))).toEqual([512, 288]);
  });

  it("reads an SVG's viewBox, not its width and height attributes", () => {
    // olive-garden.svg's case: width/height say 3:2, the drawing is 88.6 × 75.
    const s = `<svg width="1200" height="800" viewBox="-10.2 -12.5 88.6 75">`;
    expect(logoSize("a.svg", svg(s))).toEqual([88.6, 75]);
    expect(logoSize("b.svg", svg(`<svg viewBox='0,0,140,27'>`))).toEqual([
      140, 27,
    ]);
  });

  it("refuses files it can't size", () => {
    expect(() => logoSize("a.png", svg("not a png at all, really"))).toThrow();
    expect(() => logoSize("a.svg", svg(`<svg width="10">`))).toThrow();
    expect(() => logoSize("a.jpg", png(1, 1))).toThrow();
  });
});

describe("fitInside", () => {
  const box = { width: 130, height: 60 };
  it("keeps the proportions and touches the box on one side", () => {
    expect(fitInside([140, 27], box)).toEqual({ width: 130, height: 25 }); // wide: width-bound
    expect(fitInside([204, 204], box)).toEqual({ width: 60, height: 60 }); // square: height-bound
    expect(fitInside([10, 5], box)).toEqual({ width: 120, height: 60 }); // small logos grow
  });
});

describe("SHARE_BRANDS", () => {
  // Rows start with the id; descriptions can hold quoted commas, so match the logo as its own field.
  const csv = readFileSync("data/retailers.csv", "utf8").split("\n");
  const row = (id: string) => csv.find((line) => line.startsWith(`${id},`));

  it("has fourteen brands, each live with this logo file", () => {
    expect(SHARE_BRANDS).toHaveLength(14);
    for (const { id, logoFile } of SHARE_BRANDS)
      expect(row(id), id).toContain(`,${logoFile},`);
  });

  it("can size every logo", () => {
    for (const { logoFile } of SHARE_BRANDS) {
      const [w, h] = logoSize(
        logoFile,
        readFileSync(`public/retailers/${logoFile}`),
      );
      expect(w > 0 && h > 0, logoFile).toBe(true);
    }
  });
});
