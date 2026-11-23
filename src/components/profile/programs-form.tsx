"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { FormAlert, formError } from "@/components/auth/form-alert";
import type { CardRetailer } from "@/components/retailers/retailer-card";
import { RetailerLogo } from "@/components/retailers/retailer-logo";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { filterRetailers, type FilterRow } from "@/lib/retailers/filter";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/retailers/labels";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;
type Row = CardRetailer & FilterRow;

const noSubscribe = () => () => {};

// S-101 step 2 (SPEC §3.3, F-2/F-3): every listed program as a checkbox, saved together. Search
// and category tabs filter in the browser (F-3's filterRetailers); hidden rows stay in the form,
// so a ticked program is still sent. Without JS the whole list shows and the buttons just work.
export function ProgramsForm({
  saveOnboarding,
  retailers,
  enrolledIds,
}: {
  saveOnboarding: Action;
  retailers: Row[];
  enrolledIds: string[];
}) {
  const [state, action, pending] = useActionState(saveOnboarding, null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  // Programs joined already (e.g. from Discover) show ticked and locked: this step only adds,
  // so an untick here couldn't be saved. Leaving a program is Discover's toggle (FR-8).
  const joined = new Set(enrolledIds);
  const [selected, setSelected] = useState(() => new Set<string>());
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const visible = new Set(
    filterRetailers(retailers, { q, category }, {}).shown.map((r) => r.id),
  );
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const count = selected.size;

  return (
    <>
      <form id="programs-skip" action={action} hidden>
        <input type="hidden" name="step" value="programs" />
      </form>
      <form action={action} className="grid gap-4">
        <input type="hidden" name="step" value="programs" />
        <label htmlFor="programs-q" className="sr-only">
          Search programs
        </label>
        <input
          id="programs-q"
          type="search"
          placeholder="Search programs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          // Enter would submit the form's first button ("Save"): it only filters here.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          hidden={!hydrated}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
        />
        {hydrated ? (
          <div
            role="group"
            aria-label="Categories"
            className="flex flex-wrap gap-2 text-sm"
          >
            {[undefined, ...CATEGORIES].map((c) => (
              <button
                key={c ?? "all"}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={`h-9 rounded-full border px-3 ${category === c ? "border-primary bg-primary text-primary-foreground" : "border-border/70"}`}
              >
                {c ? CATEGORY_LABELS[c] : "All"}
              </button>
            ))}
          </div>
        ) : null}
        <ul className="grid max-h-[28rem] gap-2 overflow-y-auto rounded-lg border border-border/70 p-2">
          {retailers.map((r) => (
            <li key={r.id} hidden={hydrated && !visible.has(r.id)}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted">
                <input
                  type="checkbox"
                  name="retailerIds"
                  value={r.id}
                  checked={joined.has(r.id) || selected.has(r.id)}
                  disabled={joined.has(r.id)}
                  onChange={(e) => toggle(r.id, e.target.checked)}
                  className="size-5 shrink-0"
                />
                <RetailerLogo name={r.name} logoFile={r.logo_file} size={36} />
                <span className="min-w-0">
                  <span className="block font-medium">{r.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {r.reward_description}
                  </span>
                </span>
              </label>
            </li>
          ))}
          {hydrated && visible.size === 0 ? (
            <li className="p-2 text-sm text-muted-foreground">
              {msg("M-171")}
            </li>
          ) : null}
        </ul>
        <FormAlert id={formError(state)} />
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            size="lg"
            // Only disabled once JS runs, so a no-JS form can always be sent.
            disabled={pending || (hydrated && count === 0)}
          >
            {pending
              ? "Saving…"
              : !hydrated
                ? "Save programs"
                : count === 0
                  ? msg("M-111b")
                  : count === 1
                    ? "Save 1 program"
                    : msg("M-110").replace("{count}", String(count))}
          </Button>
          <Button
            type="submit"
            size="lg"
            variant="ghost"
            disabled={pending}
            // Its own form (below): "Skip" sends no programs, whatever is ticked.
            form="programs-skip"
          >
            {msg("M-111c")}
          </Button>
        </div>
      </form>
    </>
  );
}
