import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList, type TableCardListColumn } from "@/components/dashboard/responsive/table-card-list";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getManagedListings } from "@/lib/listings/manage";
import type { ManagedListing } from "@/lib/listings/types";

export const metadata: Metadata = {
  title: "My listings",
};

const PAGE_SIZE = 25;

/**
 * Feature 006 RUN C (T016) — the seller's own listings, across ALL approved states.
 *
 * SECURITY: re-verifies `isAuthorizedMember` AND `organization.canSell` server-side, independent of
 * nav visibility (T020's own registry entry is presentational only — this route's guard is what
 * actually refuses a buyer-only organization). Reads exclusively through `lib/listings/manage.ts`
 * (T003) — never a raw `coffee_offers` query here; `organizationId` is the caller's already-resolved
 * ACTING organization, never a client-supplied value.
 */
export default async function SellerListingsPage({
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
  if (!identity.organization.canSell) {
    return (
      <StateScreen
        kind="forbidden"
        title={appCopy.listings.manage.capabilityRequired.title}
        description={appCopy.listings.manage.capabilityRequired.description}
      />
    );
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);

  const { rows, hasMore } = await getManagedListings({
    organizationId: identity.organization.organizationId,
    page,
    pageSize: PAGE_SIZE,
  });

  const columns: TableCardListColumn<ManagedListing>[] = [
    {
      key: "listing",
      header: <AppBilingual pick={(c) => c.listings.manage.columns.listing} />,
      primary: true,
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.title ?? row.coffeeName ?? row.lot?.lotCode ?? row.id}</span>
          {row.lot?.lotCode ? <span className="text-muted-foreground">{row.lot.lotCode}</span> : null}
        </div>
      ),
    },
    {
      key: "status",
      header: <AppBilingual pick={(c) => c.listings.manage.columns.status} />,
      render: (row) => <ListingStatusBadge status={row.status} />,
    },
    {
      key: "quantity",
      header: <AppBilingual pick={(c) => c.listings.manage.columns.quantity} />,
      render: (row) => (
        <span className="font-mono tabular-nums" dir="ltr">
          {row.quantityKg} kg
        </span>
      ),
    },
    {
      key: "price",
      header: <AppBilingual pick={(c) => c.listings.manage.columns.price} />,
      render: (row) => (
        <span className="font-mono tabular-nums" dir="ltr">
          {row.currency} {row.pricePerKg}
        </span>
      ),
    },
    {
      key: "updated",
      header: <AppBilingual pick={(c) => c.listings.manage.columns.updated} />,
      render: (row) => (
        <span className="text-muted-foreground" dir="ltr">
          {row.updatedAt}
        </span>
      ),
    },
    {
      key: "action",
      header: (
        <span className="sr-only">
          <AppBilingual pick={(c) => c.listings.manage.columns.actions} />
        </span>
      ),
      render: (row) => (
        <Link
          href={`/dashboard/listings/${row.id}`}
          className="inline-flex min-h-11 min-w-11 items-center rounded-[var(--radius-sm)] px-1 text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <AppBilingual pick={(c) => c.listings.manage.viewDetails} />
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.listings.manage.title} />}
        description={<AppBilingual pick={(c) => c.listings.manage.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.listings.manage.title} /> }]}
        actions={
          <Button render={<Link href="/dashboard/listings/new" />}>
            <AppBilingual pick={(c) => c.listings.manage.createAction} />
          </Button>
        }
      />

      {rows.length === 0 && page === 0 ? (
        <EmptyState
          title={appCopy.listings.manage.empty.title}
          description={appCopy.listings.manage.empty.description}
          action={
            <Button render={<Link href="/dashboard/listings/new" />}>
              <AppBilingual pick={(c) => c.listings.manage.createAction} />
            </Button>
          }
        />
      ) : (
        <>
          <TableCardList columns={columns} rows={rows} getRowKey={(row) => row.id} caption={appCopy.listings.manage.caption} />

          {page > 0 || hasMore ? (
            <div className="flex items-center justify-between gap-4">
              {page > 0 ? (
                <Button variant="outline" render={<Link href={`/dashboard/listings?page=${page - 1}`} />}>
                  <AppBilingual pick={(c) => c.listings.manage.pagination.previous} />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <AppBilingual pick={(c) => c.listings.manage.pagination.previous} />
                </Button>
              )}
              <span className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.listings.manage.pagination.pageLabel.replace("{page}", String(page + 1))} />
              </span>
              {hasMore ? (
                <Button variant="outline" render={<Link href={`/dashboard/listings?page=${page + 1}`} />}>
                  <AppBilingual pick={(c) => c.listings.manage.pagination.next} />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <AppBilingual pick={(c) => c.listings.manage.pagination.next} />
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
