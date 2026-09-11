"use server";

import { revalidatePath } from "next/cache";

import { getRequestIdentity } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { MyProfileInput } from "@/lib/validation/my-profile";
import { OrganizationContactInput } from "@/lib/validation/organization-contact";

/**
 * `updateMyProfile` — the FR-012 Server Action Contract reference implementation
 * (contracts/server-action-contract.md). Every later sensitive Server Action in this codebase
 * copies this file's six-step shape.
 *
 * SECURITY CONTRACT — do not reorder or skip a step:
 *
 * 1. VALIDATE  — Zod parses the FormData. Invalid input returns field errors immediately; nothing
 *    below this point runs (no auth check, no RPC call) on invalid input.
 * 2. AUTHENTICATE — `getRequestIdentity()` resolves identity fresh, this request (never a
 *    client-supplied user id, never `getSession()`). Unauthenticated callers are rejected before
 *    any database access — this Server Action is reachable directly (a client can POST to it even
 *    if the rendering page's guard would otherwise deny the page), so it must independently
 *    re-verify authentication itself rather than trusting that only an authorized page could have
 *    reached it (Constitution Principle VIII; contracts/route-surface-contract.md "Defence in
 *    depth").
 * 3. AUTHORIZE — none needed beyond authentication: every authenticated user may update their own
 *    profile (`update_my_profile` scopes the write to `auth.uid()` itself).
 * 4. CONTROLLED DATA ACCESS — the already-approved `update_my_profile` RPC, called through the
 *    request-scoped, RLS-respecting server client (never the browser client, never a privileged /
 *    service-role client — this feature's runtime code never constructs one).
 * 5. SAFE ERROR MAPPING — the RPC's error is never returned verbatim. `update_my_profile` raises a
 *    generic `forbidden` exception for its own auth check, and any other Postgres error could carry
 *    schema/internal detail; both map to one safe, generic string (FR-013, FR-027).
 * 6. REVALIDATE — only this user's own settings surface. Never a public/shared cache key for a
 *    user-scoped write.
 */
export async function updateMyProfile(
  _prevState: ActionFeedbackResult<{ fullName: string | null; companyName: string | null }> | undefined,
  formData: FormData
): Promise<ActionFeedbackResult<{ fullName: string | null; companyName: string | null }>> {
  // 1. VALIDATE
  const parsed = MyProfileInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.VALIDATION_ERROR,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // 2. AUTHENTICATE
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") {
    return { ok: false, code: ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED };
  }
  // T033 remediation — a step-up-pending session must not be able to mutate profile data.
  if (identity.requiresMfaStepUp) {
    return { ok: false, code: ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED };
  }

  // 3. AUTHORIZE — see comment above; no additional check for this action.

  // 4. CONTROLLED DATA ACCESS
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_profile", {
    p_full_name: parsed.data.fullName ?? null,
    p_phone: parsed.data.phone ?? null,
    p_company_name: parsed.data.companyName ?? null,
    p_avatar_path: parsed.data.avatarPath ?? null,
  });

  // 5. SAFE ERROR MAPPING — the raw RPC error's own message detail never reaches the caller.
  if (error) {
    return { ok: false, code: ACTION_FEEDBACK.PROFILE_SAVE_FAILED };
  }

  // 6. REVALIDATE
  revalidatePath("/dashboard/settings");

  return {
    ok: true,
    code: ACTION_FEEDBACK.PROFILE_SAVED,
    data: {
      fullName: parsed.data.fullName ?? null,
      companyName: parsed.data.companyName ?? null,
    },
  };
}

/**
 * `updateOrganizationContact` — Feature 003 T026. Same six-step shape as `updateMyProfile` above.
 *
 * ONLY `update_organization_contact` is ever called — no direct `organizations` table UPDATE
 * anywhere in this file. The RPC itself (confirmed against the live schema report) accepts exactly
 * `p_organization_id, p_display_name, p_email, p_phone` and writes exactly those three columns; it
 * has no parameter through which `status`/`account_type`/`can_buy`/`can_sell`/`is_hills_internal`/
 * `created_by` could ever be supplied, by this action or by a tampered request directly against it.
 *
 * `p_organization_id` is the caller's FRESH acting organization from `getRequestIdentity()` —
 * never a hidden form field. The RPC independently re-verifies `is_org_member(p_organization_id)`
 * and `NOT is_blocked_user()` itself (`raise exception 'forbidden'` otherwise) — defence in depth,
 * not this action's only line of defence against a cross-org or blocked-caller attempt.
 */
export async function updateOrganizationContact(
  _prevState: ActionFeedbackResult | undefined,
  formData: FormData
): Promise<ActionFeedbackResult> {
  // 1. VALIDATE
  const parsed = OrganizationContactInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // 2. AUTHENTICATE
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") {
    return { ok: false, code: ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED };
  }
  // T033 remediation — a step-up-pending session must not be able to mutate organization data.
  if (identity.requiresMfaStepUp) {
    return { ok: false, code: ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED };
  }

  // 3. AUTHORIZE — a fresh, unambiguous acting organization is required; the RPC re-verifies
  // membership itself regardless.
  if (identity.organization === null || identity.requiresOrganizationSelection) {
    return { ok: false, code: ACTION_FEEDBACK.ORGANIZATION_CONTACT_SAVE_FAILED };
  }

  // 4. CONTROLLED DATA ACCESS
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_organization_contact", {
    p_organization_id: identity.organization.organizationId,
    p_display_name: parsed.data.displayName || null,
    p_email: parsed.data.email || null,
    p_phone: parsed.data.phone || null,
  });

  // 5. SAFE ERROR MAPPING
  if (error) {
    return { ok: false, code: ACTION_FEEDBACK.ORGANIZATION_CONTACT_SAVE_FAILED };
  }

  // 6. REVALIDATE
  revalidatePath("/dashboard/settings");

  return { ok: true, data: undefined, code: ACTION_FEEDBACK.ORGANIZATION_CONTACT_SAVED };
}
