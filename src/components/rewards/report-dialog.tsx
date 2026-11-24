"use client";

import { useActionState, useCallback, useState } from "react";
import { toast } from "sonner";
import { FormAlert, formError } from "@/components/auth/form-alert";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActionResult } from "@/lib/action-result";
import { msg, type MessageId } from "@/lib/messages";
import { useDialogForm } from "./pickup-dialog";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

/** FR-48's four reasons, as the report_reason enum, with their labels (M-193–M-196). */
const REASONS: [value: string, label: MessageId][] = [
  ["expired", "M-193"],
  ["different_reward", "M-194"],
  ["wrong_timing", "M-195"],
  ["store_closed", "M-196"],
];

// C-107 Report dialog (SPEC §3.3, FR-48, NFR-11): a required choice of four reasons and no text
// field, so nothing user-written can reach the check. S-104 shows a ghost button; S-105 puts it in
// the card's "More" menu. Once reported this cycle the trigger becomes M-198.
export function ReportDialog({
  retailerId,
  retailer,
  reported,
  reportReward,
  trigger = "button",
}: {
  retailerId: string;
  retailer: string;
  reported: boolean;
  reportReward: Action;
  trigger?: "button" | "menu";
}) {
  const [open, setOpen] = useState(false);
  // Shown straight away; the server render that follows (revalidated) says the same.
  const [sent, setSent] = useState(false);
  const done = reported || sent;
  const onSent = useCallback(() => {
    setSent(true);
    setOpen(false);
  }, []);

  const opener =
    trigger === "menu" ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`More for ${retailer}`}>
            More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem disabled={done} onSelect={() => setOpen(true)}>
            {done ? msg("M-198") : msg("M-190")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : done ? (
      <p className="text-sm text-muted-foreground">{msg("M-198")}</p>
    ) : (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {msg("M-190")}
      </Button>
    );

  return (
    <>
      {opener}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {msg("M-191").replace("{retailer}", retailer)}
            </DialogTitle>
            <DialogDescription>{msg("M-192")}</DialogDescription>
          </DialogHeader>
          {open ? (
            <ReportForm
              retailerId={retailerId}
              reportReward={reportReward}
              onSent={onSent}
              onCancel={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReportForm({
  retailerId,
  reportReward,
  onSent,
  onCancel,
}: {
  retailerId: string;
  reportReward: Action;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(
    async (prev: ActionResult | null, fd: FormData) => {
      const result = await reportReward(prev, fd);
      if (result.ok && result.message)
        toast.success(messageText(result.message));
      return result;
    },
    null,
  );
  const { form, id } = useDialogForm(state, onSent);
  const [missing, setMissing] = useState(false);
  // M-199: nothing chosen, caught here or (a direct call) refused by the server's schema.
  const reasonError =
    missing || (state?.ok === false && state.error === "API-4");

  return (
    <form
      ref={form}
      action={action}
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        const chosen = new FormData(e.currentTarget).get("reason");
        setMissing(!chosen);
        if (!chosen) e.preventDefault();
      }}
    >
      <input type="hidden" name="retailerId" value={retailerId} />
      <fieldset className="grid gap-2">
        <legend id={`${id}-legend`} className="sr-only">
          Reason
        </legend>
        <div
          role="radiogroup"
          aria-labelledby={`${id}-legend`}
          aria-required="true"
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? `${id}-error` : undefined}
          className="grid gap-2"
        >
          {REASONS.map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-11 items-center gap-3 rounded-md border border-border/70 px-3"
            >
              <input
                type="radio"
                name="reason"
                value={value}
                onChange={() => setMissing(false)}
                className="size-4"
              />
              {msg(label)}
            </label>
          ))}
        </div>
        {reasonError ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {msg("M-199")}
          </p>
        ) : null}
      </fieldset>
      <FormAlert id={formError(state)} />
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : msg("M-197")}
        </Button>
      </DialogFooter>
    </form>
  );
}
