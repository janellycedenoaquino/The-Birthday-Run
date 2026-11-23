"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { msg, type MessageId } from "@/lib/messages";
import { removeRecent, useRecent, type Recent } from "./undo-store";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// C-109's success row (FR-18): "{retailer} picked up." with "Undo" for 60 seconds.
export function UndoBar({ deletePickup }: { deletePickup: Action }) {
  const recent = useRecent();
  if (recent.length === 0) return null;
  return (
    <ul className="mt-6 grid gap-2" aria-live="polite">
      {recent.map((r) => (
        <UndoRow key={r.pickupId} item={r} deletePickup={deletePickup} />
      ))}
    </ul>
  );
}

function UndoRow({
  item,
  deletePickup,
}: {
  item: Recent;
  deletePickup: Action;
}) {
  const [state, action, pending] = useActionState(deletePickup, null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(msg("BR-21"));
      removeRecent(item.pickupId);
    }
  }, [state, item.pickupId]);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/40 px-4 py-3">
      <span>{msg("M-116").replace("{retailer}", item.retailer)}</span>
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="pickupId" value={item.pickupId} />
        <input type="hidden" name="intent" value="undo" />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Undo
        </Button>
        {state && !state.ok ? (
          <span role="alert" className="text-sm text-destructive">
            {msg(state.error as MessageId)}
          </span>
        ) : null}
      </form>
    </li>
  );
}
