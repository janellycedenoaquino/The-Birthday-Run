"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { confettiBurst } from "@/components/motion/confetti";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/messages";

// S-101's finish card (decision 0016 prototype; owner, 2026-11-25): "You're all set!", how many
// programs were saved and the birthday they count down to, one confetti burst (not with reduced
// motion), then on to My Rewards (decision 0018). The heading takes focus so screen readers hear it.
export function OnboardingDone({
  count,
  date,
}: {
  count: number;
  /** The next birthday, already formatted by the timing module (NFR-5). */
  date: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      confettiBurst();
  }, []);
  const lead =
    count === 0
      ? msg("M-301h")
      : (count === 1 ? msg("M-301g") : msg("M-301f"))
          .replace("{count}", String(count))
          .replace("{date}", date);
  return (
    <div className="py-6 text-center">
      <h1
        ref={heading}
        tabIndex={-1}
        className="headline text-[34px] leading-[1.1] outline-none sm:text-[40px]"
      >
        {msg("M-301d")} <span className="headline-block">{msg("M-301e")}</span>
      </h1>
      <p className="mx-auto mt-3 max-w-md text-muted-foreground">{lead}</p>
      <Button asChild size="lg" className="mt-7 h-12 px-6 text-base">
        <Link href="/rewards">{msg("M-301i")}</Link>
      </Button>
    </div>
  );
}
