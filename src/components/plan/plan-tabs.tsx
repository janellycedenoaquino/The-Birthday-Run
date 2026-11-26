"use client";

import { useEffect, useState, type ReactNode } from "react";
import { msg } from "@/lib/messages";

// S-106 on phones and narrow tablets (decision 0016): up to 860 px the two lists become tabs,
// "Plan" and "Groups (N)", so neither is a long scroll away. Wider, they sit side by side.
// Without JavaScript there are no tabs and both lists show, one under the other.
export function PlanTabs({
  groupCount,
  rewards,
  groups,
}: {
  groupCount: number;
  rewards: ReactNode;
  groups: ReactNode;
}) {
  const [tab, setTab] = useState<"rewards" | "groups">("rewards");
  // Tabs (and their roles) only where they show; no JavaScript means no tabs at all.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 860px)");
    const update = () => setReady(narrow.matches);
    update();
    narrow.addEventListener("change", update);
    return () => narrow.removeEventListener("change", update);
  }, []);
  const hidden = (t: typeof tab) =>
    ready && tab !== t ? "max-[860px]:hidden" : "";
  const button = (t: typeof tab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`plan-tab-${t}`}
      aria-controls={`plan-panel-${t}`}
      aria-selected={tab === t}
      tabIndex={tab === t ? 0 : -1}
      onClick={() => setTab(t)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const next = t === "rewards" ? "groups" : "rewards";
        setTab(next);
        document.getElementById(`plan-tab-${next}`)?.focus();
      }}
      className={`h-11 flex-1 rounded-xl px-3 font-extrabold text-[var(--navy)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-foreground ${tab === t ? "bg-[var(--bubblegum)] shadow-[inset_0_0_0_2px_var(--navy)] dark:text-[var(--navy)]" : ""}`}
    >
      {label}
    </button>
  );
  return (
    <div className="mt-8">
      {ready ? (
        <div
          role="tablist"
          aria-label="Plan"
          className="flex gap-1 rounded-2xl bg-white/80 p-1 shadow-[inset_0_0_0_1.5px_var(--border)] dark:bg-white/10"
        >
          {button("rewards", msg("M-307"))}
          {button(
            "groups",
            msg("M-308").replace("{count}", String(groupCount)),
          )}
        </div>
      ) : null}
      <div className="mt-6 grid grid-cols-1 gap-10 min-[861px]:mt-0 min-[861px]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] min-[861px]:items-start">
        {/* Fits the screen and scrolls on its own, so no reward is out of reach while the groups scroll. */}
        <div
          id="plan-panel-rewards"
          role={ready ? "tabpanel" : undefined}
          aria-labelledby={ready ? "plan-tab-rewards" : undefined}
          className={`min-[861px]:sticky min-[861px]:top-20 min-[861px]:-m-1 min-[861px]:max-h-[calc(100vh-6rem)] min-[861px]:overflow-y-auto min-[861px]:overscroll-contain min-[861px]:p-1 ${hidden("rewards")}`}
        >
          {rewards}
        </div>
        <div
          id="plan-panel-groups"
          role={ready ? "tabpanel" : undefined}
          aria-labelledby={ready ? "plan-tab-groups" : undefined}
          className={hidden("groups")}
        >
          {groups}
        </div>
      </div>
    </div>
  );
}
