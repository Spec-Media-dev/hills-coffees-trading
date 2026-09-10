"use client";

import { PublicShell } from "@/components/public/public-shell";
import { RouteError } from "@/components/public/route-error";

/**
 * Root-segment error boundary (Feature 002 T033). Catches the locked homepage's own failures — it
 * sits outside `(public)/layout.tsx`, so that route group's `error.tsx` does not cover it, and
 * unlike that boundary there is no enclosing layout already providing `PublicShell` here, so this
 * file wraps `RouteError` in it explicitly. See `RouteError`'s header comment for the shared
 * implementation and its logging discipline.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PublicShell>
      <RouteError error={error} reset={reset} />
    </PublicShell>
  );
}
