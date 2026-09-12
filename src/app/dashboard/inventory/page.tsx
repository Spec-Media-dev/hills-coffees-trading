import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { TableCardList, type TableCardListColumn } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getInventoryPositions } from "@/lib/inventory/positions";
import type { InventoryPosition } from "@/lib/inventory/types";

export const metadata: Metadata = {
  title: "Inventory",
  // Feature 004 T008 precedent: noindex is declared once at `dashboard/layout.tsx`; SEC-004/FR-015
  // still hold for this route (private member inventory), inherited automatically.
};

const PAGE_SIZE = 25;

/**
 * Feature 005 RUN B (T007) — member inventory positions list.
 *
 * INDEPENDENTLY RE-VERIFIES authorization (same rule every other `/dashboard/*` page follows,
 * documented at `src/app/dashboard/page.tsx`): a parent layout returning something other than
 * `{children}` does not stop this page's own Server Component execution.
 *
 * Reads exclusively through `lib/inventory/positions.ts` (FR-001) — no ad-hoc query against
 * `inventory_positions` lives here. `organizationId` is the caller's already-resolved ACTING
 * organization (`identity.organization.organizationId`), never a client-supplied value.
 */
export default async function InventoryListPage({
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

  const { rows, hasMore } = await getInventoryPositions({
    organizationId: identity.organization.organizationId,
    page,
    pageSize: PAGE_SIZE,
  });

  const columns: TableCardListColumn<InventoryPosition>[] = [
    {
      key: "lot",
      header: <AppBilingual pick={(c) => c.inventory.list.columns.lot} />,
      primary: true,
      render: (row) =>
        row.lot ? (
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{row.lot.lotCode}</span>
            {row.lot.coffeeName ? <span className="text-muted-foreground">{row.lot.coffeeName}</span> : null}
          </div>
        ) : (
          <span className="text-muted-foreground">
            <AppBilingual pick={(c) => c.inventory.list.lotUnavailable} />
          </span>
        ),
    },
    {
      key: "warehouse",
      header: <AppBilingual pick={(c) => c.inventory.list.columns.warehouse} />,
      render: (row) =>
        row.warehouse ? (
          <span>
            {row.warehouse.name}
            {row.warehouse.city ? ` · ${row.warehouse.city}` : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">
            <AppBilingual pick={(c) => c.inventory.list.warehouseUnavailable} />
          </span>
        ),
    },
    {
      key: "owned",
      header: <AppBilingual pick={(c) => c.inventory.list.columns.ownedQuantity} />,
      render: (row) => (
        <span className="font-mono tabular-nums" dir="ltr">
          {row.availableQuantityKg} kg
        </span>
      ),
    },
    {
      key: "reserved",
      header: <AppBilingual pick={(c) => c.inventory.list.columns.reservedQuantity} />,
      render: (row) => (
        <span className="font-mono tabular-nums" dir="ltr">
          {row.reservedQuantityKg} kg
        </span>
      ),
    },
    {
      key: "action",
      header: (
        <span className="sr-only">
          <AppBilingual pick={(c) => c.inventory.list.columns.actions} />
        </span>
      ),
      render: (row) => (
        <Link
          href={`/dashboard/inventory/${row.id}`}
          className="inline-flex min-h-11 min-w-11 items-center rounded-[var(--radius-sm)] px-1 text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <AppBilingual pick={(c) => c.inventory.list.viewDetails} />
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.inventory.list.title} />}
        description={<AppBilingual pick={(c) => c.inventory.list.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.inventory.list.title} /> }]}
        actions={
          <Button variant="outline" render={<Link href="/dashboard/inventory/history" />}>
            <AppBilingual pick={(c) => c.inventory.history.title} />
          </Button>
        }
      />

      {rows.length === 0 && page === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-card p-8 text-center">
          <h2 className="hc-heading-4 font-semibold text-foreground">
            <AppBilingual pick={(c) => c.inventory.list.empty.title} />
          </h2>
          <p className="mt-2 text-[length:var(--text-small)] text-muted-foreground">
            <AppBilingual pick={(c) => c.inventory.list.empty.description} />
          </p>
        </div>
      ) : (
        <>
          <TableCardList
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            caption={appCopy.inventory.list.caption}
          />

          {page > 0 || hasMore ? (
            <div className="flex items-center justify-between gap-4">
              {page > 0 ? (
                <Button variant="outline" render={<Link href={`/dashboard/inventory?page=${page - 1}`} />}>
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
                <Button variant="outline" render={<Link href={`/dashboard/inventory?page=${page + 1}`} />}>
                  <AppBilingual pick={(c) => c.inventory.list.pagination.next} />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <AppBilingual pick={(c) => c.inventory.list.pagination.next} />
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
