import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { UntrustedText } from "@/components/disputes/untrusted-text";
import { AppBilingual } from "@/components/locale/app-bilingual";

/**
 * Feature 012 RUN B (T008) — read-only list of a dispute's evidence, role-agnostic (the caller maps
 * each row's uploader to `byViewer`, so no profile id is ever rendered). Shows exactly what the
 * database holds: the time, who added it (relative to the viewer), its type, and the note as inert
 * text. A row that references a file shows that the FILE ITSELF IS NOT AVAILABLE — files cannot be
 * stored (DB-BLOCK-01), so there is never a download/open control. No edit or delete affordance
 * exists in this component at all (evidence is append-only, FR-003).
 */
export type EvidenceListItem = {
  id: string;
  note: string | null;
  hasFileReference: boolean;
  byViewer: boolean;
  createdAt: string;
};

export function EvidenceList({ items }: { items: readonly EvidenceListItem[] }) {
  if (items.length === 0) {
    return (
      <p data-slot="evidence-empty" className="text-[length:var(--text-small)] text-muted-foreground">
        <AppBilingual pick={(c) => c.disputes.evidence.empty} />
      </p>
    );
  }

  return (
    <ol data-slot="evidence-list" className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} data-slot="evidence-item" className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border p-4">
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[length:var(--text-micro)] text-muted-foreground">
            <div className="flex gap-1.5">
              <dt>
                <AppBilingual pick={(c) => c.disputes.evidence.addedLabel} />:
              </dt>
              <dd className="text-foreground">
                <AdminDateTime value={item.createdAt} fallback="—" />
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>
                <AppBilingual pick={(c) => c.disputes.evidence.byLabel} />:
              </dt>
              <dd className="text-foreground">
                <AppBilingual pick={(c) => (item.byViewer ? c.disputes.evidence.uploadedByYou : c.disputes.evidence.uploadedByOther)} />
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>
                <AppBilingual pick={(c) => c.disputes.evidence.typeLabel} />:
              </dt>
              <dd className="text-foreground">
                <AppBilingual pick={(c) => (item.hasFileReference ? c.disputes.evidence.typeFileReference : c.disputes.evidence.typeNote)} />
              </dd>
            </div>
          </dl>
          {item.note ? <UntrustedText value={item.note} slot="evidence-note" /> : null}
        </li>
      ))}
    </ol>
  );
}
