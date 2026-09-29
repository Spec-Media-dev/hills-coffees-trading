import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { StateScreen } from "@/components/layout/state-screen";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { NewTicketModal } from "@/components/messaging/new-ticket-modal";
import { TicketList } from "@/components/messaging/ticket-list";
import { getRequestIdentity } from "@/lib/auth/dal";
import { listMemberTickets } from "@/lib/messaging/tickets";
import { createClient } from "@/lib/supabase/server";
import { SUPPORT_TICKET_STATUSES, type SupportTicketStatus } from "@/lib/messaging/types";

export const metadata: Metadata = {
  title: "Support & Messages",
};

interface MessagesPageProps {
  searchParams?: Promise<{
    new?: string;
    orderId?: string;
    status?: string;
    page?: string;
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
  let initialOrderId: string | undefined;
  let initialOrderCode: string | undefined;
  if (resolvedParams?.orderId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedParams.orderId)) {
    const supabase = await createClient();
    const { data: order } = await supabase.from("orders")
      .select("id, order_code, buyer_organization_id, seller_organization_id")
      .eq("id", resolvedParams.orderId).maybeSingle();
    if (order && [order.buyer_organization_id, order.seller_organization_id].includes(identity.organization.organizationId)) {
      initialOrderId = order.id;
      initialOrderCode = order.order_code;
    }
  }
  const statusFilter = SUPPORT_TICKET_STATUSES.find((value) => value === resolvedParams?.status) as SupportTicketStatus | undefined;
  const requestedPage = Number(resolvedParams?.page ?? 0);
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 ? Math.min(requestedPage, 10000) : 0;

  const tickets = await listMemberTickets({
    organizationId: identity.organization.organizationId,
    status: statusFilter,
    page,
  });
  const hasMore = tickets.length > 25;
  const pageHref = (target: number) => `/dashboard/messages/?${new URLSearchParams({ ...(statusFilter ? { status: statusFilter } : {}), page: String(target) })}`;

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
        <TicketList tickets={tickets.slice(0, 25)} />
        {(page > 0 || hasMore) ? (
          <nav className="flex flex-wrap items-center justify-between gap-3">
            {page > 0 ? <Link href={pageHref(page - 1)} className="min-h-11 rounded-[var(--radius-sm)] px-3 py-2 text-sm underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"><AppBilingual pick={(c) => c.supportMessaging.previousPage} /></Link> : <span />}
            {hasMore ? <Link href={pageHref(page + 1)} className="min-h-11 rounded-[var(--radius-sm)] px-3 py-2 text-sm underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"><AppBilingual pick={(c) => c.supportMessaging.nextPage} /></Link> : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
