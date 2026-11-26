"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useMotion } from "@/components/motion/motion";
import { msg } from "@/lib/messages";
import type { ShowcaseRetailer } from "@/lib/retailers/showcase";

// "What you get" on sign in and sign up (decision 0016, the owner's rule: signing up or in reminds
// people what's waiting): one reward at a time, changing every 2.6 s, stopping while motion is
// paused. Decoration (`aria-hidden`), so screen readers aren't interrupted every 2.6 s.

export type TickerRetailer = ShowcaseRetailer;
const EVERY_MS = 2600;

export function RewardTicker({ retailers }: { retailers: TickerRetailer[] }) {
  const { paused } = useMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (paused || retailers.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % retailers.length),
      EVERY_MS,
    );
    return () => window.clearInterval(timer);
  }, [paused, retailers.length]);

  // Modulo: the list can change length on a refresh while the index stays.
  const r = retailers.length ? retailers[index % retailers.length] : undefined;
  if (!r) return null;
  // The next logo loads while this one shows, so the swap never shows an empty box.
  const next = retailers[(index + 1) % retailers.length];
  return (
    <div
      aria-hidden="true"
      className="mb-[18px] border-b-[1.5px] border-border pb-4"
    >
      <div className="flex items-center gap-3.5 overflow-hidden rounded-2xl bg-white px-3.5 py-3 text-[var(--navy)] shadow-[0_0_0_1.5px_color-mix(in_srgb,var(--navy)_18%,transparent)]">
        <Image
          src={`/retailers/${r.logoFile}`}
          alt=""
          width={64}
          height={40}
          className="h-10 w-16 flex-none object-contain"
        />
        {next.id !== r.id && (
          <Image
            src={`/retailers/${next.logoFile}`}
            alt=""
            width={64}
            height={40}
            loading="eager"
            className="hidden"
          />
        )}
        <div
          key={r.id}
          className="min-w-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
        >
          <small className="block text-[11px] font-bold tracking-widest text-[#4c557d] uppercase">
            {msg("M-293")}
          </small>
          <strong className="block truncate text-base font-extrabold">
            {r.reward}
          </strong>
          <span className="text-[13px] text-[#4c557d]">{r.name}</span>
        </div>
      </div>
    </div>
  );
}
