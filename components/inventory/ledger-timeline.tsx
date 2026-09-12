import { Icon } from "@/components/ui/icon";
import { AppBilingual } from "@/components/locale/app-bilingual";
import type { OwnershipEvent } from "@/lib/inventory/types";

/**
 * Feature 005 RUN B (T012) — read-only ownership ledger timeline. Presentation only: every field
 * comes straight from `lib/inventory/ownership.ts`'s `OwnershipEvent` DTO (already RLS-scoped,
 * already redaction-resolved). This component renders NO edit/delete/reorder/correct affordance of
 * any kind (LOT-03) — the database's `prevent_ownership_event_mutation` trigger is the real
 * guarantee; this file simply never offers the action.
 *
 * Reason/correlation text is rendered as PLAIN TEXT (React's default escaping) — never
 * `dangerouslySetInnerHTML`, never markdown-interpreted (SEC-005).
 */
export function LedgerTimeline({ events }: { events: readonly OwnershipEvent[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {events.map((event) => {
        const direction = event.role.isSource && event.role.isDestination ? "both" : event.role.isDestination ? "incoming" : "outgoing";
        const directionIcon = direction === "outgoing" ? "arrow-up" : direction === "incoming" ? "arrow-down" : "arrow-left";

        const counterparty = event.role.isDestination ? event.from : event.to;

        return (
          <li key={event.id} className="flex gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4">
            <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-subtle)] text-foreground">
              <Icon name={directionIcon as "arrow-up" | "arrow-down" | "arrow-left"} className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-foreground">
                  <AppBilingual pick={(c) => c.inventory.history.eventType[event.eventType]} />
                </span>
                <time className="text-[length:var(--text-small)] text-muted-foreground" dir="ltr" dateTime={event.createdAt}>
                  {event.createdAt}
                </time>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-small)] text-muted-foreground">
                <span>
                  <AppBilingual pick={(c) => c.inventory.history.direction[direction]} />
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-foreground" dir="ltr">
                  {event.quantityKg} kg
                </span>
                {counterparty.organizationId ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      {counterparty.redacted ? (
                        <AppBilingual pick={(c) => c.inventory.history.counterpartyRedacted} />
                      ) : (
                        counterparty.displayName
                      )}
                    </span>
                  </>
                ) : null}
              </div>

              {event.reason ? (
                <p className="text-[length:var(--text-small)] text-foreground">
                  <span className="text-muted-foreground">
                    <AppBilingual pick={(c) => c.inventory.history.reasonLabel} />:
                  </span>{" "}
                  {event.reason}
                </p>
              ) : null}

              {event.correlationId ? (
                <p className="text-[length:var(--text-micro)] text-muted-foreground">
                  <AppBilingual pick={(c) => c.inventory.history.correlationLabel} />:{" "}
                  <span className="font-mono" dir="ltr">
                    {event.correlationId}
                  </span>
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
