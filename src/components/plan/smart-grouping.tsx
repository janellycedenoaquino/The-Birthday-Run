"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { useStartLocation } from "@/components/location/start-location";
import {
  errorText,
  StartLocationForm,
} from "@/components/location/start-location-form";
import { messageText } from "@/components/plan/result-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import { formatDate, type LocalDate } from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import type { SuggestResult } from "@/lib/route/result";

type Action<I, T> = (input: I) => Promise<ActionResult<T>>;
type Pickup = { date: string; time: string };
type Props = {
  range: { min: string; max: string };
  suggestGroups: Action<unknown, SuggestResult>;
  applySuggestions: Action<unknown, { groupIds: string[] }>;
  lookupZip: Action<unknown, { state: string | null }>;
};

// S-106 Smart Grouping (SPEC §3.3: FR-29, premium). The button opens a dialog: C-105 first, then
// the suggested groups (stops listed in order), each with its own pickup date and time, the
// left-out list (M-231), and "Apply all" (M-232) or "Cancel". Nothing is saved until Apply all.
export function SmartGrouping({
  range,
  suggestGroups,
  applySuggestions,
  lookupZip,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="lg" onClick={() => setOpen(true)}>
        {msg("M-229")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{msg("M-135")}</DialogTitle>
            <DialogDescription>
              Groups of nearby stores. Change a date or time, then apply all.
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <Suggestions
              range={range}
              suggestGroups={suggestGroups}
              applySuggestions={applySuggestions}
              lookupZip={lookupZip}
              onDone={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Suggestions({
  range,
  suggestGroups,
  applySuggestions,
  lookupZip,
  onDone,
}: Props & { onDone: () => void }) {
  const { start } = useStartLocation();
  const [saved, setSaved] = useState<{
    key: string;
    result: ActionResult<SuggestResult>;
  } | null>(null);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [loading, startLoading] = useTransition();
  const [applying, startApplying] = useTransition();
  const [applyError, setApplyError] = useState<string | null>(null);
  const id = useId();
  const key = start ? JSON.stringify(start) : null;

  useEffect(() => {
    if (!start || !key) return;
    startLoading(async () => {
      let r: ActionResult<SuggestResult>;
      try {
        r = await suggestGroups({ start });
      } catch {
        r = { ok: false, error: "M-7" };
      }
      if (r.ok && r.data?.offered)
        setPickups(
          r.data.groups.map((g) => ({
            date: g.pickupDate,
            time: g.pickupTime,
          })),
        );
      setSaved({ key, result: r });
    });
    // `suggestGroups` is a stable server action; the key holds the start.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when the start changes
  }, [key]);

  if (!start) return <StartLocationForm lookupZip={lookupZip} />;
  const result = saved?.key === key ? saved.result : null;
  if (loading || !result)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {msg("M-169")}
      </p>
    );
  if (!result.ok)
    return (
      <p role="alert" className="text-sm text-destructive">
        {result.fieldErrors?.zip?.[0] ?? errorText(result.error)}
      </p>
    );
  const data = result.data!;
  if (!data.offered)
    return (
      <div className="grid gap-2">
        {result.message ? (
          <p role="status">{errorText(result.message)}</p>
        ) : null}
        <p>{msg("M-230").replace("{needed}", String(data.needed))}</p>
      </div>
    );

  const apply = () =>
    startApplying(async () => {
      setApplyError(null);
      // A cleared date or time: say which range is allowed (BR-8b), before asking the server.
      if (pickups.some((p) => !p.date || !p.time))
        return setApplyError(
          msg("BR-8b")
            .replace("{start}", formatDate(range.min as LocalDate, "short"))
            .replace("{end}", formatDate(range.max as LocalDate, "short")),
        );
      let r: ActionResult<{ groupIds: string[] }>;
      try {
        r = await applySuggestions({
          groups: data.groups.map((g, i) => ({
            retailerIds: g.retailerIds,
            pickupDate: pickups[i]!.date,
            pickupTime: pickups[i]!.time,
          })),
        });
      } catch {
        r = { ok: false, error: "M-7" };
      }
      if (r.ok) {
        // M-227: some rewards end before their pickup. The groups show on the page (revalidated).
        if (r.message) toast.warning(messageText(r.message));
        return onDone();
      }
      const field = Object.values(r.fieldErrors ?? {})[0]?.[0];
      setApplyError(field ?? errorText(r.error));
    });

  return (
    <div className="grid gap-5">
      {data.groups.map((g, i) => (
        <section
          key={g.retailerIds.join()}
          aria-labelledby={`${id}-g${i}`}
          className="grid gap-3 rounded-lg border border-border/70 p-4"
        >
          <h3 id={`${id}-g${i}`} className="font-semibold">
            {msg("M-215").replace("{n}", String(i + 1))}
          </h3>
          <ol className="grid gap-1 text-sm">
            {g.stops.map((s) => (
              <li key={s.retailerId}>
                {s.n}. {s.retailerName}
                <span className="text-muted-foreground"> · {s.storeName}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-3">
            <div className="grid gap-1">
              <Label htmlFor={`${id}-d${i}`}>Pickup date</Label>
              <Input
                id={`${id}-d${i}`}
                type="date"
                min={range.min}
                max={range.max}
                value={pickups[i]?.date ?? ""}
                onChange={(e) =>
                  setPickups((p) =>
                    p.map((x, k) =>
                      k === i ? { ...x, date: e.target.value } : x,
                    ),
                  )
                }
                className="h-11"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`${id}-t${i}`}>Pickup time</Label>
              <Input
                id={`${id}-t${i}`}
                type="time"
                value={pickups[i]?.time ?? ""}
                onChange={(e) =>
                  setPickups((p) =>
                    p.map((x, k) =>
                      k === i ? { ...x, time: e.target.value } : x,
                    ),
                  )
                }
                className="h-11"
              />
            </div>
          </div>
        </section>
      ))}
      {data.leftOut.length ? (
        <p className="text-sm text-muted-foreground">
          {msg("M-231").replace(
            "{retailers}",
            data.leftOut.map((l) => l.retailerName).join(", "),
          )}
        </p>
      ) : null}
      {applyError ? (
        <p role="alert" className="text-sm text-destructive">
          {applyError}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" size="lg" onClick={apply} disabled={applying}>
          {applying ? "Saving…" : msg("M-232")}
        </Button>
      </DialogFooter>
    </div>
  );
}
