"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getRequestIdentity } from "@/lib/auth/dal";
import { startOrganizationOnboarding } from "@/lib/kyb/mutations";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { MembershipApplicationInput } from "@/lib/validation/membership-application";

/**
 * Controlled organization onboarding (Feature 003 T013 — spec FR-008, SEC-001/SEC-006).
 *
 * 1. AUTHENTICATE + VERIFY — requires a fresh, authenticated, email-verified identity. A blocked
 *    caller is refused by `start_organization_onboarding` itself (server/DB-side); this action does
 *    not attempt to re-derive that check in TypeScript because `RequestIdentity` carries no
 *    `isBlocked` field to check — the DB function is the sole authority for it.
 * 2. VALIDATE — Zod (`MembershipApplicationInput`), the same schema the client form uses.
 * 3. CONTROLLED DATA ACCESS — calls `start_organization_onboarding` (`lib/kyb/mutations.ts`) only.
 *    No direct `organizations`/`organization_members` INSERT exists anywhere in this file; no
 *    service-role client is constructed here. `status`, `can_buy`, `can_sell`, `created_by`,
 *    `member_role`, and any role field are never accepted as input and never forwarded — the RPC
 *    derives every one of them itself.
 * 4. HANDLE THE CONFLICT TRUTHFULLY — an `already_member` result (structurally unreachable in normal
 *    operation, since this page only renders for a caller with zero memberships, but possible under
 *    a race) is treated as success: re-resolving `/dashboard/` will show the correct state for
 *    whatever membership now actually exists, never a fabricated organization id.
 * 5. REVALIDATE + REDIRECT — back to `/dashboard/`, which re-resolves identity fresh; the new
 *    `PENDING_KYB` organization routes to the "KYB verification is next" state (`dashboard/layout.tsx`),
 *    never the ordinary business dashboard.
 *
 * FULL NAME PERSISTENCE (RUN A UX refinement, closed here): `full_name` is captured at Sign-Up into
 * `auth.users.raw_user_meta_data` (`(auth)/sign-up/actions.ts`) because there is no approved way to
 * write it into `profiles` at that point (no session exists yet in this project's Auth
 * configuration). The FIRST moment a real, authenticated, write-capable session exists in the
 * approved flow is here, at onboarding — so this action now calls the existing `update_my_profile()`
 * RPC (the SAME one `dashboard/settings/actions.ts` already uses, via the SAME `supabase.rpc(...)`
 * call shape) to copy `user.user_metadata.full_name` into `profiles.full_name`, before attempting
 * the controlled onboarding capability. No new RPC, no new RLS, no new migration.
 *
 * KNOWN REMAINING GAP (not closed here — requires a migration, out of this run's allowed scope):
 * `update_my_profile()` is UPDATE-only (`UPDATE profiles SET ... WHERE id = auth.uid()`), and there
 * is still no approved way to CREATE a `profiles` row for a user who has never had one — no trigger
 * creates it, and `profiles` RLS grants no member INSERT policy (confirmed against the live schema
 * report). For a genuinely fresh real signup (never seeded by `scripts/seed-test-fixtures.ts`), the
 * `update_my_profile()` call below is a harmless no-op (zero rows affected, no error), and the
 * `start_organization_onboarding` call immediately after will then fail with a foreign-key violation
 * on `organizations.created_by references profiles(id)` — a real, pre-existing platform gap this run
 * did not introduce and cannot close without a migration (an INSERT policy scoped to
 * `auth.uid() = id`, an upsert-capable RPC, or a `handle_new_user`-style trigger). Every fixture this
 * repository's tests use already has a `profiles` row (created by the approved admin-only seed
 * script), which is why this gap did not surface during RUN A's or RUN DB's live verification.
 */
export async function submitMembershipApplication(
  _prevState: ActionFeedbackResult | undefined,
  formData: FormData
): Promise<ActionFeedbackResult> {
  const identity = await getRequestIdentity();

  if (identity.kind !== "authenticated") {
    redirect("/sign-in/");
  }

  if (!identity.isEmailVerified) {
    redirect("/verify-email/");
  }

  if (identity.organization !== null || identity.requiresOrganizationSelection) {
    // Already attached (or ambiguously multi-attached) — nothing for this action to do.
    redirect("/dashboard/");
  }

  const parsed = MembershipApplicationInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.VALIDATION_ERROR,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // Full Name sync (see the doc comment above): best-effort, never blocks onboarding on failure —
  // this is presentation/profile data, not an authorization decision, and its absence must never
  // stop a legitimate onboarding attempt.
  if (!identity.profile.fullName) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const metadataFullName = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
    if (metadataFullName) {
      await supabase.rpc("update_my_profile", {
        p_full_name: metadataFullName,
        p_phone: null,
        p_company_name: identity.profile.companyName ?? null,
        p_avatar_path: null,
      });
      // No error handling here beyond the call itself: `update_my_profile` fails closed (raises
      // only for `forbidden`, which cannot occur — this action already confirmed an authenticated,
      // verified identity) or silently affects zero rows if no `profiles` row exists yet (the
      // known remaining gap documented above). Either outcome is safe to ignore and continue.
    }
  }

  const result = await startOrganizationOnboarding({
    legalName: parsed.data.legalName,
    displayName: parsed.data.displayName || undefined,
    accountType: parsed.data.accountType,
    countryCode: parsed.data.countryCode,
    taxNumber: parsed.data.taxNumber || undefined,
    registrationNumber: parsed.data.registrationNumber || undefined,
    email: parsed.data.contactEmail || undefined,
    phone: parsed.data.contactPhone || undefined,
  });

  if (!result.ok) {
    return { ok: false, code: ACTION_FEEDBACK.ONBOARDING_FAILED };
  }

  revalidatePath("/dashboard/");
  redirect("/dashboard/");
}
