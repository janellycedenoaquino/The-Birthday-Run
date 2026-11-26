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
import { TAPS, tapsIn, withTaps } from "@/lib/rewards/note-taps";
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
        {/* White with the navy ring, as in the prototype (decision 0016). */}
        <Button
          size="sm"
          className="h-10 bg-white px-3.5 text-sm font-bold shadow-[0_0_0_1.5px_var(--navy)] dark:bg-white/10 dark:text-foreground"
        >
          {msg("M-115")}
        </Button>
      </DialogTrigger>
      {/* Decision 0023: a pastel blue sticky note, slightly tilted (straight on phones), with a pin
          and a folded corner; navy on the blue paper in both themes. */}
      <DialogContent className={NOTE}>
        <span
          aria-hidden="true"
          className="absolute top-2 left-1/2 size-[18px] -translate-x-1/2 rounded-full bg-[var(--bubblegum)] shadow-[inset_0_0_0_2px_var(--navy),0_3px_4px_rgb(0_0_0/25%)]"
        />
        <DialogHeader>
          <DialogTitle className="font-hand text-[28px] leading-tight font-bold">
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
      <Field id={`${id}-date`} label={msg("M-311")} errors={errors?.pickedUpOn}>
        <Input
          id={`${id}-date`}
          name="pickedUpOn"
          type="date"
          defaultValue={maxDate}
          min={minDate}
          max={maxDate}
          aria-invalid={errors?.pickedUpOn?.length ? true : undefined}
          className={`h-11 ${PAPER_INPUT}`}
        />
      </Field>
      <NoteWithTaps id={`${id}-note`} errors={errors?.note} />
      <TextField
        id={`${id}-where`}
        name="locationLabel"
        label={msg("M-314")}
        hint={msg("M-113")}
        errors={errors?.locationLabel}
        inputClassName={`font-hand text-[22px] md:text-[22px] ${PAPER_INPUT}`}
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

// The note's paper and the fields on it (decision 0023). Fixed colours, so dark mode keeps the
// blue paper with navy text (about 11:1) and light date pickers.
const NOTE =
  "rounded-none bg-[#d6ebff] p-6 pt-8 text-[var(--navy)] shadow-[0_18px_30px_rgb(0_0_0/22%)] ring-0 [color-scheme:light] [clip-path:polygon(0_0,100%_0,100%_calc(100%-30px),calc(100%-30px)_100%,0_100%)] after:absolute after:right-0 after:bottom-0 after:size-[30px] after:bg-[linear-gradient(135deg,#a9cdf2_50%,transparent_50%)] sm:rotate-[-1.5deg] [&_[data-slot=button][data-variant=ghost]]:text-[var(--navy)] [&_.text-muted-foreground]:text-[#4a527a]";
const PAPER_INPUT =
  "border-0 bg-white/75 text-[var(--navy)] dark:bg-white/75 placeholder:text-[#5b6285]";

/** "How did it go?" plus "Anything else?": the taps go into the note itself (FR-17's one field
 *  and its 500-character limit), so they're saved and shown in History like anything typed. */
function NoteWithTaps({ id, errors }: { id: string; errors?: string[] }) {
  const [value, setValue] = useState("");
  const picked = tapsIn(value);
  const left = PICKUP_TEXT_MAX - [...value].length;
  return (
    <>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-extrabold">{msg("M-312")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {TAPS.map((t) => {
            const label = msg(t);
            const on = picked.includes(label);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setValue(
                    withTaps(
                      value,
                      on
                        ? picked.filter((p) => p !== label)
                        : [...picked, label],
                    ),
                  )
                }
                className={`rounded-full px-2.5 py-1.5 text-[13px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-[var(--navy)]/40 ${on ? "bg-[var(--navy)] text-white" : "bg-white text-[var(--navy)] shadow-[inset_0_0_0_1.5px_rgb(31_42_92/30%)]"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <Field id={id} label={msg("M-313")} errors={errors}>
        <textarea
          id={id}
          name="note"
          rows={2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={msg("M-313a")}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={errors?.length ? `${id}-error` : undefined}
          className={`min-h-16 w-full resize-none rounded-lg px-2.5 py-1.5 font-hand text-[22px] leading-snug outline-none focus-visible:ring-3 focus-visible:ring-[var(--navy)]/40 ${PAPER_INPUT}`}
        />
        {left <= 50 ? (
          <p className="text-sm" aria-live="polite">
            {msg("M-114").replace("{left}", String(left))}
          </p>
        ) : null}
      </Field>
    </>
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
      <Label htmlFor={id} className="font-extrabold">
        {label}
      </Label>
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
  inputClassName = "",
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  errors?: string[];
  defaultValue?: string;
  inputClassName?: string;
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
        className={`h-11 ${inputClassName}`}
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
