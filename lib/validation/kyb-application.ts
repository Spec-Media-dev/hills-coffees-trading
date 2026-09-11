import { z } from "zod";

/**
 * Feature 003 T014 — KYB application input schemas, per SRS §4.1's "Required organization and user
 * evidence" table.
 *
 * SCOPE DECISION (documented in full in the migration this schema depends on,
 * `supabase/migrations/20260912010000_feature_003_kyb_draft_fields.sql`): Company identity fields
 * (legal name, tax number, registration number, country, email, phone) already exist on
 * `organizations`, captured at onboarding. Agreements are Phase 6's scope, explicitly excluded from
 * RUN B. The remaining SRS §4.1 rows — the rest of Company evidence (trade licence), Ownership/
 * control (UBO/directors/signatory authority evidence), and Banking (verified account evidence) —
 * are, per the SRS's own "evidence" wording, DOCUMENTS: they use the already-applied
 * `kyb_documents`/`attach_kyb_document` model (`document_type` is free text, not a DB enum), not new
 * schema. `KYB_DOCUMENT_TYPES` below is the closed, application-layer vocabulary for that free-text
 * column. The only genuinely new SCALAR text this schema adds is a registered business address and a
 * short business-activity description — plain business/presentation data, matching the two new
 * `kyb_applications` columns that migration adds.
 *
 * NEVER a field here: `status`, `APPROVED`, `ACTIVE`, `can_buy`, `can_sell`, `decided_by`,
 * `decided_at`, a reviewer identity, or any organization-ownership id not derived server-side. This
 * schema has no such field, by construction — there is no client-facing input path for any of them.
 */

export const KybDraftInput = z.object({
  registeredAddress: z
    .string({ error: "Enter your registered business address." })
    .trim()
    .min(1, "Enter your registered business address.")
    .max(300, "Keep this under 300 characters."),

  businessActivity: z
    .string({ error: "Describe your business activity." })
    .trim()
    .min(1, "Describe your business activity.")
    .max(500, "Keep this under 500 characters."),
});
export type KybDraftInput = z.infer<typeof KybDraftInput>;

/**
 * The closed document-type vocabulary this feature accepts, mapped from SRS §4.1's Company /
 * Ownership-control / Banking evidence rows. `expiryApplicable` drives T022 (expired-document
 * surfacing) — only document kinds that genuinely expire (a trade licence, a government-issued ID)
 * carry it; a declaration or a bank letter does not, and this schema does not fabricate an expiry
 * requirement for those.
 */
export const KYB_DOCUMENT_TYPES = [
  { type: "TRADE_LICENSE", required: true, expiryApplicable: true },
  { type: "PROOF_OF_INCORPORATION", required: true, expiryApplicable: false },
  { type: "AUTHORIZED_SIGNATORY_ID", required: true, expiryApplicable: true },
  { type: "UBO_DECLARATION", required: true, expiryApplicable: false },
  { type: "BANKING_EVIDENCE", required: true, expiryApplicable: false },
] as const;

export type KybDocumentType = (typeof KYB_DOCUMENT_TYPES)[number]["type"];

export const KYB_DOCUMENT_TYPE_VALUES = KYB_DOCUMENT_TYPES.map((entry) => entry.type) as readonly KybDocumentType[];

export function isKybDocumentType(value: string): value is KybDocumentType {
  return (KYB_DOCUMENT_TYPE_VALUES as readonly string[]).includes(value);
}

export function kybDocumentTypeConfig(type: KybDocumentType) {
  const entry = KYB_DOCUMENT_TYPES.find((candidate) => candidate.type === type);
  if (!entry) throw new Error(`Unknown KYB document type: ${type}`);
  return entry;
}
