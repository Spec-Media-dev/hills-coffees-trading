import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { PageHeader } from "@/components/app/page-header";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { appCopy } from "@/lib/app/copy";
import { Button } from "@/components/ui/button";
import { listListingsForReview, type ListingReviewRow } from "@/lib/admin/compliance";
import { checkAreaAccess } from "@/lib/admin/guards";
import { formatMoney, formatQuantity } from "@/lib/dashboard/format";

/**
 * Feature 010 RUN B (T011) — the Compliance listing-review queue: listings awaiting a decision
 * (PENDING_REVIEW) plus live listings that may be suspended (PUBLISHED / PARTIALLY_FILLED) and
 * already-suspended ones. Reads `coffee_offers` under `offers_compliance_read`; reuses Feature 006's
 * own `ListingStatusBadge` and the shared money/quantity formatters (currency and unit always shown).
 */
export default async function ListingReviewQueuePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const access = await checkAreaAccess("listings");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_compliance_operator" />;

  const page = Math.max(0, Number.parseInt((await searchParams).page ?? "0", 10) || 0);
  let result: Awaited<ReturnType<typeof listListingsForReview>> | null = null;
  try {
    result = await listListingsForReview({ page });
  } catch {
    result = null;
  }

  const columns = [
    {
      key: "listing",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.compliance.listings.columns.listing} />,
      render: (row: ListingReviewRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{row.title}</span>
          <span className="font-mono text-[length:var(--text-micro)] text-muted-foreground">{row.id}</span>
        </span>
      ),
    },
    {
      key: "seller",
      header: <AppBilingual pick={(c) => c.admin.compliance.listings.columns.seller} />,
      render: (row: ListingReviewRow) =>
        row.sellerType === "HILLS" ? (
          <AppBilingual pick={(c) => c.admin.compliance.listings.hillsSeller} />
        ) : row.sellerOrganizationName ? (
          row.sellerOrganizationName
        ) : (
          <span className="text-[length:var(--text-micro)] text-muted-foreground">
            <AppBilingual pick={(c) => c.admin.compliance.listings.sellerUnavailable} />
          </span>
        ),
    },
    { key: "status", header: <AppBilingual pick={(c) => c.admin.compliance.listings.columns.status} />, render: (row: ListingReviewRow) => <ListingStatusBadge status={row.status} /> },
    { key: "quantity", header: <AppBilingual pick={(c) => c.admin.compliance.listings.columns.quantity} />, render: (row: ListingReviewRow) => <span className="tabular-nums">{formatQuantity(row.quantityKg, "kg")}</span> },
    { key: "price", header: <AppBilingual pick={(c) => c.admin.compliance.listings.columns.price} />, render: (row: ListingReviewRow) => <span className="tabular-nums">{formatMoney(row.pricePerKg, row.currency, "kg")}</span> },
    { key: "updated", header: <AppBilingual pick={(c) => c.admin.compliance.listings.columns.updated} />, render: (row: ListingReviewRow) => <AdminDateTime value={row.updatedAt} fallback={<AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />} /> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.compliance.listings.columns.open} />,
      render: (row: ListingReviewRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/listings/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.compliance.listings.columns.open} />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.compliance.listings.title} />}
        description={<AppBilingual pick={(c) => c.admin.compliance.listings.description} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
          { label: <AppBilingual pick={(c) => c.admin.groups.compliance} /> },
          { label: <AppBilingual pick={(c) => c.admin.compliance.listings.breadcrumb} /> },
        ]}
      />
      {result === null ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.compliance.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.common.loadError.description} />} />
      ) : (
        <>
          <TableCardList
            columns={columns}
            rows={result.rows}
            getRowKey={(row) => row.id}
            caption={appCopy.admin.compliance.listings.title}
            emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.compliance.listings.empty.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.listings.empty.description} />} />}
          />
          {result.hasMore || page > 0 ? (
            <div className="flex justify-end gap-2">
              {page > 0 ? (
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/listings?page=${page - 1}`} />}>
                  ‹
                </Button>
              ) : null}
              {result.hasMore ? (
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/listings?page=${page + 1}`} />}>
                  ›
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
