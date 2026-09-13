import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Separator } from "@/components/ui/separator";
import { StateScreen } from "@/components/layout/state-screen";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getListingStatusHistory, getManagedListingById } from "@/lib/listings/manage";

import { ListingEditForm } from "./listing-edit-form";
import { MoveListingToDraftButton, WithdrawListingButton } from "./listing-lifecycle-actions";

export const metadata: Metadata = {
  title: "Listing",
};

/** Application-level policy — see `actions.ts`'s own header for why these are narrower than
 * everything `validate_offer_transition` would technically accept. */
const EDITABLE_STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "PARTIALLY_FILLED"] as const;
const WITHDRAWABLE_STATUSES = ["DRAFT", "APPROVED", "PUBLISHED", "PARTIALLY_FILLED"] as const;

/**
 * Feature 006 RUN C (T017) — seller listing detail/edit/withdraw.
 *
 * PRIVACY: `getManagedListingById` is org-scoped exactly like `lib/inventory/positions.ts`'s own
 * established convention — a cross-org id and a nonexistent id return the IDENTICAL `null`, so this
 * page calls `notFound()` for both with no branching that could reveal which case occurred.
 */
export default async function SellerListingDetailPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }
  if (!identity.organization.canSell) {
    return (
      <StateScreen
        kind="forbidden"
        title={appCopy.listings.manage.capabilityRequired.title}
        description={appCopy.listings.manage.capabilityRequired.description}
      />
    );
  }

  const { offerId } = await params;
  const organizationId = identity.organization.organizationId;

  const listing = await getManagedListingById({ organizationId, offerId });
  if (!listing) notFound();

  const history = await getListingStatusHistory({ organizationId, offerId });

  const isEditable = (EDITABLE_STATUSES as readonly string[]).includes(listing.status) && listing.status !== "REJECTED";
  const isWithdrawable = (WITHDRAWABLE_STATUSES as readonly string[]).includes(listing.status);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={listing.title ?? listing.coffeeName ?? <AppBilingual pick={(c) => c.listings.detail.title} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.listings.manage.title} />, href: "/dashboard/listings" },
          { label: listing.title ?? listing.coffeeName ?? <AppBilingual pick={(c) => c.listings.detail.title} /> },
        ]}
        actions={<ListingStatusBadge status={listing.status} />}
      />

      {listing.status === "REJECTED" ? (
        <InlineAlert tone="warning" title={appCopy.listings.detail.rejected.title}>
          <p>{listing.rejectionReason ?? appCopy.listings.detail.rejected.genericReason}</p>
          <div className="mt-4">
            <MoveListingToDraftButton offerId={listing.id} />
          </div>
        </InlineAlert>
      ) : null}

      <div className="flex flex-col gap-8 rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        {isEditable ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-foreground">
              <AppBilingual pick={(c) => c.listings.detail.editHeading} />
            </h2>
            <ListingEditForm
              offerId={listing.id}
              defaultValues={{ title: listing.title ?? "", quantityKg: listing.quantityKg, pricePerKg: listing.pricePerKg }}
            />
          </section>
        ) : (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-foreground">
              <AppBilingual pick={(c) => c.listings.detail.editHeading} />
            </h2>
            <p className="text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.listings.detail.notEditable} />
            </p>
            <dl className="grid grid-cols-2 gap-3 text-[length:var(--text-small)] sm:grid-cols-3">
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">
                  <AppBilingual pick={(c) => c.listings.manage.columns.quantity} />
                </dt>
                <dd className="font-mono tabular-nums text-foreground" dir="ltr">
                  {listing.quantityKg} kg
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">
                  <AppBilingual pick={(c) => c.listings.manage.columns.price} />
                </dt>
                <dd className="font-mono tabular-nums text-foreground" dir="ltr">
                  {listing.currency} {listing.pricePerKg}
                </dd>
              </div>
            </dl>
          </section>
        )}

        <Separator />

        <section className="flex flex-wrap items-center gap-3">
          <WithdrawListingButton offerId={listing.id} disabled={!isWithdrawable} />
        </section>

        <Separator />

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            <AppBilingual pick={(c) => c.listings.detail.historyHeading} />
          </h2>
          {history.length === 0 ? (
            <p className="text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.listings.detail.historyEmpty} />
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2 text-[length:var(--text-small)] last:border-b-0">
                  <span className="text-foreground">
                    {entry.oldStatus ? `${entry.oldStatus} → ${entry.newStatus}` : entry.newStatus}
                  </span>
                  <span className="text-muted-foreground" dir="ltr">
                    {entry.createdAt}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
