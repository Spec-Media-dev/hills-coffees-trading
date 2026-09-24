import Link from "next/link";

import { ListingCard } from "@/components/listings/listing-card";
import { Bilingual, type CopySelector } from "@/components/locale/bilingual";
import { ACCOUNT_ROUTES } from "@/components/public/routes";
import { Icon, type IconName } from "@/components/ui/icon";
import { getRequestIdentity } from "@/lib/auth/dal";
import type { RequestIdentity } from "@/lib/auth/types";
import { getBrowseListings } from "@/lib/listings/browse";
import { projectFillState } from "@/lib/listings/fills";
import { getPrimaryOfferImages } from "@/lib/listings/media";

/**
 * Homepage "Recently listed" (final non-payment closure run — Features 002 + 006).
 *
 * THE MARKETPLACE IS PRIVATE. This module is the ONLY place the homepage touches listing data, and it
 * does so for exactly one audience: an authorized member (signed in, step-up complete, email verified,
 * an unambiguous acting organization, `is_authorized_member()`). For that audience it REUSES the member
 * marketplace's own reads — `getBrowseListings` (RLS policy `member_read_published_offers`) and
 * `getPrimaryOfferImages` (signed, member-scoped listing media) — and the same `ListingCard`.
 *
 * Every other audience gets a state panel and NOTHING ELSE: the listing and media queries are not
 * executed at all in those branches, so no offer id, price, quantity, seller, warehouse, title or
 * signed media URL can reach their HTML or RSC payload. The Suspense fallback is data-free too.
 *
 * ORDER: `coffee_offers.created_at DESC, id DESC` (the browse read's own deterministic order) — never
 * `updated_at`, so editing an old listing does not make it look newly listed. At most FIVE are shown
 * (`RECENTLY_LISTED_LIMIT`), enforced by the page size AND a defensive slice.
 *
 * Kept outside `src/app/page.tsx` and `components/public/` on purpose: public routes must stay
 * identity-independent (T032), so the homepage streams this server component behind `<Suspense>`, the
 * same way the header resolves the signed-in account.
 */
export const RECENTLY_LISTED_LIMIT = 5;

export type MarketplaceAccess = "anonymous" | "mfa" | "operator" | "pending" | "member";

/** Pure: which marketplace audience a request identity belongs to. Exported for the unit suites. */
export function resolveMarketplaceAccess(identity: RequestIdentity): MarketplaceAccess {
  if (identity.kind !== "authenticated") return "anonymous";
  if (identity.requiresMfaStepUp) return "mfa";
  if (identity.isEmailVerified && !identity.requiresOrganizationSelection && identity.organization !== null && identity.isAuthorizedMember) return "member";
  if (identity.organization === null && identity.organizations.length === 0 && identity.operationalRoles.length > 0) return "operator";
  return "pending";
}

/** Where "View all listings" (and the marketplace nav entry) takes each audience. */
export function marketplaceDestination(access: MarketplaceAccess): string {
  switch (access) {
    case "member":
      return ACCOUNT_ROUTES.marketplace;
    case "anonymous":
      return ACCOUNT_ROUTES.signUp;
    case "mfa":
      return ACCOUNT_ROUTES.mfa;
    case "operator":
      return ACCOUNT_ROUTES.operatorConsole;
    case "pending":
      return ACCOUNT_ROUTES.memberPortal;
  }
}

export async function RecentlyListed() {
  const access = resolveMarketplaceAccess(await getRequestIdentity());
  if (access !== "member") return <MarketplaceStatePanel access={access} />;

  // Authorized member ONLY — the same RLS-scoped reads the member marketplace uses.
  const { rows } = await getBrowseListings({ page: 0, pageSize: RECENTLY_LISTED_LIMIT });
  const listings = rows.slice(0, RECENTLY_LISTED_LIMIT);
  const images = await getPrimaryOfferImages(listings.map((listing) => listing.id));

  return (
    <div className="flex flex-col gap-6" data-recently-listed="member" data-recently-listed-count={listings.length}>
      {listings.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-[var(--radius-xl)] border border-dashed border-border bg-card p-7" data-recently-listed-empty>
          <p className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold">
            <Bilingual pick={(c) => c.home.marketplace.emptyTitle} />
          </p>
          <p className="text-[length:var(--text-small)] text-muted-foreground">
            <Bilingual pick={(c) => c.home.marketplace.emptyBody} />
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {listings.map((listing) => (
            <li key={listing.id} className="min-w-0">
              <ListingCard
                listing={listing}
                imageUrl={images.get(listing.id) ?? null}
                projection={projectFillState({ quantityKg: listing.quantityKg, reservedQuantityKg: listing.reservedQuantityKg, filledQuantityKg: listing.filledQuantityKg })}
              />
            </li>
          ))}
        </ul>
      )}
      <Link href={marketplaceDestination("member")} className="hc-btn-accent self-start" data-recently-listed-view-all>
        <Bilingual pick={(c) => c.home.marketplace.viewAll} />
        <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
      </Link>
    </div>
  );
}

