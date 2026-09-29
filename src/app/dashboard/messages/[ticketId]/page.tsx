import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { PageHeader } from "@/components/app/page-header";
import { StateScreen } from "@/components/layout/state-screen";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { ComposeBox } from "@/components/messaging/compose-box";
import { MessageThread } from "@/components/messaging/message-thread";
import { TicketStatusPill } from "@/components/messaging/ticket-status-pill";
import { Icon } from "@/components/ui/icon";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getSupportTicketDetail } from "@/lib/messaging/tickets";

export const metadata: Metadata = {
  title: "Ticket Details",
};

interface TicketDetailPageProps {
  params: Promise<{
    ticketId: string;
  }>;
}

export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const { ticketId } = await params;
  const ticket = await getSupportTicketDetail(ticketId);

  if (!ticket) {
    notFound();
  }

  const isClosed = ticket.status === "CLOSED";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={
          <div className="flex flex-wrap items-center gap-3">
            <span dir="ltr" className="font-mono text-xl font-bold tracking-tight text-foreground">
              {ticket.ticketCode}
            </span>
            <TicketStatusPill status={ticket.status} />
          </div>
        }
        description={ticket.subject}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.supportMessaging.breadcrumb} />, href: "/dashboard/messages" },
          { label: <span dir="ltr">{ticket.ticketCode}</span> },
        ]}
        actions={
          ticket.orderId && ticket.orderCodeSnapshot ? (
            <Link
              href={`/dashboard/orders/${ticket.orderId}/`}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-[color-mix(in_srgb,transparent,var(--forest-700)_8%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <Icon name="package" className="size-4" />
              <span dir="ltr"><AppBilingual pick={(c) => c.supportMessaging.orderReference} />: {ticket.orderCodeSnapshot}</span>
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[var(--radius-lg)] border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">
            <AppBilingual pick={(c) => c.supportMessaging.ticketReference} />:
          </span>
          <span dir="ltr" className="font-mono font-semibold text-foreground">{ticket.ticketCode}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">
            <AppBilingual pick={(c) => c.supportMessaging.priority} />:
          </span>
          <span className="font-semibold text-foreground">
            <AppBilingual pick={(c) => c.supportMessaging.priorities[ticket.priority]} />
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">
            <AppBilingual pick={(c) => c.notificationCenter.receivedLabel} />:
          </span>
          <AdminDateTime value={ticket.createdAt} fallback="—" />
        </div>
      </div>

      <section aria-labelledby="thread-heading" className="flex flex-col gap-6">
        <h2 id="thread-heading" className="sr-only">
          Conversation
        </h2>
        <MessageThread messages={ticket.messages} />
        <ComposeBox ticketId={ticket.id} isClosed={isClosed} />
      </section>
    </div>
  );
}
