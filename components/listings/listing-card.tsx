import Link from "next/link";

import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { appCopy } from "@/lib/app/copy";
import type { BuyerBrowseListing, FillProjection } from "@/lib/listings/types";

/**
 * Feature 006 RUN B (T011) — the marketplace browse card. Its information architecture (eyebrow,
 * title, spec grid, price row) is adapted from the project's own design-reference component library
 * for this exact card concept — but NOT copied verbatim: that reference's multi-step "coffee
 * identity" fields (grade/process/harvest/cupping, lot photography) describe a FUTURE, richer
 * catalogue this feature's approved `coffee_offers`/`coffee_lots` schema does not yet carry (RUN A's
 * DB preflight; DB-OPEN-05 also means lot detail frequently degrades to `null` live). This card shows
 * only fields the buyer DTO actually carries — never a fabricated photo, grade or origin region to
 * "fill the visual gap" the reference's photography slot would otherwise leave empty.
 *
 * PRESENTATION ONLY: receives the already-resolved `BuyerBrowseListing` DTO and the already-projected
 * `FillProjection` (computed once by the page via `lib/listings/fills.ts`) — no data fetching, no
 * quantity arithmetic, here.
 */
export function ListingCard({ listing, projection }: { listing: BuyerBrowseListing; projection: FillProjection }) {
  const eyebrow = [listing.coffeeName, listing.lot?.lotCode].filter(Boolean).join(" · ");
  const remainingKg = projection.ok ? projection.remainingQuantityKg : null;

  return (
    <Link
      href={`/dashboard/coffee/${listing.id}`}
      className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-5 transition-[border-color,box-shadow,transform] duration-[var(--dur-fast)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="hc-eyebrow text-accent-foreground">{eyebrow || <AppBilingual pick={(c) => c.marketplace.card.viewDetails} />}</span>
        <ListingStatusBadge status={listing.status} />
      </div>

      <h3 className="line-clamp-2 text-lg font-semibold text-foreground">
        {listing.title ?? listing.coffeeName ?? appCopy.marketplace.card.viewDetails}
      </h3>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[length:var(--text-small)]">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">
            <AppBilingual pick={(c) => c.marketplace.availability.remainingLabel} />
          </dt>
          <dd className="font-mono font-semibold tabular-nums text-foreground" dir="ltr">
            {remainingKg !== null ? `${remainingKg} kg` : "—"}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">
            <AppBilingual pick={(c) => c.marketplace.card.sellerLabel} />
          </dt>
          <dd className="font-semibold text-foreground">
            <AppBilingual pick={(c) => c.marketplace.card.sellerType[listing.sellerType]} />
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="font-mono text-lg font-bold tabular-nums text-foreground" dir="ltr">
          {listing.currency} {listing.pricePerKg}
          <span className="ms-1 text-[length:var(--text-small)] font-normal text-muted-foreground">
            <AppBilingual pick={(c) => c.marketplace.card.priceUnit} />
          </span>
        </span>
        <span className="text-[length:var(--text-small)] font-medium text-foreground underline-offset-4 group-hover:underline">
          <AppBilingual pick={(c) => c.marketplace.card.viewDetails} />
        </span>
      </div>
    </Link>
  );
}
