import type { OperationalRole } from "@/lib/auth/types"

import type { AppNavGroup } from "@/components/app/app-navigation"
import { AppBilingual } from "@/components/locale/app-bilingual"
import { Icon } from "@/components/ui/icon"
import { ADMIN_AREA_GROUP_KEYS, ADMIN_SHELL_ROUTES, getVisibleAdminAreas, type AdminAreaGroupKey } from "@/lib/admin/areas"

/**
 * Operations console (`/dashboard-admin`) role-shaped navigation (Feature 010 T003, superseding the
 * Phase 5.5 UIF-041 placeholder structure — Constitution V, VIII).
 *
 * ── DERIVED FROM THE ACCESS MATRIX, NEVER A SECOND SOURCE ────────────────────────────────────────
 *
 * The groups and areas rendered here are read from `lib/admin/areas.ts` — the single declarative
 * matrix (T001). This file adds labels and icons; it declares no area of its own, so navigation
 * can never advertise an area the matrix does not guard.
 *
 * ── VISIBILITY IS NEVER AUTHORIZATION ────────────────────────────────────────────────────────────
 *
 * `buildAdminNavGroups(roles)` is a PURE function over `identity.operationalRoles` — the
 * attestations the six approved database functions already produced for THIS request
 * (`lib/auth/dal.ts`). It reads no role itself, calls no RPC, and consults no organization or
 * membership. Hiding an entry grants nothing and showing one grants nothing: every `/dashboard-admin`
 * route re-verifies its own role function server-side on every request (`lib/admin/guards.ts`, the
 * route-group layouts under `src/app/dashboard-admin/(…)`), and the DB-level functions remain the
 * only real gate — visibility here is never a security boundary. Feature 010 supplies real role
 * gating; this file only shapes what an already-verified operator sees.
 *
 * ── HIERARCHY IS THE DATABASE'S FACT, NOT ONE INVENTED HERE ──────────────────────────────────────
 *
 * An ADMIN sees Compliance/Warehouse/Finance/Audit because `is_compliance_operator()` etc. return
 * true for ADMIN and the DAL therefore lists those roles in `operationalRoles` — this file never
 * expands a role name into other roles.
 */

export function buildAdminNavGroups(roles: readonly OperationalRole[]): AppNavGroup[] {
  const visible = getVisibleAdminAreas(roles)

  const overview: AppNavGroup = {
    key: "overview",
    label: <AppBilingual pick={(c) => c.overview} />,
    items: [
      {
        key: ADMIN_SHELL_ROUTES.overview.key,
        label: <AppBilingual pick={(c) => c.overview} />,
        href: ADMIN_SHELL_ROUTES.overview.href,
        icon: <Icon name={ADMIN_SHELL_ROUTES.overview.icon} className="size-[18px]" />,
      },
    ],
  }

  const areaGroups: AppNavGroup[] = ADMIN_AREA_GROUP_KEYS.map((group: AdminAreaGroupKey) => ({
    key: group,
    label: <AppBilingual pick={(c) => c.admin.groups[group]} />,
    items: visible
      .filter((area) => area.group === group)
      .map((area) => ({
        key: area.key,
        label: <AppBilingual pick={(c) => c.admin.areas[area.key]} />,
        href: area.href,
        icon: <Icon name={area.icon} className="size-[18px]" />,
      })),
  })).filter((group) => group.items.length > 0)

  const account: AppNavGroup = {
    key: "account",
    label: <AppBilingual pick={(c) => c.admin.groups.account} />,
    items: [
      {
        key: ADMIN_SHELL_ROUTES.account.key,
        label: <AppBilingual pick={(c) => c.admin.shell.account} />,
        href: ADMIN_SHELL_ROUTES.account.href,
        icon: <Icon name={ADMIN_SHELL_ROUTES.account.icon} className="size-[18px]" />,
      },
    ],
  }

  return [overview, ...areaGroups, account]
}
