import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";

import type { DashboardModule } from "./modules";

/**
 * Feature 004 T002 — the static registry of IMPLEMENTED dashboard modules.
 *
 * `.tsx`, not `.ts`, deliberately: `NavEntry.label` needs a real `<AppBilingual>` element for
 * server-rendered EN/AR (the same reason `components/app/member-navigation.tsx`, this file's
 * now-retired predecessor, was also `.tsx`).
 *
 * ONLY GENUINELY-EXISTING ROUTES ARE LISTED HERE. No Inventory/Orders/Payments/Delivery/Listings
 * entry exists yet, because none of those routes exists yet (FR-006) — adding one here before its
 * owning feature (005–009, 012) ships would be exactly the "placeholder that implies a module
 * already exists" the run directive forbids. `lib/dashboard/overview.ts` composes an honestly empty
 * `bought`/`owe`/`where`/`needsAction` result from this registry until such a module registers.
 *
 * The "account" module below covers exactly the two live `/dashboard` destinations Feature 003
 * already ships (the Overview page itself, and the combined Settings page — profile, organization
 * contact, team members, acting-organization switcher all live on that ONE route today). It
 * contributes no `overviewCards`/`actionItems` — its own identity/status summary is composed
 * directly from `RequestIdentity` by `lib/dashboard/overview.ts`'s `account` area, not through this
 * module system, so there is nothing here to duplicate 003's own logic with.
 *
 * FEATURE 004 T018 — "Profile" and "Organization" are the Settings entry below (with a
 * `description` making that explicit, reusing the already-reviewed `settingsPage.description`
 * copy — no new string invented). "Agreements" and "KYB Status" get NO separate nav entry: neither
 * has a route an already-authorized member can actually reach today. `/dashboard/kyb/` redirects an
 * authorized member straight back to `/dashboard/` (`src/app/dashboard/kyb/page.tsx`'s own guard),
 * and there is no standalone "view your accepted agreements" page — both only ever appear as
 * full-page GATES an ineligible/not-yet-accepted caller sees on the way IN, never as a destination an
 * already-eligible member can navigate BACK to. Registering a nav entry for either would be exactly
 * the "invent a route merely because the task names a conceptual destination" the run directive
 * forbids. This is a genuine, honestly-documented product gap for a future run to decide on
 * deliberately (e.g. a read-only agreement-history view), not something to route around here.
 */
export const DASHBOARD_MODULES: readonly DashboardModule[] = [
  {
    id: "account",
    requiredCapability: "member",
    navGroups: [
      {
        key: "overview",
        label: <AppBilingual pick={(c) => c.overview} />,
        entries: [
          {
            id: "overview",
            label: <AppBilingual pick={(c) => c.overview} />,
            href: "/dashboard",
            icon: <Icon name="layout-grid" className="size-[18px]" />,
            requiredCapability: "member",
          },
        ],
      },
      {
        key: "account",
        label: <AppBilingual pick={(c) => c.account} />,
        entries: [
          {
            id: "settings",
            label: <AppBilingual pick={(c) => c.settings} />,
            href: "/dashboard/settings",
            icon: <Icon name="settings" className="size-[18px]" />,
            description: <AppBilingual pick={(c) => c.settingsPage.description} />,
            requiredCapability: "member",
          },
        ],
      },
    ],
  },
];
