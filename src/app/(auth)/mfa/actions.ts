"use server";

import { redirect } from "next/navigation";

import { getRequestIdentity } from "@/lib/auth/dal";
import { MfaCodeInput } from "@/lib/validation/mfa";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { createClient } from "@/lib/supabase/server";

/**
 * MFA challenge verification (Feature 003 T009 — spec FR-001, SEC-005; SECURITY-CRITICAL).
 *
 * Uses Supabase Auth's own factor APIs (`mfa.challengeAndVerify`) — no custom second-factor
 * mechanism is invented. This gates SESSION AUTHENTICATOR LEVEL itself (`aal1` → `aal2`), not merely
 * a UI screen: until this succeeds, `supabase.auth.getUser()` still returns the user, but any
 * RLS policy or SECURITY DEFINER function requiring `aal2` continues to refuse access — the
 * database, not this page, is the actual enforcement boundary (spec T009 Verify).
 */
export async function verifyMfaChallenge(
  _prevState: ActionFeedbackResult | undefined,
  formData: FormData
): Promise<ActionFeedbackResult> {
  const parsed = MfaCodeInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.VALIDATION_ERROR,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });

  if (error) {
    return { ok: false, code: ACTION_FEEDBACK.MFA_INVALID_CODE };
  }

  const identity = await getRequestIdentity();
  if (identity.kind === "authenticated" && identity.operationalRoles.length > 0) {
    redirect("/dashboard-admin/");
  }
  redirect("/dashboard/");
}

/**
 * MFA enrollment confirmation (T009). Verifying the code the user entered from their authenticator
 * app against the just-created factor is what moves it from `unverified` to `verified` and
 * promotes the current session to `aal2` — Supabase's own documented enrollment completion step.
 */
export async function confirmMfaEnrollment(
  _prevState: ActionFeedbackResult | undefined,
  formData: FormData
): Promise<ActionFeedbackResult> {
  const parsed = MfaCodeInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.VALIDATION_ERROR,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });

  if (error) {
    return { ok: false, code: ACTION_FEEDBACK.MFA_INVALID_CODE };
  }

  return { ok: true, data: undefined, code: ACTION_FEEDBACK.MFA_ENABLED };
}
