"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { msg, type MessageId } from "@/lib/messages";

// C-3's "Check your email" panel (SPEC §3.2): replaces the form after M-1..M-3, takes focus, and
// offers "Try again" (the form back, email kept, a fresh C-4). The email stays in the page, never
// in a URL (D15).
export function EmailSentPanel({
  message,
  email,
  onTryAgain,
}: {
  message: Extract<MessageId, "M-1" | "M-2" | "M-3">;
  email: string;
  onTryAgain: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

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
