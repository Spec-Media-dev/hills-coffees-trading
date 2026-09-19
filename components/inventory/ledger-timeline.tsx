import { HistoryTimeline } from "@/components/audit/history-timeline";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";
import type { OwnershipEvent } from "@/lib/inventory/types";

/**
 * Feature 005 RUN B (T012) — read-only ownership ledger timeline. Presentation only: every field
 * comes straight from `lib/inventory/ownership.ts`'s `OwnershipEvent` DTO (already RLS-scoped,
 * already redaction-resolved). This component renders NO edit/delete/reorder/correct affordance of
 * any kind (LOT-03) — the database's `prevent_ownership_event_mutation` trigger is the real
 * guarantee; this file simply never offers the action.
 *
 * Feature 012 RUN C (T016): now a thin Feature-005 adapter over the SHARED read-only
 * `components/audit/history-timeline.tsx` — the event type is the entry title; direction, quantity and
 * (possibly redacted) counterparty are its read-only details; reason (inert text) and the stored
 * correlation ID (monospaced `CorrelationId`) render only when present. Same `{ events }` contract.
 */
export function LedgerTimeline({ events }: { events: readonly OwnershipEvent[] }) {
  return (
    <>
      <h2 id="ownership-ledger-heading" className="sr-only">
        <AppBilingual pick={(c) => c.inventory.history.title} />
      </h2>
      <HistoryTimeline
        labelledBy="ownership-ledger-heading"
        entries={events.map((event) => {
          const direction = event.role.isSource && event.role.isDestination ? "both" : event.role.isDestination ? "incoming" : "outgoing";
          const directionIcon = direction === "outgoing" ? "arrow-up" : direction === "incoming" ? "arrow-down" : "arrow-left";
          const counterparty = event.role.isDestination ? event.from : event.to;
          return {
            id: event.id,
            occurredAt: event.createdAt,
            title: <AppBilingual pick={(c) => c.inventory.history.eventType[event.eventType]} />,
            details: (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name={directionIcon} aria-hidden className="size-4" />
                  <AppBilingual pick={(c) => c.inventory.history.direction[direction]} />
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-foreground" dir="ltr">
                  {event.quantityKg} kg
                </span>
                {counterparty.organizationId ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{counterparty.redacted ? <AppBilingual pick={(c) => c.inventory.history.counterpartyRedacted} /> : counterparty.displayName}</span>
                  </>
                ) : null}
              </>
            ),
            reason: event.reason,
            correlationId: event.correlationId,
          };
        })}
      />
    </>
  );
}
