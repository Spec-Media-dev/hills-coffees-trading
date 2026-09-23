"use server";

import { revalidatePath } from "next/cache";

import { getRequestIdentity } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { ALLOWED_IMAGE_MIME_TYPES, AVATAR_MAX_BYTES, ChangeMyEmailInput, ChangeMyPasswordInput } from "@/lib/validation/account-security";
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

/**
 * `changeMyPassword` — Feature 010 RUN F010-ACCOUNT-MEDIA approved scope addition, available to
 * EVERY role (Admin/Super Admin/Seller/Buyer, per the run's own approved account rules). Same
 * six-step shape as `updateMyProfile`. Uses ONLY the approved Supabase Auth mechanism
 * (`auth.updateUser({ password })`) against the caller's OWN already-authenticated session — the
 * SAME primitive `(auth)/reset-password/confirm/actions.ts` already relies on after a recovery link,
 * now reached directly from an in-session account-settings form instead. No custom password table,
 * no plaintext value logged or returned — a success response never echoes the password back.
 */
export async function changeMyPassword(_prevState: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  // 1. VALIDATE
  const parsed = ChangeMyPasswordInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // 2. AUTHENTICATE
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") {
    return { ok: false, code: ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED };
  }
  if (identity.requiresMfaStepUp) {
    return { ok: false, code: ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED };
  }

  // 3. AUTHORIZE — every authenticated, step-up-complete session may change its OWN password; the
  // Supabase Auth call below is scoped to the caller's own session by construction (there is no
  // parameter through which another user's password could be targeted).

  // 4. CONTROLLED DATA ACCESS
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  // 5. SAFE ERROR MAPPING — Supabase's own error (e.g. "password too weak", "same as old password")
  // is never returned verbatim; a single generic failure code covers every case.
  if (error) {
    return { ok: false, code: ACTION_FEEDBACK.PASSWORD_CHANGE_FAILED };
  }

  // 6. REVALIDATE — nothing cached depends on this; no path to revalidate.
  return { ok: true, data: undefined, code: ACTION_FEEDBACK.PASSWORD_CHANGED };
}

/**
 * `changeMyEmail` — Feature 010 T048, ADMIN/SUPER_ADMIN ONLY (the run's own approved account rules:
 * "Seller/Buyer MUST NOT change their email in this scope"). Uses ONLY the approved Supabase Auth
 * double-confirmation flow (`auth.updateUser({ email })`) — Supabase itself sends a confirmation
 * email and does not change the session's email until the link is used, preserving verification
 * without this codebase needing to implement any of that itself. No `auth.users` write of any kind
 * happens here or anywhere else in this file — this is the ONLY approved mechanism, and it is the
 * provider's own.
 *
 * AUTHORIZATION — explicit and load-bearing (step 3, not merely "any authenticated user"): a
 * Seller/Buyer session (no `operationalRoles` at all) is refused BEFORE any Supabase Auth call, with
 * its own distinct code (`EMAIL_CHANGE_FORBIDDEN`) rather than falling through to a generic failure —
 * this is the exact hardening the run directive requires ("explicitly refuses Seller/Buyer email
 * mutation"), proven in `tests/auth/account-security.test.ts`.
 */
export async function changeMyEmail(_prevState: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  // 1. VALIDATE
  const parsed = ChangeMyEmailInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // 2. AUTHENTICATE
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") {
    return { ok: false, code: ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED };
  }
  if (identity.requiresMfaStepUp) {
    return { ok: false, code: ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED };
  }

  // 3. AUTHORIZE — ADMIN/SUPER_ADMIN only. `operationalRoles` is the SAME live, per-request role
  // resolution every admin-console guard already uses (lib/auth/dal.ts) — never a client-supplied or
  // cached value. A Seller/Buyer (or a pure FINANCE/WAREHOUSE/COMPLIANCE/AUDITOR operator, who is
  // NOT named in the approved rule either) is refused here, explicitly, before any Auth call.
  const isAdminOrSuperAdmin = identity.operationalRoles.includes("ADMIN") || identity.operationalRoles.includes("SUPER_ADMIN");
  if (!isAdminOrSuperAdmin) {
    return { ok: false, code: ACTION_FEEDBACK.EMAIL_CHANGE_FORBIDDEN };
  }

  // 4. CONTROLLED DATA ACCESS — the approved Supabase Auth flow only. Preserves email
  // verification/re-authentication requirements exactly as Supabase itself enforces them; this
  // codebase adds no bypass.
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: parsed.data.newEmail });

  // 5. SAFE ERROR MAPPING
  if (error) {
    return { ok: false, code: ACTION_FEEDBACK.EMAIL_CHANGE_FAILED };
  }

  // 6. REVALIDATE — the account page shows the pending-change state next render.
  revalidatePath("/dashboard-admin/account");
  return { ok: true, data: undefined, code: ACTION_FEEDBACK.EMAIL_CHANGE_REQUESTED };
}

