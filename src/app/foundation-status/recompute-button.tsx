"use client";

import { Button } from "@/components/ui/button";

import { revalidateFoundationStatus } from "./actions";

/**
 * The real, working trigger for the T022 revalidation proof (FR-015) — a plain form bound
 * directly to the Server Action. No client-side state beyond the browser's own pending-submission
 * handling is needed: this button's only job is to demonstrate `revalidateTag` actually firing, so
 * the computed value visibly changes on the next read (research.md §5).
 */
export function RecomputeButton() {
  return (
    <form action={revalidateFoundationStatus}>
      <Button type="submit" variant="outline" size="sm">
        Recompute now
      </Button>
    </form>
  );
}
