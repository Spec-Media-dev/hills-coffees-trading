"use server";

import { redirect } from "next/navigation";

import { clearActingOrganization } from "@/lib/auth/eligibility";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign-out Server Action (Feature 003 T006 — spec FR-003).
 *
 * `supabase.auth.signOut()` invalidates the session server-side (revokes the refresh token and
 * clears the `@supabase/ssr` session cookies via this same request-scoped client) — the very next
 * request to a protected route is denied by `getRequestIdentity()` resolving `{ kind: "anonymous" }`
 * with no cache to purge, because authorization state was never cached in the first place (FR-017).
 * This is NOT merely clearing client-side UI state: the confirmation dialog that calls this
 * (`components/account/logout-confirm-dialog.tsx`) is presentation only, and this action is what
 * actually ends the session.
 *
 * Also clears the acting-organization selection cookie (`lib/auth/eligibility.ts`) — a stale acting
 * org selection must not silently survive into the next sign-in on the same browser.
 */
export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearActingOrganization();
  redirect("/");
}
