import { Icon } from "@/components/ui/icon";
import { AppBilingual } from "@/components/locale/app-bilingual";

/**
 * Feature 008 T022 — the honest, non-actionable "funding isn't available" state (spec.md PS2,
 * FR-003/FR-015). Rendered from the REAL outcome of `lib/finance/funding.ts#requestFunding` (never a
 * hardcoded string a future edit could silently drift from the seam) — see the calling page's own
 * header for why. No provider name/logo, no bank instructions, no button, no CTA: this notice is
 * read-only information, matching `requestFunding`'s own "non-actionable" contract exactly.
 */
export function FundingUnavailableNotice() {
  return (
    <section
      data-finance-notice="funding-unavailable"
      aria-labelledby="funding-unavailable-heading"
      className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-5"
    >
      <Icon name="wallet" className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h2 id="funding-unavailable-heading" className="text-[length:var(--text-small)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.finance.funding.unavailable.title} />
        </h2>
        <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
          <AppBilingual pick={(c) => c.finance.funding.unavailable.description} />
        </p>
      </div>
    </section>
  );
}
