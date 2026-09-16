import { AppBilingual } from "@/components/locale/app-bilingual";

/**
 * Feature 010 RUN E (T025/T026) — what the AUDITOR role can and cannot read under the LIVE policy set,
 * stated per surface (each line names a real, verified policy fact). Server Component, no control.
 */
export function AuditScopeNotes() {
  return (
    <section data-audit-scope className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
      <h2 className="text-[length:var(--text-small)] font-semibold text-foreground">
        <AppBilingual pick={(c) => c.admin.audit.scope.heading} />
      </h2>
      <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
        {(["listings", "custody", "log", "kyb", "finance", "disputes", "shipments"] as const).map((key) => (
          <li key={key} data-audit-scope-item={key}>
            <AppBilingual pick={(c) => c.admin.audit.scope[key]} />
          </li>
        ))}
      </ul>
    </section>
  );
}
