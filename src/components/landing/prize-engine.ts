// The rules of "Catch the prizes" (decision 0016), kept apart from the drawing so they can be
// tested: a 30-second round, prizes fall faster and more often as it goes, a star is worth more.

export const ROUND_SECONDS = 30;
export const STAR_CHANCE = 0.1;
export const POINTS = { logo: 15, star: 50 } as const;
/** The runner's catch reach, in px either side of her centre. */
export const REACH = 32;

export type Prize = {
  /** Index into the logo list, or null for a star. */
  logo: number | null;
  x: number;
  y: number;
  vy: number;
  sway: number;
  rot: number;
  spin: number;
  /** x after the sway, where it's drawn and caught. */
  cx: number;
};

/** Seconds between prizes: 0.9 s at the start, 0.45 s at the end. */
export const spawnInterval = (elapsed: number) =>
  0.9 - (Math.min(elapsed, ROUND_SECONDS) / ROUND_SECONDS) * 0.45;

/** A new prize above the board. `rand` is Math.random in the game, fixed in tests. */
export function newPrize(
  rand: () => number,
  width: number,
  elapsed: number,
  logoCount: number,
): Prize {
  const star = logoCount === 0 || rand() < STAR_CHANCE;
  const x = 30 + rand() * Math.max(0, width - 60);
  return {
    logo: star ? null : Math.floor(rand() * logoCount),
    x,
    y: -30,
    vy: (45 + rand() * 30) * (1 + elapsed / ROUND_SECONDS) * (star ? 1.7 : 1),
    sway: rand() * Math.PI * 2,
    rot: 0,
    spin: (rand() - 0.5) * 1.2,
    cx: x,
  };
}

/** Moves a prize on by `dt` seconds. */
export function advance(p: Prize, dt: number) {
  p.y += p.vy * dt;
  p.sway += dt * 2;
  p.rot += p.spin * dt;
  p.cx = p.x + Math.sin(p.sway) * 12;
}

/** Whether the runner (feet at `groundY`, drawn at `scale`) catches it: at her body's height, in reach. */
export const isCaught = (
  p: Prize,
  runnerX: number,
  groundY: number,
  scale: number,
) =>
  p.y > groundY - 118 * scale &&
  p.y < groundY - 30 * scale &&
  Math.abs(p.cx - runnerX) < REACH;

export const pointsFor = (p: Prize) =>
  p.logo === null ? POINTS.star : POINTS.logo;