const STATE_COPY: Record<Exclude<MarketplaceAccess, "member" | "anonymous">, { icon: IconName; title: CopySelector; body: CopySelector; action: CopySelector }> = {
  mfa: { icon: "shield", title: (c) => c.home.marketplace.mfaTitle, body: (c) => c.home.marketplace.mfaBody, action: (c) => c.home.marketplace.mfaAction },
  operator: { icon: "layout-grid", title: (c) => c.home.marketplace.operatorTitle, body: (c) => c.home.marketplace.operatorBody, action: (c) => c.home.marketplace.operatorAction },
  pending: { icon: "clock", title: (c) => c.home.marketplace.pendingTitle, body: (c) => c.home.marketplace.pendingBody, action: (c) => c.home.marketplace.pendingAction },
};

/** Every non-member state. Renders NO listing data — none was fetched. */
export function MarketplaceStatePanel({ access }: { access: Exclude<MarketplaceAccess, "member"> }) {
  if (access === "anonymous") return <MarketplaceLockedTeaser />;
  const state = STATE_COPY[access];
  return (
    <div className="flex flex-col items-start gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-7 sm:flex-row sm:items-center sm:justify-between" data-recently-listed={access}>
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
          <Icon name={state.icon} className="size-5" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold">
            <Bilingual pick={state.title} />
          </p>
          <p className="max-w-[56ch] text-[length:var(--text-small)] leading-[1.65] text-muted-foreground">
            <Bilingual pick={state.body} />
          </p>
        </div>
      </div>
      <Link href={marketplaceDestination(access)} className="hc-btn-accent shrink-0">
        <Bilingual pick={state.action} />
        <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
      </Link>
    </div>
  );
}

/**
 * The anonymous marketplace: a designed LOCKED preview — five abstract card silhouettes (no text, no
 * number, no image) behind a lock panel with the sign-up and sign-in actions. Also the Suspense
 * fallback, so the streamed-in member grid never shifts the layout by more than its own content.
 */
export function MarketplaceLockedTeaser({ loading = false }: { loading?: boolean }) {
  return (
    <div className="relative isolate overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card" data-recently-listed={loading ? "loading" : "anonymous"} aria-busy={loading || undefined}>
      <ul aria-hidden="true" className="grid gap-4 p-5 opacity-60 blur-[2px] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 motion-reduce:blur-none">
        {Array.from({ length: RECENTLY_LISTED_LIMIT }, (_, index) => (
          <li key={index} className={`flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-background ${index < 2 ? "flex" : index === 2 ? "hidden lg:flex" : "hidden 2xl:flex"}`}>
            <span className="aspect-[4/3] w-full bg-[linear-gradient(135deg,var(--surface-subtle,rgba(0,0,0,0.04)),rgba(164,72,25,0.08))]" />
            <span className="flex flex-col gap-2 p-4">
              <span className="h-2.5 w-2/5 rounded-full bg-muted" />
              <span className="h-3.5 w-4/5 rounded-full bg-muted" />
              <span className="mt-3 h-3 w-3/5 rounded-full bg-muted" />
            </span>
          </li>
        ))}
      </ul>

      {loading ? null : (
        <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_35%,transparent),color-mix(in_srgb,var(--card)_88%,transparent))] p-5">
          <div className="flex max-w-[34rem] flex-col items-center gap-4 rounded-[var(--radius-xl)] border border-border bg-card/95 p-6 text-center shadow-[var(--shadow-md)] backdrop-blur-sm sm:p-7">
            <span className="grid size-11 place-items-center rounded-full bg-[var(--hc-forest)] text-[var(--gold-on-dark)] dark:bg-[var(--hc-moss)] dark:ring-1 dark:ring-[rgba(214,178,94,0.4)]">
              <Icon name="lock" className="size-5" aria-hidden="true" />
            </span>
            <p className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold">
              <Bilingual pick={(c) => c.home.marketplace.lockedTitle} />
            </p>
            <p className="text-[length:var(--text-small)] leading-[1.65] text-muted-foreground text-pretty">
              <Bilingual pick={(c) => c.home.marketplace.lockedBody} />
            </p>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Link href={ACCOUNT_ROUTES.signUp} className="hc-btn-accent justify-center" data-marketplace-signup>
                <Bilingual pick={(c) => c.home.marketplace.createAccount} />
                <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
              </Link>
              <Link
                href={ACCOUNT_ROUTES.signIn}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border px-6 text-sm font-semibold text-foreground transition-colors duration-[var(--dur-fast)] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                data-marketplace-signin
              >
                <Bilingual pick={(c) => c.home.marketplace.signIn} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
