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
  MFA_STEP_UP_REQUIRED: "mfa_step_up_required",
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
  AGREEMENT_ACCEPTED: "agreement_accepted",
  AGREEMENT_ACCEPT_FAILED: "agreement_accept_failed",
  ORGANIZATION_CONTACT_SAVED: "organization_contact_saved",
  ORGANIZATION_CONTACT_SAVE_FAILED: "organization_contact_save_failed",
  ACTING_ORGANIZATION_SWITCH_FAILED: "acting_organization_switch_failed",

  /**
   * Feature 006 RUN A — prepared now (no Server Action uses them yet; Phase 4 will) so the
   * marketplace/listing mutations that arrive later reuse this SAME contract rather than inventing a
   * second one. `LISTING_INELIGIBLE` deliberately carries no reason text of its own — the specific
   * `EligibilityRefusalReason` (`lib/listings/types.ts`) is a separate, richer, typed result a future
   * action surfaces alongside this code, not encoded into the code string itself.
   */
  LISTING_NOT_FOUND: "listing_not_found",
  LISTING_NOT_ACCESSIBLE: "listing_not_accessible",
  SELLER_NOT_CAPABLE: "seller_not_capable",
  LISTING_INELIGIBLE: "listing_ineligible",
  LISTING_TRANSITION_REFUSED: "listing_transition_refused",
  LISTING_SAVE_FAILED: "listing_save_failed",
} as const;

export type ActionFeedbackCode = (typeof ACTION_FEEDBACK)[keyof typeof ACTION_FEEDBACK];

export type ActionFeedbackResult<T = undefined> =
  | { ok: true; data: T; code?: ActionFeedbackCode }
  | {
      ok: false;
      code: ActionFeedbackCode;
      fieldErrors?: Record<string, string[] | undefined>;
    };
