import type { Metadata } from "next";

import { StateScreen } from "@/components/layout/state-screen";
import { getRequestIdentity } from "@/lib/auth/dal";

/**
 * Operations Console (`/dashboard-admin`) — server-side authorization guard.
 *
 * SECURITY CONTRACT (contracts/route-surface-contract.md; Constitution Principles V and VIII):
 *
 * - Access requires `kind: "authenticated"` AND a non-empty `operationalRoles` (i.e. the database
 *   attests at least one operational role for this user via its own SECURITY DEFINER role
 *   functions).
 * - This guard is COMPLETELY INDEPENDENT of the Member Portal guard. It never inspects
 *   `identity.organization`. A fully approved trading member with no `platform_admins` row is
 *   denied here, and an operator with no organization membership is denied in `/dashboard`.
 *   Member access never implies admin access, and admin access never implies member access
 *   (spec FR-004, Story 1 AS4, Edge Cases).
 * - Least privilege: a non-empty `operationalRoles` grants entry to the console shell only. Each
 *   area inside the console must additionally verify the specific role it requires (010's scope) —
 *   this guard is the outer boundary, not a universal admin capability.
 */

export const metadata: Metadata = {
  title: "Operations console",
  // Private surface — never indexable (FR-013 / SEO-APP-01).
  robots: { index: false, follow: false },
};

export default async function DashboardAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await getRequestIdentity();

  if (identity.kind !== "authenticated") {
    return <StateScreen kind="unauthorized" />;
  }

  if (identity.operationalRoles.length === 0) {
    return (
      <StateScreen
        kind="forbidden"
        title="Operations access required"
        description="Your account is signed in, but it does not hold an operational role for the Hills Coffee operations console."
      />
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border px-6 py-4">
        <p className="text-sm font-medium text-foreground">Operations console</p>
        <p className="text-xs text-muted-foreground">
          {identity.operationalRoles.join(" · ")}
        </p>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
