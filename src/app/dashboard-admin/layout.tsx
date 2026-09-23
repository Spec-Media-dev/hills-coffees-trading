import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminRoleBadges } from "@/components/admin/role-badges";
import { AdminStateCard } from "@/components/admin/state-card";
import { AdminTopbarActions } from "@/components/admin/topbar";
import { AppShell } from "@/components/app/app-shell";
import { buildAdminNavGroups } from "@/components/app/admin-navigation";
import { AppBilingual } from "@/components/locale/app-bilingual";
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
 * ── WHAT UIF-039 CHANGED (Phase 5.5) ─────────────────────────────────────────────────────────────
 *
 * Only the markup past the guard: the ad-hoc `<header>/<main>` pair is replaced by the SAME
 * `AppShell` UIF-035 built for `/dashboard` — the two surfaces share one shell architecture at
 * different navigation density, never a second design system.
 *
 * ── WHAT FEATURE 010 RUN A (T003) CHANGED ────────────────────────────────────────────────────────
 *
 * Still only the markup past the guard — the three guard statements above are byte-identical.
 * Navigation is now shaped from `identity.operationalRoles` through `buildAdminNavGroups()`, which
 * reads the single access matrix (`lib/admin/areas.ts`): an operator sees only the groups/areas
 * their attested roles permit. That shaping is PRESENTATION ONLY — every `/dashboard-admin/*` route
 * group carries its own server-side layout guard that calls the area's specific role function live
 * (`lib/admin/guards.ts`, T002/T004); hiding or showing an entry here grants nothing. The topbar
 * carries the operator's role badges, and an account menu (`components/admin/topbar.tsx`) with the
 * self-account route and the real sign-out action. This layout still never inspects a membership
 * object (FR-001 — operations access never implies member capability, and vice versa).
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
      <main className="flex flex-1 flex-col p-6">
        {/* T037: bilingual (the shared StateScreen takes strings only); same state as the per-area refusal. */}
        <AdminStateCard
          kind="no-operational-role"
          icon="shield"
          title={<AppBilingual pick={(c) => c.noOperationalRole.title} />}
          description={<AppBilingual pick={(c) => c.noOperationalRole.description} />}
        />
      </main>
    );
  }

  return (
    <AppShell
      navGroups={buildAdminNavGroups(identity.operationalRoles)}
      workspaceLabel={<AppBilingual pick={(c) => c.adminWorkspace} />}
      identitySubtitle={<AdminRoleBadges roles={identity.operationalRoles} />}
      logoHref="/dashboard-admin"
      footerNote={appCopy.roleVisibilityNote}
      topbarActions={<AdminTopbarActions displayName={identity.profile.fullName} avatarPath={identity.profile.avatarPath} roles={identity.operationalRoles} />}
    >
      {children}
    </AppShell>
  );
}
