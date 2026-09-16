import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";

/**
 * Feature 010 RUN E (T025) — the Audit area's read-only statement. Server Component; renders no
 * control. The whole `components/admin/audit/*` tree is built without any mutation affordance —
 * there is no button to disable, no form to hide, and no Server Action import anywhere in it.
 */
export function AuditReadOnlyBanner() {
  return (
    <div data-audit-read-only className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
      <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--surface-card)] text-foreground">
        <Icon name="shield" className="size-3.5" />
      </span>
      <p>
        <span className="me-2 inline-flex rounded-[var(--radius-pill)] bg-[var(--status-review-surface)] px-2 py-0.5 text-[length:var(--text-micro)] font-semibold text-[var(--status-review)]">
          <AppBilingual pick={(c) => c.admin.audit.readOnly} />
        </span>
        <AppBilingual pick={(c) => c.admin.audit.readOnlyNote} />
      </p>
    </div>
  );
}
