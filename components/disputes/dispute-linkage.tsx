import Link from "next/link";

import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { DisputeStatusBadge } from "@/components/disputes/dispute-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import type { MemberDisputeSummaryDTO } from "@/lib/disputes/types";

/**
 * Feature 012 RUN B (T007) — the link between an order/shipment and its dispute RECORDS, drawn from
 * what the data actually says (DB-OPEN-09, FR-007, SC-005):
 *
 * - The record's OWN status is whatever its own workflow set. A dispute never changes it: no trigger
 *   exists on `disputes`, and COMPLIANCE has no write path to `orders`/`order_shipments`. So this
 *   component never infers "frozen/held" from a dispute, and never infers a dispute from a status.
 * - When the record's own status IS `DISPUTED`, that fact is stated as the record's own status — and
 *   explicitly NOT as a consequence of raising a dispute.
 * - The dispute list is read-only links to `/dashboard/disputes/[id]` (the acting organization's own
 *   disputes only — `listDisputesForOrder`).
 */

function LinkedDisputes({ disputes }: { disputes: readonly MemberDisputeSummaryDTO[] }) {
  return (
    <ul data-slot="linked-disputes" className="flex flex-col gap-2">
      {disputes.map((dispute) => (
        <li key={dispute.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2 text-[length:var(--text-small)] last:border-b-0">
          <span className="flex flex-wrap items-center gap-3">
            <DisputeStatusBadge status={dispute.status} />
            <span className="text-muted-foreground">
              <AdminDateTime value={dispute.openedAt} fallback="—" />
            </span>
          </span>
          <Link
            href={`/dashboard/disputes/${dispute.id}`}
            className="inline-flex min-h-11 min-w-11 items-center rounded-[var(--radius-sm)] px-1 font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <AppBilingual pick={(c) => c.disputes.linkage.viewDispute} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Order detail: every dispute on this order (acting organization's), plus the no-effect statement. */
export function OrderDisputeLinkage({ orderId, orderIsDisputed, disputes }: { orderId: string; orderIsDisputed: boolean; disputes: readonly MemberDisputeSummaryDTO[] }) {
  return (
    <section data-slot="order-dispute-linkage" aria-labelledby="order-disputes-heading" className="flex flex-col gap-3">
      <h2 id="order-disputes-heading" className="text-lg font-semibold text-foreground">
        <AppBilingual pick={(c) => c.disputes.linkage.heading} />
      </h2>
      {orderIsDisputed ? (
        <p data-slot="order-own-disputed-status" className="text-[length:var(--text-small)] text-foreground">
          <AppBilingual pick={(c) => c.disputes.linkage.orderDisputed} />
        </p>
      ) : null}
      <p className="text-[length:var(--text-small)] text-muted-foreground">
        <AppBilingual pick={(c) => c.disputes.linkage.noEffect} />
      </p>
      {disputes.length === 0 ? (
        <p className="text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.disputes.linkage.none} />
        </p>
      ) : (
        <LinkedDisputes disputes={disputes} />
      )}
      <Link
        href={`/dashboard/disputes?orderId=${orderId}`}
        className="inline-flex min-h-11 w-fit items-center rounded-[var(--radius-sm)] px-1 text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <AppBilingual pick={(c) => c.disputes.linkage.raise} />
      </Link>
    </section>
  );
}

/** Shipment detail, rendered ONLY when the shipment's own status is `DISPUTED`. */
export function ShipmentDisputeLinkage({ disputes }: { disputes: readonly MemberDisputeSummaryDTO[] }) {
  return (
    <div data-slot="shipment-dispute-linkage" className="flex flex-col gap-2">
      <p className="text-[length:var(--text-small)] text-foreground">
        <AppBilingual pick={(c) => c.disputes.linkage.shipmentDisputed} />
      </p>
      <h3 className="text-[length:var(--text-small)] font-semibold text-foreground">
        <AppBilingual pick={(c) => c.disputes.linkage.shipmentHeading} />
      </h3>
      {disputes.length === 0 ? (
        <p className="text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.disputes.linkage.shipmentNone} />
        </p>
      ) : (
        <LinkedDisputes disputes={disputes} />
      )}
    </div>
  );
}
