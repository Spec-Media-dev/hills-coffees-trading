import type { Metadata } from "next";
import { AdminTicketQueue } from "@/components/admin/messaging/admin-ticket-queue";
import { PageHeader } from "@/components/app/page-header";
import { StateScreen } from "@/components/layout/state-screen";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { getRequestIdentity } from "@/lib/auth/dal";
import { listAdminTickets } from "@/lib/messaging/tickets";
import type { SupportTicketStatus } from "@/lib/messaging/types";

export const metadata: Metadata = {
  title: "Support Queue — Operations Console",
};

interface AdminMessagesPageProps {
  searchParams?: Promise<{
    status?: string;
    priority?: string;
  }>;
}

export default async function AdminMessagesPage({ searchParams }: AdminMessagesPageProps) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.operationalRoles.includes("ADMIN") && !identity.operationalRoles.includes("SUPER_ADMIN")) {
    return <StateScreen kind="forbidden" />;
  }

  const resolvedParams = searchParams ? await searchParams : undefined;
  const statusParam = resolvedParams?.status;
  const statusFilter =
    statusParam && statusParam !== "ALL" ? (statusParam as SupportTicketStatus) : undefined;

  const tickets = await listAdminTickets({
    status: statusFilter,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.supportMessaging.adminTitle} />}
        description={<AppBilingual pick={(c) => c.supportMessaging.adminDescription} />}
        trail={[
          { label: "Console", href: "/dashboard-admin" },
          { label: "Support Queue" },
        ]}
      />

      <AdminTicketQueue tickets={tickets} currentStatus={statusParam} />
    </div>
  );
}
