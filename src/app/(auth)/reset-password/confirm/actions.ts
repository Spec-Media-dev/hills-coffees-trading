"use server";

import { redirect } from "next/navigation";

import { ResetPasswordConfirmInput } from "@/lib/validation/reset-password";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { createClient } from "@/lib/supabase/server";

/**
 * Password reset completion (Feature 003 T008). Reached only after `/auth/confirm/route.ts`
 * successfully verifies the recovery link's OTP and establishes a temporary recovery session — this
 * action's `updateUser` call fails naturally (no active session) for anyone who did not arrive via a
 * genuine, unexpired recovery link, without this file needing to re-check anything about the link
 * itself. Uses the approved Supabase Auth mechanism only.
 */
export async function confirmPasswordReset(
  _prevState: ActionFeedbackResult | undefined,
  formData: FormData
): Promise<ActionFeedbackResult> {
  const parsed = ResetPasswordConfirmInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.VALIDATION_ERROR,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { ok: false, code: ACTION_FEEDBACK.RESET_LINK_INVALID };
  }

  redirect("/sign-in/");
}
