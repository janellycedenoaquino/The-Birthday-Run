"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import type { StartLocation } from "@/lib/validation/route";
import { useStartLocation } from "./start-location";
import { errorText, StartLocationForm } from "./start-location-form";

type LookupZip = (
  input: unknown,
) => Promise<ActionResult<{ state: string | null }>>;

// S-103's state filter (SPEC §3.3: FR-5, premium). Needs C-105 first. Setting a start here applies
// the filter; a start set earlier (on My Rewards) is applied only when the user presses M-172b, so
// "Show all" never snaps back and nothing happens on page load (FR-5: never auto-detects).
export function StateFilter({ lookupZip }: { lookupZip: LookupZip }) {
  const { start } = useStartLocation();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Set when the user starts setting a location inside this filter.
  const armed = useRef(false);
  const startedWith = useRef(start);

  const apply = (s: StartLocation) =>
    startTransition(async () => {
      setError(null);
      let r: ActionResult<{ state: string | null }>;
      try {
        r = await lookupZip({ start: s });
      } catch {
        r = { ok: false, error: "M-7" };
      }
      if (!r.ok) return setError(r.fieldErrors?.zip?.[0] ?? errorText(r.error));
      const state = r.data?.state;
      if (!state) return setError(msg("M-7"));
      const next = new URLSearchParams(params.toString());
      next.set("state", state);
      router.push(`/discover?${next.toString()}`, { scroll: false });
    });

  useEffect(() => {
    // Only a start the user set here, after the page loaded.
    if (start && start !== startedWith.current && armed.current) {
      armed.current = false;
      apply(start);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the start changes
  }, [start]);

  return (
    <div
      className="grid gap-3"
      onPointerDownCapture={() => (armed.current = true)}
      onKeyDownCapture={() => (armed.current = true)}
    >
      <StartLocationForm lookupZip={lookupZip} />
      {start ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => apply(start)}
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
