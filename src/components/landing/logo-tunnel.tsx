import Image from "next/image";

// The landing tunnel (decision 0016): live retailers' logo cards, in their own colours, flying
// toward the viewer. Decoration (`aria-hidden`): every retailer is reachable in Discover. Hovering
// a card shows its name and reward with a spring-green border and holds all motion (`.motion-hold`);
// the paused stage stops it too (components/motion/motion.tsx).

export type TunnelRetailer = {
  id: string;
  name: string;
  logoFile: string;
  reward: string;
};

export function LogoTunnel({ retailers }: { retailers: TunnelRetailer[] }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden [perspective:700px]"
    >
      {retailers.map((r, i) => {
        // Golden-angle spread on an ellipse, so no two cards fly the same line.
        const angle = (i * 137.5 * Math.PI) / 180;
        const radius = 430 + ((i * 53) % 160);
        return (
          <div
            key={r.id}
            className="tunnel-tile motion motion-hold group flex h-24 w-[150px] items-center justify-center rounded-2xl bg-white px-3.5 py-3 shadow-[0_0_0_1.5px_color-mix(in_srgb,var(--navy)_18%,transparent)] transition-shadow hover:z-10 hover:shadow-[0_0_0_4px_var(--spring),0_18px_34px_-14px_rgb(0_0_0/30%)]"
            style={
              {
                "--x": `${Math.round(Math.cos(angle) * radius)}px`,
                "--y": `${Math.round(Math.sin(angle) * radius * 0.72)}px`,
                "--delay": `${((-14 * i) / retailers.length).toFixed(2)}s`,
              } as React.CSSProperties
            }
          >
            <Image
              src={`/retailers/${r.logoFile}`}
              alt=""
              width={122}
              height={56}
              className="max-h-14 w-auto object-contain"
            />
            <span className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 w-max max-w-60 -translate-x-1/2 rounded-[10px] bg-white px-3 py-2 text-left text-[13px] leading-snug text-[var(--navy)] opacity-0 shadow-[0_0_0_2px_var(--spring),0_10px_24px_-10px_rgb(0_0_0/25%)] transition-opacity group-hover:opacity-100">
              <b className="block font-extrabold">{r.name}</b>
              {r.reward}
            </span>
          </div>
        );
      })}
    </div>
  );
}
