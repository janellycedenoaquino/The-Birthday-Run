"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import {
  FormAlert,
  formError,
  useFocusOnError,
} from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { PICKUP_TEXT_MAX } from "@/lib/validation/pickups";
import { addRecent } from "./undo-store";

type Action = (
  prev: ActionResult<{ pickupId: string }> | null,
  formData: FormData,
) => Promise<ActionResult<{ pickupId: string }>>;

// C-109 Pickup dialog (SPEC §3.3, FR-17): date (today by default, from the window's start to
// today), note and "where", both plain text with FR-17's limit. On success it closes and the
// undo row takes over (FR-18).
export function PickupDialog({
  retailerId,
  retailer,
  minDate,
  maxDate,
  createPickup,
}: {
  retailerId: string;
  retailer: string;
  minDate: string;
  maxDate: string;
  createPickup: Action;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{msg("M-115")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {msg("M-112").replace("{retailer}", retailer)}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Date, note and place for this pickup.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PickupForm
            retailerId={retailerId}
            retailer={retailer}
            minDate={minDate}
            maxDate={maxDate}
            createPickup={createPickup}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PickupForm({
  retailerId,
  retailer,
  minDate,
  maxDate,
  createPickup,
  onDone,
}: {
  retailerId: string;
  retailer: string;
  minDate: string;
  maxDate: string;
  createPickup: Action;
  onDone: () => void;
}) {
  // The undo row is recorded as soon as the action returns, not in an effect: the server re-render
  // that follows removes this card (and this dialog) from the list straight away.
  const [state, action, pending] = useActionState(
    async (prev: ActionResult<{ pickupId: string }> | null, fd: FormData) => {
      const result = await createPickup(prev, fd);
      if (result.ok && result.data) addRecent(result.data.pickupId, retailer);
      return result;
    },
    null,
  );
  const { form, errors, id } = useDialogForm(state, onDone);

  return (
    <form ref={form} action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="retailerId" value={retailerId} />
      <Field id={`${id}-date`} label="Date" errors={errors?.pickedUpOn}>
        <Input
          id={`${id}-date`}
          name="pickedUpOn"
          type="date"
          defaultValue={maxDate}
          min={minDate}
          max={maxDate}
          aria-invalid={errors?.pickedUpOn?.length ? true : undefined}
          className="h-11"
        />
      </Field>
      <TextField
        id={`${id}-note`}
        name="note"
        label="Note (optional)"
        errors={errors?.note}
      />
      <TextField
        id={`${id}-where`}
        name="locationLabel"
        label="Where (optional)"
        hint={msg("M-113")}
        errors={errors?.locationLabel}
      />
      <FormAlert id={formError(state)} />
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : msg("M-115")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  errors,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      {errors?.length ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

/** A plain-text field with FR-17's limit and a counter near it (M-114). */
export function TextField({
  id,
  name,
  label,
  hint,
  errors,
  defaultValue = "",
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  errors?: string[];
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const left = PICKUP_TEXT_MAX - [...value].length;
  return (
    <Field id={id} label={label} hint={hint} errors={errors}>
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={errors?.length ? `${id}-error` : undefined}
        className="h-11"
      />
      {left <= 50 ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {msg("M-114").replace("{left}", String(left))}
        </p>
      ) : null}
    </Field>
  );
}

/** A dialog form's shared wiring: focus on error, close on success, field errors, an id base. */
export function useDialogForm<T>(
  state: ActionResult<T> | null,
  onDone: () => void,
) {
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return {
    form,
    errors: state && !state.ok ? state.fieldErrors : undefined,
    id: useId(),
  };
}
