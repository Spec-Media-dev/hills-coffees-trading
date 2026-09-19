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
  /**
   * Feature 006 RUN B (T014) — a NEW, confirmed gap found while implementing listing creation, not
   * anticipated by RUN A: `coffee_offers.coffee_id` is NOT NULL, but the only way to resolve it for a
   * given `lot_id` is `coffee_lots.coffee_id`, and `coffee_lots`' member-read policy
   * (`member_read_trade_lots`) has the SAME broken, self-referential predicate DB-OPEN-05 already
   * documents for reads (`co.lot_id = co.id`, never satisfiable) — so a member session can NEVER read
   * `coffee_lots` today, for creation OR display. `createListingDraft` makes one best-effort,
   * RLS-respecting attempt to recover it from the position's own originating listing
   * (`source_purchase_order_item_id` → `order_items.offer_id` → that `coffee_offers.coffee_id`) and
   * returns this code, never a guessed/fabricated value, when that attempt also comes back empty.
   */
  LISTING_COFFEE_CONTEXT_UNAVAILABLE: "listing_coffee_context_unavailable",

  /**
   * Feature 007 RUN A — the order/draft/shipment domain's own safe result codes
   * (`lib/orders/errors.ts` is the single place that maps a raised database exception string to one
   * of these; no Server Action in `lib/orders/*`/`src/app/dashboard/orders/*` inspects a raw
   * Postgres/PostgREST message itself). Reuses this SAME `ActionFeedbackResult` contract rather than
   * inventing a second one (the run directive's own explicit rule).
   */
  ORDER_NOT_FOUND: "order_not_found",
  ORDER_NOT_ACCESSIBLE: "order_not_accessible",
  BUYER_NOT_CAPABLE: "buyer_not_capable",
  ORDER_ITEM_NOT_AVAILABLE: "order_item_not_available",
  ORDER_ITEM_QUANTITY_UNAVAILABLE: "order_item_quantity_unavailable",
  ORDER_NOT_EDITABLE: "order_not_editable",
  ORDER_TRANSITION_REFUSED: "order_transition_refused",
  ORDER_SAVE_FAILED: "order_save_failed",
  SHIPMENT_NOT_FOUND: "shipment_not_found",
  SHIPMENT_NOT_EDITABLE: "shipment_not_editable",
  SHIPMENT_ITEM_QUANTITY_INVALID: "shipment_item_quantity_invalid",
  SHIPMENT_SAVE_FAILED: "shipment_save_failed",
  /**
   * Feature 007 RUN B (T008) — `lib/orders/checkout.ts`'s own pre-checkout readiness refusal
   * (no items, or no READY/RESERVED shipment whose planned quantities cover the order). Returned
   * BEFORE the one-way `DRAFT -> CONFIRMED` transition is attempted, so a not-yet-ready draft is
   * never stranded in `CONFIRMED`; `checkout_order()` re-validates all of this itself regardless.
   */
  ORDER_CHECKOUT_NOT_READY: "order_checkout_not_ready",
  /**
   * Feature 007 RUN C (T012/T013) — `lib/orders/expiry.ts#requireFreshHold`'s refusal: the order's
   * hold has expired (or it is not in a hold-bearing status at all), so no downstream payment/
   * proof/escrow hand-off may proceed. Feature 008's real payment action MUST call that boundary.
   */
  ORDER_HOLD_EXPIRED: "order_hold_expired",

  /**
   * Feature 008 Phase 1 (T002) — the finance/escrow domain's own safe result codes
   * (`lib/finance/errors.ts` is the single place that maps a raised database exception string to one
   * of these; `lib/finance/read.ts`/`lib/finance/funding.ts` never inspect a raw Postgres/PostgREST
   * message themselves). Reuses this SAME `ActionFeedbackResult` contract rather than inventing a
   * second one (mirrors Feature 007's own established precedent above).
   */
  FINANCE_READ_FAILED: "finance_read_failed",
  /**
   * `lib/finance/funding.ts`'s controlled, honest outcome: no provider is selected and no approved
   * database trusted-funding gate exists yet (spec.md PS2, FR-003 through FR-007). This code MUST
   * NEVER be interpreted as, or paired with copy implying, payment success, escrow initiation, a bank
   * instruction, or a pending provider state.
   */
  FINANCE_FUNDING_UNAVAILABLE: "finance_funding_unavailable",

  /**
   * Feature 009 RUN A1 (T002) — the delivery domain's own safe result codes, reusing the shipment
   * codes Feature 007 already defined above (`SHIPMENT_NOT_FOUND`/`SHIPMENT_NOT_EDITABLE`/
   * `SHIPMENT_ITEM_QUANTITY_INVALID`/`SHIPMENT_SAVE_FAILED`) for everything the CURRENT database
   * already raises. These two are NEW and map to the DB-BLOCK-07 Phase 2 exception names drafted in
   * `lib/delivery/validation.ts#DB_BLOCK_07_DRAFT_EXCEPTIONS` — prepared now (no database exception
   * exists yet; no migration is applied in RUN A1) so Phase 2/3 reuse this SAME contract rather than
   * inventing a second one, mirroring Feature 008's own "forward-compatible, not prematurely acted
   * on" precedent for `lib/finance/errors.ts`.
   */
  SHIPMENT_ORDER_NOT_SETTLED: "shipment_order_not_settled",
  SHIPMENT_RESERVATION_UNAVAILABLE: "shipment_reservation_unavailable",
  /**
   * Feature 009 RUN B (T016) — the warehouse domain layer's own app-level pre-check (mirrors
   * `BUYER_NOT_CAPABLE` exactly): the caller is not `is_warehouse_operator()`, checked live via RPC
   * BEFORE any transition is attempted. Distinct from `SHIPMENT_NOT_EDITABLE` (which also covers the
   * DATABASE's own `warehouse_required_for_operational_shipment_status` refusal) so a UI can tell
   * "you don't have this role at all" apart from "this specific transition isn't valid right now."
   */
  WAREHOUSE_NOT_CAPABLE: "warehouse_not_capable",

  /**
   * Feature 010 RUN B — Compliance console decisions (KYB, organization status, listing review).
   * `*_STALE` = the target is no longer in a state this decision applies to (e.g. another operator
   * decided first — the compare-and-set update affected zero rows); `*_HISTORY_INCOMPLETE` = the
   * state changed but the review row could not be recorded (surfaced, never hidden);
   * `ORGANIZATION_ACCESS_UNAVAILABLE` = the operator's role has no read/update path to
   * `organizations` under the current policy set (a recorded capability gap, never bypassed).
   */
  COMPLIANCE_NOT_CAPABLE: "compliance_not_capable",
  KYB_DECISION_RECORDED: "kyb_decision_recorded",
  KYB_DECISION_STALE: "kyb_decision_stale",
  KYB_DECISION_FAILED: "kyb_decision_failed",
  KYB_DECISION_HISTORY_INCOMPLETE: "kyb_decision_history_incomplete",
  KYB_REVIEW_STARTED: "kyb_review_started",
  ORGANIZATION_ACCESS_UNAVAILABLE: "organization_access_unavailable",
  ORGANIZATION_STATUS_CHANGED: "organization_status_changed",
  ORGANIZATION_STATUS_STALE: "organization_status_stale",
  ORGANIZATION_STATUS_FAILED: "organization_status_failed",
  LISTING_DECISION_RECORDED: "listing_decision_recorded",
  LISTING_DECISION_STALE: "listing_decision_stale",
  LISTING_DECISION_FAILED: "listing_decision_failed",
  LISTING_DECISION_HISTORY_INCOMPLETE: "listing_decision_history_incomplete",

  /**
   * Feature 010 RUN E — Catalogue management (Phase 7) and the KYB review-coherence correction.
   * `CATALOGUE_*` are `lib/admin/catalogue.ts`'s only result codes; the SQLSTATE→code mapping lives
   * there (23505 unique → `SLUG_TAKEN`, 23503 FK → `REFERENCE_INVALID`, 23514 CHECK → `STATUS_INVALID`,
   * compare-and-set miss → `STALE`, RLS-filtered/nonexistent → `NOT_FOUND`), never a raw message.
   * `KYB_APPROVAL_BLOCKED` = the server re-read the application's required evidence and refused
   * `APPROVED` because a required document is missing, awaiting review, rejected or expired;
   * `KYB_DOCUMENT_REVIEW_*` = the per-document review (Feature 003's `create_kyb_review` RPC).
   */
  CATALOGUE_NOT_CAPABLE: "catalogue_not_capable",
  CATALOGUE_SAVED: "catalogue_saved",
  CATALOGUE_SLUG_TAKEN: "catalogue_slug_taken",
  CATALOGUE_REFERENCE_INVALID: "catalogue_reference_invalid",
  CATALOGUE_STATUS_INVALID: "catalogue_status_invalid",
  CATALOGUE_STALE: "catalogue_stale",
  CATALOGUE_NOT_FOUND: "catalogue_not_found",
  CATALOGUE_SAVE_FAILED: "catalogue_save_failed",
  KYB_APPROVAL_BLOCKED: "kyb_approval_blocked",
  KYB_DOCUMENT_REVIEW_RECORDED: "kyb_document_review_recorded",
  KYB_DOCUMENT_REVIEW_STALE: "kyb_document_review_stale",
  KYB_DOCUMENT_REVIEW_FAILED: "kyb_document_review_failed",

  /**
   * Feature 010 RUN F — Phase 9 system configuration (`lib/admin/{roles,commission,pricing-rules,
   * payment-accounts}.ts`). `SYSTEM_NOT_CAPABLE` = the live `is_super_admin()` (or, for the
   * payment-account READ area, `is_platform_admin()`) check refused the caller before any query;
   * `SYSTEM_STALE` = a compare-and-set miss; SQLSTATE mapping lives in `lib/admin/system-errors.ts`
   * (23505 → DUPLICATE, 23503 → REFERENCE_INVALID, 23514/23502 → VALUE_INVALID, else SAVE_FAILED).
   * `ROLE_SELF_CHANGE_REFUSED` = a super admin may not change or deactivate their own capability row
   * (the database would allow it and lock every operator out).
   */
  SYSTEM_NOT_CAPABLE: "system_not_capable",
  SYSTEM_SAVED: "system_saved",
  SYSTEM_STALE: "system_stale",
  SYSTEM_NOT_FOUND: "system_not_found",
  SYSTEM_DUPLICATE: "system_duplicate",
  SYSTEM_REFERENCE_INVALID: "system_reference_invalid",
  SYSTEM_VALUE_INVALID: "system_value_invalid",
  SYSTEM_SAVE_FAILED: "system_save_failed",
  ROLE_SELF_CHANGE_REFUSED: "role_self_change_refused",

  /**
   * Feature 012 RUN A (T001) — the dispute domain's own safe result codes. `lib/disputes/errors.ts`
   * is the single place that maps a raw database error to one of these; no dispute module or Server
   * Action inspects a Postgres/PostgREST message itself. A dispute the caller may not see — another
   * organization's, or one that does not exist — is ONE code (`DISPUTE_NOT_FOUND`), never a
   * distinguishable "exists but not yours". `DISPUTE_NOT_CAPABLE` = the member-side caller is not an
   * authorized, unblocked member of an acting organization (checked live before any write);
   * the compliance side reuses `COMPLIANCE_NOT_CAPABLE` above. `DISPUTE_TRANSITION_REFUSED` = the
   * requested operation is not an approved transition from the dispute's current status;
   * `DISPUTE_STALE` = the compare-and-set update matched zero rows (another operator acted first).
   */
  DISPUTE_NOT_FOUND: "dispute_not_found",
  DISPUTE_NOT_CAPABLE: "dispute_not_capable",
  DISPUTE_RAISED: "dispute_raised",
  DISPUTE_RAISE_FAILED: "dispute_raise_failed",
  DISPUTE_EVIDENCE_RECORDED: "dispute_evidence_recorded",
  DISPUTE_EVIDENCE_FAILED: "dispute_evidence_failed",
  DISPUTE_TRANSITION_RECORDED: "dispute_transition_recorded",
  DISPUTE_TRANSITION_REFUSED: "dispute_transition_refused",
  DISPUTE_STALE: "dispute_stale",
  DISPUTE_TRANSITION_FAILED: "dispute_transition_failed",
  /**
   * Feature 012 RUN B (T005) — the inert evidence-FILE seam's only outcome: dispute evidence files
   * cannot be stored (DB-BLOCK-01). Never paired with copy implying an upload happened.
   */
  DISPUTE_EVIDENCE_FILE_UNAVAILABLE: "dispute_evidence_file_unavailable",
  /** Feature 012 RUN B (T011) — own-user notification preferences. */
  NOTIFICATION_PREFERENCES_SAVED: "notification_preferences_saved",
  NOTIFICATION_PREFERENCES_FAILED: "notification_preferences_failed",
  NOTIFICATION_PREFERENCES_NOT_CAPABLE: "notification_preferences_not_capable",
} as const;

export type ActionFeedbackCode = (typeof ACTION_FEEDBACK)[keyof typeof ACTION_FEEDBACK];

export type ActionFeedbackResult<T = undefined> =
  | { ok: true; data: T; code?: ActionFeedbackCode }
  | {
      ok: false;
      code: ActionFeedbackCode;
      fieldErrors?: Record<string, string[] | undefined>;
    };
