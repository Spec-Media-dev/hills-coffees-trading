/**
 * Controlled result codes for interactive product actions.
 *
 * Server Actions return these codes instead of user-facing provider/database text. Client surfaces
 * map each code to the active EN/AR dictionary and decide whether it is field-local or global toast
 * feedback. This keeps localization and presentation out of the authorization boundary.
 */
export const ACTION_FEEDBACK = {
  VALIDATION_ERROR: "validation_error",
  INVALID_CREDENTIALS: "invalid_credentials",
  ADMIN_PORTAL_REQUIRED: "admin_portal_required",
  ADMIN_ACCESS_DENIED: "admin_access_denied",
  AUTH_GENERIC_ERROR: "auth_generic_error",
  SIGN_UP_ACKNOWLEDGED: "sign_up_acknowledged",
  WEAK_PASSWORD: "weak_password",
  RATE_LIMITED: "rate_limited",
  RESET_REQUESTED: "reset_requested",
  RESET_LINK_INVALID: "reset_link_invalid",
  VERIFICATION_RESENT: "verification_resent",
  SESSION_EXPIRED: "session_expired",
  MFA_INVALID_CODE: "mfa_invalid_code",
  MFA_ENABLED: "mfa_enabled",
  ONBOARDING_FAILED: "onboarding_failed",
  KYB_START_FAILED: "kyb_start_failed",
  KYB_DRAFT_SAVED: "kyb_draft_saved",
  KYB_DRAFT_SAVE_FAILED: "kyb_draft_save_failed",
  KYB_APPLICATION_NOT_EDITABLE: "kyb_application_not_editable",
  KYB_FILE_REQUIRED: "kyb_file_required",
  KYB_FILE_TYPE_INVALID: "kyb_file_type_invalid",
  KYB_FILE_TOO_LARGE: "kyb_file_too_large",
  KYB_REPLACEMENT_STALE: "kyb_replacement_stale",
  KYB_UPLOAD_FAILED: "kyb_upload_failed",
  KYB_UPLOAD_SUCCEEDED: "kyb_upload_succeeded",
  KYB_SUBMIT_NOT_ALLOWED: "kyb_submit_not_allowed",
  KYB_SUBMIT_FAILED: "kyb_submit_failed",
  KYB_RESUBMIT_NOT_ALLOWED: "kyb_resubmit_not_allowed",
  KYB_RESUBMIT_FAILED: "kyb_resubmit_failed",
  PROFILE_AUTH_REQUIRED: "profile_auth_required",
  PROFILE_SAVE_FAILED: "profile_save_failed",
  PROFILE_SAVED: "profile_saved",
} as const;

export type ActionFeedbackCode = (typeof ACTION_FEEDBACK)[keyof typeof ACTION_FEEDBACK];

export type ActionFeedbackResult<T = undefined> =
  | { ok: true; data: T; code?: ActionFeedbackCode }
  | {
      ok: false;
      code: ActionFeedbackCode;
      fieldErrors?: Record<string, string[] | undefined>;
    };
