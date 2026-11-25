import Image from "next/image";
import type { ShowcaseRetailer } from "@/lib/retailers/showcase";

// The tilted wall of retailer cards behind sign in and sign up (decision 0016): 7 rows rotated
// -8°, sliding in alternating directions (44–58 s a loop), each card with its logo in its own
// colours and its reward. Hovering a card shows the name and reward with a green border and holds
// all motion (`.motion-hold`); the paused stage stops it too. Decoration (`aria-hidden`).

export type WallRetailer = ShowcaseRetailer;

const ROWS = 7;
const PER_ROW = 16;

export function CardWall({ retailers }: { retailers: WallRetailer[] }) {
  if (!retailers.length) return null;
  const rows = Array.from({ length: ROWS }, (_, i) =>
    Array.from(
      { length: PER_ROW },
      (_, j) => retailers[(i * PER_ROW + j * 7 + i) % retailers.length],
    ),
  );
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute -inset-[30%] flex -rotate-[8deg] flex-col justify-center gap-[18px]">
        {rows.map((row, i) => (
          <div
            key={i}
            className="motion wall-row flex w-max gap-[18px]"
            style={
              {
                "--duration": `${44 + i * 2.3}s`,
                animationDirection: i % 2 ? "reverse" : "normal",
              } as React.CSSProperties
            }
          >
            {/* Two copies, so the row loops without a gap (it slides by half its width). */}
            {[...row, ...row].map((r, j) => (
              <div
                key={`${r.id}-${j}`}
                className="motion-hold group pointer-events-auto relative flex h-24 w-[150px] flex-none flex-col items-center justify-center gap-1.5 rounded-2xl bg-white px-3 py-2.5 shadow-[0_0_0_1.5px_color-mix(in_srgb,var(--navy)_18%,transparent)] transition-shadow hover:z-10 hover:shadow-[0_0_0_4px_var(--spring),0_18px_34px_-14px_rgb(0_0_0/30%)]"
              >
                <Image
                  src={`/retailers/${r.logoFile}`}
                  alt=""
                  width={126}
                  height={48}
                  className="max-h-12 w-auto object-contain"
                />
                <span className="max-w-full truncate text-[11px] font-bold text-[#4c557d]">
                  {r.reward}
                </span>
                <span className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 w-max max-w-60 -translate-x-1/2 rounded-[10px] bg-white px-3 py-2 text-left text-[13px] leading-snug text-[var(--navy)] opacity-0 shadow-[0_0_0_2px_var(--spring),0_10px_24px_-10px_rgb(0_0_0/25%)] transition-opacity group-hover:opacity-100">
                  <b className="block font-extrabold">{r.name}</b>
                  {r.reward}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
