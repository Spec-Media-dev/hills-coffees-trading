/**
 * The public route table and the primary navigation order (Phase 5.5, UIF-020/UIF-021).
 *
 * Extracted from `site-header.tsx` so the Server-Component header and the Client-Component mobile
 * drawer can share one definition without the drawer dragging the whole header into the client
 * bundle. `site-header.tsx` re-exports `PUBLIC_ROUTES`, so every existing import keeps working.
 *
 * Server-safe: no client directive, no `react` import, no copy strings — only paths and dictionary
 * keys. Paths are technical constants and never belong in the copy dictionary (contract §3.7).
 */

/**
 * The canonical public route paths this feature owns, in enforced trailing-slash form (FR-026).
 *
 * `/knowledge/*` and `/legal/*` are deliberately ABSENT: no approved content source exists for
 * editorial or legal pages (CONTENT-01), and a navigation entry pointing at an unbuilt page is a
 * dead end for visitors and crawlers alike. They are added by whichever feature resolves
 * CONTENT-01 — not here, and not as a placeholder.
 */
export const PUBLIC_ROUTES = {
  home: "/",
  coffee: "/coffee/",
  origins: "/origins/",
  sourcing: "/sourcing/",
  about: "/about/",
  contact: "/contact/",
  portalEntry: "/portal-entry/",
} as const;

/** Keys into `copy.nav`, so a label is looked up rather than duplicated per surface. */
export type NavKey = "coffee" | "origins" | "sourcing" | "about" | "contact";

export type NavItem = {
  href: string;
  key: NavKey;
};

/**
 * Primary navigation, in the order `docs/design-guidance/Hills-Coffee-Website-Recommendations.md`
 * requires: Coffee, Origins and Sourcing lead; About and Contact follow (public convergence pass —
 * both are real static routes). The commercial CTA and the Trading Portal entry are actions rather
 * than navigation, so they are composed separately by each surface — that is what keeps the portal
 * entry visually secondary to the CTA (FR-016).
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: PUBLIC_ROUTES.coffee, key: "coffee" },
  { href: PUBLIC_ROUTES.origins, key: "origins" },
  { href: PUBLIC_ROUTES.sourcing, key: "sourcing" },
  { href: PUBLIC_ROUTES.about, key: "about" },
  { href: PUBLIC_ROUTES.contact, key: "contact" },
] as const;

/**
 * Desktop flyout panels (public convergence pass). Keyed by the nav item that opens them; an item
 * without an entry (Contact) is a plain link. Every `href` below is a route in `PUBLIC_ROUTES` —
 * there is no destination here that does not exist. Image paths are small editorial crops used at
 * small-slot size, never a record's media (MEDIA-01).
 */
export type MegaMenuKey = "coffee" | "origins" | "sourcing" | "about";

export type MegaMenuPanel = {
  key: MegaMenuKey;
  primaryHref: string;
  related: readonly { href: string; key: Exclude<keyof typeof PUBLIC_ROUTES, "home"> }[];
  image: string;
};

export const MEGA_MENU: Readonly<Record<MegaMenuKey, MegaMenuPanel>> = {
  coffee: {
    key: "coffee",
    primaryHref: PUBLIC_ROUTES.coffee,
    related: [
      { href: PUBLIC_ROUTES.origins, key: "origins" },
      { href: PUBLIC_ROUTES.contact, key: "contact" },
    ],
    image: "/images/coffee-lot-6.jpg",
  },
  origins: {
    key: "origins",
    primaryHref: PUBLIC_ROUTES.origins,
    related: [
      { href: PUBLIC_ROUTES.coffee, key: "coffee" },
      { href: PUBLIC_ROUTES.sourcing, key: "sourcing" },
    ],
    image: "/images/farmer-partnership.jpg",
  },
  sourcing: {
    key: "sourcing",
    primaryHref: PUBLIC_ROUTES.sourcing,
    related: [
      { href: PUBLIC_ROUTES.about, key: "about" },
      { href: PUBLIC_ROUTES.contact, key: "contact" },
    ],
    image: "/images/warehouse-bags.jpg",
  },
  about: {
    key: "about",
    primaryHref: PUBLIC_ROUTES.about,
    related: [
      { href: PUBLIC_ROUTES.contact, key: "contact" },
      { href: PUBLIC_ROUTES.portalEntry, key: "portalEntry" },
    ],
    image: "/images/coffee-lot-4.jpg",
  },
} as const;
