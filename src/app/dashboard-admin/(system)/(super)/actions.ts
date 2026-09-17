"use server";

import { revalidatePath } from "next/cache";

import { createCommissionPolicy, createCommissionTier, transitionCommissionPolicy, updateCommissionPolicy, updateCommissionTier, type CommissionTransitionOutcome } from "@/lib/admin/commission";
import { createShippingRule, createTaxRule, updateShippingRule, updateTaxRule } from "@/lib/admin/pricing-rules";
import { changePlatformAdminRole, grantPlatformAdminRole, setPlatformAdminActive } from "@/lib/admin/roles";
import type { SystemWriteOutcome } from "@/lib/admin/system-errors";
import type { ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN F — Server Actions of the SUPER_ADMIN configuration slice. Each delegates to ONE
 * `lib/admin/*` function (which re-verifies `is_super_admin()` live before any query) and, on
 * success, revalidates the console's own routes. Nothing here touches a public cache: no
 * configuration row is publicly rendered. No action recalculates, restates, backfills or
 * re-snapshots any historical order, commission, seller net amount or payout — no such function
 * exists to call (T044).
 */

function fields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") out[key] = value;
  return out;
}

type Result = ActionFeedbackResult<SystemWriteOutcome>;

function revalidateSystem(paths: readonly string[]) {
  for (const path of paths) revalidatePath(path);
  revalidatePath("/dashboard-admin");
}

/* ── T027 ── */
export async function grantRole(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const result = await grantPlatformAdminRole(fields(formData));
  if (result.ok) revalidateSystem(["/dashboard-admin/roles"]);
  return result;
}
export async function changeRole(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = await changePlatformAdminRole({ userId: input.userId, role: input.decision ?? input.role, expectedRole: input.expectedRole });
  if (result.ok) revalidateSystem(["/dashboard-admin/roles"]);
  return result;
}
export async function setRoleActive(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = await setPlatformAdminActive({ userId: input.userId, isActive: input.decision === "activate" ? "true" : "false", expectedRole: input.expectedRole, expectedActive: input.expectedActive });
  if (result.ok) revalidateSystem(["/dashboard-admin/roles"]);
  return result;
}

/* ── T042 ── */
export async function saveCommissionPolicy(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.policyId ? await updateCommissionPolicy(input) : await createCommissionPolicy(input);
  if (result.ok) revalidateSystem(["/dashboard-admin/commission", `/dashboard-admin/commission/${result.data.id}`]);
  return result;
}
export async function runCommissionTransition(_prev: ActionFeedbackResult<CommissionTransitionOutcome> | undefined, formData: FormData): Promise<ActionFeedbackResult<CommissionTransitionOutcome>> {
  const input = fields(formData);
  const result = await transitionCommissionPolicy({ policyId: input.policyId, operation: input.operation });
  if (result.ok) revalidateSystem(["/dashboard-admin/commission", `/dashboard-admin/commission/${result.data.id}`]);
  return result;
}
export async function saveCommissionTier(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.tierId ? await updateCommissionTier(input) : await createCommissionTier(input);
  if (result.ok) revalidateSystem(["/dashboard-admin/commission", `/dashboard-admin/commission/${input.policyId}`]);
  return result;
}

/* ── T028 ── */
export async function saveTaxRule(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.ruleId ? await updateTaxRule(input) : await createTaxRule(input);
  if (result.ok) revalidateSystem(["/dashboard-admin/tax", `/dashboard-admin/tax/${result.data.id}`]);
  return result;
}
export async function saveShippingRule(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.ruleId ? await updateShippingRule(input) : await createShippingRule(input);
  if (result.ok) revalidateSystem(["/dashboard-admin/shipping", `/dashboard-admin/shipping/${result.data.id}`]);
  return result;
}
