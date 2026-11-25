"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { msg } from "@/lib/messages";

const SEEN = "tbr-scroll-hint-seen";

// The brand pop-up's "more below" hint (owner, 2026-11-25): some people don't notice the sheet
// scrolls. Shown in the first pop-up only (remembered on this device; not personal data), only
// when there is more to scroll, and gone at the first scroll or after a few seconds. Sticky at
// the sheet's bottom edge; decoration for sighted users (the content itself is all reachable).
export function ScrollHint() {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const scroller = ref.current?.parentElement;
    if (!scroller) return;
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN) === "1";
      if (!seen) localStorage.setItem(SEEN, "1");
    } catch {
      // Storage blocked: skip the hint rather than show it every time.
    }
    if (seen || scroller.scrollHeight <= scroller.clientHeight + 40) return;
    // Shown after the sheet has opened (not during render), then hidden on scroll or timeout.
    const start = window.setTimeout(() => setShow(true), 0);
    const hide = () => setShow(false);
    const timer = window.setTimeout(hide, 4500);
    scroller.addEventListener("scroll", hide, { once: true });
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timer);
      scroller.removeEventListener("scroll", hide);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none sticky bottom-0 flex justify-center pt-6 transition-opacity duration-300 ${show ? "opacity-100" : "opacity-0"}`}
    >
      <span className="scroll-hint inline-flex items-center gap-1 rounded-full bg-[var(--navy)] px-3 py-1.5 text-xs font-bold text-white shadow-lg">
        {msg("M-298y")}
        <ChevronDown className="size-3.5" />
      </span>
    </div>
  );
}
