import type { OperationalRole } from "@/lib/auth/types";

import type { IconName } from "@/components/ui/icon";

/**
 * Feature 010 T001 — THE single declarative access matrix for the Operations Console.
 *
 * Every console area is declared here exactly once, mapped to the ONE approved database role
 * function that authorizes it (SRS §14, Constitution V/VIII; spec FR-002/FR-003). This file is
 * data: it performs no authorization itself. `lib/admin/guards.ts` reads it to call the named
 * function server-side on every request, `components/app/admin-navigation.tsx` reads it to shape
 * navigation, and `tests/admin/access-matrix.test.ts` iterates it so declaration, enforcement and
 * proof cannot drift apart.
 *
 * ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────────────────────────────
 *
 * - No "any staff" / "any operational role" catch-all: `AdminRoleFunction` is a closed union of the
 *   six approved SECURITY DEFINER functions, and every `AdminArea.roleFunction` names one of them.
 * - No invented hierarchy: `is_platform_admin()` being true for ADMIN and SUPER_ADMIN, and
 *   `is_compliance_operator()` being true for COMPLIANCE/ADMIN/SUPER_ADMIN, are facts the database
 *   functions themselves attest (`lib/auth/dal.ts#ROLE_FUNCTIONS`). `ROLE_FUNCTION_ATTESTS` records
 *   which entry of `identity.operationalRoles` each function produces, so navigation can be shaped
 *   from the SAME already-resolved attestations — it never re-derives a hierarchy from role names.
 * - No member-role inheritance: nothing here reads an organization, a membership or a capability.
 *
 * ── AVAILABILITY IS HONEST, NOT ASPIRATIONAL ─────────────────────────────────────────────────────
 *
 * Navigation may know an area exists before its workflow is built, so `availability` records the
 * truth per area: `live` (a real workflow exists), `planned` (a later Feature 010 phase owns it —
 * the route renders an honest "not yet available" state behind its real guard), `blocked` (a
 * recorded dependency or database open item prevents it — the route explains exactly which).
 */

export const ADMIN_ROLE_FUNCTIONS = [
  "is_compliance_operator",
  "is_warehouse_operator",
  "is_finance_operator",
  "is_auditor",
  "is_platform_admin",
  "is_super_admin",
] as const;

export type AdminRoleFunction = (typeof ADMIN_ROLE_FUNCTIONS)[number];

/** The `identity.operationalRoles` entry each approved function attests (mirrors `lib/auth/dal.ts`). */
export const ROLE_FUNCTION_ATTESTS: Readonly<Record<AdminRoleFunction, OperationalRole>> = {
  is_compliance_operator: "COMPLIANCE",
  is_warehouse_operator: "WAREHOUSE",
  is_finance_operator: "FINANCE",
  is_auditor: "AUDITOR",
  is_platform_admin: "ADMIN",
  is_super_admin: "SUPER_ADMIN",
};

export const ADMIN_AREA_GROUP_KEYS = ["compliance", "warehouse", "finance", "catalogue", "audit", "system"] as const;
export type AdminAreaGroupKey = (typeof ADMIN_AREA_GROUP_KEYS)[number];

export type AdminAreaAvailability = "live" | "planned" | "blocked";

/** Recorded reasons an area cannot be worked yet — each cites the owning feature or open item. */
export type AdminAreaBlocker = "feature-008-finance-layer" | "feature-012-audit-layer";

export const ADMIN_AREA_KEYS = [
  "kyb", "organizations", "listings", "disputes",
  "shipments", "inventory",
  "payments", "payouts", "invoices",
  "coffees", "origins", "regions", "taxonomy", "warehouses", "media", "prices",
  "audit",
  "roles", "commission", "tax", "shipping", "paymentAccounts", "branding",
] as const;
export type AdminAreaKey = (typeof ADMIN_AREA_KEYS)[number];

