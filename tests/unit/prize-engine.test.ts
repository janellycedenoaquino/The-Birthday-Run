import { describe, expect, it } from "vitest";
import {
  advance,
  isCaught,
  newPrize,
  POINTS,
  pointsFor,
  REACH,
  ROUND_SECONDS,
  spawnInterval,
} from "@/components/landing/prize-engine";

// The landing game's rules (decision 0016): 30-second round, faster prizes later, stars worth more.
const fixed = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("Catch the prizes rules", () => {
  it("spawns every 0.9 s at the start and 0.45 s at the end, never faster", () => {
    expect(spawnInterval(0)).toBeCloseTo(0.9);
    expect(spawnInterval(ROUND_SECONDS)).toBeCloseTo(0.45);
    expect(spawnInterval(ROUND_SECONDS * 2)).toBeCloseTo(0.45);
  });

  it("a roll under 10% makes a star; otherwise a logo from the list", () => {
    const star = newPrize(fixed(0.05, 0.5), 400, 0, 10);
    expect(star.logo).toBeNull();
    const logo = newPrize(fixed(0.5, 0.5, 0.35), 400, 0, 10);
    expect(logo.logo).toBe(3);
  });

  it("with no logos every prize is a star", () => {
    expect(newPrize(fixed(0.9), 400, 0, 0).logo).toBeNull();
  });

  it("stays inside the board's 30 px margins", () => {
    expect(newPrize(fixed(0.5, 0), 400, 0, 5).x).toBe(30);
    expect(newPrize(fixed(0.5, 0.999999), 400, 0, 5).x).toBeCloseTo(370);
  });

  it("falls faster later in the round, and stars 1.7× faster", () => {
    const early = newPrize(fixed(0.5, 0.5, 0.5, 0), 400, 0, 5);
    const late = newPrize(fixed(0.5, 0.5, 0.5, 0), 400, ROUND_SECONDS, 5);
    expect(late.vy).toBeCloseTo(early.vy * 2);
    const star = newPrize(fixed(0.05, 0.5, 0), 400, 0, 5);
    expect(star.vy).toBeCloseTo(45 * 1.7);
  });

  it("is caught only at the runner's body height and within reach", () => {
    const p = newPrize(fixed(0.5, 0.5, 0.5, 0), 400, 0, 5);
    const ground = 184;
    const scale = 0.62;
    p.cx = 200;
    p.y = ground - 60 * scale;
    expect(isCaught(p, 200 + REACH - 1, ground, scale)).toBe(true);
    expect(isCaught(p, 200 + REACH, ground, scale)).toBe(false);
    p.y = ground - 10 * scale; // at her feet: already past
    expect(isCaught(p, 200, ground, scale)).toBe(false);
    p.y = ground - 130 * scale; // above her hat
    expect(isCaught(p, 200, ground, scale)).toBe(false);
  });

  it("moves down by vy × dt and scores 15 a logo, 50 a star", () => {
    const p = newPrize(fixed(0.5, 0.5, 0.5, 0), 400, 0, 5);
    const y = p.y;
    advance(p, 0.5);
    expect(p.y).toBeCloseTo(y + p.vy * 0.5);
    expect(pointsFor(p)).toBe(POINTS.logo);
    expect(pointsFor({ ...p, logo: null })).toBe(POINTS.star);
  });
});
