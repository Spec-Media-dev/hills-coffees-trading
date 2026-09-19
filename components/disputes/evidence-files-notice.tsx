import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";
import { DISPUTE_EVIDENCE_FILE_CAPABILITY } from "@/lib/disputes/evidence-files";

/**
 * Feature 012 RUN B (T008) — the visible DB-BLOCK-01 explanation, rendered in place of a file upload
 * control (there is deliberately NO disabled or fake upload input). Driven by the seam's own
 * capability flag, so if an approved Storage capability ever flips it, this notice disappears with it.
 */
export function EvidenceFilesNotice() {
  if (DISPUTE_EVIDENCE_FILE_CAPABILITY.available) return null;
  return (
    <div data-slot="evidence-files-unavailable" data-blocker={DISPUTE_EVIDENCE_FILE_CAPABILITY.blocker} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-subtle)] p-4 text-sm text-foreground">
      <Icon name="alert-circle" className="mt-0.5 size-5 text-muted-foreground" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold">
          <AppBilingual pick={(c) => c.disputes.evidence.filesUnavailableTitle} />
        </p>
        <p className="text-muted-foreground">
          <AppBilingual pick={(c) => c.disputes.evidence.filesUnavailableBody} />
        </p>
      </div>
    </div>
  );
}
