import type { ReactNode } from "react";

import type { OrganizationMembership } from "@/lib/auth/types";

/**
 * Feature 004 T001 — the module registration contract every later member feature (005 inventory,
 * 006 marketplace, 007 orders, 008 payments, 009 delivery, 012 disputes/notifications) plugs into.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * CRITICAL RULE — DECLARATION IS NEVER AUTHORIZATION (spec SEC-002, plan.md architecture decision 2)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Every `requiredCapability` in this file is PRESENTATIONAL ONLY. It tells the shell whether to
 * RENDER a nav entry, overview card, or action item — nothing more. It is NEVER consulted to decide
 * whether a REQUEST may proceed.
 *
 * A module declaring `requiredCapability: "sell"` may cause its nav entry to be hidden from a
 * `canSell: false` organization. It does NOT protect the route that entry links to. Every route a
 * module registers MUST independently call `getRequestIdentity()` (or the eligibility layer built on
 * it) and re-verify `organization.canBuy` / `organization.canSell` / `is_authorized_member()` for
 * itself, exactly as `src/app/dashboard/kyb/page.tsx` and `src/app/dashboard/settings/page.tsx`
 * already do for Feature 003's own routes (FR-003, Constitution Principle VIII).
 *
 * This registry must never become a hidden authorization system. If a future contributor is tempted
 * to skip a route's own server-side check because "the registry already filtered the nav for this
 * capability" — that is exactly the mistake this contract exists to prevent.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * CAPABILITY VOCABULARY — DELIBERATELY NARROW
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Exactly three values, sourced from `RequestIdentity`/`OrganizationMembership` (`lib/auth/types.ts`)
 * — never a fourth, and never a module-invented capability name:
 *
 * - `"member"` — every authorized member of the acting organization. This is not a database fact by
 *   itself; by the time the shell resolves navigation/overview at all, the caller has already passed
 *   Feature 003's `isAuthorizedMember`/agreement gates (`src/app/dashboard/layout.tsx`), so `"member"`
 *   is simply "no additional capability beyond what already got you here."
 * - `"buy"` — gated on the acting organization's `organization_can_buy()` result
 *   (`OrganizationMembership.canBuy`).
 * - `"sell"` — gated on the acting organization's `organization_can_sell()` result
 *   (`OrganizationMembership.canSell`), additive on top of buy (Constitution Principle VI — there is
 *   no seller-only organization; selling is always additional capability on a buyer).
 */
export type DashboardCapability = "member" | "buy" | "sell";

/**
 * One navigable destination a module contributes to the sidebar/drawer.
 *
 * `label`/`description` are `ReactNode`, not `string`, for the same reason
 * `components/app/app-navigation.ts#AppNavItem` uses `ReactNode` — callers pass
 * `<AppBilingual pick={(c) => c.some.key} />` so the shell (a Server Component) renders correctly in
 * both languages with no client island.
 */
export type NavEntry = {
  /** Stable id, unique within the module — becomes part of the rendered `AppNavItem`'s React key. */
  id: string;
  label: ReactNode;
  href: string;
  icon?: ReactNode;
  description?: ReactNode;
  requiredCapability: DashboardCapability;
};

/** One group of related nav entries (rendered as one `AppNavGroup` — see `components/dashboard/sidebar.tsx`). */
export type NavGroupContribution = {
  /**
   * Stable group key. Two modules may contribute to the SAME `key` (e.g. two future modules both
   * wanting an entry under `"account"`) — the shell merges entries with a matching key into one
   * group rather than rendering two group headers with the same label.
   */
  key: string;
  label: ReactNode;
  entries: readonly NavEntry[];
};

/**
 * The four questions the approved design system says the member overview must answer (spec PS2),
 * plus the always-present account/status area every member gets regardless of which business
 * modules exist (spec: "The account/status contribution from 003 may exist where truthful").
 *
 * `"account"` is populated directly from the resolved identity/organization by
 * `lib/dashboard/overview.ts` — it is NOT a module contribution slot. Modules contribute only to
 * `"bought"` / `"owe"` / `"where"`.
 */
