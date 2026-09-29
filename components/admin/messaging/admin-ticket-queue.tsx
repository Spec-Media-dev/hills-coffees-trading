"use client";

import Link from "next/link";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { useLocale } from "@/components/locale/locale-provider";
import { TicketStatusPill } from "@/components/messaging/ticket-status-pill";
import { Icon } from "@/components/ui/icon";
import type { SupportTicketListItemDTO } from "@/lib/messaging/types";

export function AdminTicketQueue({
  tickets,
  currentStatus,
}: {
  tickets: SupportTicketListItemDTO[];
  currentStatus?: string;
}) {
  const { tApp } = useLocale();

  const statuses: Array<{ value: string; label: string }> = [
    { value: "ALL", label: tApp.supportMessaging.filterAll },
    { value: "OPEN", label: tApp.supportMessaging.status.OPEN },
    { value: "IN_PROGRESS", label: tApp.supportMessaging.status.IN_PROGRESS },
    { value: "RESOLVED", label: tApp.supportMessaging.status.RESOLVED },
    { value: "CLOSED", label: tApp.supportMessaging.status.CLOSED },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Status filter tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {statuses.map((tab) => {
          const isActive = (currentStatus ?? "ALL") === tab.value;
          const href = tab.value === "ALL" ? "/dashboard-admin/messages/" : `/dashboard-admin/messages/?status=${tab.value}`;
          return (
            <Link
              key={tab.value}
              href={href}
              className={`inline-flex min-h-9 items-center rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-[var(--brand-primary)] text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {tickets.length === 0 ? (
        <div data-slot="admin-tickets-empty" className="flex min-h-48 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-8 text-center">
          <Icon name="inbox" className="mb-4 size-8 text-muted-foreground" />
          <p className="font-semibold text-foreground">
            <AppBilingual pick={(c) => c.supportMessaging.noTicketsInQueue} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <AppBilingual pick={(c) => c.supportMessaging.noTicketsInQueueDesc} />
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-card shadow-xs">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start">
                  <AppBilingual pick={(c) => c.supportMessaging.queueColumns.reference} />
                </th>
                <th className="px-4 py-3 text-start">
                  <AppBilingual pick={(c) => c.supportMessaging.queueColumns.subject} />
                </th>
                <th className="px-4 py-3 text-start">
                  <AppBilingual pick={(c) => c.supportMessaging.queueColumns.status} />
                </th>
                <th className="px-4 py-3 text-start">
                  <AppBilingual pick={(c) => c.supportMessaging.queueColumns.priority} />
                </th>
                <th className="px-4 py-3 text-start">
                  <AppBilingual pick={(c) => c.supportMessaging.queueColumns.updated} />
                </th>
                <th className="px-4 py-3 text-end">
                  <AppBilingual pick={(c) => c.supportMessaging.queueColumns.action} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-muted/30">
                  <td dir="ltr" className="px-4 py-3 font-mono text-xs font-bold text-foreground">
                    {ticket.ticketCode}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">
                    {ticket.subject}
                    {ticket.orderCodeSnapshot && (
                      <span dir="ltr" className="ms-2 font-mono text-xs text-muted-foreground">
                        ({ticket.orderCodeSnapshot})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <TicketStatusPill status={ticket.status} />
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                    <AppBilingual pick={(c) => c.supportMessaging.priorities[ticket.priority]} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <AdminDateTime value={ticket.updatedAt} fallback="—" />
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/dashboard-admin/messages/${ticket.id}/`}
                      className="inline-flex min-h-8 items-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      <AppBilingual pick={(c) => c.supportMessaging.queueColumns.open} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
