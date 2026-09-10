"use client";

import { useEffect } from "react";

import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";

/**
 * Shared public route-segment error boundary content (Feature 002 T033 — honest error/retry state).
 *
 * Next.js `error.tsx` files must be Client Components, so this cannot be the Server Component
 * `not-found.tsx` is. `StateScreen` (`components/layout/state-screen.tsx`) has no server-only
 * dependency, so it renders correctly here exactly as `src/app/dashboard/error.tsx` already
 * established for the Member Portal — this file follows the same discipline (a safe generic
 * message only; the raw error, its message and stack never reach the client or a log; `digest` is
 * the only non-sensitive correlation id recorded).
 *
 * DELIBERATELY NO `PublicShell` HERE. An `error.tsx` boundary only replaces its OWN layout's
 * `children` — the enclosing layout keeps rendering normally around it. `(public)/layout.tsx`
 * already wraps its children in `PublicShell`, so `(public)/error.tsx` renders this bare and the
 * header/footer stay up automatically. The root homepage sits OUTSIDE that route group and has no
 * such wrapping layout, so `src/app/error.tsx` wraps this in `PublicShell` itself — see that file.
 *
 * `reset()` is Next's real segment-remount function: clicking "Try again" genuinely re-executes the
 * failed render, not a fake retry affordance.
 */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (error.digest) {
      console.error(`Public site error (digest: ${error.digest})`);
    } else {
      console.error("Public site error");
    }
  }, [error.digest]);

  return (
    <StateScreen kind="error">
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </StateScreen>
  );
}
