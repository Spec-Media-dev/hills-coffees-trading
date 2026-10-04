"use server";

import { revalidatePath } from "next/cache";

import { createPaymentAccount, setDefaultPaymentAccount, updatePaymentAccount, type BankDefaultResult } from "@/lib/admin/payment-accounts";
import type { SystemWriteOutcome } from "@/lib/admin/system-errors";
import type { ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN F — T029 payment-account Server Action. Delegates to `lib/admin/payment-accounts.ts`
 * (which re-verifies `is_super_admin()` before any write — the database's own `WITH CHECK`). A
 * high-risk, single-actor change: no maker-checker exists in the approved schema (OPS-01) and none
 * is simulated here. No member or public route reaches this module.
 */

function fields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") out[key] = value;
  return out;
}

type Result = ActionFeedbackResult<SystemWriteOutcome>;

export async function savePaymentAccount(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.accountId ? await updatePaymentAccount(input) : await createPaymentAccount(input);
  if (result.ok) {
    revalidatePath("/dashboard-admin/payment-accounts");
    revalidatePath(`/dashboard-admin/payment-accounts/${result.data.id}`);
    revalidatePath("/dashboard-admin");
  }
  return result;
}

/**
 * Feature 018 - choose the default USD account. Thin wrapper over the existing request-bound database routine
 * (Platform Admin + MFA are enforced there; Super Admin keeps sole authority over create/edit above). The client sends
 * one stable `requestId` per confirmation so a retry is a safe replay.
 */
export async function setDefaultPaymentAccountAction(_prev: BankDefaultResult | undefined, formData: FormData): Promise<BankDefaultResult> {
  const accountId = formData.get("accountId");
  const requestId = formData.get("requestId");
  const result = await setDefaultPaymentAccount({ accountId: typeof accountId === "string" ? accountId : undefined, requestId: typeof requestId === "string" ? requestId : undefined });
  if (result.ok) {
    revalidatePath("/dashboard-admin/payment-accounts");
    revalidatePath("/dashboard-admin");
  }
  return result;
}
