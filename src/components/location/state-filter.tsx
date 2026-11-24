"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { inState } from "@/lib/retailers/filter";
import type { StartLocation } from "@/lib/validation/route";
import { useStartLocation } from "./start-location";
import { errorText, StartLocationForm } from "./start-location-form";

// S-103's state filter (SPEC §3.3: FR-5, premium; decision 0014). It runs in the browser: the
// state is kept in memory with the start and never goes to the server or into a URL (NFR-3).
// The page renders every card; StateScoped hides the ones the state rules out.

type LookupZip = (
  input: unknown,
) => Promise<ActionResult<{ state: string | null }>>;
export type StateRow = {
  id: string;
  states_scope: string;
  state_codes: string[];
};

const hiddenCount = (rows: StateRow[], state: string | null) =>
  state ? rows.filter((r) => !inState(r, state)).length : 0;

/**
 * C-105, then the filter. Setting a start here turns it on (one lookupZip for a ZIP, from C-105's
 * own check). A start set earlier turns it on only with M-172b, so nothing happens on page load
 * (FR-5) and "Show all" stays off.
 */
export function StateFilter({
  lookupZip,
  rows,
}: {
  lookupZip: LookupZip;
  rows: StateRow[];
}) {
  const { start, state, setState } = useStartLocation();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const applyState = (found: string | null | undefined) => {
    // FR-30: a start with no US state (abroad, or no ZIP data) → the plain message and ZIP.
    if (!found) return setError(msg("M-154"));
    setError(null);
    setState(found);
  };
  const lookup = (s: StartLocation) =>
    startTransition(async () => {
      try {
        const r = await lookupZip({ start: s });
        if (r.ok) return applyState(r.data?.state);
        setError(r.fieldErrors?.zip?.[0] ?? errorText(r.error));
      } catch {
        setError(msg("M-7"));
      }
    });

  if (state)
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span>
          {msg("M-172")
            .replace("{state}", state)
            .replace("{hidden}", String(hiddenCount(rows, state)))}
        </span>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={() => setState(null)}
        >
          {msg("M-173")}
        </Button>
      </p>
    );
  return (
    <div className="grid gap-3">
      <StartLocationForm
        lookupZip={lookupZip}
        onSet={(s, found) => (s.kind === "zip" ? applyState(found) : lookup(s))}
      />
      {start ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => lookup(start)}
          >
            {msg("M-172b")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** One card, hidden while the state filter rules it out. */
export function StateScoped({
  row,
  children,
}: {
  row: StateRow;
  children: ReactNode;
}) {
  const { state } = useStateFilter();
  return state && !inState(row, state) ? null : children;
}

/** M-178's count with the state filter applied, and M-179 when it hides everything. */
export function StateCount({
  rows,
  total,
}: {
  rows: StateRow[];
  total: number;
}) {
  const { state } = useStateFilter();
  const shown = rows.length - hiddenCount(rows, state);
  return (
    <>
      <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
        {msg("M-178")
          .replace("{shown}", String(shown))
          .replace("{total}", String(total))}
      </p>
      {state && rows.length > 0 && shown === 0 ? (
        <p className="mt-6 rounded-lg border border-border/70 p-6">
          {msg("M-179")}
        </p>
      ) : null}
    </>
  );
}

const useStateFilter = () => ({ state: useStartLocation().state });
