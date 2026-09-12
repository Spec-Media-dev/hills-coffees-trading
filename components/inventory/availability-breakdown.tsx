import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import { AppBilingual } from "@/components/locale/app-bilingual";
import type { AvailabilityBreakdown as AvailabilityBreakdownDto } from "@/lib/inventory/types";

/**
 * Feature 005 RUN B (T009) — presentation-only availability breakdown. Receives an authoritative
 * `AvailabilityBreakdownDto` (already resolved by `lib/inventory/availability.ts`, the single read
 * layer) and renders it verbatim. No inventory arithmetic exists in this file — the exact structural
 * audit `tests/inventory/availability.test.ts` already runs against `lib/inventory/availability.ts`
 * is mirrored here in `tests/inventory/availability-breakdown-component.test.tsx`.
 *
 * LABELING (Feature 005 reconciliation, see `lib/app/copy/en.ts#inventory`'s header comment):
 * `availableQuantityKg` is labeled "Owned quantity" — the live `checkout_order`/`admin_review_payment`
 * functions prove this column is the position's TOTAL/gross owned quantity, not "free to trade now."
 * `reservedQuantityKg` is labeled "Reserved quantity." No third "available to trade" figure is shown;
 * one would require `owned - reserved`, which this feature never computes.
 *
 * NEGATIVE-VALUE INTEGRITY GUARD: a genuine negative value from the database (which the CHECK
 * constraints should make impossible) is never silently clamped to zero (`Math.max(0, value)` would
 * falsify what the database actually stored). Instead this component renders a controlled
 * data-integrity `Alert` in place of the quantity figures.
 */
export function AvailabilityBreakdown({ breakdown }: { breakdown: AvailabilityBreakdownDto }) {
  const { availableQuantityKg: ownedQuantityKg, reservedQuantityKg, reservationCauses } = breakdown;

  if (ownedQuantityKg < 0 || reservedQuantityKg < 0) {
    return (
      <Alert variant="destructive">
        <Icon name="warning" />
        <AlertTitle>
          <AppBilingual pick={(c) => c.inventory.availability.integrityError.title} />
        </AlertTitle>
        <AlertDescription>
          <AppBilingual pick={(c) => c.inventory.availability.integrityError.description} />
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="hc-heading-4 font-semibold text-foreground">
        <AppBilingual pick={(c) => c.inventory.availability.title} />
      </h2>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-border bg-card p-4">
          <dt className="text-[length:var(--text-small)] text-muted-foreground">
            <AppBilingual pick={(c) => c.inventory.availability.ownedQuantity} />
          </dt>
          <dd className="font-mono text-[length:var(--text-h4)] font-semibold tabular-nums text-foreground" dir="ltr">
            {ownedQuantityKg} kg
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-border bg-card p-4">
          <dt className="text-[length:var(--text-small)] text-muted-foreground">
            <AppBilingual pick={(c) => c.inventory.availability.reservedQuantity} />
          </dt>
          <dd className="font-mono text-[length:var(--text-h4)] font-semibold tabular-nums text-foreground" dir="ltr">
            {reservedQuantityKg} kg
          </dd>
        </div>
      </dl>

      {reservedQuantityKg > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-[length:var(--text-small)] font-medium text-muted-foreground">
            <AppBilingual pick={(c) => c.inventory.availability.reservationCause.heading} />
          </h3>
          <ul className="flex flex-col gap-2">
            {reservationCauses.length === 0 ? (
              <li className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.inventory.availability.reservationCause.unknown} />
              </li>
            ) : (
              reservationCauses.map((cause, index) => (
                <li key={index} className="flex flex-col gap-0.5 text-[length:var(--text-small)] text-foreground">
                  {cause.kind === "order" ? (
                    <>
                      <span>
                        {cause.orderCode ? (
                          <AppBilingual pick={(c) => c.inventory.availability.reservationCause.knownOrder.replace("{orderCode}", cause.orderCode!)} />
                        ) : (
                          <AppBilingual pick={(c) => c.inventory.availability.reservationCause.knownNoCode} />
                        )}
                      </span>
                      {cause.holdExpiresAt ? (
                        <span className="text-muted-foreground" dir="ltr">
                          {cause.holdExpiresAt}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      <AppBilingual pick={(c) => c.inventory.availability.reservationCause.unknown} />
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : (
        <p className="text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.inventory.availability.reservationCause.none} />
        </p>
      )}
    </div>
  );
}
