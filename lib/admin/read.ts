import type { AdminAreaGroupKey, AdminAreaKey } from "@/lib/admin/areas";
import type { AppCopy } from "@/lib/app/copy";
import type { OperationalRole } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Feature 010 T006 — the Operations Console overview's read layer: REAL, role-shaped counts only.
 *
 * ── EVERY FIGURE IS A LIVE QUERY UNDER THE OPERATOR'S OWN SESSION ────────────────────────────────
 *
 * Each metric is one `select(…, { count: "exact", head: true })` against a table whose RLS grants
 * the section's role a SELECT path (verified against the approved policy set — see `ADMIN_OVERVIEW_QUERIES`
 * below and `tests/admin/overview.test.ts`, which cross-checks every metric's table/policy against
 * `docs/database/database-schema-report.json`). No service role, no cache (`unstable_cache`/
 * `"use cache"`/`cacheTag` are absent by design — operational truth is private, FR-011), and no
 * arithmetic beyond the database's own count. A query error yields `null` ("unavailable"), never a
 * fabricated zero; a genuine zero is rendered by the UI as an explicit empty state, never as a
 * bare figure presented as activity (spec SC-008 / FR-016).
 *
 * ── WHY SECTIONS ARE ROLE-SHAPED HERE, NOT ONLY IN THE UI ───────────────────────────────────────
 *
 * RLS FILTERS rather than errors: a role without a SELECT policy on a table receives an empty
 * result (count 0), which would be indistinguishable from "nothing waiting". So a section's
 * queries run ONLY when the caller's attested roles include the section's role — and every table a
 * section reads has an explicit policy for exactly that role. Two consequences are recorded
 * honestly rather than papered over: (a) the audit-log count runs only for `ADMIN`
 * (`audit_admin_read` is `is_platform_admin()`; a pure `AUDITOR` cannot read it — DB-OPEN-06), and
 * (b) no organization-level compliance metric exists, because `organizations` carries no SELECT
 * policy for `COMPLIANCE` (only `is_org_member`/`is_platform_admin`) — a Phase 3 finding, not
 * silently worked around here.
 *
 * ── MONEY IS DEFERRED, NOT INVENTED ─────────────────────────────────────────────────────────────
 *
 * Feature 008's current read contract defines per-order snapshots (`OrderFinancialsDTO`), not
 * platform aggregates ("settled value", "awaiting review", "commission earned"). Summing snapshots
 * into a headline figure would be console-invented business semantics, so the Finance section
 * shows counts only and states that monetary totals arrive with Feature 008's own definitions.
 */

export type AdminMetricKey = keyof AppCopy["admin"]["overview"]["metrics"];
export type AdminOverviewNoteKey = keyof AppCopy["admin"]["overview"]["notes"];

export type AdminMetric = {
  key: AdminMetricKey;
  /** `null` = could not be read (rendered "Unavailable"); `0` = genuinely nothing (rendered "None"). */
  value: number | null;
  /** The console area this figure belongs to (rendered as the tile's link when the area exists). */
  areaKey: AdminAreaKey;
};

