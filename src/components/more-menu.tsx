"use client";

import { useEffect, useRef, type ReactNode } from "react";

// The "⋯" menu on History entries and Plan groups (decision 0016). A native <details>, so the
// items inside (dialog buttons, a no-JS Delete link, a Duplicate form) still work without
// JavaScript. With JavaScript it closes on Escape and on a click outside, but not on a click in a
// dialog opened from it, so focus can go back to the item that opened the dialog.
export function MoreMenu({
  label,
  children,
}: {
  /** The button's accessible name, e.g. "More for Birthday lunch". */
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = () => {
      if (ref.current) ref.current.open = false;
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!ref.current?.open || !target) return;
      if (ref.current.contains(target)) return;
      if (target.closest("[role=dialog],[role=alertdialog]")) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !ref.current?.open) return;
      if (!ref.current.contains(document.activeElement)) return;
      close();
      ref.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <details ref={ref} className="group relative shrink-0">
      <summary
        aria-label={label}
        className="grid size-10 cursor-pointer list-none place-items-center rounded-xl bg-white/80 text-lg font-extrabold text-[var(--navy)] shadow-[inset_0_0_0_1.5px_var(--border)] outline-none group-open:bg-white focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-white/10 dark:text-foreground dark:group-open:bg-white/20 [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true">⋯</span>
      </summary>
      <div className="absolute top-12 right-0 z-20 grid min-w-44 gap-1 rounded-xl bg-popover p-1.5 text-popover-foreground shadow-[0_0_0_1.5px_var(--border),0_8px_24px_rgb(0_0_0/12%)] [&_a]:w-full [&_a]:justify-start [&_button]:w-full [&_button]:justify-start">
        {children}
      </div>
    </details>
  );
}
