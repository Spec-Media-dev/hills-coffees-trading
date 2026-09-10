import type { OperationalRole } from "@/lib/auth/types"

import type { AppNavGroup } from "@/components/app/app-navigation"
import { AppBilingual } from "@/components/locale/app-bilingual"
import { Icon, type IconName } from "@/components/ui/icon"
import type { AppCopy } from "@/lib/app/copy"

/**
 * Operations console (`/dashboard-admin`) role-scalable navigation structure (Phase 5.5, UIF-041 —
 * Constitution V, VIII).
 *
 * ── THE STRUCTURE, NOT AUTHORIZATION (UIF-041 MUST NOT) ──────────────────────────────────────────
 *
 * `ADMIN_MODULE_GROUPS` below is DATA — a documented map of which operational role(s) each future
 * module conceptually belongs to. It implements no authorization logic and reads no role; it is the
 * shape a FUTURE Feature 010 will filter once real role gating exists.
 *
 * `buildAdminNavGroups(roles)` is a PURE function: given an arbitrary role set, it returns the
 * groups whose module list is non-empty after filtering. It is deliberately generic over `roles` —
 * the live admin layout calls it with `[]` (see the comment in `dashboard-admin/layout.tsx`), and
 * `tests/design/uif-g.test.tsx` calls it with every individual role plus mixed sets to prove the
 * structure genuinely renders "for an arbitrary supplied role set", exactly as UIF-041's Verify
 * requires. **Visibility here is never a security boundary** — the DB-level RPCs in `lib/auth/dal.ts`
 * remain the only real gate, and each of these modules re-verifies its own role requirement
 * server-side, independently, once Feature 010 actually implements it.
 *
 * ── OVERVIEW IS ROLE-AGNOSTIC ─────────────────────────────────────────────────────────────────────
 *
 * Overview has no `roles` list — it is the one group every operational role sees, matching the live
 * `/dashboard-admin` route the current guard already grants to `operationalRoles.length > 0`
 * (any role). Passing `[]` still returns Overview alone, which is exactly what the honest, currently
 * real live route renders (contract §29 — no dead module links).
 *
 * ── HIERARCHY IS THE DATABASE'S FACT, NOT ONE INVENTED HERE ──────────────────────────────────────
 *
 * `lib/auth/dal.ts` documents that the approved role functions are already hierarchical
 * (`is_platform_admin()` true for ADMIN and SUPER_ADMIN; `is_compliance_operator()` true for
 * COMPLIANCE, ADMIN and SUPER_ADMIN). `SUPER_ADMIN`/`ADMIN` are listed against every group below
 * because that hierarchy is a fact the database itself already attests — not a permission this file
 * invents.
 */

type AdminModuleKey = keyof AppCopy["admin"]["modules"]

type AdminModule = {
  key: AdminModuleKey
  href: string
  icon: IconName
}

type AdminModuleGroup = {
  key: string
  groupLabelKey: keyof AppCopy["admin"]["groups"]
  /** Roles that see this group. `undefined` = role-agnostic (every operational role). */
  roles?: readonly OperationalRole[]
  modules: readonly AdminModule[]
}

/**
 * The full documented catalogue (UIF-040's named candidate modules). NONE of these routes exists —
 * every `href` below is a future path, never created by this phase, and this array is never handed
 * to `AppShell` directly; only `buildAdminNavGroups()`'s filtered result is.
 */
const ADMIN_MODULE_GROUPS: readonly AdminModuleGroup[] = [
  {
    key: "organizations",
    groupLabelKey: "organizations",
    roles: ["SUPER_ADMIN", "ADMIN", "COMPLIANCE"],
    modules: [
      { key: "organizations", href: "/dashboard-admin/organizations", icon: "building-2" },
      { key: "members", href: "/dashboard-admin/members", icon: "users" },
      { key: "kyb", href: "/dashboard-admin/kyb", icon: "badge-check" },
    ],
  },
  {
    key: "catalogue",
    groupLabelKey: "catalogue",
    roles: ["SUPER_ADMIN", "ADMIN", "WAREHOUSE"],
    modules: [
      { key: "catalogue", href: "/dashboard-admin/catalogue", icon: "package" },
      { key: "inventory", href: "/dashboard-admin/inventory", icon: "package" },
      { key: "listings", href: "/dashboard-admin/listings", icon: "tag" },
    ],
  },
  {
    key: "commercial",
    groupLabelKey: "commercial",
    roles: ["SUPER_ADMIN", "ADMIN", "FINANCE"],
    modules: [
      { key: "orders", href: "/dashboard-admin/orders", icon: "file-text" },
      { key: "paymentProofs", href: "/dashboard-admin/payment-proofs", icon: "file-text" },
      { key: "finance", href: "/dashboard-admin/finance", icon: "wallet" },
      { key: "settlement", href: "/dashboard-admin/settlement", icon: "wallet" },
      { key: "payouts", href: "/dashboard-admin/payouts", icon: "wallet" },
      { key: "pricing", href: "/dashboard-admin/pricing", icon: "percent" },
      { key: "commission", href: "/dashboard-admin/commission", icon: "percent" },
    ],
  },
  {
    key: "logistics",
    groupLabelKey: "logistics",
    roles: ["SUPER_ADMIN", "ADMIN", "WAREHOUSE"],
    modules: [{ key: "delivery", href: "/dashboard-admin/delivery", icon: "truck" }],
  },
  {
    key: "compliance",
    groupLabelKey: "compliance",
    roles: ["SUPER_ADMIN", "ADMIN", "COMPLIANCE"],
    modules: [{ key: "disputes", href: "/dashboard-admin/disputes", icon: "shield" }],
  },
  {
    key: "audit",
    groupLabelKey: "audit",
    roles: ["SUPER_ADMIN", "ADMIN", "AUDITOR"],
    modules: [{ key: "audit", href: "/dashboard-admin/audit-log", icon: "clipboard-list" }],
  },
]

export function buildAdminNavGroups(roles: readonly OperationalRole[]): AppNavGroup[] {
  const roleSet = new Set(roles)
  const visible = ADMIN_MODULE_GROUPS.filter((group) => !group.roles || group.roles.some((role) => roleSet.has(role)))

  const overview: AppNavGroup = {
    key: "overview",
    label: <AppBilingual pick={(c) => c.overview} />,
    items: [
      {
        key: "overview",
        label: <AppBilingual pick={(c) => c.overview} />,
        href: "/dashboard-admin",
        icon: <Icon name="layout-grid" className="size-[18px]" />,
      },
    ],
  }

  const rest: AppNavGroup[] = visible.map((group) => ({
    key: group.key,
    label: <AppBilingual pick={(c) => c.admin.groups[group.groupLabelKey]} />,
    items: group.modules.map((module) => ({
      key: module.key,
      label: <AppBilingual pick={(c) => c.admin.modules[module.key]} />,
      href: module.href,
      icon: <Icon name={module.icon} className="size-[18px]" />,
    })),
  }))

  return [overview, ...rest]
}
