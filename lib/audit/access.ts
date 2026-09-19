import { probeAuditLog, type AuditLogRow } from "@/lib/admin/audit";
import { checkConsoleShellAccess, verifyRoleFunction } from "@/lib/admin/guards";

/**
 * Feature 012 RUN C (T015) — who may read which history/audit record, and the honest answer when a
 * role may not. This module grants nothing: it MIRRORS the live policies (the database remains the
 * only authority) so a surface can distinguish "nothing happened" from "you are not permitted to see
 * what happened" (FR-016).
 *
 * ── DB-OPEN-06 (stays OPEN) ──────────────────────────────────────────────────────────────────────
 * `audit_logs` has exactly one SELECT policy, `audit_admin_read` = `is_platform_admin()`. The AUDITOR
 * role — whose job is reading evidence — is therefore NOT able to read the audit log. The approved
 * response is to SAY so: `resolveAuditLogAccess()` returns `{ status: "limited", blocker: "DB-OPEN-06" }`
 * for an auditor WITHOUT issuing a query (an RLS-filtered query would return an empty list that looks
 * exactly like "no activity"), and never falls back to a service role or any wider credential.
 *
 * REUSE, NOT DUPLICATION: the one `audit_logs` read already exists in Feature 010
 * (`lib/admin/audit.ts#probeAuditLog`, admin-scoped, payload columns excluded). This module calls it
 * only after a LIVE `is_platform_admin()` check — it adds no second audit query.
 */

export type HistoryAudience = "member" | "compliance" | "auditor" | "admin";
export type HistoryKind = "order" | "listing" | "account" | "ownership" | "auditLog";

/** `true` = the live policy grants this audience; `"own"` = only rows of the audience's own organization. */
type Grant = true | false | "own";

/**
 * The live SELECT policies, as data. Kept in lock-step with `docs/database/database-schema-report.json`
 * by `tests/audit/immutability.test.ts` (which re-derives the policy expressions and fails on drift).
 */
export const HISTORY_ACCESS_MATRIX: Readonly<Record<HistoryKind, { policy: string; grants: Readonly<Record<HistoryAudience, Grant>>; blocker?: "DB-OPEN-06" }>> = Object.freeze({
  order: { policy: "order_history_view: can_view_order(order_id)", grants: { member: "own", compliance: false, auditor: false, admin: true } },
  listing: {
    policy: "offer_history_view: is_platform_admin() OR seller-org member; offer_history_compliance_read: is_compliance_operator() OR is_auditor()",
    grants: { member: "own", compliance: true, auditor: true, admin: true },
  },
  account: { policy: "account_status_history_view: is_org_member(organization_id) OR is_platform_admin()", grants: { member: "own", compliance: false, auditor: false, admin: true } },
  ownership: { policy: "ownership_admin: is_platform_admin() OR is_org_member(to_organization_id) OR is_org_member(from_organization_id)", grants: { member: "own", compliance: false, auditor: false, admin: true } },
  auditLog: { policy: "audit_admin_read: is_platform_admin()", grants: { member: false, compliance: false, auditor: false, admin: true }, blocker: "DB-OPEN-06" },
});

export function canReadHistory(kind: HistoryKind, audience: HistoryAudience): Grant {
  return HISTORY_ACCESS_MATRIX[kind].grants[audience];
}

export type AuditLogAccess =
  | { status: "readable"; rows: readonly AuditLogRow[] }
  | { status: "limited"; blocker: "DB-OPEN-06"; audience: "auditor" }
  | { status: "not-permitted" }
  | { status: "unavailable" };

/**
 * The caller's honest audit-log state:
 * - platform admin (live `is_platform_admin()`) → `readable` with real rows (read-only);
 * - auditor without admin → `limited` + DB-OPEN-06 — no query, no fallback;
 * - anyone else (member, compliance, warehouse, finance, anonymous) → `not-permitted`;
 * - an admin whose read fails → `unavailable` (never presented as an empty log).
 */
export async function resolveAuditLogAccess(): Promise<AuditLogAccess> {
  const shell = await checkConsoleShellAccess();
  if (!shell.ok) return { status: "not-permitted" };

  if (await verifyRoleFunction("is_platform_admin")) {
    const probe = await probeAuditLog({ isPlatformAdmin: true });
    return probe.readable ? { status: "readable", rows: probe.rows } : { status: "unavailable" };
  }
  if (await verifyRoleFunction("is_auditor")) return { status: "limited", blocker: "DB-OPEN-06", audience: "auditor" };
  return { status: "not-permitted" };
}
