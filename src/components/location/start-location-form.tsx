"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import { M, msg, type MessageId } from "@/lib/messages";
import type { StartLocation } from "@/lib/validation/route";
import { useStartLocation } from "./start-location";

type LookupZip = (
  input: unknown,
) => Promise<ActionResult<{ state: string | null }>>;

/** An action's error ID (or catalogue text) as text. */
export const errorText = (e: string) => (e in M ? msg(e as MessageId) : e);

// C-105 Start location (SPEC §3.3: FR-30, NFR-3). The browser is asked only when M-150 is pressed;
// a ZIP is checked on the server (BR-12) before it's kept. Set: M-155 with "Change" (M-157).
export function StartLocationForm({
  lookupZip,
  onSet,
}: {
  lookupZip: LookupZip;
  /** Called once the user sets a start here; a ZIP brings the state its check found (FR-5). */
  onSet?: (start: StartLocation, state?: string | null) => void;
}) {
  const { start, setStart, clear } = useStartLocation();
  const [locating, setLocating] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const id = useId();

  if (start)
    return (
      <p className="flex flex-wrap items-center gap-2">
        <span>{msg("M-155").replace("{place}", placeOf(start))}</span>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={clear}
        >
          {msg("M-157")}
        </Button>
      </p>
    );

  const useMyLocation = () => {
    setError(null);
    setZipError(null);
    if (!("geolocation" in navigator)) return failed();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const s: StartLocation = {
          kind: "coords",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setStart(s);
        onSet?.(s);
      },
      () => {
        setLocating(false);
        failed();
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };
  // FR-30: denied, timed out or unavailable → M-154 and the ZIP field.
  const failed = () => {
    setError(msg("M-154"));
    zipRef.current?.focus();
  };

  const submitZip = (formData: FormData) => {
    setError(null);
    setZipError(null);
    const zip = String(formData.get("zip") ?? "").trim();
    if (!/^\d{5}$/.test(zip)) {
      setZipError(msg("BR-12"));
      zipRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const r = await lookupZip({ start: { kind: "zip", zip } });
      if (r.ok) {
        const s: StartLocation = { kind: "zip", zip };
        setStart(s);
        return onSet?.(s, r.data?.state ?? null);
      }
      const field = r.fieldErrors?.zip?.[0];
      if (field) {
        setZipError(field);
        zipRef.current?.focus();
      } else setError(errorText(r.error));
    });
  };

  return (
    <div className="grid gap-3">
      <div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={useMyLocation}
          disabled={locating}
        >
          {locating ? msg("M-153") : msg("M-150")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">or</p>
      <form
        action={submitZip}
        className="flex flex-wrap items-end gap-2"
        noValidate
      >
        <div className="grid gap-1">
          <Label htmlFor={`${id}-zip`}>ZIP code</Label>
          <Input
            ref={zipRef}
            id={`${id}-zip`}
            name="zip"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            className="w-32"
            aria-invalid={zipError ? true : undefined}
            aria-describedby={zipError ? `${id}-zip-error` : undefined}
          />
        </div>
        <Button type="submit" size="lg" disabled={pending}>
          {msg("M-151")}
        </Button>
      </form>
      {zipError ? (
        <p id={`${id}-zip-error`} className="text-sm text-destructive">
          {zipError}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">{msg("M-152")}</p>
    </div>
  );
}

const placeOf = (s: StartLocation) => (s.kind === "zip" ? s.zip : msg("M-156"));
