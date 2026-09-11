"use client";

import { useEffect, useRef } from "react";

import { toast } from "@/components/app/toast";

export type ActionToastFeedback = {
  tone: "success" | "error" | "warning" | "info";
  message: string;
  action?: { label: string; onClick: () => void };
};

/**
 * Emits at most one toast for each Server Action result object, including under Strict Mode,
 * ordinary rerenders, or a locale/theme rerender. A genuinely new submission produces a new result
 * object and may therefore notify again, as expected.
 */
export function useActionToast(
  state: object | undefined,
  feedback: ActionToastFeedback | null
): void {
  const handledState = useRef<object | undefined>(undefined);

  useEffect(() => {
    if (!state || handledState.current === state) return;
    handledState.current = state;
    if (!feedback) return;

    toast[feedback.tone](feedback.message, feedback.action ? { action: feedback.action } : undefined);
  }, [feedback, state]);
}
