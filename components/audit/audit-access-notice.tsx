import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";
import type { AuditLogAccess } from "@/lib/audit/access";

/**
 * Feature 012 RUN C (T015) — the explanation a surface shows INSTEAD of an audit-log list whenever
 * `resolveAuditLogAccess()` did not return rows. For DB-OPEN-06 it says plainly that the Auditor role
 * cannot read the log and that this is not "no activity". Renders nothing for a readable state (the
 * caller renders the rows). Read-only; no action.
 */
export function AuditAccessNotice({ access }: { access: AuditLogAccess }) {
  if (access.status === "readable") return null;
  return (
    <section data-slot="audit-access-notice" data-status={access.status} data-blocker={access.status === "limited" ? access.blocker : undefined} aria-labelledby="audit-access-heading" className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[var(--radius-lg)] border border-[var(--info)] bg-[var(--info-surface)] p-4 text-sm text-foreground">
      <Icon name="alert-circle" className="mt-0.5 size-5 text-[var(--info)]" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 id="audit-access-heading" className="font-semibold">
          <AppBilingual pick={(c) => c.auditAccess.heading} />
        </h2>
        <p>
          <AppBilingual pick={(c) => (access.status === "limited" ? c.auditAccess.auditorLimitation : access.status === "unavailable" ? c.auditAccess.unavailable : c.auditAccess.notPermitted)} />
        </p>
      </div>
    </section>
  );
}
