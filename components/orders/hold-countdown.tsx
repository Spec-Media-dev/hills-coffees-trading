"use client";

import { useEffect, useState } from "react";

import { useLocale } from "@/components/locale/locale-provider";

/**
 * Feature 007 RUN B (T010) — the 20-minute hold countdown. Derives EXCLUSIVELY from the stored
 * `orders.hold_expires_at` timestamp passed in as a prop (FR-007): there is no "checkout time +
 * 20 minutes" arithmetic anywhere, no way to extend or reset the hold from the client, and the
 * component never writes anything. Reaching zero only changes what is DISPLAYED — expiry itself is
 * Phase 5's `expire_order_hold()`, not implemented this run.
 *
 * ACCESSIBILITY: the ticking figure carries `role="timer"` — whose implicit `aria-live` is `off`,
 * so assistive tech can find and read it on demand but is never interrupted by every second — and
 * a separate visually-hidden `aria-live="polite"` summary changes only when the whole-minute figure
 * changes (or the window ends), so announcements are rare and useful. `prefers-reduced-motion`
 * needs no special handling — nothing animates; the text simply changes.
 *
 * This is a working component RUN B needs; it does NOT claim T017 (Phase 6), whose own acceptance
 * (monospaced order/proforma codes + a `financial-summary.tsx`) is a separate, later task.
 */
export function HoldCountdown({ holdExpiresAt }: { holdExpiresAt: string }) {
  const { tApp } = useLocale();
  const copy = tApp.orders.hold;
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(holdExpiresAt).getTime();
    const tick = () => setRemainingMs(Math.max(0, target - Date.now()));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [holdExpiresAt]);

  if (remainingMs === null) {
    return (
      <span className="font-mono tabular-nums text-foreground" dir="ltr">
        —
      </span>
    );
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const expired = remainingMs === 0;

  const summary = expired ? copy.expired : minutes >= 1 ? copy.countdownSummary.replace("{minutes}", String(minutes)) : copy.countdownSummaryUnderMinute;

  return (
    <span data-slot="hold-countdown" data-expired={expired || undefined}>
      <span role="timer" aria-label={copy.remainingLabel} className="font-mono text-lg font-semibold tabular-nums text-foreground" dir="ltr">
        {expired ? "00:00" : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`}
      </span>
      <span className="sr-only" aria-live="polite">
        {summary}
      </span>
    </span>
  );
}
