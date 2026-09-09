"use client";

import { useEffect } from "react";
import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";

/**
 * Member Portal error boundary (Next.js route-segment convention). Must be a Client Component.
 *
 * Renders a safe, generic message only. The raw error is never shown to the user and never logged
 * with its payload (FR-013, FR-027): internal messages, stack traces and any data they may carry
 * stay server-side. `digest` is a non-sensitive correlation id Next.js generates for server errors.
 *
 * This mirrors StateScreen's markup rather than importing it, because StateScreen is a Server
 * Component and this boundary must be a Client Component.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Deliberately minimal: record only that an error occurred plus its non-sensitive digest.
    // Never log the message, stack, or any request/session data.
    if (error.digest) {
      console.error(`Member portal error (digest: ${error.digest})`);
    } else {
      console.error("Member portal error");
    }
  }, [error.digest]);

  return <StateScreen kind="error"><Button variant="outline" onClick={reset}>Try again</Button></StateScreen>;
}
