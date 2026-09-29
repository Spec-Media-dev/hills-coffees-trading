/**
 * Feature 012 RUN B (T010) — the documented DB-BLOCK-04 statement, surfaced in-product.
 *
 * The baseline schema has SELECT-only notification access. Feature 014 adds
 * server-side generation for three approved order transitions and own-user
 * read-state RPCs; ordinary application sessions still have no direct write policy.
 * - No email/SMS/WhatsApp delivery provider is approved (SRS §12), and `notification_deliveries` is
 *   writable only by `is_platform_admin()`.
 *
 * CONSEQUENCE — WHAT THIS FEATURE MUST NOT DO:
 * External delivery channels (email/SMS/WhatsApp) remain unapproved.
 *
 * `tests/disputes/honest-limitations.test.ts` fails if any of the flags below turns `true` without
 * the corresponding database capability being recorded.
 */
export const NOTIFICATION_LIMITATIONS = Object.freeze({
  blocker: "DB-BLOCK-04",
  canGenerate: true,
  canMarkRead: true,
  deliveryChannelsApproved: false,
} as const);
