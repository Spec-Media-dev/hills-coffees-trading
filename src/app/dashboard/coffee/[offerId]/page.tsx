import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { AvailabilityBar } from "@/components/listings/availability-bar";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getBrowseListingById } from "@/lib/listings/browse";
import { projectFillState } from "@/lib/listings/fills";

export const metadata: Metadata = {
  title: "Listing",
};

/**
 * Feature 006 RUN B (T010) — marketplace listing detail. Guard lives at `../layout.tsx` (T007
 * reconciliation); this page performs no identity check of its own.
 *
 * PRIVACY: `getBrowseListingById` returns `null` identically whether the id does not exist, belongs
 * to a non-published/suspended/soft-deleted offer, OR (per the confirmed T012 KNOWN BLOCKER — the
 * live `member_read_published_offers` predicate requires `remaining > 0`) a genuine SOLD_OUT offer —
 * this page calls `notFound()` for every one of those with no branching that could reveal which case
 * occurred, or work around the RLS predicate.
 *
 * PURCHASE HANDOFF (Feature 007 not built yet): the purchase action is a genuinely disabled button,
 * never a dead link pretending checkout exists and never a client-trusted quantity write — mirrors
 * Feature 004 T006's "reserved notifications entry is genuinely inert" precedent (disabled control,
 * truthful accessible state, no fabricated behavior).
 */
export default async function MarketplaceListingDetailPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}) {
  const { offerId } = await params;

  const listing = await getBrowseListingById(offerId);
  if (!listing) notFound();

  const projection = projectFillState({
    quantityKg: listing.quantityKg,
    reservedQuantityKg: listing.reservedQuantityKg,
    filledQuantityKg: listing.filledQuantityKg,
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={listing.title ?? listing.coffeeName ?? <AppBilingual pick={(c) => c.marketplace.detail.breadcrumb} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.marketplace.detail.breadcrumb} />, href: "/dashboard/coffee" },
          { label: listing.title ?? listing.coffeeName ?? <AppBilingual pick={(c) => c.marketplace.detail.breadcrumb} /> },
        ]}
        actions={<ListingStatusBadge status={listing.status} />}
      />

      <div className="flex flex-col gap-8 rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            <AppBilingual pick={(c) => c.marketplace.detail.lotHeading} />
          </h2>
          {listing.lot ? (
            <dl className="flex flex-col border-t border-border">
              {listing.coffeeName ? <Row label={<AppBilingual pick={(c) => c.marketplace.detail.coffeeLabel} />} value={listing.coffeeName} /> : null}
              <Row label={<AppBilingual pick={(c) => c.marketplace.detail.lotCodeLabel} />} value={listing.lot.lotCode} />
              {listing.lot.cropYear ? <Row label={<AppBilingual pick={(c) => c.marketplace.detail.cropYearLabel} />} value={listing.lot.cropYear} /> : null}
              {listing.lot.qualityGrade ? <Row label={<AppBilingual pick={(c) => c.marketplace.detail.qualityGradeLabel} />} value={listing.lot.qualityGrade} /> : null}
            </dl>
          ) : (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-4">
              <p className="font-medium text-foreground">
                <AppBilingual pick={(c) => c.marketplace.detail.lotUnavailable.title} />
              </p>
              <p className="mt-1 text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.marketplace.detail.lotUnavailable.description} />
              </p>
            </div>
          )}
        </section>

        <Separator />

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            <AppBilingual pick={(c) => c.marketplace.detail.warehouseHeading} />
          </h2>
          {listing.warehouse ? (
            <p className="text-foreground">
              {listing.warehouse.name}
              {listing.warehouse.city ? ` · ${listing.warehouse.city}` : ""}
            </p>
          ) : (
            <p className="text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.marketplace.detail.warehouseUnavailable} />
            </p>
          )}
        </section>

        <Separator />

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            <AppBilingual pick={(c) => c.marketplace.detail.availabilityHeading} />
          </h2>
          <AvailabilityBar projection={projection} />
          <p className="text-[length:var(--text-micro)] text-muted-foreground">
            <AppBilingual pick={(c) => c.marketplace.detail.advisoryNote} />
          </p>
        </section>

        {listing.sensoryNotes ? (
          <>
            <Separator />
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-foreground">
                <AppBilingual pick={(c) => c.marketplace.detail.sensoryHeading} />
              </h2>
              <dl className="flex flex-col border-t border-border">
                {(["aroma", "flavor", "acidity", "body", "finish", "notes"] as const)
                  .filter((key) => listing.sensoryNotes![key])
                  .map((key) => (
                    <Row key={key} label={<AppBilingual pick={(c) => c.marketplace.detail.sensory[key]} />} value={listing.sensoryNotes![key]!} />
                  ))}
              </dl>
            </section>
          </>
        ) : null}

        {listing.tags.length > 0 ? (
          <>
            <Separator />
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-foreground">
                <AppBilingual pick={(c) => c.marketplace.detail.tagsHeading} />
              </h2>
              <ul className="flex flex-wrap gap-2">
                {listing.tags.map((tag) => (
                  <li key={tag}>
                    <Badge variant="secondary">{tag}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        <Separator />

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="font-mono text-2xl font-bold tabular-nums text-foreground" dir="ltr">
              {listing.currency} {listing.pricePerKg}
              <span className="ms-1 text-[length:var(--text-small)] font-normal text-muted-foreground">
                <AppBilingual pick={(c) => c.marketplace.card.priceUnit} />
              </span>
            </span>
            <Button type="button" disabled aria-disabled="true">
              <AppBilingual pick={(c) => c.marketplace.detail.purchase.comingSoon} />
            </Button>
          </div>
          <p className="text-[length:var(--text-small)] text-muted-foreground">
            <AppBilingual pick={(c) => c.marketplace.detail.purchase.comingSoonDescription} />
          </p>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-3 text-[length:var(--text-small)]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
