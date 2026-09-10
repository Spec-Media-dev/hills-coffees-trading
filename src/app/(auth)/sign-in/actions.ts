"use server";

import { redirect } from "next/navigation";

import { getRequestIdentity } from "@/lib/auth/dal";
import type { ServerActionResult } from "@/lib/types/server-action";
import { SIGN_IN_GENERIC_ERROR, SignInInput } from "@/lib/validation/sign-in";
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
 * 3. MFA — if the session's authenticator level must step up (`aal1` → `aal2`), the user is routed
 *    to the challenge before anything else, never straight to a protected destination.
 * 4. ROUTE BY ELIGIBILITY — resolved AFTER a fresh `getRequestIdentity()` call for this same
 *    request (the new session cookie is already set at this point), never assumed from the
 *    sign-in form's own success alone.
 */
export async function signIn(
  _prevState: ServerActionResult<never> | undefined,
  formData: FormData
): Promise<ServerActionResult<never>> {
  // 1. VALIDATE
  const parsed = SignInInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
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
    return { ok: false, error: SIGN_IN_GENERIC_ERROR };
  }

  // 3. MFA STEP-UP
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aalError && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
    redirect("/mfa/");
  }

  // 4. ROUTE BY ELIGIBILITY
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") {
    redirect("/sign-in/");
  }

  if (!identity.isEmailVerified) {
    redirect("/verify-email/");
  }

  if (identity.operationalRoles.length > 0) {
    redirect("/dashboard-admin/");
  }

  redirect("/dashboard/");
}
