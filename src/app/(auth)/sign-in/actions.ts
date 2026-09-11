"use server";

import { redirect } from "next/navigation";

import { getRequestIdentity } from "@/lib/auth/dal";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { SignInInput } from "@/lib/validation/sign-in";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign-in Server Action (Feature 003 T005 — spec FR-001, FR-002, SC-005).
 *
 * 1. VALIDATE — Zod, the same schema the client form uses.
 * 2. AUTHENTICATE — `supabase.auth.signInWithPassword`. Supabase Auth itself returns the SAME
 *    generic `"Invalid login credentials"` error whether the email is unknown or the password is
 *    wrong — this action adds NOTHING on top of that response that could reintroduce a
 *    distinction (no pre-check "does this email exist" lookup, no different message per cause,
 *    no different status/redirect). That is the entire enumeration-resistance mechanism (SC-005);
 *    it needs no additional logic here to hold, only the discipline not to break it.
 * 3. PORTAL BOUNDARY — resolve identity from fresh DB authority. Operational admins are signed
 *    straight back out and receive only the controlled `ADMIN_PORTAL_REQUIRED` code; this member
 *    entry point never creates onboarding state or admits them to a member workspace.
 * 4. MFA — member sessions that require `aal2` step up before a protected destination.
 * 5. ROUTE BY MEMBER ELIGIBILITY — verified members continue to the member dashboard.
 */
export async function signIn(
  _prevState: ActionFeedbackResult | undefined,
  formData: FormData
): Promise<ActionFeedbackResult> {
  // 1. VALIDATE
  const parsed = SignInInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.VALIDATION_ERROR,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // 2. AUTHENTICATE
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // The SAME generic message for every failure cause — never distinguish by error code/status.
    return { ok: false, code: ACTION_FEEDBACK.INVALID_CREDENTIALS };
  }

  // 3. PORTAL BOUNDARY — resolve fresh DB-derived identity before any onward route.
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") {
    await supabase.auth.signOut();
    return { ok: false, code: ACTION_FEEDBACK.AUTH_GENERIC_ERROR };
  }

  if (identity.operationalRoles.length > 0) {
    // Operational accounts use the dedicated admin portal. Do not leave a member-portal session
    // behind and do not create/enter any member onboarding state.
    await supabase.auth.signOut();
    return { ok: false, code: ACTION_FEEDBACK.ADMIN_PORTAL_REQUIRED };
  }

  // 4. MFA STEP-UP
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aalError && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
    redirect("/mfa/");
  }

  // 5. MEMBER ELIGIBILITY
  if (!identity.isEmailVerified) {
    redirect("/verify-email/");
  }

  redirect("/dashboard/");
}
