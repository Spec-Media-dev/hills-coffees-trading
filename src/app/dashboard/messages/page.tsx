import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { StateScreen } from "@/components/layout/state-screen";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { NewTicketModal } from "@/components/messaging/new-ticket-modal";
import { TicketList } from "@/components/messaging/ticket-list";
import { getRequestIdentity } from "@/lib/auth/dal";
import { listMemberTickets } from "@/lib/messaging/tickets";
import type { SupportTicketStatus } from "@/lib/messaging/types";

export const metadata: Metadata = {
  title: "Support & Messages",
};

interface MessagesPageProps {
  searchParams?: Promise<{
    new?: string;
    orderId?: string;
    orderCode?: string;
    status?: string;
  }>;
}

export default async function MessagesPage({ searchParams }: MessagesPageProps) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const resolvedParams = searchParams ? await searchParams : undefined;
  const initialOpen = resolvedParams?.new === "1";
  const initialOrderId = resolvedParams?.orderId;
  const initialOrderCode = resolvedParams?.orderCode;
  const statusFilter = resolvedParams?.status as SupportTicketStatus | undefined;

  const tickets = await listMemberTickets({
    organizationId: identity.organization.organizationId,
    status: statusFilter,
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={<AppBilingual pick={(c) => c.supportMessaging.title} />}
        description={<AppBilingual pick={(c) => c.supportMessaging.description} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.supportMessaging.breadcrumb} /> },
        ]}
        actions={
          <NewTicketModal
            initialOpen={initialOpen}
            initialOrderId={initialOrderId}
            initialOrderCode={initialOrderCode}
          />
        }
      />

      <section aria-labelledby="messages-list-heading" className="flex flex-col gap-4">
        <h2 id="messages-list-heading" className="sr-only">
          <AppBilingual pick={(c) => c.supportMessaging.breadcrumb} />
        </h2>
        <TicketList tickets={tickets} />
      </section>
    </div>
  );
}
