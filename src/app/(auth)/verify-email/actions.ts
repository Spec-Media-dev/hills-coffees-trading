"use server";

import { createClient } from "@/lib/supabase/server";
import type { ServerActionResult } from "@/lib/types/server-action";

/**
 * Resend the email-verification link (Feature 003 T007 — spec FR-001).
 *
 * Uses Supabase Auth's own provider mechanism (`auth.resend`) — no custom verification token is
 * invented. Requires an active (even if unverified) session, since the email is read from the
 * caller's own verified `auth.getUser()` result rather than trusted from client input.
 */
export async function resendVerificationEmail(): Promise<ServerActionResult<never>> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return { ok: false, error: "You need to sign in again to request a new verification email." };
  }

  const { error } = await supabase.auth.resend({ type: "signup", email: user.email });

  if (error) {
    return { ok: false, error: "That didn't send — please try again shortly." };
  }

  return { ok: true, data: undefined as never };
}
