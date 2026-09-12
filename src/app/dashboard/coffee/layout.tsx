import { KybStatusScreen } from "@/components/account/kyb-status-screen";
import { StateScreen } from "@/components/layout/state-screen";
import { getRequestIdentity } from "@/lib/auth/dal";
import { listKybDocumentReviews } from "@/lib/kyb/review-items";
import { currentDocuments, getKybWorkspace } from "@/lib/kyb/status";

/**
 * Feature 006 T007 reconciliation — the private marketplace access boundary for EVERY route under
 * `/dashboard/coffee/*`, moved here (from `page.tsx`) so it is INHERITED by construction rather than
 * something each future page must remember to repeat.
 *
 * WHY THIS MOVE WAS NECESSARY: `dashboard/layout.tsx` (the parent) deliberately does NOT block
 * `{children}` for a not-yet-authorized organization (RUN B/T016–T022 changed this on purpose, so
 * `/dashboard/kyb/` can render its own content) — see that file's own header comment. That means a
 * page under `/dashboard/coffee/*` that forgot to re-check `isAuthorizedMember` itself WOULD render
 * for a PENDING_KYB/SUSPENDED session. Feature 005's own precedent duplicates this guard in every
 * page (`inventory/page.tsx`, `inventory/[positionId]/page.tsx`, `inventory/history/page.tsx`,
 * `storage/page.tsx`) — exactly the "depends on every future page remembering" pattern this
 * reconciliation was asked to eliminate for the marketplace. Phase 3 will add
 * `/dashboard/coffee/[offerId]/page.tsx`; putting the guard in THIS layout means that page (and any
 * other page ever added under `coffee/`) inherits it structurally — Next.js always renders this
 * layout, and its own gate on `{children}`, before any nested page component even executes, so a
 * descendant cannot bypass it by omission.
 *
 * AUTHORIZATION HAPPENS BEFORE ANY LISTING READ (FR-001, SEC-001, AC-01): `lib/listings/browse.ts`/
 * `manage.ts` are not imported here, or anywhere reachable before this guard passes — no future page
 * component under `coffee/` can execute a listing query without first passing through this function,
 * because React/Next.js does not invoke a child component unless its parent's returned tree includes
 * it, and every branch below except the final one returns WITHOUT `{children}`.
 *
 * Three branches, same shape `src/app/dashboard/page.tsx`/`dashboard/layout.tsx` already established
 * (re-verified here rather than assumed, per this project's established defense-in-depth
 * convention — the outer `dashboard/layout.tsx` re-checks its own anonymous/unattached case even
 * though it is already "the root" for `/dashboard`):
 *
 *   - `identity.kind !== "authenticated" || identity.organization === null` → `StateScreen
 *     kind="unauthorized"` — anonymous AND authenticated-but-unattached alike.
 *   - `!identity.isAuthorizedMember` → `KybStatusScreen` — the SAME state-aware hub used elsewhere,
 *     covering PENDING_KYB, UNDER_REVIEW, SUSPENDED and REJECTED honestly. No second authentication
 *     system, no separate "pending" vs "suspended" branch invented here.
 *   - Otherwise: an authorized active member — `{children}` renders, and ONLY now may any nested
 *     page (today's placeholder, or Phase 3's browse/detail pages) perform its own listing read.
 */
export default async function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const identity = await getRequestIdentity();

  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }

  if (!identity.isAuthorizedMember) {
    const workspace = await getKybWorkspace(identity.organization.organizationId);
    const documents = currentDocuments(workspace.documents);
    const reviews = workspace.application ? await listKybDocumentReviews(workspace.application.id) : { ok: true as const, reviews: [] };
    return (
      <KybStatusScreen
        application={workspace.application}
        currentDocuments={documents}
        reviews={reviews.ok ? reviews.reviews : []}
      />
    );
  }

  return <>{children}</>;
}
