import { AdminStatusBadge } from "@/components/admin/compliance/status-badge";
import { AppBilingual, type AppCopySelector } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";
import type { CommissionPolicyStatus, PlatformAdminRole } from "@/lib/admin/system-validation";

/**
 * Feature 010 RUN F — the system area's recorded-fact notices. Each one names a real, verified
 * property of the approved schema or an open item; none simulates a capability:
 *   FutureOnlyNotice       — T028/T044: changes affect eligible future checkouts only.
 *   AttributionGapNotice   — UPDATE actor not persisted (no updated_by, no audit trigger) — D2 (ii).
 *   HighRiskNotice         — T029 / OPS-01: single actor, no maker-checker, not simulated.
 *   ShippingUnconsumedNotice — no checkout/shipment path reads `shipping_rules` today.
 */

function Notice({ tone, icon, title, description, dataKey }: { tone: "info" | "warning" | "danger"; icon: "clock" | "shield" | "warning"; title: AppCopySelector; description: AppCopySelector; dataKey: string }) {
  const toneClass = tone === "danger" ? "border-[var(--status-danger)] bg-[var(--status-danger-surface)]" : tone === "warning" ? "border-[var(--status-pending)] bg-[var(--status-pending-surface)]" : "border-border bg-[var(--surface-subtle)]";
  return (
    <section data-system-notice={dataKey} className={`flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 ${toneClass}`}>
      <span aria-hidden="true" className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[var(--surface-card)] text-foreground">
        <Icon name={icon} className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[length:var(--text-small)] font-semibold text-foreground">
          <AppBilingual pick={title} />
        </p>
        <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
          <AppBilingual pick={description} />
        </p>
      </div>
    </section>
  );
}

export function FutureOnlyNotice() {
  return <Notice dataKey="future-only" tone="info" icon="clock" title={(c) => c.admin.system.common.futureOnlyTitle} description={(c) => c.admin.system.common.futureOnly} />;
}

export function AttributionGapNotice() {
  return (
    <p data-system-notice="attribution-gap" className="rounded-[var(--radius-md)] border border-dashed border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-micro)] leading-[var(--lh-body)] text-muted-foreground">
      <AppBilingual pick={(c) => c.admin.system.common.attributionGap} />
    </p>
  );
}

export function HighRiskNotice() {
  return (
    <div className="flex flex-col gap-3">
      <Notice dataKey="high-risk" tone="danger" icon="warning" title={(c) => c.admin.system.paymentAccounts.highRisk.title} description={(c) => c.admin.system.paymentAccounts.highRisk.description} />
      <Notice dataKey="ops-01" tone="warning" icon="shield" title={(c) => c.admin.system.paymentAccounts.dualControl.title} description={(c) => c.admin.system.paymentAccounts.dualControl.description} />
    </div>
  );
}

export function ShippingUnconsumedNotice() {
  return <Notice dataKey="shipping-unconsumed" tone="warning" icon="warning" title={(c) => c.admin.system.shipping.unconsumed.title} description={(c) => c.admin.system.shipping.unconsumed.description} />;
}

export function NoDeleteNote() {
  return (
    <p className="text-[length:var(--text-micro)] text-muted-foreground">
      <AppBilingual pick={(c) => c.admin.system.common.noDeleteNote} />
    </p>
  );
}

export function CommissionPolicyStatusBadge({ status }: { status: CommissionPolicyStatus }) {
  const tone = status === "ACTIVE" ? "paid" : status === "ARCHIVED" ? "cancelled" : "draft";
  return <AdminStatusBadge status={status} tone={tone} pick={(c) => c.admin.system.commission.statuses[status] ?? status} />;
}

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return <AdminStatusBadge status={isActive ? "ACTIVE" : "INACTIVE"} tone={isActive ? "paid" : "cancelled"} pick={(c) => (isActive ? c.admin.system.common.active : c.admin.system.common.inactive)} />;
}

export function RoleBadge({ role }: { role: PlatformAdminRole }) {
  return <AdminStatusBadge status={role} tone={role === "SUPER_ADMIN" ? "paid" : role === "ADMIN" ? "review" : "draft"} pick={(c) => c.admin.system.roles.roleLabels[role] ?? role} />;
}
