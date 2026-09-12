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
 * NOT WIRED TO A LIVE PAGE YET (Feature 004 RUN A is Phase 1 "module contract" + Phase 2 "shell
 * layout" only). `src/app/dashboard/page.tsx` still renders `FoundationOverview` — Phase 4 (T011)
 * replaces that with this composer's output. This file exists now, proven by its own unit tests, so
 * later modules have a stable contract to register against before Phase 4 lands.
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
}: {
  organization: OrganizationMembership;
  registry: readonly DashboardModule[];
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
  const needsAction: ActionItem[] = [];

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
