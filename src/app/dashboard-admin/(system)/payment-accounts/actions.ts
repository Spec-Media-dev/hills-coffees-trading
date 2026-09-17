"use server";

import { revalidatePath } from "next/cache";

import { createPaymentAccount, updatePaymentAccount } from "@/lib/admin/payment-accounts";
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
