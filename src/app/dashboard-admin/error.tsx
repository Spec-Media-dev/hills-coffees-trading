"use client";

import { useEffect } from "react";

/**
 * Operations Console error boundary (Next.js route-segment convention). Must be a Client Component.
 *
 * Renders a safe, generic message only. The raw error is never shown to the user and never logged
 * with its payload (FR-013, FR-027) — this surface handles operational data, so leaking an internal
 * message or stack here would be especially sensitive. `digest` is a non-sensitive correlation id.
 */
export default function DashboardAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (error.digest) {
      console.error(`Operations console error (digest: ${error.digest})`);
    } else {
      console.error("Operations console error");
    }
  }, [error.digest]);

  return (
    <main
      data-state-screen="error"
      className="flex min-h-[60vh] flex-1 items-center justify-center px-6 py-16"
    >
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          That did not load correctly. Please try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
