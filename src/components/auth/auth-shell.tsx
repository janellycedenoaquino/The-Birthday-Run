import Link from "next/link";
import type { ReactNode } from "react";
import { CardWall } from "@/components/motion/card-wall";
import {
  MotionStage,
  MovingGlow,
  PauseMotionButton,
} from "@/components/motion/motion";
import { msg } from "@/lib/messages";
import { cn } from "cn";
import { RewardTicker, type TickerRetailer } from "./reward-ticker";

// Sign in and sign up's look (decision 0016, Template S-4/S-5): the tilted card wall and flowing
// glow behind one frosted card. "Create account" / "Sign in" tabs at the top are links between the
// two routes that keep `next`, so every existing link and redirect still works. Then the rotating
// reward, the heading with its tilted block, and the page's own forms (unchanged).

export function AuthShell({
  mode,
  next,
  retailers,
  children,
}: {
  mode: "in" | "up";
  next?: string;
  retailers: TickerRetailer[];
  children: ReactNode;
}) {
  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  const tabs = [
    { mode: "up", href: `/sign-up${query}`, label: msg("M-290") },
    { mode: "in", href: `/sign-in${query}`, label: msg("M-290b") },
  ] as const;
  const [lead, block, sub] =
    mode === "up"
      ? (["M-291", "M-291b", "M-291c"] as const)
      : (["M-292", "M-292b", "M-292c"] as const);

  return (
    <MotionStage className="flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 pt-20 pb-10 sm:px-6">
      <MovingGlow />
      <CardWall retailers={retailers} />
      <PauseMotionButton className="absolute top-4 right-4 z-10 sm:top-5 sm:right-5" />
      <div className="frosted relative z-[5] w-full max-w-[430px] rounded-[28px] px-6 py-8 sm:px-8">
        <nav
          aria-label={msg("M-290c")}
          className="mb-5 flex gap-1 rounded-xl bg-white/60 p-1 shadow-[inset_0_0_0_1.5px_var(--border)] dark:bg-white/10"
        >
          {tabs.map((t) => (
            <Link
              key={t.mode}
              href={t.href}
              aria-current={t.mode === mode ? "page" : undefined}
              className={cn(
                "flex-1 rounded-[9px] px-2.5 py-2.5 text-center text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                t.mode === mode
                  ? "bg-white text-[var(--navy)] shadow-[0_0_0_1.5px_var(--navy)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <RewardTicker retailers={retailers} />
        <h1 className="headline text-[30px] leading-[1.1] tracking-[-0.03em]">
          {msg(lead)} <span className="headline-block">{msg(block)}</span>
        </h1>
        <p className="mt-2 mb-6 text-[15px] leading-snug text-muted-foreground">
          {msg(sub)}
        </p>
        {children}
      </div>
    </MotionStage>
  );
}
