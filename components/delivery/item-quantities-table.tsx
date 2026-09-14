import { AppBilingual } from "@/components/locale/app-bilingual";
import { TableCardList, type TableCardListColumn } from "@/components/dashboard/responsive/table-card-list";
import { appCopy } from "@/lib/app/copy";
import type { ShipmentItemDTO } from "@/lib/delivery/types";
import type { OrderItemDTO } from "@/lib/orders/validation";

/**
 * Feature 009 RUN C (T021) — per-item planned vs. delivered quantities. Reuses
 * `TableCardList` (the project's ONE responsive table/card primitive, Feature 004 T007) rather than
 * a bespoke table — a real `<table>` at `lg:` and above, a stacked card list below it, from the same
 * data. Quantities always carry their unit (`kg`, FR-013); partial delivery is never visually
 * indistinguishable from a complete one — the progress column text differs, and delivered quantity
 * for a partial row is always strictly less than planned.
 *
 * A Server Component (no client hook) rendering BOTH languages via `<AppBilingual>` for every label —
 * `appCopy` (English-only) is used ONLY for the visually-hidden table `caption`, matching
 * `src/app/dashboard/orders/page.tsx`'s own established precedent for that one attribute-shaped use.
 */
export function ItemQuantitiesTable({ items, orderItems }: { items: readonly ShipmentItemDTO[]; orderItems: readonly OrderItemDTO[] }) {
  const orderItemById = new Map(orderItems.map((item) => [item.id, item]));

  const columns: TableCardListColumn<ShipmentItemDTO>[] = [
    {
      key: "item",
      header: <AppBilingual pick={(c) => c.deliveries.detail.itemsTable.item} />,
      primary: true,
      render: (row) => <span className="text-foreground">{orderItemById.get(row.orderItemId)?.productNameSnapshot ?? row.orderItemId}</span>,
    },
    {
      key: "planned",
      header: <AppBilingual pick={(c) => c.deliveries.detail.itemsTable.planned} />,
      render: (row) => (
        <span className="font-mono tabular-nums text-foreground" dir="ltr">
          {row.plannedQuantityKg} kg
        </span>
      ),
    },
    {
      key: "delivered",
      header: <AppBilingual pick={(c) => c.deliveries.detail.itemsTable.delivered} />,
      render: (row) => (
        <span className="font-mono tabular-nums text-foreground" dir="ltr">
          {row.deliveredQuantityKg} kg
        </span>
      ),
    },
    {
      key: "progress",
      header: <AppBilingual pick={(c) => c.deliveries.detail.itemsTable.progress} />,
      render: (row) => (
        <span className="text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual
            pick={(c) => {
              const t = c.deliveries.detail.itemsTable;
              return row.deliveredQuantityKg <= 0 ? t.notStarted : row.deliveredQuantityKg < row.plannedQuantityKg ? t.partial : t.complete;
            }}
          />
        </span>
      ),
    },
  ];

  return <TableCardList columns={columns} rows={items} getRowKey={(row) => row.id} caption={appCopy.deliveries.detail.itemsHeading} />;
}
