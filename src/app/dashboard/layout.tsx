import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PreAuthHeader } from "@/components/app/pre-auth-header";
import { OnboardingExperience } from "@/components/account/onboarding-experience";
import { OrganizationSelector } from "@/components/account/organization-selector";
import { ResendVerificationButton } from "@/components/account/resend-verification-button";
import { buildDashboardNavGroups } from "@/components/dashboard/sidebar";
import { DashboardTopbarActions } from "@/components/dashboard/topbar";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { DASHBOARD_MODULES } from "@/lib/dashboard/registry";

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
 * ── WHAT FEATURE 004 RUN A CHANGED (T004) ───────────────────────────────────────────────────────
 *
 * Only the final, already-authorized `AppShell` return block below changed — every guard branch
 * above it (including the two `git diff`-protected predicate lines) is untouched. The previously
 * HARDCODED `buildMemberNavGroups({ canSell: false })` (`components/app/member-navigation.tsx`, now
 * retired) is replaced with `buildDashboardNavGroups` (`components/dashboard/sidebar.tsx`), which
 * reads the ACTING organization's real `canBuy`/`canSell` — resolved fresh every request by
 * `getRequestIdentity()`, never cached — against the module registry (`lib/dashboard/registry.tsx`).
 * This is exactly the real capability resolution Feature 003's own comment on this file reserved for
 * Feature 004. Navigation visibility from this is still never the authorization boundary (SEC-002):
 * every route a rendered entry links to independently re-verifies its own access.
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
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <PreAuthHeader />
        <main className="flex flex-1 flex-col">
          <StateScreen kind="unauthorized" />
        </main>
      </div>
    );
  }

  // T033 remediation — SECURITY-CRITICAL, checked before ANY protected data below is fetched or
  // rendered by a child Server Component. A session that must complete an MFA step-up (a verified
  // factor exists and this session has not yet reached `aal2`) is redirected to the SAME `/mfa/`
  // destination `sign-in/actions.ts`/`admin/sign-in/actions.ts` already use — an application-layer
  // gate in front of the real, database-level boundary (`mfa_satisfied()`-gated RLS; see the T033
  // remediation migration), never a substitute for it. This is never a blanket "every user needs
  // MFA" rule — `identity.requiresMfaStepUp` is `false` for the overwhelming majority of accounts,
  // which have never enrolled a factor at all (Supabase's own AAL semantics already encode that).
  if (identity.requiresMfaStepUp) {
    redirect("/mfa/");
  }

  // Every branch below this point is reachable only by an authenticated caller, but still BEFORE
  // the business `AppShell` (whose own `Topbar` carries the theme/locale toggles) — none of these
  // states get that shell, so `PreAuthHeader` supplies the same theme/locale controls and a way
  // back to the public site that every other pre-authenticated surface already has (`(auth)/layout.tsx`).
  // Feature 003 T007 — gates everything past this point; an unverified email is denied the shell
  // outright, never merely shown a warning banner over otherwise-accessible content.
  if (!identity.isEmailVerified) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <PreAuthHeader />
        <main className="flex flex-1 flex-col">
          <StateScreen kind="forbidden" title={appCopy.emailNotVerified.title} description={appCopy.emailNotVerified.description}>
            <ResendVerificationButton />
          </StateScreen>
        </main>
      </div>
    );
  }

  // Feature 003 T002 — a multi-organization user with no valid acting-org selection yet is shown
  // the honest choice, never silently routed under the wrong organization and never conflated with
  // "no organization at all" (the check immediately below, which only ever triggers once this one
  // has ruled out the ambiguous case).
  if (identity.requiresOrganizationSelection) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <PreAuthHeader />
        <main className="flex flex-1 flex-col">
          <OrganizationSelector organizations={identity.organizations} redirectTo="/dashboard/" />
        </main>
      </div>
    );
  }

  // Feature 003 T012 — a verified, unattached user gets the real onboarding experience, not a
  // static "no organization" dead end. Rendered inline (same precedent as `OrganizationSelector`
  // above) rather than as a separate route.
  if (identity.organization === null) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <PreAuthHeader />
        <main className="flex flex-1 flex-col">
          <OnboardingExperience />
        </main>
      </div>
    );
  }

  // Feature 003 T013/critical access rule — an organization existing is NOT authorization. A
  // `PENDING_KYB` (or otherwise not-yet-authorized) organization must never reach the ordinary
  // business dashboard shell below. `isAuthorizedMember` comes from `is_authorized_member()`
  // (never a raw `organizations.status` read) — the same authority `lib/auth/eligibility.ts`
  // translates into `nextAction: "await-authorization"`.
  //
  // RUN B (T016–T022) CHANGE FROM RUN A: this branch used to return a single static
  // `<AwaitingKybState />` in place of `{children}`, which structurally prevented any real route
  // under `/dashboard/*` from ever rendering while an organization is not yet authorized — but
  // T016 requires exactly such a route (`/dashboard/kyb/`, the real draft/upload/submit screen).
  // `{children}` now DOES render past this point, inside a shell that carries no business nav group
  // — `AppShell` (with its real, capability-driven nav) is reached only in the final `return` below,
  // strictly after this check, so the "no protected business modules pre-approval" property is unchanged: what
  // changed is which non-business content is allowed to render, not whether business content can.
  // Each page under `/dashboard/*` independently re-verifies `isAuthorizedMember` itself (the same
  // rule this file's own header comment already states) and is responsible for rendering only
  // KYB-appropriate content for its own route — `/dashboard/page.tsx` shows the state-aware KYB
  // status hub, `/dashboard/kyb/page.tsx` shows the draft/upload screen for the editable states.
  if (!identity.isAuthorizedMember) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <PreAuthHeader />
        <main className="flex flex-1 flex-col">
          {children}
        </main>
      </div>
    );
  }

  return (
    <AppShell
      navGroups={buildDashboardNavGroups({ modules: DASHBOARD_MODULES, organization: identity.organization })}
      workspaceLabel={<AppBilingual pick={(c) => c.memberWorkspace} />}
      identitySubtitle={identity.organization.displayName}
      logoHref="/dashboard"
      footerNote={appCopy.roleVisibilityNote}
      topbarActions={
        <DashboardTopbarActions
          displayName={identity.profile.fullName ?? identity.profile.companyName ?? "Account"}
          organizationName={identity.organization.displayName}
        />
      }
    >
      {children}
    </AppShell>
  );
}
