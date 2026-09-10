import type { Metadata } from "next";

import { AppShell } from "@/components/app/app-shell";
import { buildMemberNavGroups } from "@/components/app/member-navigation";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";

/**
 * Member Portal (`/dashboard`) — server-side authorization guard (unchanged) + application shell
 * (Phase 5.5, UIF-036 — contract §1).
 *
 * SECURITY CONTRACT (contracts/route-surface-contract.md; Constitution Principle VIII) — UNCHANGED
 * BY THIS BLOCK, verified by `git diff` on this file:
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
 *
 * ── WHAT UIF-036 CHANGED ─────────────────────────────────────────────────────────────────────────
 *
 * Only the markup PAST the guard changed: the ad-hoc `<header>/<main>` pair is replaced by
 * `AppShell` (UIF-035). Both authorization checks above this comment are untouched, line for line —
 * `tests/design/uif-f.test.tsx` diffs this exact file against the pre-block commit to prove it.
 *
 * `buildMemberNavGroups({ canSell: false })` — HARDCODED, NOT READ FROM `identity`. Feature 004 owns
 * real capability resolution (`organization.canSell`); reading it here to drive navigation would be
 * exactly the "real capability resolution implemented early" this phase forbids (run directive §5,
 * §11). The `canSell: true` branch exists and is exercised only by `tests/design/uif-f.test.tsx`
 * (UIF-038's required component-level test).
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
        title={appCopy.noOrganization.title}
        description={appCopy.noOrganization.description}
      />
    );
  }

  return (
    <AppShell
      navGroups={buildMemberNavGroups({ canSell: false })}
      workspaceLabel={<AppBilingual pick={(c) => c.memberWorkspace} />}
      identitySubtitle={identity.organization.displayName}
      logoHref="/dashboard"
      footerNote={appCopy.roleVisibilityNote}
    >
      {children}
    </AppShell>
  );
}
