import { AppBilingual } from "@/components/locale/app-bilingual";
import { ShipmentStatusBadge } from "@/components/delivery/shipment-status-badge";
import { Icon } from "@/components/ui/icon";
import type { OrderShipmentDTO } from "@/lib/delivery/types";

/**
 * Feature 009 RUN C (T020/T021) — an HONEST status summary, deliberately NOT a fabricated
 * multi-step event history. No `shipment_status_history`-equivalent table exists for
 * `order_shipments` (unlike `order_status_history` for `orders`) — this component therefore shows
 * ONLY the genuinely stored facts: when the shipment record was created (`created_at`), when it
 * became `READY` (`ready_at`, only if the database has actually set it), and its current status —
 * never an invented intermediate step the database does not record. `delivered_at` is deliberately
 * NOT shown: live inspection of every trigger/function this feature's own migration touches found no
 * code path that ever sets it — rendering it would imply a historical fact the database never
 * actually records.
 *
 * Text + icon + label communicate each entry — never color alone (FR-013/SC-004).
 */
export function StatusTimeline({ shipment }: { shipment: OrderShipmentDTO }) {
  return (
    <ol className="flex flex-col gap-3">
      <li className="flex items-center gap-3 text-[length:var(--text-small)]">
        <Icon name="clock" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground">
          <AppBilingual pick={(c) => c.deliveries.detail.timeline.created} />
        </span>
        <span className="font-mono text-foreground" dir="ltr">
          {shipment.createdAt}
        </span>
      </li>
      {shipment.readyAt ? (
        <li className="flex items-center gap-3 text-[length:var(--text-small)]">
          <Icon name="check" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">
            <AppBilingual pick={(c) => c.deliveries.detail.timeline.ready} />
          </span>
          <span className="font-mono text-foreground" dir="ltr">
            {shipment.readyAt}
          </span>
        </li>
      ) : null}
      <li className="flex items-center gap-3 text-[length:var(--text-small)]">
        <span className="text-muted-foreground">
          <AppBilingual pick={(c) => c.deliveries.detail.timeline.current} />
        </span>
        <ShipmentStatusBadge status={shipment.status} />
      </li>
    </ol>
  );
}