/**
 * `uploadMyAvatar` — Feature 010 approved scope addition (Part 4). Own avatar only, every role.
 * Migration `20260922130000_feature_010_branding_avatar_listing_media.sql` (NOT YET APPLIED) is the
 * genuinely required precondition — `set_my_avatar()` does not exist in the live database yet, so
 * this action's RPC call will fail honestly (mapped to `AVATAR_UPDATE_FAILED`) until it is applied;
 * this is real, correct code, not a stub, exactly like Feature 008's `record_stripe_payment_intent`
 * caller this run reuses the same "written, blocked on migration" discipline from.
 *
 * DB-writes / Storage-I/O split (the SAME pattern Feature 008 established): the RPC only updates
 * `profiles.avatar_path` and returns the OLD path; THIS function does the actual Storage upload and
 * the old-object cleanup, since a SECURITY DEFINER function cannot call the Storage API itself.
 */
export async function uploadMyAvatar(_prevState: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  // 2. AUTHENTICATE (no form fields to validate before this — the file itself is validated next)
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") {
    return { ok: false, code: ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED };
  }
  if (identity.requiresMfaStepUp) {
    return { ok: false, code: ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED };
  }

  // 1. VALIDATE the file itself — authorized MIME types and a reasonable size limit, matching the
  // Storage bucket's own configured limits exactly (duplicated for an immediate, specific error).
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { avatar: ["Required"] } };
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number]) || file.size > AVATAR_MAX_BYTES) {
    return { ok: false, code: ACTION_FEEDBACK.AVATAR_INVALID_FILE };
  }

  // 3. AUTHORIZE — self-only, enforced both here (the object path is namespaced to auth.uid()) and
  // again inside set_my_avatar() (defence in depth).
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const objectPath = `avatars/${identity.userId}/${Date.now()}${extension}`;

  // 4. CONTROLLED DATA ACCESS
  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage.from("public-assets").upload(objectPath, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { ok: false, code: ACTION_FEEDBACK.AVATAR_UPDATE_FAILED };
  }

  const { data: oldPath, error: rpcError } = await supabase.rpc("set_my_avatar", { p_object_path: objectPath });
  if (rpcError) {
    // The upload itself succeeded but the DB link failed — clean up the orphaned object rather than
    // leaving it referenced by nothing.
    await supabase.storage.from("public-assets").remove([objectPath]).catch(() => undefined);
    return { ok: false, code: ACTION_FEEDBACK.AVATAR_UPDATE_FAILED };
  }

  // Best-effort cleanup of the superseded avatar — never blocks the success response on its outcome.
  if (typeof oldPath === "string" && oldPath.length > 0 && oldPath !== objectPath) {
    await supabase.storage.from("public-assets").remove([oldPath]).catch(() => undefined);
  }

  // 6. REVALIDATE
  // Root layout: every shell that shows this user's avatar (public header, member topbar, console
  // topbar) re-renders with the new path — no stale image, no sign-out required.
  revalidatePath("/", "layout");
  return { ok: true, data: undefined, code: ACTION_FEEDBACK.AVATAR_UPDATED };
}

/** `removeMyAvatar` — own avatar only, every role. Same DB-writes/Storage-I/O split as `uploadMyAvatar`.
 * Takes no real input — `useActionState` still requires the (prevState, formData) signature, so both
 * are accepted and explicitly discarded rather than silently unused. */
export async function removeMyAvatar(prevState: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  void prevState;
  void formData;
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") {
    return { ok: false, code: ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED };
  }
  if (identity.requiresMfaStepUp) {
    return { ok: false, code: ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED };
  }

  const supabase = await createClient();
  const { data: oldPath, error } = await supabase.rpc("remove_my_avatar");
  if (error) {
    return { ok: false, code: ACTION_FEEDBACK.AVATAR_UPDATE_FAILED };
  }
  if (typeof oldPath === "string" && oldPath.length > 0) {
    await supabase.storage.from("public-assets").remove([oldPath]).catch(() => undefined);
  }

  revalidatePath("/", "layout");
  return { ok: true, data: undefined, code: ACTION_FEEDBACK.AVATAR_REMOVED };
}
