"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useLocale } from "@/components/locale/locale-provider";
import { HoldCountdown } from "@/components/orders/hold-countdown";

/**
 * Feature 013 T099 — reuses the shared `HoldCountdown` timer with the server deadline and
 * contextual EN/AR labels. Its polite minute-level summary avoids announcing every second.
 * Refreshing at the deadline asks the server for the authoritative expired state; it never
 * extends or writes the reservation client-side.
 */
export function ReservationCountdown({ expiresAt, label, kind = "reservation" }: { expiresAt: string; label: ReactNode; kind?: "reservation" | "proforma" }) {
  const router = useRouter();
  const { tApp } = useLocale();
  useEffect(() => {
    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now()) + 1000;
    const timer = window.setTimeout(() => router.refresh(), delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt, router]);

  return (
    <div data-slot="reservation-countdown" className="flex flex-col gap-1">
      <span className="text-[length:var(--text-small)] text-muted-foreground">{label}</span>
      <HoldCountdown holdExpiresAt={expiresAt} labels={kind === "proforma" ? {
        remainingLabel: tApp.commerce.proformaUi.validityRemaining,
        expired: tApp.commerce.proformaUi.validityExpired,
        countdownSummary: tApp.commerce.proformaUi.validitySummary,
        countdownSummaryUnderMinute: tApp.commerce.proformaUi.validityUnderMinute,
      } : undefined} />
    </div>
  );
}
