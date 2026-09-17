import { mapSystemError, requireSuperAdmin, saved, validationFailure, type SystemWriteOutcome } from "@/lib/admin/system-errors";
import {
  COMMISSION_POLICY_TRANSITIONS,
  CommissionPolicyFieldsInput,
  CommissionPolicyTransitionInput,
  CommissionPolicyUpdateInput,
  CommissionTierFieldsInput,
  CommissionTierUpdateInput,
  type CommissionPolicyStatus,
  type CommissionPolicyTransitionKey,
} from "@/lib/admin/system-validation";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN F — T042/T043/T044/T045: commission CONFIGURATION over the EXISTING
 * `commission_policies` / `commission_tiers` tables and nothing else (no shadow table, no schema
 * change; behavioural reference `docs/database/commission-capability.md`).
 *
 * AUTHORITY (T043) — every read and write calls `requireSuperAdmin()` (live `is_super_admin()`) before
 * `createClient()`; RLS `commission_admin` / `tiers_admin` (USING + WITH CHECK `is_super_admin()`) are
 * left exactly as they are and remain the backstop.
 *
 * SEMANTICS the UI states (mirroring `checkout_order`, verified in the 007 migration): the tier is
 * selected by the order's TOTAL quantity — `min_quantity_kg <= qty` (inclusive) AND
 * `qty < max_quantity_kg` (exclusive), `max = NULL` open-ended; the selected percentage applies to
 * the WHOLE base (`base_subtotal`, never progressive); among overlapping in-force ACTIVE policies the
 * LATEST `effective_from` wins (then the highest matching `min_quantity_kg`).
 *
 * IMMUTABILITY (T044) — a change here affects eligible FUTURE checkouts only. This module never reads
 * or writes `order_financials`, `payouts`, `orders` or `payments`, computes no commission amount, and
 * exposes no recalculate/restate/backfill/re-snapshot path — the snapshot is Feature 007/008's.
 *
 * COVERAGE (T045) — `evaluateTierCoverage` DISPLAYS the quantity ranges no band covers, because an
 * uncovered total quantity currently yields 0% at checkout (`COMMISSION-OPEN-01`, open with
 * Business/Finance via Feature 008). It neither blocks anything nor supplies a fallback rate.
 *
 * NO HARD DELETE — no `.delete()` here; `authenticated` holds no DELETE grant on either table.
 * Retirement is `ARCHIVED`; a tier that is wrong is edited.
 */

export type CommissionTierRow = { id: string; policyId: string; minQuantityKg: number; maxQuantityKg: number | null; percentage: number };
export type CommissionPolicyRow = {
  id: string;
  name: string;
  status: CommissionPolicyStatus;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdBy: string;
  createdAt: string;
  tiers: readonly CommissionTierRow[];
};

type PolicyRaw = { id: string; name: string; status: CommissionPolicyStatus; effective_from: string; effective_until: string | null; created_by: string; created_at: string; commission_tiers: { id: string; policy_id: string; min_quantity_kg: number | string; max_quantity_kg: number | string | null; percentage: number | string }[] | null };

function toPolicy(row: PolicyRaw): CommissionPolicyRow {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
    createdBy: row.created_by,
    createdAt: row.created_at,
    tiers: (row.commission_tiers ?? [])
      .map((tier) => ({ id: tier.id, policyId: tier.policy_id, minQuantityKg: Number(tier.min_quantity_kg), maxQuantityKg: tier.max_quantity_kg === null ? null : Number(tier.max_quantity_kg), percentage: Number(tier.percentage) }))
      .sort((a, b) => a.minQuantityKg - b.minQuantityKg),
  };
}

const POLICY_SELECT = "id, name, status, effective_from, effective_until, created_by, created_at, commission_tiers(id, policy_id, min_quantity_kg, max_quantity_kg, percentage)";

/** `null` = the caller is not a super admin (the page renders the refusal, never an empty list pretending nothing exists). */
export async function listCommissionPolicies(): Promise<readonly CommissionPolicyRow[] | null> {
  const authority = await requireSuperAdmin();
  if (!authority.ok) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("commission_policies").select(POLICY_SELECT).order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  return ((data ?? []) as unknown as PolicyRaw[]).map(toPolicy);
}

export async function getCommissionPolicy(policyId: string): Promise<CommissionPolicyRow | null> {
  const authority = await requireSuperAdmin();
  if (!authority.ok || !/^[0-9a-f-]{36}$/i.test(policyId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("commission_policies").select(POLICY_SELECT).eq("id", policyId).maybeSingle();
  return data ? toPolicy(data as unknown as PolicyRaw) : null;
}

/* ═══════════════════════════ T045 — coverage gaps (pure) ═══════════════════════════ */

export type CoverageGap = { from: number; to: number | null };
export type TierCoverage = {
  /** Quantity ranges (kg, `[from, to)`; `to = null` = unbounded) no band covers — each yields 0% at checkout today. */
  gaps: readonly CoverageGap[];
  /** Bands whose ranges intersect another band of the same policy (`checkout_order` then takes the higher `min`). */
  overlaps: readonly { a: CommissionTierRow; b: CommissionTierRow }[];
  /** True when at least one band is open-ended (`max = NULL`). */
  openEnded: boolean;
  covered: boolean;
};

/**
 * Gap detection over the policy's OWN bands, using exactly `checkout_order`'s inequality
 * (`min <= qty < max`): a quantity is covered iff some band satisfies it. A policy with no band, no
 * band starting at 0, a hole between consecutive bands, or no open-ended top band has gaps.
 */
export function evaluateTierCoverage(tiers: readonly CommissionTierRow[]): TierCoverage {
  const sorted = [...tiers].sort((a, b) => a.minQuantityKg - b.minQuantityKg || (a.maxQuantityKg ?? Number.POSITIVE_INFINITY) - (b.maxQuantityKg ?? Number.POSITIVE_INFINITY));
  const gaps: CoverageGap[] = [];
  const overlaps: { a: CommissionTierRow; b: CommissionTierRow }[] = [];
  let reach = 0; // every quantity below `reach` is covered
  let openEnded = false;
  for (const tier of sorted) {
    if (tier.minQuantityKg > reach) gaps.push({ from: reach, to: tier.minQuantityKg });
    const end = tier.maxQuantityKg === null ? Number.POSITIVE_INFINITY : tier.maxQuantityKg;
    if (end > reach) reach = end;
    if (tier.maxQuantityKg === null) openEnded = true;
  }
  if (!openEnded) gaps.push({ from: Number.isFinite(reach) ? reach : 0, to: null });
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      const aEnd = a.maxQuantityKg ?? Number.POSITIVE_INFINITY;
      const bEnd = b.maxQuantityKg ?? Number.POSITIVE_INFINITY;
      if (b.minQuantityKg < aEnd && a.minQuantityKg < bEnd) overlaps.push({ a, b });
    }
  }
  return { gaps, overlaps, openEnded, covered: gaps.length === 0 };
}

