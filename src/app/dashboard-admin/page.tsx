import { AdminOverviewSections } from "@/components/admin/overview";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { getAdminOverview } from "@/lib/admin/read";
import { getRequestIdentity } from "@/lib/auth/dal";

/**
 * Operations Console overview (`/dashboard-admin`) — Feature 010 T006, replacing the Phase 5.5
 * UIF-039 placeholder ("modules arrive with later features").
 *
 * WHY THIS PAGE RE-VERIFIES (FR-006, Constitution Principle VIII): Next.js renders route segments
 * in PARALLEL, so a parent layout returning `StateScreen` instead of `{children}` does not stop
 * this page from executing and being serialized into the RSC payload. Every protected route
 * re-verifies its own request (research.md §2). The predicate below is Feature 001's, unchanged.
 *
 * This check is INDEPENDENT of the Member Portal's: it inspects `operationalRoles` only, never
 * `organization`.
 *
 * WHAT RENDERS: `getAdminOverview(identity.operationalRoles)` — role-shaped sections whose every
 * figure is a live count under the operator's own session (`lib/admin/read.ts`). A WAREHOUSE-only
 * operator receives no Finance section, a FINANCE-only operator no Compliance one; an ADMIN sees
 * the sections the database's own hierarchical functions attest. No sample, estimated or seeded
 * figure exists anywhere on this page (spec FR-016 / SC-008); an empty system shows empty states.
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

  const sections = await getAdminOverview(identity.operationalRoles);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.overview.title} />}
        description={<AppBilingual pick={(c) => c.admin.overview.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} /> }]}
      />
      <AdminOverviewSections sections={sections} />
    </div>
  );
}
