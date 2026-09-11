"use server";

import { createClient } from "@/lib/supabase/server";
import type { ServerActionResult } from "@/lib/types/server-action";
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
 * FULL NAME PERSISTENCE (RUN A UX refinement — deliberately NOT written to `public.profiles` here):
 * `full_name` is passed through `signUp`'s own `options.data`, which Supabase stores as
 * `auth.users.raw_user_meta_data` — an approved, already-used mechanism in this codebase
 * (`scripts/seed-test-fixtures.ts` sets `user_metadata` the same way). It is NOT written into
 * `profiles.full_name` here, because there is currently no approved way to do that safely:
 *   - no database trigger creates a `profiles` row for a new `auth.users` row;
 *   - `profiles` RLS grants no member INSERT policy and no member UPDATE policy — the only write
 *     path is the existing `update_my_profile()` RPC, which performs `UPDATE ... WHERE id =
 *     auth.uid()` and therefore silently affects ZERO rows when no profile row exists yet;
 *   - `signUp` itself returns no session in this project's Auth configuration (confirmed during
 *     RUN DB's live verification), so there is no authenticated context here even to call
 *     `update_my_profile()` if it could create rows, which it cannot.
 * Inventing a new INSERT policy, a new trigger, or a new RPC to close this gap is exactly the "new
 * DB bypass" this run's instructions forbid. The name is captured safely and is available (via
 * `user.user_metadata.full_name`) the moment a real session exists; wiring it into `profiles` is
 * left for the approved profile/onboarding path to pick up — a genuine, pre-existing Feature 001
 * gap, not something this run should paper over.
 */
export async function signUp(
  _prevState: ServerActionResult<never> | undefined,
  formData: FormData
): Promise<ServerActionResult<never>> {
  const parsed = SignUpInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      // Same success path as a genuinely new account — never disclose that this email exists.
      return { ok: true, data: undefined as never };
    }

    if (error.code === "weak_password") {
      return { ok: false, error: "Choose a stronger password and try again." };
    }

    if (error.code === "email_address_invalid") {
      return { ok: false, error: "Enter a valid email address." };
    }

    if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
      return { ok: false, error: "Too many attempts. Please wait a moment and try again." };
    }

    return { ok: false, error: "We couldn't create your account. Please try again." };
  }

  return { ok: true, data: undefined as never };
}