/** Which ACTIVE policies are in force at `asOf` and which one `checkout_order` would take (latest `effective_from`). */
export function resolveInForce(policies: readonly CommissionPolicyRow[], asOf: Date = new Date()): { inForce: readonly CommissionPolicyRow[]; winner: CommissionPolicyRow | null } {
  const t = asOf.getTime();
  const inForce = policies.filter((p) => p.status === "ACTIVE" && Date.parse(p.effectiveFrom) <= t && (p.effectiveUntil === null || Date.parse(p.effectiveUntil) > t)).sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom));
  return { inForce, winner: inForce[0] ?? null };
}

/* ═══════════════════════════════════ writes ═══════════════════════════════════ */

export async function createCommissionPolicy(input: unknown): Promise<ActionFeedbackResult<SystemWriteOutcome>> {
  const parsed = CommissionPolicyFieldsInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  const supabase = await createClient();
  // A new policy is always DRAFT; it becomes ACTIVE only through the named `activate` operation.
  const { data, error } = await supabase
    .from("commission_policies")
    .insert({ name: parsed.data.name, status: "DRAFT", effective_from: parsed.data.effectiveFrom, effective_until: parsed.data.effectiveUntil, created_by: authority.userId })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, code: mapSystemError(error) };
  return saved(data.id);
}

export async function updateCommissionPolicy(input: unknown): Promise<ActionFeedbackResult<SystemWriteOutcome>> {
  const parsed = CommissionPolicyUpdateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  const supabase = await createClient();
  // `status` is deliberately NOT part of this update (named operations only); `created_by` never changes.
  const { data, error } = await supabase
    .from("commission_policies")
    .update({ name: parsed.data.name, effective_from: parsed.data.effectiveFrom, effective_until: parsed.data.effectiveUntil })
    .eq("id", parsed.data.policyId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, code: mapSystemError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_NOT_FOUND };
  return saved(data.id);
}

export type CommissionTransitionOutcome = SystemWriteOutcome & { operation: CommissionPolicyTransitionKey; fromStatus: CommissionPolicyStatus; toStatus: CommissionPolicyStatus };

export async function transitionCommissionPolicy(input: unknown): Promise<ActionFeedbackResult<CommissionTransitionOutcome>> {
  const parsed = CommissionPolicyTransitionInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  const spec = COMMISSION_POLICY_TRANSITIONS[parsed.data.operation];
  const supabase = await createClient();
  const { data: before } = await supabase.from("commission_policies").select("id, status").eq("id", parsed.data.policyId).maybeSingle();
  if (!before) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_NOT_FOUND };
  if (!(spec.from as readonly string[]).includes(before.status)) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_STALE };
  const { data, error } = await supabase
    .from("commission_policies")
    .update({ status: spec.to })
    .eq("id", parsed.data.policyId)
    .in("status", [...spec.from])
    .select("id, status")
    .maybeSingle();
  if (error) return { ok: false, code: mapSystemError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_STALE };
  return { ok: true, data: { id: data.id, revalidatedTags: [], operation: parsed.data.operation, fromStatus: before.status as CommissionPolicyStatus, toStatus: data.status as CommissionPolicyStatus }, code: ACTION_FEEDBACK.SYSTEM_SAVED };
}

export async function createCommissionTier(input: unknown): Promise<ActionFeedbackResult<SystemWriteOutcome>> {
  const parsed = CommissionTierFieldsInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  const supabase = await createClient();
  const { data: policy } = await supabase.from("commission_policies").select("id").eq("id", parsed.data.policyId).maybeSingle();
  if (!policy) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_NOT_FOUND };
  const { data, error } = await supabase
    .from("commission_tiers")
    .insert({ policy_id: parsed.data.policyId, min_quantity_kg: parsed.data.minQuantityKg, max_quantity_kg: parsed.data.maxQuantityKg, percentage: parsed.data.percentage })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, code: mapSystemError(error) };
  return saved(data.id);
}

export async function updateCommissionTier(input: unknown): Promise<ActionFeedbackResult<SystemWriteOutcome>> {
  const parsed = CommissionTierUpdateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_tiers")
    .update({ min_quantity_kg: parsed.data.minQuantityKg, max_quantity_kg: parsed.data.maxQuantityKg, percentage: parsed.data.percentage })
    .eq("id", parsed.data.tierId)
    .eq("policy_id", parsed.data.policyId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, code: mapSystemError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_NOT_FOUND };
  return saved(data.id);
}
