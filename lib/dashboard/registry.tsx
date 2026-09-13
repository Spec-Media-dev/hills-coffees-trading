import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";
import { getStoredAllocationsCount } from "@/lib/inventory/allocations";
import { getInventoryPositionsCount } from "@/lib/inventory/positions";
import { getManagedListingsCount } from "@/lib/listings/manage";
import { getOrderCountsForOrganization } from "@/lib/orders/read";

import type { DashboardModule, OverviewCard } from "./modules";

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
  /**
   * Feature 005 RUN B (T015, reconciled) — the first genuinely-live business module, and the first to
   * contribute real `overviewCards` THROUGH the module contract rather than a page-level workaround.
   * `DashboardModule.overviewCards` may be async (`lib/dashboard/modules.ts`'s doc comment) precisely
   * to support this: two bounded COUNT-only reads (`getInventoryPositionsCount`,
   * `getStoredAllocationsCount` — `{ count: "exact", head: true }`, no row data, no full scan),
   * resolved fresh per call from `context.organization.organizationId` alone — no ambient state, no
   * caching, no client-side authority; declaration is still never authorization (every route this
   * module links to independently re-verifies its own access, unchanged).
   *
   * A zero count contributes NO card (never a fabricated "0 positions"/"0 allocations") — the
   * existing honest empty-state message in `dashboardOverview.bought.empty`/`where.empty` keeps
   * showing on `src/app/dashboard/page.tsx`.
   *
   * History (`/dashboard/inventory/history`) intentionally has NO separate top-level nav entry — it
   * is discoverable from the inventory list page's own header action, per the run directive
   * ("do not overload top-level nav without reason").
   */
  {
    id: "inventory",
    requiredCapability: "buy",
    navGroups: [
      {
        key: "trading",
        label: <AppBilingual pick={(c) => c.inventory.nav.inventory} />,
        entries: [
          {
            id: "inventory",
            label: <AppBilingual pick={(c) => c.inventory.nav.inventory} />,
            href: "/dashboard/inventory",
            icon: <Icon name="package" className="size-[18px]" />,
            requiredCapability: "buy",
          },
          {
            id: "storage",
            label: <AppBilingual pick={(c) => c.inventory.nav.storage} />,
            href: "/dashboard/storage",
            icon: <Icon name="truck" className="size-[18px]" />,
            requiredCapability: "buy",
          },
        ],
      },
    ],
    overviewCards: async ({ organization }) => {
      const [positionsCount, storedCount] = await Promise.all([
        getInventoryPositionsCount({ organizationId: organization.organizationId }),
        getStoredAllocationsCount({ organizationId: organization.organizationId }),
      ]);

      const cards: OverviewCard[] = [];
      if (positionsCount > 0) {
        cards.push({
          id: "inventory-positions",
          area: "bought",
          title: <AppBilingual pick={(c) => c.inventory.overview.positionsCard} />,
          value: (
            <AppBilingual
              pick={(c) =>
                (positionsCount === 1 ? c.inventory.overview.positionsValue : c.inventory.overview.positionsValuePlural).replace(
                  "{count}",
                  String(positionsCount)
                )
              }
            />
          ),
          href: "/dashboard/inventory",
        });
      }
      if (storedCount > 0) {
        cards.push({
          id: "inventory-stored",
          area: "where",
          title: <AppBilingual pick={(c) => c.inventory.overview.storedCard} />,
          value: (
            <AppBilingual
              pick={(c) => (storedCount === 1 ? c.inventory.overview.storedValue : c.inventory.overview.storedValuePlural).replace("{count}", String(storedCount))}
            />
          ),
          href: "/dashboard/storage",
        });
      }
      return cards;
    },
  },
  /**
   * Feature 006 RUN C (T020) — the marketplace module. `coffee` (browse) is `requiredCapability:
   * "buy"` at the ENTRY level — every authorized member (buyer or seller; selling is additive on top
   * of buying, Constitution Principle VI, `lib/dashboard/modules.ts`'s own doc comment) sees it.
   * `listings`/`sales` are `requiredCapability: "sell"` at the entry level, so a buyer-only
   * organization never sees them in nav — but per this file's own established rule, that hiding is
   * PRESENTATIONAL ONLY: `src/app/dashboard/listings/page.tsx`,
   * `src/app/dashboard/listings/[offerId]/page.tsx` and `src/app/dashboard/sales/page.tsx` each
   * independently re-verify `organization.canSell` server-side (T016/T017/T019's own guards) — a
   * buyer-only organization reaching any of those URLs directly is refused there regardless of what
   * this registry ever rendered.
   *
   * The module's own top-level `requiredCapability` is `"buy"` (not `"sell"`) because the `coffee`
   * entry must render for buyer-only organizations too — an entry-level capability narrower than the
   * module's own would otherwise never be reached (`buildDashboardNavGroups` skips the WHOLE module
   * first if the module-level capability is not granted).
   */
  {
    id: "marketplace",
    requiredCapability: "buy",
    navGroups: [
      {
        key: "marketplace",
        label: <AppBilingual pick={(c) => c.marketplace.title} />,
        entries: [
          {
            id: "coffee",
            label: <AppBilingual pick={(c) => c.marketplace.title} />,
            href: "/dashboard/coffee",
            icon: <Icon name="tag" className="size-[18px]" />,
            requiredCapability: "buy",
          },
          {
            id: "listings",
            label: <AppBilingual pick={(c) => c.listings.manage.title} />,
            href: "/dashboard/listings",
            icon: <Icon name="clipboard-list" className="size-[18px]" />,
            requiredCapability: "sell",
          },
          {
            id: "sales",
            label: <AppBilingual pick={(c) => c.listings.sales.title} />,
            href: "/dashboard/sales",
            icon: <Icon name="wallet" className="size-[18px]" />,
            requiredCapability: "sell",
          },
        ],
      },
    ],
    overviewCards: async ({ organization }) => {
      // Seller-only contribution — a buyer-only organization contributes nothing here (never a
      // fabricated "0 listings" card), mirroring the inventory module's own zero-count discipline.
      if (!organization.canSell) return [];

      const listingsCount = await getManagedListingsCount({ organizationId: organization.organizationId });
      if (listingsCount === 0) return [];

      const cards: OverviewCard[] = [
        {
          id: "marketplace-listings",
          area: "where",
          title: <AppBilingual pick={(c) => c.listings.manage.overview.listingsCard} />,
          value: (
            <AppBilingual
              pick={(c) =>
                (listingsCount === 1 ? c.listings.manage.overview.listingsValue : c.listings.manage.overview.listingsValuePlural).replace(
                  "{count}",
                  String(listingsCount)
                )
              }
            />
          ),
          href: "/dashboard/listings",
        },
      ];
      return cards;
    },
  },
  /**
   * Feature 007 RUN C (T018) — the orders module. ONE entry, `orders`, at `requiredCapability:
   * "buy"` on BOTH the module and the entry: every buy-capable organization sees it — buyer-only
   * AND seller-that-also-buys alike (selling is additive on top of buying; the entry is never hidden
   * because `canSell` is true) — and an organization without buy capability never sees it. Per this
   * file's own established rule that hiding is PRESENTATIONAL ONLY: `src/app/dashboard/orders/*`
   * re-verify identity/membership (and, for every write, `canBuy`) server-side regardless of what
   * this registry rendered. The `trading` group key merges this entry under the same group header as
   * Feature 005's inventory/storage entries rather than adding a second "Trading" header.
   *
   * Overview cards answer the two approved questions with BOUNDED, org-scoped COUNT-only reads of
   * stored statuses (`getOrderCountsForOrganization`) — no financial figure is aggregated or computed
   * here; zero-count cards are omitted (the same discipline as every other module).
   */
  {
    id: "orders",
    requiredCapability: "buy",
    navGroups: [
      {
        key: "trading",
        label: <AppBilingual pick={(c) => c.inventory.nav.inventory} />,
        entries: [
          {
            id: "orders",
            label: <AppBilingual pick={(c) => c.orders.nav.orders} />,
            href: "/dashboard/orders",
            icon: <Icon name="file-text" className="size-[18px]" />,
            requiredCapability: "buy",
          },
        ],
      },
    ],
    overviewCards: async ({ organization }) => {
      const { purchased, awaitingPayment } = await getOrderCountsForOrganization({ organizationId: organization.organizationId });

      const cards: OverviewCard[] = [];
      if (purchased > 0) {
        cards.push({
          id: "orders-bought",
          area: "bought",
          title: <AppBilingual pick={(c) => c.orders.overview.boughtCard} />,
          value: <AppBilingual pick={(c) => (purchased === 1 ? c.orders.overview.boughtValue : c.orders.overview.boughtValuePlural).replace("{count}", String(purchased))} />,
          href: "/dashboard/orders",
        });
      }
      if (awaitingPayment > 0) {
        cards.push({
          id: "orders-owe",
          area: "owe",
          title: <AppBilingual pick={(c) => c.orders.overview.oweCard} />,
          value: <AppBilingual pick={(c) => (awaitingPayment === 1 ? c.orders.overview.oweValue : c.orders.overview.oweValuePlural).replace("{count}", String(awaitingPayment))} />,
          href: "/dashboard/orders",
        });
      }
      return cards;
    },
  },
];
