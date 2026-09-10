"use server";

import { ResetPasswordRequestInput } from "@/lib/validation/reset-password";
import type { ServerActionResult } from "@/lib/types/server-action";
import { createClient } from "@/lib/supabase/server";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Password reset request (Feature 003 T008 — spec FR-002, PS7, SC-005).
 *
 * The response is the SAME generic acknowledgement whether or not the email is registered — this
 * is Supabase Auth's own documented behaviour for `resetPasswordForEmail` (it does not disclose
 * account existence), and this action deliberately does not add any distinguishing branch on top
 * of it: even a call that errors still resolves to the identical acknowledgement, so no code path
 * here can leak account existence through a different message, status or timing-visible branch.
 *
 * Uses the approved Supabase Auth mechanism only — no custom reset-token table or storage.
 */
export async function requestPasswordReset(
  _prevState: ServerActionResult<never> | undefined,
  formData: FormData
): Promise<ServerActionResult<never>> {
  const parsed = ResetPasswordRequestInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted field.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: canonicalUrl("/reset-password/confirm/"),
  });

  // Deliberately ignore the call's own error/success distinction — see file header. The
  // acknowledgement is identical either way.
  return { ok: true, data: undefined as never };
}
