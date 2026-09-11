import { PageHeader } from "@/components/app/page-header";
import { FoundationOverview } from "@/components/app/foundation-overview";
import { AgreementList } from "@/components/account/agreements/agreement-list";
import { KybStatusScreen } from "@/components/account/kyb-status-screen";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { getOrganizationAgreementAcceptances } from "@/lib/agreements/acceptance-status";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getEligibility } from "@/lib/auth/eligibility";
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.memberWorkspace} />}
        description={<AppBilingual pick={(c) => c.modulesArriveLater} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} /> }]}
      />
      <FoundationOverview surface="member" />
    </div>
  );
}
