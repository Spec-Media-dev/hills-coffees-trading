import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { AppBilingual } from "@/components/locale/app-bilingual";
import type { FillProjection } from "@/lib/listings/types";

/**
 * Feature 006 RUN B (T011) — presentation-only listing fill/availability projection. Receives an
 * authoritative `FillProjection` (already resolved by `lib/listings/fills.ts`, the single read layer)
 * and renders it verbatim — no quantity arithmetic exists in this file (mirrors
 * `components/inventory/availability-breakdown.tsx`'s exact discipline). A negative-remainder integrity
 * problem renders a controlled `Alert`, never a broken/negative-width bar and never a silently clamped
 * figure.
 *
 * The visual fill bar is a SUPPLEMENTARY hierarchy cue only — every exact kg figure is always shown as
 * text (never replaced by a bare percentage), per the run directive's "quantities are what matter"
 * rule. `listed = 0` (a data edge case the DB's own `quantity_kg > 0` CHECK should prevent, but this
 * component still renders safely rather than dividing by zero) shows an empty/zero bar, never NaN.
 */
export function AvailabilityBar({ projection }: { projection: FillProjection }) {
  if (!projection.ok) {
    return (
      <Alert variant="destructive">
        <Icon name="warning" />
        <AlertTitle>
          <AppBilingual pick={(c) => c.marketplace.availability.integrityError.title} />
        </AlertTitle>
        <AlertDescription>
          <AppBilingual pick={(c) => c.marketplace.availability.integrityError.description} />
        </AlertDescription>
      </Alert>
    );
  }

  const { quantityKg, reservedQuantityKg, filledQuantityKg, remainingQuantityKg } = projection;
  const committedKg = reservedQuantityKg + filledQuantityKg;
  const progressValue = quantityKg > 0 ? Math.min(100, (committedKg / quantityKg) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[length:var(--text-micro)] text-muted-foreground">
            <AppBilingual pick={(c) => c.marketplace.availability.listedLabel} />
          </dt>
          <dd className="font-mono text-[length:var(--text-small)] font-semibold tabular-nums text-foreground" dir="ltr">
            {quantityKg} kg
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[length:var(--text-micro)] text-muted-foreground">
            <AppBilingual pick={(c) => c.marketplace.availability.reservedLabel} />
          </dt>
          <dd className="font-mono text-[length:var(--text-small)] font-semibold tabular-nums text-foreground" dir="ltr">
            {reservedQuantityKg} kg
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[length:var(--text-micro)] text-muted-foreground">
            <AppBilingual pick={(c) => c.marketplace.availability.filledLabel} />
          </dt>
          <dd className="font-mono text-[length:var(--text-small)] font-semibold tabular-nums text-foreground" dir="ltr">
            {filledQuantityKg} kg
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[length:var(--text-micro)] text-muted-foreground">
            <AppBilingual pick={(c) => c.marketplace.availability.remainingLabel} />
          </dt>
          <dd className="font-mono text-[length:var(--text-small)] font-semibold tabular-nums text-foreground" dir="ltr">
            {remainingQuantityKg} kg
          </dd>
        </div>
      </dl>

      {/* Decorative only — the `dl` above already gives assistive tech every exact figure, in text,
          which is strictly more useful than this bar's own 0-100 value; hiding it avoids a redundant,
          less-informative announcement rather than requiring a second localized label for the same
          information. */}
      <Progress value={progressValue} aria-hidden="true" className="gap-0">
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>
    </div>
  );
}