export type OverviewArea = "account" | "bought" | "owe" | "where";

/**
 * One summary figure on the overview. Per FR-007/SC-004, any monetary or quantity `value` MUST carry
 * its unit/currency in the rendered string (e.g. `"USD 4.80 / kg"`, `"320 bags · 60kg"`) — this
 * contract does not enforce that mechanically (it cannot know a module's domain), but every module
 * author MUST follow it.
 */
export type OverviewCard = {
  id: string;
  area: OverviewArea;
  title: ReactNode;
  value: ReactNode;
  description?: ReactNode;
  href?: string;
};

/**
 * One outstanding item the member must act on (spec PS3 — "name what is missing", never a generic
 * "action required"). `label` MUST name the specific missing thing.
 */
export type ActionItem = {
  id: string;
  label: ReactNode;
  href: string;
  requiredCapability?: DashboardCapability;
};

/**
 * Context a module receives when contributing overview cards/action items. Deliberately just the
 * resolved acting `OrganizationMembership` — passed explicitly by the caller (`lib/dashboard/
 * overview.ts`), never read from an ambient global or module-scope variable (plan.md architecture
 * decision 5; FR-010, SEC-003). A module needing more (e.g. its own bounded query result) resolves
 * that itself, server-side, from this same organization id — this contract does not fetch on a
 * module's behalf.
 */
export type DashboardModuleContext = {
  organization: OrganizationMembership;
};

/**
 * One registered module. A module that does not exist yet simply has no entry in
 * `lib/dashboard/registry.ts` — it contributes nothing (FR-006): no nav item, no overview card, no
 * fake KPI, no fake zero, no disabled placeholder route.
 *
 * `overviewCards`/`actionItems` are functions, not static arrays: real business data (bags owned,
 * amount owed, shipment location) can only be known per-request, from the acting organization
 * resolved that request — a static value would either be fabricated or immediately stale. Navigation
 * entries have no such requirement (a route's existence and required capability are compile-time
 * facts), so `navGroups` stays a plain, static array.
 */
/**
 * Feature 005 RUN B reconciliation — `overviewCards`/`actionItems` may return their result directly
 * OR as a `Promise`. This is the SMALLEST safe extension to the contract, added when Feature 005
 * became the first module needing a genuine per-request bounded database read (`lib/inventory/*`,
 * inherently async — a real request-scoped data-layer call through `next/headers`) rather than a
 * purely synchronous computation over `context.organization` alone.
 *
 * This does NOT weaken declaration-is-never-authorization or introduce ambient state: a module
 * function still receives ONLY `context` (`{ organization }`, the caller's already-resolved acting
 * organization for THIS request — never a global, never memoized, never shared across requests/
 * organizations). An async module resolves its own bounded query itself, server-side, from that same
 * organization id — exactly what this file's own `DashboardModuleContext` doc comment already
 * anticipated ("a module needing more... resolves that itself"), now simply allowed to be async. A
 * module with no such need stays a plain synchronous function — nothing changes for it.
 */
type MaybePromise<T> = T | Promise<T>;

export type DashboardModule = {
  /** Stable id, unique across the registry (e.g. `"account"`, later `"inventory"`, `"marketplace"`). */
  id: string;
  /**
   * The capability gating this module's OWN nav visibility as a whole (in addition to any
   * finer-grained `requiredCapability` on individual entries/cards). `"member"` for foundational,
   * always-available modules like the account area.
   */
  requiredCapability: DashboardCapability;
  navGroups?: readonly NavGroupContribution[];
  overviewCards?: (context: DashboardModuleContext) => MaybePromise<readonly OverviewCard[]>;
  actionItems?: (context: DashboardModuleContext) => MaybePromise<readonly ActionItem[]>;
};
