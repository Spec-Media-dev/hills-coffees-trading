import { PageHeader } from "@/components/app/page-header";
import { AgreementList } from "@/components/account/agreements/agreement-list";
import { KybStatusScreen } from "@/components/account/kyb-status-screen";
import { ActionList } from "@/components/dashboard/action-list";
import { OverviewCardSection } from "@/components/dashboard/overview-card";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { getOrganizationAgreementAcceptances } from "@/lib/agreements/acceptance-status";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getEligibility } from "@/lib/auth/eligibility";
import { composeOverview } from "@/lib/dashboard/overview";
import { DASHBOARD_MODULES } from "@/lib/dashboard/registry";
import { listKybDocumentReviews } from "@/lib/kyb/review-items";
import { currentDocuments, getKybWorkspace } from "@/lib/kyb/status";

/**
 * Member Portal overview (Phase 5.5, UIF-036 — contract §1; Feature 003 RUN B, T019).
 *
 * Deliberately contains no business functionality — the member overview and its modules are
 * 004-member-dashboard's scope, and every business module is 005-012's. This exists so `/dashboard`
 * resolves as a route, which is what makes the layout's authorization guard observable in Platform
 * Story 1's Independent Test (quickstart.md Story 1).
 *
 * WHY THIS PAGE RE-VERIFIES (FR-006, Constitution Principle VIII):
 *
 * Next.js renders route segments in PARALLEL. A parent layout that returns something other than
 * `{children}` does NOT prevent this page from executing — the page still runs and its output is
 * still serialized into the RSC flight payload. A layout guard alone therefore protects the visible
 * shell but not the data. That is why FR-006 requires every protected route to independently
 * re-verify authorization for its own request, and why Next's own auth guidance puts the real check
 * as close to the data as possible (research.md §2).
 *
 * Every later page under `/dashboard` MUST follow this pattern before fetching protected data.
 *
 * RUN B CHANGE: `!identity.isAuthorizedMember` is no longer lumped into the same `unauthorized`
 * `StateScreen` as a genuinely unauthenticated/unattached caller — an organization that exists but is
 * not yet authorized gets the real, state-aware KYB status hub (`KybStatusScreen`, T019–T022)
 * instead. `dashboard/layout.tsx`'s own guard already prevents this branch from ever reaching the
 * business `AppShell`/nav; this split only changes what non-business content renders for that case.
 *
 * FEATURE 004 RUN B (T011) — only the final, fully-eligible branch below changed: the
 * `FoundationOverview` placeholder is replaced with the real `composeOverview` output. Every guard
 * branch above it (unauthorized/unattached, not-yet-authorized-member, agreement-not-accepted) is
 * untouched — those are still Feature 003's full-page states, reached and returned from BEFORE this
 * composer ever runs, exactly as before.
 */
export default async function DashboardPage() {
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

  // Feature 003 T025 — the agreement gate is checked ONLY here, past the KYB/authorization guard
  // above (`identity.isAuthorizedMember` already confirmed true). `getEligibility` re-derives this
  // from `identity.hasAcceptedCurrentAgreements`, itself resolved fresh this request in
  // `getRequestIdentity()` — never cached, so a registry version bump re-gates the very next
  // request with no re-login required (run directive T025 Verify).
  const eligibility = getEligibility(identity);
  if (eligibility.nextAction === "accept-agreements") {
    const acceptances = await getOrganizationAgreementAcceptances(identity.organization.organizationId, identity.userId);
    return (
      <div className="hc-container flex min-h-[60vh] flex-1 items-center py-12">
        <AgreementList acceptances={acceptances} />
      </div>
    );
  }

  // Feature 004 T011 — composed fresh, this request, from the ACTING organization
  // (`identity.organization`, never `organizations[0]`) and the real agreement truth already
  // resolved above. No shared cache: this is a plain function call over already-resolved,
  // request-scoped values (SEC-003, FR-012).
  //
  // RUN B RECONCILIATION (Feature 005) — now `await`ed: `composeOverview` resolves every granted
  // module's `overviewCards`/`actionItems` (the "inventory" module's own bounded `lib/inventory/*`
  // count reads included) through this SAME call — no second, page-specific merge step exists
  // anymore. See `lib/dashboard/modules.ts`/`lib/dashboard/overview.tsx` for why this stayed safe to
  // do (small, additive contract extension; no ambient state; no shared cache).
  const overview = await composeOverview({
    organization: identity.organization,
    registry: DASHBOARD_MODULES,
    hasAcceptedCurrentAgreements: identity.hasAcceptedCurrentAgreements,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.memberWorkspace} />}
        description={<AppBilingual pick={(c) => c.modulesArriveLater} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} /> }]}
      />

      <OverviewCardSection
        title={<AppBilingual pick={(c) => c.dashboardAccount.cardTitle} />}
        cards={overview.account}
      />

      <ActionList
        title={<AppBilingual pick={(c) => c.dashboardOverview.needsAction.title} />}
        items={overview.needsAction}
        emptyMessage={<AppBilingual pick={(c) => c.dashboardOverview.needsAction.empty} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <OverviewCardSection
          title={<AppBilingual pick={(c) => c.dashboardOverview.bought.title} />}
          cards={overview.bought}
          emptyMessage={<AppBilingual pick={(c) => c.dashboardOverview.bought.empty} />}
        />
        <OverviewCardSection
          title={<AppBilingual pick={(c) => c.dashboardOverview.owe.title} />}
          cards={overview.owe}
          emptyMessage={<AppBilingual pick={(c) => c.dashboardOverview.owe.empty} />}
        />
        <OverviewCardSection
          title={<AppBilingual pick={(c) => c.dashboardOverview.where.title} />}
          cards={overview.where}
          emptyMessage={<AppBilingual pick={(c) => c.dashboardOverview.where.empty} />}
        />
      </div>
    </div>
  );
}
