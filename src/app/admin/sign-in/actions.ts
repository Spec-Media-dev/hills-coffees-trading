"use server";

import { redirect } from "next/navigation";

import { getRequestIdentity } from "@/lib/auth/dal";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { SignInInput } from "@/lib/validation/sign-in";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin sign-in Server Action (admin-auth correction pass — dedicated OPERATIONS console
 * authentication entry point, intentionally separate from the member `signIn`
 * (`(auth)/sign-in/actions.ts`)).
 *
 * 1. VALIDATE — the SAME `SignInInput` schema the member sign-in form uses. No second validation
 *    system; credentials are still plain Supabase Auth email/password.
 * 2. AUTHENTICATE — `supabase.auth.signInWithPassword`. Same provider, same credential store —
 *    this file does NOT create a second authentication database or mechanism (run directive §2).
 * 3. AUTHORIZE FROM APPROVED DB TRUTH — `getRequestIdentity()` is called FRESH, after the session
 *    cookie is already set, and `identity.operationalRoles` is read from it — the SAME field
 *    `dashboard-admin/layout.tsx`'s own guard checks (`ROLE_FUNCTIONS` in `lib/auth/dal.ts`, each
 *    backed by an approved `is_*_operator()`/`is_platform_admin()` SECURITY DEFINER function that
 *    itself checks `platform_admins.is_active = true`). Authorization is NEVER read from
 *    `user.user_metadata`, email, a URL, frontend state, or any browser-controlled value — this
 *    file does not even have a code path capable of reading `user_metadata` for this purpose.
 * 4. NON-ADMIN DENIAL — an authenticated non-admin is signed straight back out and receives the
 *    controlled `ADMIN_ACCESS_DENIED` code. Invalid credentials still share one generic code for
 *    unknown email and wrong password; neither branch returns provider or role details.
 * 5. MFA — eligible admins step up before the protected destination when required.
 * 6. NO FALLBACK, NO AUTO-PROVISIONING — this file never inserts into `platform_admins`, never
 *    grants a role, and never creates an organization/membership. A successful, eligible admin
 *    sign-in redirects to exactly ONE fixed destination (`/dashboard-admin/`) — no `next`/return
 *    parameter is read from the request at all, so there is no open-redirect surface to defend
 *    (run directive §10) by construction, not by a validated allowlist.
 */
export async function adminSignIn(
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
    return { ok: false, code: ACTION_FEEDBACK.INVALID_CREDENTIALS };
  }

  // 3/4. AUTHORIZE — fresh, DB-derived, never metadata/frontend-derived.
  const identity = await getRequestIdentity();

  if (identity.kind !== "authenticated") {
    await supabase.auth.signOut();
    return { ok: false, code: ACTION_FEEDBACK.AUTH_GENERIC_ERROR };
  }

  if (identity.operationalRoles.length === 0) {
    // Sign the just-established session back out — see doc comment point 5. Best-effort: an error
    // here does not change the response, since the caller is denied either way.
    await supabase.auth.signOut();
    return { ok: false, code: ACTION_FEEDBACK.ADMIN_ACCESS_DENIED };
  }

  // 5. MFA STEP-UP only after the admin boundary has been established.
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aalError && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
    redirect("/mfa/");
  }

  // 6. Exactly one fixed destination — no dynamic redirect target exists to validate or abuse.
  redirect("/dashboard-admin/");
}
