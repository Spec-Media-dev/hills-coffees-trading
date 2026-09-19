import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * ██ DB-BLOCK-01 SEAM ██ — Feature 012 RUN B (T005): the ONE place a dispute evidence FILE would be
 * attached. It is deliberately INERT until an approved Storage capability exists.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY IT IS INERT (verified against the live schema report and every applied migration)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * - No Storage bucket exists for dispute evidence. The only bucket any migration creates is Feature
 *   003's private `kyb-evidence`, whose storage policies are KYB-scoped; reusing it for disputes would
 *   be an unapproved widening. `storage_buckets`/`storage_policies` in the schema report are empty for
 *   disputes (DB-BLOCK-01, `docs/architecture/DATABASE-CAPABILITY-MAP.md`).
 * - `dispute_evidence.file_asset_id` references `file_assets`, whose `bucket_name` and `object_path`
 *   are NOT NULL. Creating a `file_assets` row without an uploaded object would record a location
 *   for bytes that do not exist — i.e. it would PRETEND a file was stored. So this seam creates NO
 *   `file_assets` row, sets NO `file_asset_id`, issues NO signed upload URL, touches NO bucket, and
 *   uses NO service role. It reads nothing and writes nothing.
 *
 * WHAT STILL WORKS: text evidence notes (`lib/disputes/member.ts#addDisputeEvidenceNote`), which the
 * database fully supports (`dispute_evidence_check` accepts a note without a file).
 *
 * WHEN IT CAN CHANGE: only after an approved database/Storage change provides a private dispute
 * evidence bucket and matching policies. At that point this function — and only this function — is
 * where the upload + `file_assets` metadata + `dispute_evidence` link would be implemented.
 */

/** Machine-readable capability statement the UI uses to explain (not hide) the limitation. */
export const DISPUTE_EVIDENCE_FILE_CAPABILITY = Object.freeze({
  available: false,
  blocker: "DB-BLOCK-01",
} as const);

/**
 * Always refuses with `DISPUTE_EVIDENCE_FILE_UNAVAILABLE`. The argument is accepted only so the
 * future call shape is fixed now; it is never read, stored or forwarded.
 */
export async function attachDisputeEvidenceFile(input: unknown): Promise<ActionFeedbackResult<never>> {
  void input;
  return { ok: false, code: ACTION_FEEDBACK.DISPUTE_EVIDENCE_FILE_UNAVAILABLE };
}
