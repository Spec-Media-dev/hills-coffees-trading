import { AppBilingual } from "@/components/locale/app-bilingual";

import type { OrganizationMembership } from "@/lib/auth/types";

import type { ActionItem, DashboardModule, OverviewCard } from "./modules";

/**
 * Feature 004 T003 — composes registered module contributions into the four questions the approved
 * design system says a member overview must answer (spec PS2): what did I buy, what do I owe, where
 * is it, what does it need from me — plus the always-present account/status area.
 *
 * `.tsx`, not `.ts`: the account area's card title/label are real `<AppBilingual>` elements, the same
 * reason `lib/dashboard/registry.tsx` is `.tsx`.
 *
 * RUN B (T011) — wired into the live `src/app/dashboard/page.tsx`, replacing the `FoundationOverview`
 * placeholder RUN A left in place.
 */
export type OverviewComposition = {
  account: readonly OverviewCard[];
  bought: readonly OverviewCard[];
  owe: readonly OverviewCard[];
  where: readonly OverviewCard[];
  needsAction: readonly ActionItem[];
};

/**
 * The account area is composed DIRECTLY from the resolved acting organization — never through the
 * module registry (see `lib/dashboard/registry.tsx`'s header comment on why the "account" module
 * contributes no `overviewCards` of its own). This is what makes "with an empty registry the composer
 * returns only the account area" a meaningful, testable property: this area exists independently of
 * what is or is not registered.
 *
 * Deliberately minimal and truthful — organization name and the caller's own membership role, both
 * already resolved onto `RequestIdentity` by Feature 003 (`lib/auth/dal.ts`). No KYB/agreement status
 * is re-derived here: by the time a caller reaches the overview at all, `dashboard/layout.tsx` and
 * `dashboard/page.tsx` have already independently verified `isAuthorizedMember` and
 * `hasAcceptedCurrentAgreements` — re-summarising that same truth here would be exactly the
 * "duplicate or rewrite Feature 003" the run directive forbids, not a genuine overview contribution.
 */
function buildAccountArea(organization: OrganizationMembership): readonly OverviewCard[] {
  return [
    {
      id: "account-organization",
      area: "account",
      title: <AppBilingual pick={(c) => c.dashboardAccount.cardTitle} />,
      value: organization.displayName,
      description: (
        <>
          <AppBilingual pick={(c) => c.dashboardAccount.roleLabel} />: {organization.memberRole}
        </>
      ),
    },
  ];
}

/**
 * The one intrinsic (non-module) "needs your action" item this run genuinely surfaces: the current
 * agreement registry not yet accepted by the acting organization. Sourced directly from
 * `identity.hasAcceptedCurrentAgreements` (Feature 003, resolved fresh every request) — never
 * re-derived from `agreement_acceptances` here, which would duplicate Feature 003's own logic.
 *
 * HONEST LIMITATION (recorded, not hidden): on the LIVE `/dashboard` page, this condition can never
 * actually coexist with reaching `composeOverview` at all — `src/app/dashboard/page.tsx`'s existing,
 * already-verified agreement gate intercepts `hasAcceptedCurrentAgreements === false` with a
 * full-page `AgreementList` BEFORE this composer is ever called. This function exists and is proven
 * correct at the unit level (RUN B directive's own test requirement) as forward-compatible
 * infrastructure — restructuring that full-page gate into an inline action item was judged out of
 * this run's scope (it would change already-verified Feature 003 UX/behaviour, not merely add to it).
 * A KYB-remediation equivalent is NOT added here for the same structural reason, one step earlier:
 * `!identity.isAuthorizedMember` intercepts before this composer runs at all, for every KYB state
 * that would otherwise need remediation.
 */
function buildIntrinsicActionItems(hasAcceptedCurrentAgreements: boolean): readonly ActionItem[] {
  if (hasAcceptedCurrentAgreements) return [];
  return [
    {
      id: "accept-current-agreements",
      label: <AppBilingual pick={(c) => c.dashboardOverview.needsAction.acceptAgreements} />,
      href: "/dashboard/",
    },
  ];
}

/**
 * Composes the four module-contributed areas plus the account area. `registry` is the caller's
 * explicit `DashboardModule[]` (normally `DASHBOARD_MODULES` from `lib/dashboard/registry.tsx`) —
 * never imported implicitly, so a test can pass a controlled, empty, or fixture registry.
 *
 * Filtering by capability happens the same way `components/dashboard/sidebar.tsx#buildDashboardNavGroups`
 * does — a module's own `overviewCards`/`actionItems` are only invoked when its declared
 * `requiredCapability` is granted for this organization. A module contributing nothing (no function
 * provided) produces nothing — never a placeholder card (FR-006).
 */
export function composeOverview({
  organization,
  registry,
  hasAcceptedCurrentAgreements,
}: {
  organization: OrganizationMembership;
  registry: readonly DashboardModule[];
  hasAcceptedCurrentAgreements: boolean;
}): OverviewComposition {
  const context = { organization };
  const granted = (capability: DashboardModule["requiredCapability"]): boolean => {
    switch (capability) {
      case "member":
        return true;
      case "buy":
        return organization.canBuy;
      case "sell":
        return organization.canSell;
    }
  };

  const bought: OverviewCard[] = [];
  const owe: OverviewCard[] = [];
  const where: OverviewCard[] = [];
  const needsAction: ActionItem[] = [...buildIntrinsicActionItems(hasAcceptedCurrentAgreements)];

  for (const dashboardModule of registry) {
    if (!granted(dashboardModule.requiredCapability)) continue;

    const cards = dashboardModule.overviewCards?.(context) ?? [];
    for (const card of cards) {
      if (card.area === "bought") bought.push(card);
      else if (card.area === "owe") owe.push(card);
      else if (card.area === "where") where.push(card);
      // "account" area cards are never module-contributed (see buildAccountArea above) — a module
      // declaring one is a contract misuse, silently dropped rather than crashing the overview.
    }

    const actions = dashboardModule.actionItems?.(context) ?? [];
    for (const action of actions) {
      if (action.requiredCapability && !granted(action.requiredCapability)) continue;
      needsAction.push(action);
    }
  }

  return {
    account: buildAccountArea(organization),
    bought,
    owe,
    where,
    needsAction,
  };
}
