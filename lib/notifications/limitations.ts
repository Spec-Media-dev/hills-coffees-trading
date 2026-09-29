/**
 * Feature 012 RUN B (T010) — the documented DB-BLOCK-04 statement, surfaced in-product.
 *
 * Verified against the live schema report and every applied migration:
 * - `notifications` has exactly ONE policy, `notifications_own` (SELECT: own user or platform admin).
 *   There is no INSERT and no UPDATE policy, so no application session can create a notification or
 *   set `read_at`.
 * - No trigger anywhere in the schema inserts into `notifications`, so nothing in the platform
 *   generates one either.
 * - No email/SMS/WhatsApp delivery provider is approved (SRS §12), and `notification_deliveries` is
 *   writable only by `is_platform_admin()`.
 *
 * CONSEQUENCE — WHAT THIS FEATURE MUST NOT DO:
 * Feature 014 adds database-backed read/unread lifecycle RPCs (canMarkRead: true).
 * What remains unapproved: external delivery channels (email/SMS/WhatsApp), client-side/local-storage
 * synthetic state, or direct table writes bypassing RPCs.
 *
 * `tests/disputes/honest-limitations.test.ts` fails if any of the flags below turns `true` without
 * the corresponding database capability being recorded.
 */
export const NOTIFICATION_LIMITATIONS = Object.freeze({
  blocker: "DB-BLOCK-04",
  canGenerate: false,
  canMarkRead: true,
  deliveryChannelsApproved: false,
} as const);
