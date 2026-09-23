"use client";

import { useEffect } from "react";
import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";
import { useOptionalLocale } from "@/components/locale/locale-provider";
import { appCopy } from "@/lib/app/copy";

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
  // Never throws: an error screen must render even if the locale context is unavailable.
  const tryAgain = useOptionalLocale()?.tApp.tryAgain ?? appCopy.tryAgain;
  useEffect(() => {
    if (error.digest) {
      console.error(`Operations console error (digest: ${error.digest})`);
    } else {
      console.error("Operations console error");
    }
  }, [error.digest]);

  return <StateScreen kind="error"><Button variant="outline" onClick={reset}>{tryAgain}</Button></StateScreen>;
}
