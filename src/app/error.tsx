"use client";

import { RouteError } from "@/components/public/route-error";

/**
 * Root-segment error boundary (Feature 002 T033). Catches the locked homepage's own failures — it
 * sits outside `(public)/layout.tsx`, so that route group's `error.tsx` does not cover it.
 *
 * DELIBERATELY BARE (no `PublicShell`), revised for Feature 003: `PublicShell` renders `SiteHeader`,
 * which now resolves auth state via `getRequestIdentity()` — a server-only dependency chain
 * (`next/headers`) that a Client Component boundary like this one cannot import into its own module
 * graph (a real `next build` error this exact change surfaced and fixed). `error.tsx` is a rare,
 * unhappy-path fallback; a bare `StateScreen` with no header/footer, matching the SAME precedent
 * `src/app/dashboard/error.tsx` already established for the Member Portal, is an honest, sufficient
 * treatment here — it does not need full site chrome to be usable.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} />;
}
