"use client";

import { Pause, Play } from "lucide-react";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { msg } from "@/lib/messages";
import { cn } from "cn";

// Motion that starts by itself (decision 0016, WCAG 2.2.2 Pause, Stop, Hide): one paused flag for
// a page's moving layers. It starts paused when the device asks for reduced motion. The stage
// carries `data-paused`, and globals.css stops every `.motion` animation inside a paused stage,
// or while a pointer rests on a `.motion-hold` element (hover a logo to read it).

type Motion = { paused: boolean; setPaused: (paused: boolean) => void };
const MotionContext = createContext<Motion>({
  paused: true,
  setPaused: () => {},
});

export const useMotion = () => useContext(MotionContext);

const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribeReduce = (onChange: () => void) => {
  const query = window.matchMedia(REDUCE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

export function MotionStage({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  // Until the person presses the control, the device decides. The server render counts as
  // "reduce", so a reduced-motion device never sees a frame of motion.
  const reduce = useSyncExternalStore(
    subscribeReduce,
    () => window.matchMedia(REDUCE).matches,
    () => true,
  );
  const [choice, setPaused] = useState<boolean | null>(null);
  const paused = choice ?? reduce;
  return (
    <MotionContext value={{ paused, setPaused }}>
      <div
        data-paused={paused}
        className={cn("motion-stage relative isolate", className)}
      >
        {children}
      </div>
    </MotionContext>
  );
}

/** The visible "Pause motion" / "Play motion" control. */
export function PauseMotionButton({ className }: { className?: string }) {
  const { paused, setPaused } = useMotion();
  const Icon = paused ? Play : Pause;
  return (
    <button
      type="button"
      aria-pressed={paused}
      onClick={() => setPaused(!paused)}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl bg-background/90 px-3.5 py-2.5 text-sm font-semibold text-foreground shadow-[0_0_0_1.5px_color-mix(in_srgb,var(--foreground)_25%,transparent)] outline-none focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-foreground",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" fill="currentColor" />
      {msg(paused ? "M-285b" : "M-285")}
    </button>
  );
}

/** The flowing pastel glow (decision 0016: loops of about 44, 52 and 60 s). Decoration only. */
export function MovingGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="motion glow-blob glow-blob-pink" />
      <div className="motion glow-blob glow-blob-blue" />
      <div className="motion glow-blob glow-blob-mint" />
    </div>
  );
}
