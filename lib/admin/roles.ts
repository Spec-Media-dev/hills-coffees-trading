import { mapSystemError, requireSuperAdmin, saved, validationFailure, type SystemWriteOutcome } from "@/lib/admin/system-errors";
import { RoleActivityInput, RoleChangeInput, RoleGrantInput, type PlatformAdminRole } from "@/lib/admin/system-validation";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN F — T027 platform-admin role management over the EXISTING `platform_admins` table
 * (PK `user_id`, `role` ∈ the six CHECK values, `is_active`, `created_by`).
 *
 * AUTHORITY — `is_super_admin()` is re-verified live before every read and write (`requireSuperAdmin`);
 * RLS `platform_admins_admin` (USING + WITH CHECK `is_super_admin()`) is the backstop. No membership
 * or generic staff check widens this; no role outside the CHECK list can be written.
 *
 * ATTRIBUTION — every grant, role change and deactivation is recorded BY THE DATABASE in `audit_logs`
 * (actor = `auth.uid()`, old and new row; DB-OPEN-21 resolved by migration
 * `20260920120000_feature_010_db_open_21_config_attribution.sql`,
 * `trg_audit_platform_admins` → `write_audit_log_platform_admins()`, keyed on `user_id` because this table has
 * no `id` column). A grant is additionally attributed on the row itself (`created_by`). `updated_at` is owned
 * by the `trg_platform_admins_updated_at` trigger — this module NEVER writes it. No shadow log exists here.
 *
 * SAFETY — a super admin may not change or deactivate their OWN capability row (the database would
 * allow it and could lock every operator out); every change is a compare-and-set on the role/activity
 * the operator saw, so a concurrent change is refused as STALE, never overwritten.
 */

export type PlatformAdminRow = {
  userId: string;
  role: PlatformAdminRole;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** `profiles.full_name` (readable by platform admins); `null` when the profile row is unreadable/missing. */
  fullName: string | null;
  isBlocked: boolean | null;
};

export async function listPlatformAdmins(): Promise<readonly PlatformAdminRow[] | null> {
  const authority = await requireSuperAdmin();
  if (!authority.ok) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("platform_admins").select("user_id, role, is_active, created_by, created_at, updated_at, profiles!platform_admins_user_id_fkey(full_name, is_blocked)").order("role").order("created_at");
  if (error) throw new Error("roles_read_failed");
  type Row = { user_id: string; role: PlatformAdminRole; is_active: boolean; created_by: string | null; created_at: string; updated_at: string; profiles: { full_name: string | null; is_blocked: boolean } | { full_name: string | null; is_blocked: boolean }[] | null };
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : row.profiles;
    return { userId: row.user_id, role: row.role, isActive: row.is_active, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at, fullName: profile?.full_name ?? null, isBlocked: profile?.is_blocked ?? null };
  });
}

/** Profiles a super admin may grant a role to — looked up by exact profile id (auth identities/emails are not readable by product code). */
export async function findGrantTarget(userId: string): Promise<{ id: string; fullName: string | null; alreadyAdmin: boolean } | null> {
  const authority = await requireSuperAdmin();
  if (!authority.ok || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const supabase = await createClient();
  const [{ data: profile }, { data: existing }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("id", userId).maybeSingle(),
    supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (!profile) return null;
  return { id: profile.id, fullName: profile.full_name, alreadyAdmin: Boolean(existing) };
}

export async function grantPlatformAdminRole(input: unknown): Promise<ActionFeedbackResult<SystemWriteOutcome>> {
  const parsed = RoleGrantInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  if (parsed.data.userId === authority.userId) return { ok: false, code: ACTION_FEEDBACK.ROLE_SELF_CHANGE_REFUSED };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("platform_admins").select("user_id").eq("user_id", parsed.data.userId).maybeSingle();
  if (existing) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_DUPLICATE };
  const { data, error } = await supabase
    .from("platform_admins")
    .insert({ user_id: parsed.data.userId, role: parsed.data.role, is_active: true, created_by: authority.userId })
    .select("user_id")
    .maybeSingle();
  if (error || !data) return { ok: false, code: mapSystemError(error) };
  return saved(data.user_id);
}

export async function changePlatformAdminRole(input: unknown): Promise<ActionFeedbackResult<SystemWriteOutcome>> {
  const parsed = RoleChangeInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  if (parsed.data.userId === authority.userId) return { ok: false, code: ACTION_FEEDBACK.ROLE_SELF_CHANGE_REFUSED };
  if (parsed.data.role === parsed.data.expectedRole) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_STALE };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_admins")
    .update({ role: parsed.data.role })
    .eq("user_id", parsed.data.userId)
    .eq("role", parsed.data.expectedRole)
    .select("user_id")
    .maybeSingle();
  if (error) return { ok: false, code: mapSystemError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_STALE };
  return saved(data.user_id);
}

export async function setPlatformAdminActive(input: unknown): Promise<ActionFeedbackResult<SystemWriteOutcome>> {
  const parsed = RoleActivityInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  if (parsed.data.userId === authority.userId) return { ok: false, code: ACTION_FEEDBACK.ROLE_SELF_CHANGE_REFUSED };
  if (parsed.data.isActive === parsed.data.expectedActive) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_STALE };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_admins")
    .update({ is_active: parsed.data.isActive })
    .eq("user_id", parsed.data.userId)
    .eq("role", parsed.data.expectedRole)
    .eq("is_active", parsed.data.expectedActive)
    .select("user_id")
    .maybeSingle();
  if (error) return { ok: false, code: mapSystemError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_STALE };
  return saved(data.user_id);
}
