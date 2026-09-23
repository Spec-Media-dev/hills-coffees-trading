import type { ReactNode } from "react";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { ListingDecisionPanel } from "@/components/admin/compliance/listing-decision-panel";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { getListingReviewDetail } from "@/lib/admin/compliance";
import { checkAreaAccess } from "@/lib/admin/guards";
import { formatMoney, formatQuantity } from "@/lib/dashboard/format";
import type { ListingStatus } from "@/lib/listings/types";

/**
 * Feature 010 RUN B (T011) — one listing under compliance review: identity, seller, quantities
 * (always with units), price (always with currency), the persisted `listing_reviews` decisions and
 * the trigger-written `listing_status_history`, and the decision panel. Nothing is synthesized from
 * the current state — history is what the database recorded.
 */

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:grid sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:gap-4">
      <dt className="text-[length:var(--text-small)] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-[length:var(--text-small)] text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export default async function ListingReviewPage({ params }: { params: Promise<{ offerId: string }> }) {
  const access = await checkAreaAccess("listings");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_compliance_operator" />;

  const { offerId } = await params;
  const detail = /^[0-9a-f-]{36}$/i.test(offerId) ? await getListingReviewDetail(offerId) : null;
  const trail = [
    { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
    { label: <AppBilingual pick={(c) => c.admin.compliance.listings.breadcrumb} />, href: "/dashboard-admin/listings" },
    { label: <AppBilingual pick={(c) => c.admin.compliance.listings.detail.title} /> },
  ];

  if (!detail) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.compliance.listings.detail.title} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.compliance.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.common.notFound.description} />} />
      </div>
    );
  }

  const { listing, reviews, history } = detail;
  const viewerId = access.identity.userId;
  const reviewerLabel = (userId: string | null) =>
    userId === viewerId ? <AppBilingual pick={(c) => c.admin.compliance.common.you} /> : userId ? <span className="font-mono text-[length:var(--text-micro)]">{userId}</span> : <AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={listing.title} description={<span className="font-mono text-[length:var(--text-micro)]">{listing.id}</span>} trail={trail} actions={<ListingStatusBadge status={listing.status as ListingStatus} />} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section data-listing-section="identity" className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
            <dl className="divide-y divide-border">
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.listings.detail.seller} />}>
                {listing.sellerType === "HILLS" ? (
                  <AppBilingual pick={(c) => c.admin.compliance.listings.hillsSeller} />
                ) : listing.sellerOrganizationName ? (
                  listing.sellerOrganizationName
                ) : (
                  <span className="text-muted-foreground">
                    <AppBilingual pick={(c) => c.admin.compliance.listings.sellerUnavailable} />
                  </span>
                )}
                <span className="block font-mono text-[length:var(--text-micro)] text-muted-foreground">{listing.sellerOrganizationId}</span>
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.listings.detail.sellerType} />}>
                <span className="flex flex-col">
                  <AppBilingual pick={(c) => (c.marketplace.card.sellerType as Record<string, string>)[listing.sellerType] ?? listing.sellerType} />
                  <span className="font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
                    {listing.sellerType}
                  </span>
                </span>
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.listings.detail.quantity} />}>
                <span className="tabular-nums">{formatQuantity(listing.quantityKg, "kg")}</span>
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.listings.detail.reserved} />}>
                <span className="tabular-nums">{formatQuantity(listing.reservedQuantityKg, "kg")}</span>
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.listings.detail.filled} />}>
                <span className="tabular-nums">{formatQuantity(listing.filledQuantityKg, "kg")}</span>
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.listings.detail.price} />}>
                <span className="tabular-nums">{formatMoney(listing.pricePerKg, listing.currency, "kg")}</span>
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.common.createdAt} />}>
                <AdminDateTime value={listing.createdAt} fallback={<AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />} />
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.common.updatedAt} />}>
                <AdminDateTime value={listing.updatedAt} fallback={<AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />} />
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.listings.detail.rejectionReason} />}>
                {listing.rejectionReason ?? <AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />}
              </Row>
            </dl>
          </section>

          <section data-listing-section="history" className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
            <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.admin.compliance.listings.detail.history.heading} />
            </h2>
            {history.length === 0 ? (
              <p className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.listings.detail.history.none} />
              </p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {history.map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-1 py-2 text-[length:var(--text-small)]">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[length:var(--text-micro)]">{entry.oldStatus}</span>
                      <span aria-hidden="true">→</span>
                      <span className="font-mono text-[length:var(--text-micro)]">{entry.newStatus}</span>
                      <span className="text-muted-foreground">
                        <AdminDateTime value={entry.createdAt} fallback={<AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />} />
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      <AppBilingual pick={(c) => c.admin.compliance.common.reviewer} />: {reviewerLabel(entry.changedBy)}
                    </span>
                    {entry.reason ? <span className="whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground">{entry.reason}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <ListingDecisionPanel offerId={listing.id} status={listing.status as ListingStatus} />

          <section data-listing-section="reviews" className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
            <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.admin.compliance.listings.detail.reviews.heading} />
            </h2>
            {reviews.length === 0 ? (
              <p className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.listings.detail.reviews.none} />
              </p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {reviews.map((review) => (
                  <li key={review.id} data-review={review.id} className="flex flex-col gap-1 py-3 text-[length:var(--text-small)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <ListingStatusBadge status={review.decision} />
                      <span className="text-muted-foreground">
                        <AdminDateTime value={review.createdAt} fallback={<AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />} />
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      <AppBilingual pick={(c) => c.admin.compliance.common.reviewer} />: {reviewerLabel(review.reviewerUserId)}
                    </p>
                    {review.reason ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground">{review.reason}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
