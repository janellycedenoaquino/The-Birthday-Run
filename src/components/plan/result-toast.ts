"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { M, msg, type MessageId } from "@/lib/messages";

/** A result's message as text: catalogue IDs are looked up, filled-in texts shown as they are. */
export function messageText(message: string): string {
  return message in M ? msg(message as MessageId) : message;
}

/** Plan's toasts: M-227's "ends before your pickup" is a warning, other messages a success. */
export function useResultToast(state: ActionResult<unknown> | null) {
  useEffect(() => {
    if (!state?.ok || !state.message) return;
    const text = messageText(state.message);
    if (text.startsWith(msg("M-227").split("{")[0]!)) toast.warning(text);
    else toast.success(text);
  }, [state]);
}
