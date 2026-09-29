import type { Metadata } from "next";
import Link from "next/link";
import { AdminTicketQueue } from "@/components/admin/messaging/admin-ticket-queue";
import { PageHeader } from "@/components/app/page-header";
import { StateScreen } from "@/components/layout/state-screen";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { getRequestIdentity } from "@/lib/auth/dal";
import { listAdminTickets } from "@/lib/messaging/tickets";
import { SUPPORT_TICKET_STATUSES, type SupportTicketStatus } from "@/lib/messaging/types";

export const metadata: Metadata = {
  title: "Support Queue — Operations Console",
};

interface AdminMessagesPageProps {
  searchParams?: Promise<{
    status?: string;
    priority?: string;
    page?: string;
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
  const statusFilter = SUPPORT_TICKET_STATUSES.find((value) => value === statusParam) as SupportTicketStatus | undefined;
  const requestedPage = Number(resolvedParams?.page ?? 0);
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 ? Math.min(requestedPage, 10000) : 0;

  const tickets = await listAdminTickets({
    status: statusFilter,
    page,
  });
  const hasMore = tickets.length > 25;
  const pageHref = (target: number) => `/dashboard-admin/messages/?${new URLSearchParams({ ...(statusFilter ? { status: statusFilter } : {}), page: String(target) })}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.supportMessaging.adminTitle} />}
        description={<AppBilingual pick={(c) => c.supportMessaging.adminDescription} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.adminWorkspace} />, href: "/dashboard-admin" },
          { label: <AppBilingual pick={(c) => c.supportMessaging.adminTitle} /> },
        ]}
      />

      <AdminTicketQueue tickets={tickets.slice(0, 25)} currentStatus={statusParam} />
      {(page > 0 || hasMore) ? (
        <nav className="flex flex-wrap items-center justify-between gap-3">
          {page > 0 ? <Link href={pageHref(page - 1)} className="min-h-11 rounded-[var(--radius-sm)] px-3 py-2 text-sm underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"><AppBilingual pick={(c) => c.supportMessaging.previousPage} /></Link> : <span />}
          {hasMore ? <Link href={pageHref(page + 1)} className="min-h-11 rounded-[var(--radius-sm)] px-3 py-2 text-sm underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"><AppBilingual pick={(c) => c.supportMessaging.nextPage} /></Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
