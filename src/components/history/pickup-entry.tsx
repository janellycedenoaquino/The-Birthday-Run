"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { FormAlert, formError } from "@/components/auth/form-alert";
import { TextField, useDialogForm } from "@/components/rewards/pickup-dialog";
import { toast } from "sonner";
import { useSuccessToast } from "@/components/settings/use-success-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import { msg, type MessageId } from "@/lib/messages";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// One S-107 entry's actions (FR-20): "Edit" (note and place, C-109's fields) and "Delete"
// (C-108, "Cancel" focused first). Delete is a link to ?confirm=<id> first, so it works without
// JS; with JS the dialog opens in place.
export function PickupActions({
  pickupId,
  retailer,
  note,
  locationLabel,
  updatePickup,
  deletePickup,
}: {
  pickupId: string;
  retailer: string;
  note: string | null;
  locationLabel: string | null;
  updatePickup: Action;
  deletePickup: Action;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex gap-2">
      <EditDialog
        pickupId={pickupId}
        retailer={retailer}
        note={note}
        locationLabel={locationLabel}
        updatePickup={updatePickup}
      />
      <Button asChild size="sm" variant="ghost">
        <Link
          href={`/history?confirm=${pickupId}`}
          scroll={false}
          onClick={(e) => {
            e.preventDefault();
            setConfirming(true);
          }}
          aria-label={`Delete ${retailer} pickup`}
        >
          Delete
        </Link>
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{msg("M-185")}</AlertDialogTitle>
            <AlertDialogDescription>{msg("M-186")}</AlertDialogDescription>
          </AlertDialogHeader>
          <DeleteForm
            pickupId={pickupId}
            deletePickup={deletePickup}
            onDone={() => setConfirming(false)}
          >
            <AlertDialogFooter>
              <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button type="submit" variant="destructive">
                  Delete
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </DeleteForm>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The delete form: used in the dialog and on the no-JS confirm block. */
export function DeleteForm({
  pickupId,
  deletePickup,
  onDone,
  children,
}: {
  pickupId: string;
  deletePickup: Action;
  onDone?: () => void;
  children: React.ReactNode;
}) {
  // The toast fires as soon as the action returns, not in an effect: the re-render that follows
  // removes this entry (and its dialog) from the page.
  const [state, action] = useActionState(
    async (prev: ActionResult | null, fd: FormData) => {
      const result = await deletePickup(prev, fd);
      if (result.ok && result.message)
        toast.success(msg(result.message as MessageId));
      return result;
    },
    null,
  );
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="pickupId" value={pickupId} />
      <input type="hidden" name="intent" value="delete" />
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {msg(state.error as MessageId)}
        </p>
      ) : null}
      {children}
    </form>
  );
}

function EditDialog({
  pickupId,
  retailer,
  note,
  locationLabel,
  updatePickup,
}: {
  pickupId: string;
  retailer: string;
  note: string | null;
  locationLabel: string | null;
  updatePickup: Action;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Edit ${retailer} pickup`}
        >
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{retailer}</DialogTitle>
          <DialogDescription className="sr-only">
            Edit the note and place.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <EditForm
            pickupId={pickupId}
            note={note}
            locationLabel={locationLabel}
            updatePickup={updatePickup}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  pickupId,
  note,
  locationLabel,
  updatePickup,
  onDone,
}: {
  pickupId: string;
  note: string | null;
  locationLabel: string | null;
  updatePickup: Action;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updatePickup, null);
  useSuccessToast(state);
  const { form, errors, id } = useDialogForm(state, onDone);
  return (
    <form ref={form} action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="pickupId" value={pickupId} />
      <TextField
        id={`${id}-note`}
        name="note"
        label="Note (optional)"
        defaultValue={note ?? ""}
        errors={errors?.note}
      />
      <TextField
        id={`${id}-where`}
        name="locationLabel"
        label="Where (optional)"
        hint={msg("M-113")}
        defaultValue={locationLabel ?? ""}
        errors={errors?.locationLabel}
      />
      <FormAlert id={formError(state)} />
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
