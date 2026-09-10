import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Shared email-link confirmation route (Feature 003 T007/T008 — Supabase Auth's current
 * recommended SSR pattern: `token_hash` + `type` verified server-side via `auth.verifyOtp`, rather
 * than a PKCE code-exchange flow). Handles BOTH email-verification links (`type=email`/`signup`)
 * and password-recovery links (`type=recovery`) through the same verb, since both are simply "prove
 * you control this email, then let the caller decide the next screen."
 *
 * No custom verification token is invented anywhere — this route only calls the approved provider
 * method and never stores or generates its own token.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      if (type === "recovery") redirect("/reset-password/confirm/");
      redirect(next && next.startsWith("/") ? next : "/dashboard/");
    }
  }

  redirect("/sign-in/");
}
