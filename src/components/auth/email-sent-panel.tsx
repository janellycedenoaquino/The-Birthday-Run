"use client";

import { useEffect, useRef } from "react";
import { confettiBurst } from "@/components/motion/confetti";
import { useMotion } from "@/components/motion/motion";
import { Button } from "@/components/ui/button";
import { msg, type MessageId } from "@/lib/messages";

// C-3's "Check your email" panel (SPEC §3.2): replaces the form after M-1..M-3, takes focus, and
// offers "Try again" (the form back, email kept, a fresh C-4). The email stays in the page, never
// in a URL (D15). `celebrate` (sign up, decision 0016): one confetti burst, skipped when motion is
// paused or reduced (outside a motion stage it counts as paused).
export function EmailSentPanel({
  message,
  email,
  onTryAgain,
  celebrate = false,
}: {
  message: Extract<MessageId, "M-1" | "M-2" | "M-3">;
  email: string;
  onTryAgain: () => void;
  celebrate?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { paused } = useMotion();
  const pausedOnShow = useRef(paused);
  useEffect(() => {
    heading.current?.focus();
    // Reduced motion is checked on its own too: "Play motion" on such a device isn't a yes to confetti.
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (celebrate && !pausedOnShow.current && !reduced) confettiBurst();
  }, [celebrate]);

  return (
    <div className="grid gap-4" aria-live="polite">
      <h2
        ref={heading}
        tabIndex={-1}
        className="text-xl font-semibold outline-none"
      >
        Check your email
      </h2>
      <p>{msg(message).replace("{email}", email)}</p>
      <p className="text-sm text-muted-foreground">{msg("M-8")}</p>
      <div>
        <Button type="button" variant="outline" size="lg" onClick={onTryAgain}>
          Try again
        </Button>
      </div>
    </div>
  );
}
