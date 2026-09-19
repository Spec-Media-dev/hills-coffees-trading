import { z } from "zod";

/**
 * Feature 012 RUN A — input schemas for the dispute write boundaries. CLIENT-SAFE (zod only): the
 * raise form uses these for inline validation, and the Server Action / domain layer re-parses with
 * the SAME schema as the enforced gate.
 *
 * Issue messages are stable KEYS, not prose: the client resolves each key through the active EN/AR
 * dictionary (`disputes.raise.errors.*`), so an inline error is always in the page's language. No
 * field outside these schemas ever reaches an insert/update — `status`, `opened_by_user_id`,
 * `opened_by_organization_id`, `resolved_by` and `resolved_at` are never client-supplied.
 */

export const DISPUTE_TEXT_MIN = 10;
export const DISPUTE_TEXT_MAX = 2000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DISPUTE_FIELD_ERROR_KEYS = ["orderRequired", "reasonTooShort", "reasonTooLong", "noteRequired", "noteTooLong", "resolutionTooShort", "resolutionTooLong", "invalidReference"] as const;
export type DisputeFieldErrorKey = (typeof DISPUTE_FIELD_ERROR_KEYS)[number];

export function isDisputeFieldErrorKey(value: unknown): value is DisputeFieldErrorKey {
  return typeof value === "string" && (DISPUTE_FIELD_ERROR_KEYS as readonly string[]).includes(value);
}

const reference = (key: DisputeFieldErrorKey) => z.string().trim().regex(UUID_PATTERN, key);

export const RaiseDisputeInput = z.object({
  orderId: z.string().trim().min(1, "orderRequired").regex(UUID_PATTERN, "orderRequired"),
  reason: z.string().trim().min(DISPUTE_TEXT_MIN, "reasonTooShort").max(DISPUTE_TEXT_MAX, "reasonTooLong"),
});
export type RaiseDisputeInput = z.infer<typeof RaiseDisputeInput>;

/** A text-only evidence note (`dispute_evidence.note`); a file reference is never accepted (DB-BLOCK-01). */
export const DisputeEvidenceNoteInput = z.object({
  disputeId: reference("invalidReference"),
  note: z.string().trim().min(1, "noteRequired").max(DISPUTE_TEXT_MAX, "noteTooLong"),
});
export type DisputeEvidenceNoteInput = z.infer<typeof DisputeEvidenceNoteInput>;

export const DisputeReferenceInput = z.object({
  disputeId: reference("invalidReference"),
});
export type DisputeReferenceInput = z.infer<typeof DisputeReferenceInput>;

/** Resolution/rejection text, stored in `disputes.resolution` (the only reason column the schema has). */
export const DisputeOutcomeInput = z.object({
  disputeId: reference("invalidReference"),
  resolution: z.string().trim().min(DISPUTE_TEXT_MIN, "resolutionTooShort").max(DISPUTE_TEXT_MAX, "resolutionTooLong"),
});
export type DisputeOutcomeInput = z.infer<typeof DisputeOutcomeInput>;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
