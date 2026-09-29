import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminThreadView } from "@/components/admin/messaging/admin-thread-view";
import { PageHeader } from "@/components/app/page-header";
import { StateScreen } from "@/components/layout/state-screen";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getSupportTicketDetail } from "@/lib/messaging/tickets";

export const metadata: Metadata = {
  title: "Ticket Details — Operations Console",
};

interface AdminTicketDetailPageProps {
  params: Promise<{
    ticketId: string;
  }>;
}

export default async function AdminTicketDetailPage({ params }: AdminTicketDetailPageProps) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.operationalRoles.includes("ADMIN") && !identity.operationalRoles.includes("SUPER_ADMIN")) {
    return <StateScreen kind="forbidden" />;
  }

  const { ticketId } = await params;
  const ticket = await getSupportTicketDetail(ticketId, "admin");

  if (!ticket) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={ticket.ticketCode}
        description={ticket.subject}
        trail={[
          { label: "Console", href: "/dashboard-admin" },
          { label: "Support Queue", href: "/dashboard-admin/messages" },
          { label: ticket.ticketCode },
        ]}
      />

      <AdminThreadView ticket={ticket} />
    </div>
  );
}
