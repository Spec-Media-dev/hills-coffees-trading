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
 * CONSEQUENCE — WHAT THIS FEATURE MUST NOT DO: generate notifications (from orders, disputes,
 * payments or anything else), keep a client-side/local-storage "read" state, show an unread count, or
 * offer a "mark as read" control. Each would simulate a capability the approved system does not have.
 * The notification page reads what genuinely exists (usually nothing) and states this limitation.
 *
 * `tests/disputes/honest-limitations.test.ts` fails if any of the flags below turns `true` without
 * the corresponding database capability being recorded.
 */
export const NOTIFICATION_LIMITATIONS = Object.freeze({
  blocker: "DB-BLOCK-04",
  canGenerate: false,
  canMarkRead: false,
  deliveryChannelsApproved: false,
} as const);