export type AdminArea = {
  key: AdminAreaKey;
  group: AdminAreaGroupKey;
  href: string;
  /** The ONE approved database function this area requires — called live by `lib/admin/guards.ts`. */
  roleFunction: AdminRoleFunction;
  icon: IconName;
  availability: AdminAreaAvailability;
  /** Feature 010 phase that owns the workflow (tasks.md). */
  phase: number;
  blocker?: AdminAreaBlocker;
};

/**
 * Each route group's own guard (T004): the group layout calls this function; an area inside the
 * group may require a STRICTER function (e.g. `(system)` is `is_platform_admin` at the group level
 * because `payment_accounts` is `is_platform_admin()` under RLS, while roles/commission/tax/
 * shipping additionally require `is_super_admin` — enforced by their own nested `(super)` layout).
 */
export const ADMIN_GROUP_ROLE_FUNCTIONS: Readonly<Record<AdminAreaGroupKey, AdminRoleFunction>> = {
  compliance: "is_compliance_operator",
  warehouse: "is_warehouse_operator",
  finance: "is_finance_operator",
  catalogue: "is_platform_admin",
  audit: "is_auditor",
  system: "is_platform_admin",
};

export const ADMIN_AREAS: readonly AdminArea[] = [
  // ── Compliance ────────────────────────────────────────────────────────────────────────────────
  { key: "kyb", group: "compliance", href: "/dashboard-admin/kyb", roleFunction: "is_compliance_operator", icon: "badge-check", availability: "live", phase: 3 },
  { key: "organizations", group: "compliance", href: "/dashboard-admin/organizations", roleFunction: "is_compliance_operator", icon: "building-2", availability: "live", phase: 3 },
  { key: "listings", group: "compliance", href: "/dashboard-admin/listings", roleFunction: "is_compliance_operator", icon: "tag", availability: "live", phase: 4 },
  { key: "disputes", group: "compliance", href: "/dashboard-admin/disputes", roleFunction: "is_compliance_operator", icon: "shield", availability: "live", phase: 4 },

  // ── Warehouse ─────────────────────────────────────────────────────────────────────────────────
  { key: "shipments", group: "warehouse", href: "/dashboard-admin/shipments", roleFunction: "is_warehouse_operator", icon: "truck", availability: "live", phase: 6 },
  { key: "inventory", group: "warehouse", href: "/dashboard-admin/inventory", roleFunction: "is_warehouse_operator", icon: "package", availability: "live", phase: 6 },

  // ── Finance ───────────────────────────────────────────────────────────────────────────────────
  { key: "payments", group: "finance", href: "/dashboard-admin/payments", roleFunction: "is_finance_operator", icon: "wallet", availability: "blocked", phase: 5, blocker: "feature-008-finance-layer" },
  { key: "payouts", group: "finance", href: "/dashboard-admin/payouts", roleFunction: "is_finance_operator", icon: "wallet", availability: "blocked", phase: 5, blocker: "feature-008-finance-layer" },
  { key: "invoices", group: "finance", href: "/dashboard-admin/invoices", roleFunction: "is_finance_operator", icon: "file-text", availability: "blocked", phase: 5, blocker: "feature-008-finance-layer" },

  // ── Catalogue ─────────────────────────────────────────────────────────────────────────────────
  { key: "coffees", group: "catalogue", href: "/dashboard-admin/coffees", roleFunction: "is_platform_admin", icon: "package", availability: "live", phase: 7 },
  { key: "origins", group: "catalogue", href: "/dashboard-admin/origins", roleFunction: "is_platform_admin", icon: "globe", availability: "live", phase: 7 },
  { key: "regions", group: "catalogue", href: "/dashboard-admin/regions", roleFunction: "is_platform_admin", icon: "map-pin", availability: "live", phase: 7 },
  { key: "taxonomy", group: "catalogue", href: "/dashboard-admin/taxonomy", roleFunction: "is_platform_admin", icon: "tag", availability: "live", phase: 7 },
  { key: "warehouses", group: "catalogue", href: "/dashboard-admin/warehouses", roleFunction: "is_platform_admin", icon: "building-2", availability: "live", phase: 7 },
  { key: "media", group: "catalogue", href: "/dashboard-admin/media", roleFunction: "is_platform_admin", icon: "file", availability: "live", phase: 7 },
  // T049 — reference-price administration (Feature 011 FR-011): `price_*_admin` RLS is `is_platform_admin()`.
  { key: "prices", group: "catalogue", href: "/dashboard-admin/prices", roleFunction: "is_platform_admin", icon: "percent", availability: "live", phase: 14 },

  // ── Audit ─────────────────────────────────────────────────────────────────────────────────────
  { key: "audit", group: "audit", href: "/dashboard-admin/audit", roleFunction: "is_auditor", icon: "clipboard-list", availability: "live", phase: 8 },

  // ── System ────────────────────────────────────────────────────────────────────────────────────
  { key: "roles", group: "system", href: "/dashboard-admin/roles", roleFunction: "is_super_admin", icon: "users", availability: "live", phase: 9 },
  { key: "commission", group: "system", href: "/dashboard-admin/commission", roleFunction: "is_super_admin", icon: "percent", availability: "live", phase: 9 },
  { key: "tax", group: "system", href: "/dashboard-admin/tax", roleFunction: "is_super_admin", icon: "percent", availability: "live", phase: 9 },
  { key: "shipping", group: "system", href: "/dashboard-admin/shipping", roleFunction: "is_super_admin", icon: "truck", availability: "live", phase: 9 },
  { key: "paymentAccounts", group: "system", href: "/dashboard-admin/payment-accounts", roleFunction: "is_platform_admin", icon: "key-round", availability: "live", phase: 9 },
  // Feature 010 T047 + approved scope addition (RUN F010-ACCOUNT-MEDIA, 2026-09-22): platform logo/branding.
  { key: "branding", group: "system", href: "/dashboard-admin/branding", roleFunction: "is_platform_admin", icon: "settings", availability: "live", phase: 9 },
];

