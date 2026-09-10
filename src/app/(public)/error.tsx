"use client";

import { RouteError } from "@/components/public/route-error";

/** The `(public)` route group's error boundary (Feature 002 T033). See `RouteError`'s header comment. */
export default function PublicGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} />;
}
