"use server";

import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Resend the email-verification link (Feature 003 T007 — spec FR-001).
 *
 * Uses Supabase Auth's own provider mechanism (`auth.resend`) — no custom verification token is
 * invented. Requires an active (even if unverified) session, since the email is read from the
 * caller's own verified `auth.getUser()` result rather than trusted from client input.
 */
export async function resendVerificationEmail(): Promise<ActionFeedbackResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return { ok: false, code: ACTION_FEEDBACK.SESSION_EXPIRED };
  }

  const { error } = await supabase.auth.resend({ type: "signup", email: user.email });

  if (error) {
    return { ok: false, code: ACTION_FEEDBACK.AUTH_GENERIC_ERROR };
  }

  return { ok: true, data: undefined, code: ACTION_FEEDBACK.VERIFICATION_RESENT };
}
