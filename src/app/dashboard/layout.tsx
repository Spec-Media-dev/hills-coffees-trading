import type { Metadata } from "next";

import { StateScreen } from "@/components/layout/state-screen";
import { getRequestIdentity } from "@/lib/auth/dal";

/**
 * Member Portal (`/dashboard`) — server-side authorization guard.
 *
 * SECURITY CONTRACT (contracts/route-surface-contract.md; Constitution Principle VIII):
 *
 * - The guard runs here, at the top of the surface's root layout, BEFORE any child route renders.
 *   `{children}` is only returned once the check has passed, so a denied request never triggers a
 *   protected page's data fetching and never partially renders protected content.
 * - Access requires `kind: "authenticated"` AND a non-null `organization`. An authenticated user
 *   with no active organization membership is denied — authentication alone is never authorization.
 * - This guard checks `organization` ONLY. It never inspects `operationalRoles`. Passing this check
 *   grants nothing in `/dashboard-admin`, and holding an operational role grants nothing here
 *   (independence rule, Story 1 AS4).
 * - Navigation visibility is never the boundary: later features' pages and Server Actions must each
 *   re-verify authorization independently rather than relying on this layout alone.
 */

export const metadata: Metadata = {
  title: "Member portal",
  // Private surface — never indexable (FR-013 / SEO-APP-01).
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await getRequestIdentity();

  if (identity.kind !== "authenticated") {
    return <StateScreen kind="unauthorized" />;
  }

  if (identity.organization === null) {
    return (
      <StateScreen
        kind="forbidden"
        title="No organization linked to your account"
        description="Your account is not yet linked to an approved organization, so the member portal is unavailable. Hills Coffee operations complete this step as part of membership onboarding."
      />
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border px-6 py-4">
        <p className="text-sm font-medium text-foreground">
          {identity.organization.displayName}
        </p>
        <p className="text-xs text-muted-foreground">Member portal</p>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
