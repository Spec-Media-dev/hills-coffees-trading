import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";

export const metadata: Metadata = {
  title: "Marketplace",
  // Feature 004 T008 precedent: noindex is declared once at `dashboard/layout.tsx`; SEC-004/FR-014
  // still hold for this route (private marketplace listings), inherited automatically — no duplicate
  // `robots` entry needed here.
};

/**
 * Feature 006 T007 reconciliation — the authorization guard for `/dashboard/coffee/*` now lives in
 * `./layout.tsx` (see that file's header for why), so this page renders ONLY once an authorized
 * active member has already been confirmed — it performs no identity check of its own, and reads no
 * listing data yet: RUN A renders an honest "not yet built" placeholder. Phase 3 (T009) replaces the
 * body below with the real browse/search UI; it inherits the same guard automatically.
 */
export default function MarketplacePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.marketplace.title} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.marketplace.breadcrumb} /> }]}
      />
      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-8 text-center">
        <h2 className="hc-heading-4 font-semibold text-foreground">
          <AppBilingual pick={(c) => c.marketplace.comingSoon.title} />
        </h2>
        <p className="mt-2 text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.marketplace.comingSoon.description} />
        </p>
      </div>
    </div>
  );
}
