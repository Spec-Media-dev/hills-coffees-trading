import { StateScreen } from "@/components/layout/state-screen";
import { getRequestIdentity } from "@/lib/auth/dal";

/**
 * Minimal Operations Console placeholder.
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
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Operations console
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The platform foundation is in place. Role-separated operational work
        areas arrive with later features.
      </p>
    </div>
  );
}
