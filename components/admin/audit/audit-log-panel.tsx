import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";
import type { AuditLogProbe, AuditLogRow } from "@/lib/admin/audit";
import { appCopy } from "@/lib/app/copy";

/**
 * Feature 010 RUN E (T026) — the audit-log panel. When the role cannot read `audit_logs`
 * (DB-OPEN-06: `audit_admin_read` is `is_platform_admin()` only) it renders the recorded limitation —
 * an intentional, explained state, not an error and not an empty table. Read-only; no control.
 */
export function AuditLogPanel({ probe }: { probe: AuditLogProbe }) {
  if (!probe.readable) {
    return (
      <section data-admin-state="capability-gap" data-capability-gap="db-open-06" aria-labelledby="audit-log-gap-heading" className="rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-card)] p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-subtle)] text-foreground">
            <Icon name="clock" className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <h2 id="audit-log-gap-heading" className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.admin.audit.log.unavailableTitle} />
            </h2>
            <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.audit.log.unavailableDescription} />
            </p>
          </div>
        </div>
      </section>
    );
  }
  const columns = [
    { key: "when", primary: true, header: <AppBilingual pick={(c) => c.admin.audit.log.columns.when} />, render: (row: AuditLogRow) => <AdminDateTime value={row.createdAt} fallback="—" /> },
    { key: "actor", header: <AppBilingual pick={(c) => c.admin.audit.log.columns.actor} />, render: (row: AuditLogRow) => <span className="break-all font-mono text-[length:var(--text-micro)]" dir="ltr">{row.actorUserId ?? "—"}</span> },
    { key: "entity", header: <AppBilingual pick={(c) => c.admin.audit.log.columns.entity} />, render: (row: AuditLogRow) => <span className="flex flex-col"><span className="font-mono text-[length:var(--text-micro)]" dir="ltr">{row.entityType}</span><span className="break-all font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">{row.entityId ?? ""}</span></span> },
    { key: "action", header: <AppBilingual pick={(c) => c.admin.audit.log.columns.action} />, render: (row: AuditLogRow) => <span className="font-mono text-[length:var(--text-micro)]" dir="ltr">{row.action}</span> },
  ];
  return (
    <section data-audit-log className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
      <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
        <AppBilingual pick={(c) => c.admin.audit.log.heading} />
      </h2>
      <p className="text-[length:var(--text-small)] text-muted-foreground">
        <AppBilingual pick={(c) => c.admin.audit.log.availableNote} />
      </p>
      <TableCardList columns={columns} rows={probe.rows} getRowKey={(row) => String(row.id)} caption={appCopy.admin.audit.log.heading} emptyState={<p className="text-[length:var(--text-small)] text-muted-foreground"><AppBilingual pick={(c) => c.admin.audit.log.empty} /></p>} />
    </section>
  );
}
