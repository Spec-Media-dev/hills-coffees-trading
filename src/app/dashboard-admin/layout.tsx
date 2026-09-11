import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { buildAdminNavGroups } from "@/components/app/admin-navigation";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";

/**
 * Operations Console (`/dashboard-admin`) — server-side authorization guard (unchanged) +
 * application shell (Phase 5.5, UIF-039 — contract §1).
 *
 * SECURITY CONTRACT (contracts/route-surface-contract.md; Constitution Principles V and VIII) —
 * UNCHANGED BY THIS BLOCK; `tests/design/uif-g.test.tsx` diffs this exact file against the
 * pre-block commit to prove it:
 *
 * - Access requires `kind: "authenticated"` AND a non-empty `operationalRoles` (i.e. the database
 *   attests at least one operational role for this user via its own SECURITY DEFINER role
 *   functions).
 * - This guard is COMPLETELY INDEPENDENT of the Member Portal guard. It never inspects a
 *   membership object. A fully approved trading member with no `platform_admins` row is
 *   denied here, and an operator with no organization membership is denied in `/dashboard`.
 *   Member access never implies admin access, and admin access never implies member access
 *   (spec FR-004, Story 1 AS4, Edge Cases).
 * - Least privilege: a non-empty `operationalRoles` grants entry to the console shell only. Each
 *   area inside the console must additionally verify the specific role it requires (010's scope) —
 *   this guard is the outer boundary, not a universal admin capability.
 *
 * ── WHAT UIF-039 CHANGED ─────────────────────────────────────────────────────────────────────────
 *
 * Only the markup past the guard: the ad-hoc `<header>/<main>` pair is replaced by the SAME
 * `AppShell` UIF-035 built for `/dashboard` — the two surfaces share one shell architecture at
 * different navigation density, never a second design system (contract §1, §27 of this run's
 * directive).
 *
 * `buildAdminNavGroups([])` — an EMPTY role array, not `identity.operationalRoles`. Reading the
 * real roles here to filter navigation would be exactly the "read a role" UIF-041 forbids; an empty
 * array is the honest neutral default for "no role information is available to this phase", and it
 * happens to also be the correct answer today, because `Overview` — the only real route this phase
 * ships — is role-agnostic and renders regardless (see `admin-navigation.tsx`). No dead module link
 * is ever rendered on this live route (contract §29 of this run's directive).
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

  // Admin-auth correction: an anonymous visitor to the OPERATIONS console is sent to the
  // DEDICATED admin sign-in route, never the member `/sign-in/` page (`src/proxy.ts` already
  // handles the common no-cookie case optimistically; this covers the stale/expired-cookie edge
  // case that reaches this layout guard for real). The guard predicate itself — the actual
  // authorization boundary — is untouched: only what renders for a denied anonymous request
  // changed, from a static card to a redirect to the correct sign-in surface.
  if (identity.kind !== "authenticated") {
    redirect("/admin/sign-in/");
  }

  // T033 remediation — same session-assurance gate as the Member Portal
  // (`src/app/dashboard/layout.tsx`), applied uniformly: `adminSignIn` already redirects a
  // step-up-pending session to `/mfa/` at sign-in time, so an operator who later reaches this
  // layout with a stale/expired step-up (e.g. re-entering via a bookmarked URL after their session
  // partially expired) must be denied here too, before any operational-role content renders.
  if (identity.requiresMfaStepUp) {
    redirect("/mfa/");
  }

  if (identity.operationalRoles.length === 0) {
    return (
      <StateScreen
        kind="forbidden"
        title={appCopy.noOperationalRole.title}
        description={appCopy.noOperationalRole.description}
      />
    );
  }

  return (
    <AppShell
      navGroups={buildAdminNavGroups([])}
      workspaceLabel={<AppBilingual pick={(c) => c.adminWorkspace} />}
      identitySubtitle={identity.operationalRoles.join(" · ")}
      logoHref="/dashboard-admin"
      footerNote={appCopy.roleVisibilityNote}
    >
      {children}
    </AppShell>
  );
}
