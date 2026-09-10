import { PageHeader } from "@/components/app/page-header";
import { FoundationOverview } from "@/components/app/foundation-overview";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { getRequestIdentity } from "@/lib/auth/dal";

/**
 * Operations Console overview (Phase 5.5, UIF-039 — contract §1).
 *
 * Deliberately contains no operational functionality — the role-separated work areas (compliance,
 * warehouse, finance, catalogue, audit, system) are 010-admin-operations-console's scope. This
 * exists so `/dashboard-admin` resolves as a route, which is what makes the layout's independent
 * authorization guard observable in Platform Story 1's Independent Test (quickstart.md Story 1).
 *
 * WHY THIS PAGE RE-VERIFIES (FR-006, Constitution Principle VIII): Next.js renders route segments
 * in PARALLEL, so a parent layout returning `StateScreen` instead of `{children}` does not stop
 * this page from executing and being serialized into the RSC payload. Every protected route
 * re-verifies its own request (research.md §2).
 *
 * This check is INDEPENDENT of the Member Portal's: it inspects `operationalRoles` only, never
 * `organization`.
 *
 * UIF-039 restyles this onto `PageHeader` and states honestly that live counts arrive with later
 * features — no estimated or sample figure anywhere on this page.
 */
export default async function DashboardAdminPage() {
  const identity = await getRequestIdentity();

  // Independent re-verification — identical predicate to the layout guard, enforced again here.
  if (
    identity.kind !== "authenticated" ||
    identity.operationalRoles.length === 0
  ) {
    return <StateScreen kind="unauthorized" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.adminWorkspace} />}
        description={<AppBilingual pick={(c) => c.modulesArriveLater} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} /> }]}
      />
      <FoundationOverview surface="admin" />
    </div>
  );
}
