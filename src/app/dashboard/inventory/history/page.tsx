import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { LedgerTimeline } from "@/components/inventory/ledger-timeline";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getOwnershipEvents } from "@/lib/inventory/ownership";

export const metadata: Metadata = {
  title: "Ownership history",
};

const PAGE_SIZE = 25;

/**
 * Feature 005 RUN B (T011) — read-only ownership ledger view.
 *
 * Reads exclusively through `lib/inventory/ownership.ts` (FR-001). No mutation affordance exists
 * anywhere on this page or in `components/inventory/ledger-timeline.tsx` (LOT-03) — the database's
 * `prevent_ownership_event_mutation` trigger is the real, only enforcement.
 */
export default async function OwnershipHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);

  const { rows, hasMore } = await getOwnershipEvents({
    organizationId: identity.organization.organizationId,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.inventory.history.title} />}
        description={<AppBilingual pick={(c) => c.inventory.history.description} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.inventory.history.breadcrumb} />, href: "/dashboard/inventory" },
          { label: <AppBilingual pick={(c) => c.inventory.history.title} /> },
        ]}
      />

      {rows.length === 0 && page === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-card p-8 text-center">
          <h2 className="hc-heading-4 font-semibold text-foreground">
            <AppBilingual pick={(c) => c.inventory.history.empty.title} />
          </h2>
          <p className="mt-2 text-[length:var(--text-small)] text-muted-foreground">
            <AppBilingual pick={(c) => c.inventory.history.empty.description} />
          </p>
        </div>
      ) : (
        <>
          <LedgerTimeline events={rows} />

          {page > 0 || hasMore ? (
            <div className="flex items-center justify-between gap-4">
              {page > 0 ? (
                <Button variant="outline" render={<Link href={`/dashboard/inventory/history?page=${page - 1}`} />}>
                  <AppBilingual pick={(c) => c.inventory.list.pagination.previous} />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <AppBilingual pick={(c) => c.inventory.list.pagination.previous} />
                </Button>
              )}
              <span className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.inventory.list.pagination.pageLabel.replace("{page}", String(page + 1))} />
              </span>
              {hasMore ? (
                <Button variant="outline" render={<Link href={`/dashboard/inventory/history?page=${page + 1}`} />}>
                  <AppBilingual pick={(c) => c.inventory.list.pagination.next} />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <AppBilingual pick={(c) => c.inventory.list.pagination.next} />
                </Button>
              )}
            </div>
          ) : null}

          <p className="text-[length:var(--text-small)] text-muted-foreground">
            <AppBilingual pick={(c) => c.inventory.history.immutableNote} />
          </p>
        </>
      )}
    </div>
  );
}
