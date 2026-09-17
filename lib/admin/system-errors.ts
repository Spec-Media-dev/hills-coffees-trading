import { checkRoleFunctionAccess } from "@/lib/admin/guards";
import { ACTION_FEEDBACK, type ActionFeedbackCode, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN F (Phase 9) — the shared authority + error boundary of the system-configuration
 * layer. Every configuration READ and WRITE calls `requireSuperAdmin()` (or, for the payment-account
 * read area only, `requirePlatformAdmin()`) BEFORE `createClient()`; RLS (`platform_admins_admin`,
 * `commission_admin`, `tiers_admin`, `tax_admin`, `shipping_admin`, `payment_accounts_admin`) is the
 * backstop, never the only gate (T043; `commission-capability.md` §4). No policy is weakened.
 *
 * Errors: SQLSTATE only — the message never leaves this layer.
 */

export type SystemAuthority = { ok: true; userId: string } | { ok: false; code: ActionFeedbackCode };

export async function requireSuperAdmin(): Promise<SystemAuthority> {
  const access = await checkRoleFunctionAccess("is_super_admin");
  if (!access.ok) return { ok: false, code: access.denial === "anonymous" ? ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED : ACTION_FEEDBACK.SYSTEM_NOT_CAPABLE };
  return { ok: true, userId: access.identity.userId };
}

/** T029's READ area is `is_platform_admin()` (task literal); every WRITE still goes through `requireSuperAdmin()` (DB `WITH CHECK is_super_admin()`). */
export async function requirePlatformAdmin(): Promise<SystemAuthority> {
  const access = await checkRoleFunctionAccess("is_platform_admin");
  if (!access.ok) return { ok: false, code: access.denial === "anonymous" ? ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED : ACTION_FEEDBACK.SYSTEM_NOT_CAPABLE };
  return { ok: true, userId: access.identity.userId };
}

type DatabaseError = { code?: unknown } | null | undefined;

export function mapSystemError(error: DatabaseError): ActionFeedbackCode {
  const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "";
  if (code === "23505") return ACTION_FEEDBACK.SYSTEM_DUPLICATE;
  if (code === "23503") return ACTION_FEEDBACK.SYSTEM_REFERENCE_INVALID;
  if (code === "23514" || code === "23502" || code === "22P02" || code === "22003") return ACTION_FEEDBACK.SYSTEM_VALUE_INVALID;
  return ACTION_FEEDBACK.SYSTEM_SAVE_FAILED;
}

export function fieldErrorsOf(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return out;
}

export function validationFailure<T>(error: { issues: { path: PropertyKey[]; message: string }[] }): ActionFeedbackResult<T> {
  return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: fieldErrorsOf(error) };
}

/** Every system write returns the row id; `revalidatedTags` stays empty — nothing here is publicly cached. */
export type SystemWriteOutcome = { id: string; revalidatedTags: readonly string[] };
export const saved = (id: string): ActionFeedbackResult<SystemWriteOutcome> => ({ ok: true, data: { id, revalidatedTags: [] }, code: ACTION_FEEDBACK.SYSTEM_SAVED });
