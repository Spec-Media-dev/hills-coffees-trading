import Link from "next/link";
import type { ReactNode } from "react";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AuditReadOnlyBanner } from "@/components/admin/audit/read-only-banner";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { getAuditListingDetail } from "@/lib/admin/audit";
import { checkAreaAccess } from "@/lib/admin/guards";
import { formatMoney, formatQuantity } from "@/lib/dashboard/format";
import type { ListingStatus } from "@/lib/listings/types";

/**
 * Feature 010 RUN E (T025) — one listing as audit evidence: identity, quantities, price and the
 * trigger-written status history. A dedicated read-only page — NOT the compliance detail with its
 * decision panel hidden: no decision component is imported, no action exists. `listing_reviews`
 * rows are compliance-only under RLS, so the page states that rather than rendering an empty list
 * as "no decisions".
 */
function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:grid sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:gap-4">
      <dt className="text-[length:var(--text-small)] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-[length:var(--text-small)] text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export default async function AuditListingPage({ params }: { params: Promise<{ offerId: string }> }) {
  const access = await checkAreaAccess("audit");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_auditor" />;
  const { offerId } = await params;
  const detail = /^[0-9a-f-]{36}$/i.test(offerId) ? await getAuditListingDetail(offerId) : null;
  const trail = [{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.audit.breadcrumb} />, href: "/dashboard-admin/audit" }, { label: <AppBilingual pick={(c) => c.admin.audit.listings.detail.breadcrumb} /> }];
  if (!detail) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.audit.listings.detail.title} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.warehouse.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.warehouse.common.notFound.description} />}>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard-admin/audit" />}>
            <AppBilingual pick={(c) => c.admin.audit.breadcrumb} />
          </Button>
        </AdminStateCard>
      </div>
    );
  }
  const { listing, history } = detail;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={listing.title} description={<span className="font-mono text-[length:var(--text-micro)]" dir="ltr">{listing.id}</span>} trail={trail} actions={<ListingStatusBadge status={listing.status as ListingStatus} />} />
      <AuditReadOnlyBanner />
      <section data-audit-section="identity" className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
        <dl className="divide-y divide-border">
          <Row label={<AppBilingual pick={(c) => c.admin.compliance.listings.detail.seller} />}>
            {listing.sellerType === "HILLS" ? <AppBilingual pick={(c) => c.admin.compliance.listings.hillsSeller} /> : listing.sellerOrganizationName ?? <span className="text-muted-foreground" data-organization-gap><AppBilingual pick={(c) => c.admin.audit.listings.sellerUnavailable} /></span>}
            <span className="block font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">{listing.sellerOrganizationId}</span>
          </Row>
          <Row label={<AppBilingual pick={(c) => c.admin.compliance.listings.detail.quantity} />}><span className="tabular-nums" dir="ltr">{formatQuantity(listing.quantityKg, "kg")}</span></Row>
          <Row label={<AppBilingual pick={(c) => c.admin.compliance.listings.detail.reserved} />}><span className="tabular-nums" dir="ltr">{formatQuantity(listing.reservedQuantityKg, "kg")}</span></Row>
          <Row label={<AppBilingual pick={(c) => c.admin.compliance.listings.detail.filled} />}><span className="tabular-nums" dir="ltr">{formatQuantity(listing.filledQuantityKg, "kg")}</span></Row>
          <Row label={<AppBilingual pick={(c) => c.admin.compliance.listings.detail.price} />}><span className="tabular-nums" dir="ltr">{formatMoney(listing.pricePerKg, listing.currency, "kg")}</span></Row>
          <Row label={<AppBilingual pick={(c) => c.admin.compliance.common.createdAt} />}><AdminDateTime value={listing.createdAt} fallback="—" /></Row>
          <Row label={<AppBilingual pick={(c) => c.admin.compliance.common.updatedAt} />}><AdminDateTime value={listing.updatedAt} fallback="—" /></Row>
        </dl>
      </section>
      <section data-audit-section="history" className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.admin.audit.listings.detail.history} />
        </h2>
        {history.length === 0 ? (
          <p className="text-[length:var(--text-small)] text-muted-foreground"><AppBilingual pick={(c) => c.admin.audit.listings.detail.historyNone} /></p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {history.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 py-2 text-[length:var(--text-small)]">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[length:var(--text-micro)]">{entry.oldStatus}</span>
                  <span aria-hidden="true">→</span>
                  <span className="font-mono text-[length:var(--text-micro)]">{entry.newStatus}</span>
                  <span className="text-muted-foreground"><AdminDateTime value={entry.createdAt} fallback="—" /></span>
                </span>
                {entry.reason ? <span className="whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground">{entry.reason}</span> : null}
              </li>
            ))}
          </ol>
        )}
        <p className="text-[length:var(--text-micro)] text-muted-foreground" data-reviews-unavailable>
          <AppBilingual pick={(c) => c.admin.audit.listings.detail.reviewsUnavailable} />
        </p>
      </section>
    </div>
  );
}