/**
 * Console-shell routes that are NOT operational areas: they sit behind the root `/dashboard-admin`
 * guard (at least one attested operational role — Feature 001's boundary, preserved verbatim) and
 * require no further specific role because they act only on the signed-in operator's own account
 * or show a view already shaped per role. They are listed here so the shell can render them, and
 * kept OUT of `ADMIN_AREAS` so the operational matrix stays a pure role→area declaration.
 */
export const ADMIN_SHELL_ROUTES = {
  overview: { key: "overview", href: "/dashboard-admin", icon: "layout-grid" as IconName },
  account: { key: "account", href: "/dashboard-admin/account", icon: "settings" as IconName },
} as const;

export function getAdminArea(key: string): AdminArea | null {
  return ADMIN_AREAS.find((area) => area.key === key) ?? null;
}

export function getAdminAreasForGroup(group: AdminAreaGroupKey): readonly AdminArea[] {
  return ADMIN_AREAS.filter((area) => area.group === group);
}

/**
 * Which areas a set of ALREADY-ATTESTED roles may see in navigation. `roles` must be
 * `identity.operationalRoles` (produced by the same six functions) — this is presentation shaping
 * only and is never the gate; every route re-verifies its own function server-side (guards.ts).
 */
export function getVisibleAdminAreas(roles: readonly OperationalRole[]): readonly AdminArea[] {
  const attested = new Set(roles);
  return ADMIN_AREAS.filter((area) => attested.has(ROLE_FUNCTION_ATTESTS[area.roleFunction]));
}

/** Resolves an area from its pathname (exact match or a nested path under the area's href). */
export function getAdminAreaForPath(pathname: string): AdminArea | null {
  const normalized = pathname.replace(/\/+$/, "");
  return ADMIN_AREAS.find((area) => normalized === area.href || normalized.startsWith(`${area.href}/`)) ?? null;
}
