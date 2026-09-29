import Link from "next/link";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { TicketStatusPill } from "@/components/messaging/ticket-status-pill";
import { Icon } from "@/components/ui/icon";
import type { SupportTicketListItemDTO } from "@/lib/messaging/types";

export function TicketList({ tickets }: { tickets: SupportTicketListItemDTO[] }) {
  if (tickets.length === 0) {
    return (
      <div
        data-slot="tickets-empty"
        className="flex min-h-48 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-8 text-center"
      >
        <Icon name="message-circle" className="mb-4 size-10 text-muted-foreground" />
        <h3 className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.supportMessaging.empty.title} />
        </h3>
        <p className="mt-2 max-w-[50ch] text-sm text-muted-foreground">
          <AppBilingual pick={(c) => c.supportMessaging.empty.description} />
        </p>
      </div>
    );
  }

  return (
    <ol data-slot="ticket-list" className="flex flex-col gap-3">
      {tickets.map((ticket) => (
        <li key={ticket.id} data-slot="ticket-item">
          <Link
            href={`/dashboard/messages/${ticket.id}/`}
            className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-card p-4 transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[color-mix(in_srgb,var(--card),var(--brand-primary)_2%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  data-slot="ticket-code-badge"
                  dir="ltr"
                  className="font-mono text-sm font-bold text-foreground"
                >
                  {ticket.ticketCode}
                </span>
                <TicketStatusPill status={ticket.status} />
                {ticket.orderCodeSnapshot && (
                  <span dir="ltr" className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-[length:var(--text-micro)] text-muted-foreground">
                    <Icon name="package" className="size-3" />
                    {ticket.orderCodeSnapshot}
                  </span>
                )}
              </div>

              <span className="text-[length:var(--text-micro)] text-muted-foreground">
                <AdminDateTime value={ticket.updatedAt} fallback="—" />
              </span>
            </div>

            <p className="text-sm font-medium text-foreground line-clamp-1">
              {ticket.subject}
            </p>
          </Link>
        </li>
      ))}
    </ol>
  );
}
