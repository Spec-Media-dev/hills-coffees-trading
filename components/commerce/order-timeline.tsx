import type { ReactNode } from "react";

import { cn } from "cn";

/**
 * Feature 013 T100 — `BANK_TRANSFER_V1` order timeline (UX-001). Owner scope reduction, 2026-09-28:
 * the reachable states in the current product stop at the reservation — `PAYMENT_UNDER_REVIEW`/`PAID`
 * onward (M5a/M5b) are not shown as future steps here, since they are not reachable in this product.
 */
const STEPS = ["DRAFT", "PROFORMA_ISSUED", "HOLD"] as const;
const TERMINAL: Record<string, "expired" | "cancelled" | "void"> = { EXPIRED: "expired", CANCELLED: "cancelled", VOID: "void" };

export function OrderTimeline({ status, labels, terminalLabel }: {
  status: string;
  labels: Record<(typeof STEPS)[number], ReactNode>;
  terminalLabel: ReactNode | null;
}) {
  const currentIndex = STEPS.indexOf(status as (typeof STEPS)[number]);
  const terminal = TERMINAL[status];

  return (
    <ol className="flex flex-wrap items-center gap-2" data-slot="order-timeline">
      {STEPS.map((step, index) => {
        const reached = currentIndex >= 0 ? index <= currentIndex : false;
        const isCurrent = index === currentIndex;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              data-reached={reached || undefined}
              data-current={isCurrent || undefined}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "inline-flex min-h-8 items-center rounded-[var(--radius-pill)] border px-3 py-1 text-[length:var(--text-micro)] font-semibold",
                reached ? "border-primary bg-[var(--surface-subtle)] text-foreground" : "border-border text-muted-foreground",
              )}
            >
              {labels[step]}
            </span>
            {index < STEPS.length - 1 ? <span aria-hidden="true" className="h-px w-4 bg-border" /> : null}
          </li>
        );
      })}
      {terminal && terminalLabel ? (
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-px w-4 bg-border" />
          <span data-terminal={terminal} className="inline-flex min-h-8 items-center rounded-[var(--radius-pill)] border border-destructive/40 bg-destructive/5 px-3 py-1 text-[length:var(--text-micro)] font-semibold text-destructive">
            {terminalLabel}
          </span>
        </li>
      ) : null}
    </ol>
  );
}
