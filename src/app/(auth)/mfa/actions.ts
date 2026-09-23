"use server";

import { revalidatePath } from "next/cache";
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

/**
 * `removeMyMfaFactor` — hardening run (2FA management). Removes ONE of the caller's OWN verified
 * TOTP factors, and only after a FRESH code from that same factor proves the caller still holds the
 * authenticator (a stolen, already-`aal2` session alone is not enough to silently disable 2FA).
 *
 * 1. VALIDATE — `MfaCodeInput` (factor id + 6-digit code), the same schema enrollment uses.
 * 2. AUTHENTICATE — a signed-in session; a session still owing its step-up must finish `/mfa/` first.
 * 3. AUTHORIZE — the factor id must appear in THIS session's own `mfa.listFactors()` verified TOTP
 *    list; Supabase Auth scopes every `mfa.*` call to the session user as well, so no other account's
 *    factor can be targeted even with a guessed id.
 * 4. VERIFY — `mfa.challengeAndVerify` with the submitted code (also satisfies Supabase's own rule
 *    that a verified factor may only be unenrolled from an `aal2` session).
 * 5. ACT — `mfa.unenroll({ factorId })`. No secret is read, logged or stored at any step.
 * 6. REVALIDATE — both account surfaces that render the status.
 */
export async function removeMyMfaFactor(
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

  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") {
    return { ok: false, code: ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED };
  }
  if (identity.requiresMfaStepUp) {
    return { ok: false, code: ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED };
  }

  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError || !factors) {
    return { ok: false, code: ACTION_FEEDBACK.MFA_REMOVE_FAILED };
  }
  const owned = factors.totp.some((factor) => factor.id === parsed.data.factorId);
  if (!owned) {
    return { ok: false, code: ACTION_FEEDBACK.MFA_FACTOR_NOT_FOUND };
  }

  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (verifyError) {
    return { ok: false, code: ACTION_FEEDBACK.MFA_INVALID_CODE };
  }

  const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: parsed.data.factorId });
  if (unenrollError) {
    return { ok: false, code: ACTION_FEEDBACK.MFA_REMOVE_FAILED };
  }

  revalidatePath("/dashboard-admin/account");
  revalidatePath("/dashboard/settings");
  return { ok: true, data: undefined, code: ACTION_FEEDBACK.MFA_DISABLED };
}
