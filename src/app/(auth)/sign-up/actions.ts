"use server";

import { createClient } from "@/lib/supabase/server";
import { canonicalUrl } from "@/lib/public/site";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { SignUpInput } from "@/lib/validation/sign-up";

/**
 * Sign-Up Server Action (Feature 003 T010a — spec FR-001, FR-002, FR-008, SEC-001).
 *
 * 1. VALIDATE — Zod (full name, email format, password length, confirmation match).
 * 2. CREATE ACCOUNT — real `supabase.auth.signUp`. Nothing else. This creates ONLY the Auth user;
 *    it never creates an `organizations` row, an `organization_members` row, or any capability —
 *    those exist solely through the controlled onboarding RPC (T013), invoked later from the
 *    onboarding step, and only for a VERIFIED, authenticated caller.
 * 3. GENERIC RESPONSE — an already-registered email (`user_already_exists`/`email_exists`) and a
 *    brand-new signup both resolve to the SAME acknowledgement, exactly like `signIn`'s single
 *    generic failure message: this is the entire enumeration-resistance mechanism here, and it needs
 *    no additional logic to hold, only the discipline not to branch on that specific error. Any
 *    OTHER failure (weak password per Supabase's own configured policy, invalid email, rate limit)
 *    is not an account-existence signal and is shown as its own safe, non-raw message.
 *
 * No verification token is invented — `signUp` sends Supabase's own confirmation email, and
 * `src/app/auth/confirm/route.ts` (already built for T007/T008) is the same shared callback that
 * completes it.
 *
 * FULL NAME PERSISTENCE: `full_name` is passed through `signUp`'s own `options.data`, which
 * Supabase stores as `auth.users.raw_user_meta_data` — an approved, already-used mechanism in this
 * codebase (`scripts/seed-test-fixtures.ts` sets `user_metadata` the same way). It is NOT written
 * into `profiles.full_name` directly here — that now happens automatically, server-side, via the
 * `on_auth_user_created` trigger (`supabase/migrations/20260912000000_feature_003_profile_bootstrap.sql`,
 * PART 0 of the run that closed the fresh-signup profile bootstrap defect): the trigger fires on the
 * SAME `auth.users` INSERT this call produces, reads only `raw_user_meta_data->>'full_name'`, and
 * creates the caller's `profiles` row with it — before any session exists, which is exactly why the
 * write could never happen from THIS action (`signUp` itself returns no session in this project's
 * Auth configuration). `dashboard/onboarding/actions.ts`'s own `update_my_profile` call remains as a
 * safe fallback for any `profiles` row that predates the trigger, never as the primary path.
 *
 * PART 1: `emailRedirectTo` is set explicitly (mirroring the `resetPasswordForEmail` precedent in
 * `(auth)/reset-password/actions.ts`) so the confirmation email's link is unambiguous regardless of
 * the Supabase project's default Site URL configuration — the same shared verification callback
 * route T007/T008 already built handles the actual confirmation, and it already redirects a
 * successfully verified caller straight to `/dashboard/`, never back to `/sign-in/`.
 */
export async function signUp(
  _prevState: ActionFeedbackResult | undefined,
  formData: FormData
): Promise<ActionFeedbackResult> {
  const parsed = SignUpInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.VALIDATION_ERROR,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: canonicalUrl("/dashboard/"),
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      // Same success path as a genuinely new account — never disclose that this email exists.
      return { ok: true, data: undefined, code: ACTION_FEEDBACK.SIGN_UP_ACKNOWLEDGED };
    }

    if (error.code === "weak_password") {
      return { ok: false, code: ACTION_FEEDBACK.WEAK_PASSWORD };
    }

    if (error.code === "email_address_invalid") {
      return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { email: ["invalid"] } };
    }

    if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
      return { ok: false, code: ACTION_FEEDBACK.RATE_LIMITED };
    }

    return { ok: false, code: ACTION_FEEDBACK.AUTH_GENERIC_ERROR };
  }

  return { ok: true, data: undefined, code: ACTION_FEEDBACK.SIGN_UP_ACKNOWLEDGED };
}
