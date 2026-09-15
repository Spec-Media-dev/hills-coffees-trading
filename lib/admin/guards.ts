import {
  ADMIN_GROUP_ROLE_FUNCTIONS,
  ADMIN_ROLE_FUNCTIONS,
  getAdminArea,
  type AdminArea,
  type AdminAreaGroupKey,
  type AdminRoleFunction,
} from "@/lib/admin/areas";
import { getRequestIdentity } from "@/lib/auth/dal";
import type { OperationalRole, RequestIdentity } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Feature 010 T002 — per-area server-side verification for the Operations Console.
 *
 * The enforcement half of the least-privilege model declared in `lib/admin/areas.ts`. Every
 * helper here ends in a LIVE call to the ONE approved SECURITY DEFINER role function the area
 * declares (`is_compliance_operator()`, `is_warehouse_operator()`, `is_finance_operator()`,
 * `is_auditor()`, `is_platform_admin()`, `is_super_admin()`) through the operator's own
 * authenticated session — never a generic "is staff" shortcut, never a cached answer, never a
 * role name read from a token, cookie, URL or metadata (spec FR-002/SEC-001/SEC-002; Constitution
 * V/VIII). Structurally server-only: it imports `lib/auth/dal.ts` (`next/headers`), exactly like
 * every other server-side authorization module in this repository.
 *
 * ── ORDER OF CHECKS (fail closed at every step) ──────────────────────────────────────────────────
 *
 * 1. `getRequestIdentity()` — server-verified `auth.getUser()`; anonymous → `anonymous`.
 * 2. `requiresMfaStepUp` — a session owing a step-up is denied before any operational content
 *    (the same gate `src/app/dashboard-admin/layout.tsx` applies).
 * 3. `operationalRoles.length === 0` — Feature 001's console boundary, restated here so a page
 *    or layout deeper in the tree never depends on an ancestor having run (Next.js renders route
 *    segments in parallel; every protected segment re-verifies its own request).
 * 4. The area's own function, called live — an operator with SOME role but not THIS one is
 *    `forbidden`. A fully approved trading member with no `platform_admins` row already fails
 *    step 3; membership is never consulted, so operator access never implies member capability
 *    and vice versa (FR-001).
 */

export type AuthenticatedIdentity = Extract<RequestIdentity, { kind: "authenticated" }>;

export type AdminDenial = "anonymous" | "mfa-step-up" | "no-operational-role" | "forbidden";

export type AdminAccess =
  | { ok: true; identity: AuthenticatedIdentity; roles: readonly OperationalRole[] }
  | { ok: false; denial: AdminDenial };

function isApprovedRoleFunction(fn: string): fn is AdminRoleFunction {
  return (ADMIN_ROLE_FUNCTIONS as readonly string[]).includes(fn);
}

/**
 * Calls ONE approved role function live for the current session. Fails closed: any error, a
 * non-boolean result, or an unapproved function name all yield `false`. The result is never
 * memoised beyond the request.
 */
export async function verifyRoleFunction(fn: AdminRoleFunction): Promise<boolean> {
  if (!isApprovedRoleFunction(fn)) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn);
  if (error) return false;
  return data === true;
}

/** The console-shell boundary (steps 1–3) — identical predicate to the root layout's guard. */
export async function checkConsoleShellAccess(): Promise<AdminAccess> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") return { ok: false, denial: "anonymous" };
  if (identity.requiresMfaStepUp) return { ok: false, denial: "mfa-step-up" };
  if (identity.operationalRoles.length === 0) return { ok: false, denial: "no-operational-role" };
  return { ok: true, identity, roles: identity.operationalRoles };
}

/** Shell boundary + a LIVE call of the named approved function (step 4). */
export async function checkRoleFunctionAccess(fn: AdminRoleFunction): Promise<AdminAccess> {
  const shell = await checkConsoleShellAccess();
  if (!shell.ok) return shell;
  const permitted = await verifyRoleFunction(fn);
  if (!permitted) return { ok: false, denial: "forbidden" };
  return shell;
}

/** Guard for a route group's own layout (T004): the group's declared function, called live. */
export async function checkGroupAccess(group: AdminAreaGroupKey): Promise<AdminAccess> {
  return checkRoleFunctionAccess(ADMIN_GROUP_ROLE_FUNCTIONS[group]);
}

/** Guard for one declared area: its own function, called live. An unknown key is forbidden. */
export async function checkAreaAccess(areaKey: string): Promise<AdminAccess & { area: AdminArea | null }> {
  const area = getAdminArea(areaKey);
  if (!area) return { ok: false, denial: "forbidden", area: null };
  const access = await checkRoleFunctionAccess(area.roleFunction);
  return { ...access, area };
}
