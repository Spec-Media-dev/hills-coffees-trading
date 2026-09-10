import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { getRequestIdentity } from "@/lib/auth/dal";

/**
 * Member Portal overview (Phase 5.5, UIF-036 — contract §1).
 *
 * Deliberately contains no business functionality — the member overview and its modules are
 * 004-member-dashboard's scope, and every business module is 005-012's. This exists so `/dashboard`
 * resolves as a route, which is what makes the layout's authorization guard observable in Platform
 * Story 1's Independent Test (quickstart.md Story 1).
 *
 * WHY THIS PAGE RE-VERIFIES (FR-006, Constitution Principle VIII):
 *
 * Next.js renders route segments in PARALLEL. A parent layout that returns `StateScreen` instead of
 * `{children}` does NOT prevent this page from executing — the page still runs and its output is
 * still serialized into the RSC flight payload. A layout guard alone therefore protects the visible
 * shell but not the data. That is why FR-006 requires every protected route to independently
 * re-verify authorization for its own request, and why Next's own auth guidance puts the real check
 * as close to the data as possible (research.md §2).
 *
 * Every later page under `/dashboard` MUST follow this pattern before fetching protected data.
 *
 * UIF-036 restyles this onto `PageHeader` and states honestly, via the T000-style copy dictionary,
 * that modules arrive with later features — no invented number, order, balance or KPI anywhere.
 */
export default async function DashboardPage() {
  const identity = await getRequestIdentity();

  // Independent re-verification — identical predicate to the layout guard, enforced again here.
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }

  return (
    <PageHeader
      title={<AppBilingual pick={(c) => c.memberWorkspace} />}
      description={<AppBilingual pick={(c) => c.modulesArriveLater} />}
      trail={[{ label: <AppBilingual pick={(c) => c.overview} /> }]}
    />
  );
}
