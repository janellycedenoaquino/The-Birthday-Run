"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { msg, type MessageId } from "@/lib/messages";

/** C-3: a successful result's message becomes one toast (never an error: those stay inline). */
export function useSuccessToast(state: ActionResult | null) {
  useEffect(() => {
    if (state?.ok && state.message)
      toast.success(msg(state.message as MessageId));
  }, [state]);
}
