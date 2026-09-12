import type { AppNavGroup, AppNavItem } from "@/components/app/app-navigation";
import type { DashboardCapability, DashboardModule } from "@/lib/dashboard/modules";
import type { OrganizationMembership } from "@/lib/auth/types";

/**
 * Feature 004 T005 — builds the real, registry-driven `AppNavGroup[]` the Member Portal's sidebar
 * renders, replacing Feature 003's hardcoded `buildMemberNavGroups({ canSell: false })`
 * (`components/app/member-navigation.tsx`, now retired).
 *
 * DOES NOT DUPLICATE THE EXISTING SIDEBAR. This file exports no visual component — it is a pure data
 * transform, exactly the role `member-navigation.tsx` played before it. The actual rendering stays
 * entirely inside `components/app/sidebar.tsx`/`components/app/app-shell.tsx`
 * (Phase 5.5, shared by `/dashboard` and `/dashboard-admin`) — this file only produces the
 * `AppNavGroup[]` shape that shell already knows how to render. Building a second `<Sidebar>` here
 * would be exactly the "independent second navigation truth" the run directive forbids.
 *
 * CAPABILITY FILTERING IS PRESENTATIONAL ONLY (see `lib/dashboard/modules.ts`'s header comment). This
 * function decides what to SHOW. Every route a rendered entry links to independently re-verifies its
 * own authorization — hiding a link here never protects `/dashboard/settings` or any future module
 * route.
 */
function isCapabilityGranted(capability: DashboardCapability, organization: OrganizationMembership): boolean {
  switch (capability) {
    case "member":
      return true;
    case "buy":
      return organization.canBuy;
    case "sell":
      return organization.canSell;
  }
}

export function buildDashboardNavGroups({
  modules,
  organization,
}: {
  modules: readonly DashboardModule[];
  organization: OrganizationMembership;
}): AppNavGroup[] {
  const groupsByKey = new Map<string, { label: AppNavGroup["label"]; items: AppNavItem[] }>();
  const order: string[] = [];

  for (const dashboardModule of modules) {
    if (!isCapabilityGranted(dashboardModule.requiredCapability, organization)) continue;

    for (const group of dashboardModule.navGroups ?? []) {
      const items: AppNavItem[] = group.entries
        .filter((entry) => isCapabilityGranted(entry.requiredCapability, organization))
        .map((entry) => ({
          key: entry.id,
          label: entry.label,
          href: entry.href,
          icon: entry.icon,
          description: entry.description,
        }));

      if (items.length === 0) continue;

      const existing = groupsByKey.get(group.key);
      if (existing) {
        // A second module contributing into an already-seen group key — merge, never a duplicate
        // group header with the same label (e.g. a future module also adding an "account" entry).
        existing.items.push(...items);
      } else {
        groupsByKey.set(group.key, { label: group.label, items });
        order.push(group.key);
      }
    }
  }

  return order.map((key) => {
    const group = groupsByKey.get(key)!;
    return { key, label: group.label, items: group.items };
  });
}
