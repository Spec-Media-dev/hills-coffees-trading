import { AdminStatusBadge, type AdminStatusTone } from "@/components/admin/compliance/status-badge";
import type { CoffeeStatus, OriginStatus } from "@/lib/admin/catalogue-validation";

/**
 * Feature 010 RUN E — catalogue status presentation over the database's own vocabularies
 * (`coffees_status_check`, `origins_status_check`, `warehouses.is_active`). Label + dot, never colour alone.
 */
const COFFEE_TONE: Record<CoffeeStatus, AdminStatusTone> = { DRAFT: "draft", PUBLISHED: "paid", ARCHIVED: "cancelled" };
const ORIGIN_TONE: Record<OriginStatus, AdminStatusTone> = { ACTIVE: "paid", INACTIVE: "pending", ARCHIVED: "cancelled" };

export function CoffeeStatusBadge({ status }: { status: CoffeeStatus }) {
  return <AdminStatusBadge status={status} tone={COFFEE_TONE[status] ?? "draft"} pick={(c) => c.admin.catalogue.statuses.coffee[status] ?? status} />;
}

export function OriginStatusBadge({ status }: { status: OriginStatus }) {
  return <AdminStatusBadge status={status} tone={ORIGIN_TONE[status] ?? "draft"} pick={(c) => c.admin.catalogue.statuses.origin[status] ?? status} />;
}

export function WarehouseActiveBadge({ isActive }: { isActive: boolean }) {
  return <AdminStatusBadge status={isActive ? "ACTIVE" : "INACTIVE"} tone={isActive ? "paid" : "cancelled"} pick={(c) => (isActive ? c.admin.catalogue.statuses.warehouse.active : c.admin.catalogue.statuses.warehouse.inactive)} />;
}
