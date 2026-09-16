import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AuditLogPanel } from "@/components/admin/audit/audit-log-panel";
import { AuditReadOnlyBanner } from "@/components/admin/audit/read-only-banner";
import { AuditScopeNotes } from "@/components/admin/audit/scope-notes";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { StorageStatusBadge } from "@/components/inventory/storage-status-badge";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { listAuditAllocations, listAuditListings, listAuditPositions, probeAuditLog, type AuditListingRow } from "@/lib/admin/audit";
import { checkAreaAccess } from "@/lib/admin/guards";
import { formatMoney, formatQuantity } from "@/lib/dashboard/format";
import type { InventoryPosition, StorageAllocation } from "@/lib/inventory/types";

/**
 * Feature 010 RUN E (T025/T026) — the Audit area: read-only by construction. This route imports no
 * Server Action and renders no form, button-with-handler, or mutation panel; every row is a persisted
 * record the AUDITOR role may read under the live policy set (`lib/admin/audit.ts`). The page
 * re-verifies `is_auditor()` itself. The audit-log view states DB-OPEN-06 honestly (T026).
 */
const VIEWS = ["listings", "custody", "log"] as const;
type View = (typeof VIEWS)[number];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  const access = await checkAreaAccess("audit");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_auditor" />;

  const params = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(params.view ?? "") ? (params.view as View) : "listings";
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);
  const isPlatformAdmin = access.roles.includes("ADMIN") || access.roles.includes("SUPER_ADMIN");

  let listings: Awaited<ReturnType<typeof listAuditListings>> | null = null;
  let positions: Awaited<ReturnType<typeof listAuditPositions>> | null = null;
  let allocations: Awaited<ReturnType<typeof listAuditAllocations>> | null = null;
  let log: Awaited<ReturnType<typeof probeAuditLog>> | null = null;
  try {
    if (view === "listings") listings = await listAuditListings({ page });
    if (view === "custody") [positions, allocations] = await Promise.all([listAuditPositions({ page }), listAuditAllocations({ page })]);
    if (view === "log") log = await probeAuditLog({ isPlatformAdmin });
  } catch {
    listings = null;
    positions = null;
    allocations = null;
    log = null;
  }
  const loadFailed = (view === "listings" && listings === null) || (view === "custody" && (positions === null || allocations === null)) || (view === "log" && log === null);
  const href = (target: View, targetPage = 0) => `/dashboard-admin/audit${target === "listings" ? "" : `?view=${target}`}${targetPage > 0 ? `${target === "listings" ? "?" : "&"}page=${targetPage}` : ""}`;

  const listingColumns = [
    {
      key: "listing",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.audit.listings.columns.listing} />,
      render: (row: AuditListingRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground [overflow-wrap:anywhere]">{row.title}</span>
          <span className="break-all font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
            {row.id}
          </span>
        </span>
      ),
    },
    {
      key: "seller",
      header: <AppBilingual pick={(c) => c.admin.audit.listings.columns.seller} />,
      render: (row: AuditListingRow) =>
        row.sellerType === "HILLS" ? <AppBilingual pick={(c) => c.admin.compliance.listings.hillsSeller} /> : row.sellerOrganizationName ?? <span className="text-[length:var(--text-micro)] text-muted-foreground" data-organization-gap><AppBilingual pick={(c) => c.admin.audit.listings.sellerUnavailable} /></span>,
    },
    { key: "status", header: <AppBilingual pick={(c) => c.admin.audit.listings.columns.status} />, render: (row: AuditListingRow) => <ListingStatusBadge status={row.status} /> },
    { key: "quantity", header: <AppBilingual pick={(c) => c.admin.audit.listings.columns.quantity} />, render: (row: AuditListingRow) => <span className="tabular-nums" dir="ltr">{formatQuantity(row.quantityKg, "kg")} · {formatMoney(row.pricePerKg, row.currency, "kg")}</span> },
    { key: "updated", header: <AppBilingual pick={(c) => c.admin.audit.listings.columns.updated} />, render: (row: AuditListingRow) => <AdminDateTime value={row.updatedAt} fallback="—" /> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.audit.listings.columns.open} />,
      render: (row: AuditListingRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/audit/listings/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.audit.listings.columns.open} />
        </Button>
      ),
    },
  ];

  const kg = (value: number, attr: Record<string, number>) => (
    <span className="font-mono tabular-nums" dir="ltr" {...attr}>
      {formatQuantity(value, "kg")}
    </span>
  );
  const positionColumns = [
    { key: "lot", primary: true, header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.lot} />, render: (row: InventoryPosition) => <span className="break-all font-mono text-[length:var(--text-micro)]" dir="ltr">{row.lot ? `${row.lot.lotCode} · ` : ""}{row.lotId}</span> },
    { key: "owner", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.owner} />, render: (row: InventoryPosition) => <span className="break-all font-mono text-[length:var(--text-micro)]" dir="ltr">{row.ownerOrganizationId}</span> },
    { key: "warehouse", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.warehouse} />, render: (row: InventoryPosition) => <span>{row.warehouse?.name ?? row.warehouseId}</span> },
    { key: "onHand", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.onHand} />, render: (row: InventoryPosition) => kg(row.availableQuantityKg, { "data-on-hand": row.availableQuantityKg }) },
    { key: "reserved", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.reserved} />, render: (row: InventoryPosition) => kg(row.reservedQuantityKg, { "data-reserved": row.reservedQuantityKg }) },
    { key: "updated", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.updated} />, render: (row: InventoryPosition) => <AdminDateTime value={row.updatedAt} fallback="—" /> },
  ];
  const allocationColumns = [
    { key: "lot", primary: true, header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.lot} />, render: (row: StorageAllocation) => <span className="break-all font-mono text-[length:var(--text-micro)]" dir="ltr">{row.lotId}</span> },
    { key: "owner", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.owner} />, render: (row: StorageAllocation) => <span className="break-all font-mono text-[length:var(--text-micro)]" dir="ltr">{row.ownerOrganizationId}</span> },
    { key: "status", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.status} />, render: (row: StorageAllocation) => <StorageStatusBadge status={row.status} /> },
    { key: "allocated", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.allocated} />, render: (row: StorageAllocation) => kg(row.quantityKg, {}) },
    { key: "released", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.released} />, render: (row: StorageAllocation) => kg(row.releasedQuantityKg, {}) },
    { key: "started", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.started} />, render: (row: StorageAllocation) => <AdminDateTime value={row.startedAt} fallback="—" /> },
  ];

  const hasMore = view === "listings" ? (listings?.hasMore ?? false) : view === "custody" ? ((positions?.hasMore ?? false) || (allocations?.hasMore ?? false)) : false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.audit.title} />}
        description={<AppBilingual pick={(c) => c.admin.audit.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.groups.audit} /> }, { label: <AppBilingual pick={(c) => c.admin.audit.breadcrumb} /> }]}
        actions={
          <nav aria-label={appCopy.admin.audit.title} className="flex flex-wrap gap-2" data-audit-view={view}>
            {VIEWS.map((value) => (
              <Button key={value} variant={view === value ? "primary" : "outline"} size="sm" nativeButton={false} aria-current={view === value ? "page" : undefined} render={<Link href={href(value)} />}>
                <AppBilingual pick={(c) => c.admin.audit.views[value]} />
              </Button>
            ))}
          </nav>
        }
      />
      <AuditReadOnlyBanner />

      {loadFailed ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.warehouse.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.warehouse.common.loadError.description} />} />
      ) : view === "listings" && listings ? (
        <TableCardList columns={listingColumns} rows={listings.rows} getRowKey={(row) => row.id} caption={appCopy.admin.audit.listings.caption} emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.audit.listings.empty.title} />} description={<AppBilingual pick={(c) => c.admin.audit.listings.empty.description} />} />} />
      ) : view === "custody" && positions && allocations ? (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.admin.audit.custody.caption} />
            </h2>
            <p className="text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.audit.custody.lead} />
            </p>
            <TableCardList columns={positionColumns} rows={positions.rows} getRowKey={(row) => row.id} caption={appCopy.admin.audit.custody.caption} emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.empty.title} />} description={<AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.empty.description} />} />} />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.admin.audit.custody.allocationsCaption} />
            </h2>
            <TableCardList columns={allocationColumns} rows={allocations.rows} getRowKey={(row) => row.id} caption={appCopy.admin.audit.custody.allocationsCaption} emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.empty.title} />} description={<AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.empty.description} />} />} />
          </section>
        </div>
      ) : log ? (
        <AuditLogPanel probe={log} />
      ) : null}

      {!loadFailed && (hasMore || page > 0) ? (
        <div className="flex justify-end gap-2">
          {page > 0 ? (
            <Button variant="outline" size="sm" nativeButton={false} aria-label={appCopy.admin.warehouse.common.previous} render={<Link href={href(view, page - 1)} />}>
              ‹
            </Button>
          ) : null}
          {hasMore ? (
            <Button variant="outline" size="sm" nativeButton={false} aria-label={appCopy.admin.warehouse.common.next} render={<Link href={href(view, page + 1)} />}>
              ›
            </Button>
          ) : null}
        </div>
      ) : null}

      <AuditScopeNotes />
    </div>
  );
}