export type AdminOverviewSection = {
  group: AdminAreaGroupKey;
  metrics: readonly AdminMetric[];
  note?: AdminOverviewNoteKey;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type AdminCountQuery = {
  key: AdminMetricKey;
  areaKey: AdminAreaKey;
  table: string;
  /** `status IN (…)` — the approved vocabulary for that table (`DATABASE-CAPABILITY-MAP.md` §3). */
  statusIn?: readonly string[];
  /** `column = value` — the few non-status filters (declarative so the query stays reviewable). */
  eq?: readonly [column: string, value: boolean];
  /** `column >= now() - ms` — rolling windows such as "last 24 hours". */
  sinceMs?: readonly [column: string, ms: number];
};

const SHIPMENT_IN_PROGRESS = ["CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED"] as const;

/** Which attested role unlocks each section — the same attestation `lib/admin/areas.ts` uses. */
export const ADMIN_OVERVIEW_SECTION_ROLE: Readonly<Record<AdminAreaGroupKey, OperationalRole>> = {
  compliance: "COMPLIANCE",
  warehouse: "WAREHOUSE",
  finance: "FINANCE",
  catalogue: "ADMIN",
  audit: "AUDITOR",
  system: "SUPER_ADMIN",
};

/**
 * Metric → table → the policy that grants the section's role a read (all verified in the approved
 * schema report). Listed next to each query so the mapping is reviewable in one place.
 */
export const ADMIN_OVERVIEW_QUERIES: Readonly<Record<AdminAreaGroupKey, readonly AdminCountQuery[]>> = {
  compliance: [
    // kyb_compliance_all — is_compliance_operator()
    { key: "kybSubmitted", areaKey: "kyb", table: "kyb_applications", statusIn: ["SUBMITTED"] },
    { key: "kybUnderReview", areaKey: "kyb", table: "kyb_applications", statusIn: ["UNDER_REVIEW"] },
    { key: "kybResubmissionRequired", areaKey: "kyb", table: "kyb_applications", statusIn: ["RESUBMISSION_REQUIRED"] },
    // offers_compliance_read — is_compliance_operator() OR is_auditor()
    { key: "listingsPendingReview", areaKey: "listings", table: "coffee_offers", statusIn: ["PENDING_REVIEW"] },
    // disputes_view — … OR is_compliance_operator() OR is_auditor()
    { key: "disputesOpen", areaKey: "disputes", table: "disputes", statusIn: ["OPEN", "UNDER_REVIEW"] },
  ],
  warehouse: [
    // shipments_view — can_view_order(order_id) OR is_warehouse_operator()
    { key: "shipmentsRequested", areaKey: "shipments", table: "order_shipments", statusIn: ["REQUESTED"] },
    { key: "shipmentsInProgress", areaKey: "shipments", table: "order_shipments", statusIn: SHIPMENT_IN_PROGRESS },
    { key: "shipmentsDispatched", areaKey: "shipments", table: "order_shipments", statusIn: ["DISPATCHED", "PARTIALLY_DELIVERED"] },
    { key: "shipmentsDisputed", areaKey: "shipments", table: "order_shipments", statusIn: ["DISPUTED"] },
    // inventory_owner_read — is_org_member(owner) OR is_warehouse_operator() OR is_auditor()
    { key: "inventoryPositions", areaKey: "inventory", table: "inventory_positions" },
  ],
  finance: [
    // payments_finance_read — is_finance_operator() OR is_auditor()
    { key: "paymentsProofSubmitted", areaKey: "payments", table: "payments", statusIn: ["PROOF_SUBMITTED"] },
    { key: "paymentsUnderReview", areaKey: "payments", table: "payments", statusIn: ["UNDER_REVIEW"] },
    // payouts_finance — is_finance_operator()
    { key: "payoutsPending", areaKey: "payouts", table: "payouts", statusIn: ["PENDING_PAYOUT"] },
  ],
  catalogue: [
    // catalog_admin_coffees / catalog_admin_origins / catalog_admin_warehouses — is_platform_admin()
    { key: "coffeesPublished", areaKey: "coffees", table: "coffees", statusIn: ["PUBLISHED"] },
    { key: "coffeesDraft", areaKey: "coffees", table: "coffees", statusIn: ["DRAFT"] },
    { key: "originsActive", areaKey: "origins", table: "origins", statusIn: ["ACTIVE"] },
    { key: "warehousesActive", areaKey: "warehouses", table: "warehouses", eq: ["is_active", true] },
  ],
  audit: [
    // audit_admin_read — is_platform_admin() ONLY (DB-OPEN-06) — see the ADMIN branch in `getAdminOverview`.
    { key: "auditEvents24h", areaKey: "audit", table: "audit_logs", sinceMs: ["created_at", 24 * 60 * 60 * 1000] },
  ],
  system: [
    // platform_admins_admin — is_super_admin()
    { key: "platformAdminsActive", areaKey: "roles", table: "platform_admins", eq: ["is_active", true] },
  ],
};

const SECTION_NOTES: Partial<Record<AdminAreaGroupKey, AdminOverviewNoteKey>> = {
  finance: "financeMoneyDeferred",
  system: "systemNote",
};

async function countRows(supabase: SupabaseServerClient, query: AdminCountQuery): Promise<number | null> {
  let builder = supabase.from(query.table).select("id", { count: "exact", head: true });
  if (query.statusIn) builder = builder.in("status", [...query.statusIn]);
  if (query.eq) builder = builder.eq(query.eq[0], query.eq[1]);
  if (query.sinceMs) builder = builder.gte(query.sinceMs[0], new Date(Date.now() - query.sinceMs[1]).toISOString());
  const { count, error } = await builder;
  if (error || typeof count !== "number") return null;
  return count;
}

/**
 * The role-shaped overview for an operator whose attested roles are `roles`
 * (`identity.operationalRoles`, verbatim). Sections the roles do not unlock are simply absent —
 * a WAREHOUSE-only operator receives no Finance section, a FINANCE-only operator no Compliance one.
 */
export async function getAdminOverview(roles: readonly OperationalRole[]): Promise<readonly AdminOverviewSection[]> {
  const attested = new Set(roles);
  const supabase = await createClient();

  const sections = await Promise.all(
    (Object.keys(ADMIN_OVERVIEW_QUERIES) as AdminAreaGroupKey[])
      .filter((group) => attested.has(ADMIN_OVERVIEW_SECTION_ROLE[group]))
      .map(async (group): Promise<AdminOverviewSection> => {
        // DB-OPEN-06: only a platform admin can read audit_logs. For a pure AUDITOR the count would
        // be a silently-filtered 0, so it is reported as unavailable with the recorded reason.
        if (group === "audit" && !attested.has("ADMIN")) {
          return { group, metrics: ADMIN_OVERVIEW_QUERIES.audit.map((q) => ({ key: q.key, areaKey: q.areaKey, value: null })), note: "auditOpen06" };
        }
        const metrics = await Promise.all(
          ADMIN_OVERVIEW_QUERIES[group].map(async (q): Promise<AdminMetric> => ({ key: q.key, areaKey: q.areaKey, value: await countRows(supabase, q) })),
        );
        return { group, metrics, note: SECTION_NOTES[group] };
      }),
  );

  return sections;
}
