import { checkKybCompleteness, type MissingItem } from "@/lib/kyb/completeness";
import { isDocumentExpired, type KybApplicationStatus, type KybDocumentSummary } from "@/lib/kyb/status-types";
import { KYB_DOCUMENT_TYPES, type KybDocumentType } from "@/lib/validation/kyb-application";

/**
 * Feature 010 RUN E — the KYB reviewer's approval-readiness rule, derived ONLY from persisted state:
 * Feature 003's completeness rule (`checkKybCompleteness` — required document types + the two
 * application fields) plus the persisted `kyb_documents.status` vocabulary (`PENDING` / `ACCEPTED` /
 * `REJECTED` / `SUPERSEDED`, written by the `apply_kyb_review_item_decision` trigger from the
 * append-only `kyb_review_items` ledger) and each current document's expiry.
 *
 * PRODUCT-OWNER REQUIREMENT (RUN E): an application MUST NOT be finally APPROVED while any REQUIRED
 * evidence is missing, still awaiting review (`PENDING`), rejected, or expired. This module is pure
 * (no I/O); `lib/admin/decisions.ts#decideKybApplication` re-reads the rows and calls it on the
 * server before accepting `APPROVED`, and the detail page renders the same result — one rule, two
 * consumers, never a client-only gate. It invents no status: "awaiting" IS `PENDING`, "expired" IS
 * `expires_at < now()` on a current required document.
 */

export type KybRequiredEvidenceState = "accepted" | "awaiting" | "rejected" | "expired" | "missing";

export type KybRequiredEvidence = {
  documentType: KybDocumentType;
  state: KybRequiredEvidenceState;
  /** The current (non-superseded) document of this type, if one exists. */
  documentId: string | null;
};

export type KybApprovalReadiness = {
  required: readonly KybRequiredEvidence[];
  counts: { required: number; accepted: number; awaiting: number; rejected: number; expired: number; missing: number };
  /** Application-field gaps from Feature 003's completeness rule (registered address, business activity). */
  fieldGaps: readonly MissingItem[];
  /** Every item that blocks APPROVED — empty means approval is available. */
  blockers: readonly { key: string; state: KybRequiredEvidenceState | "field" }[];
  approvable: boolean;
};

export function evaluateKybApprovalReadiness(
  application: { registeredAddress: string | null; businessActivity: string | null },
  documents: readonly KybDocumentSummary[],
  asOf: Date = new Date(),
): KybApprovalReadiness {
  const required: KybRequiredEvidence[] = [];
  for (const type of KYB_DOCUMENT_TYPES) {
    if (!type.required) continue;
    // The newest non-superseded document of the type is the reviewable version (Feature 003's own
    // `currentDocumentOfType` shape; versions are chained by `supersedes_document_id`).
    const current = documents.filter((document) => document.documentType === type.type && document.status !== "SUPERSEDED").sort((a, b) => b.version - a.version)[0];
    if (!current) {
      required.push({ documentType: type.type, state: "missing", documentId: null });
      continue;
    }
    let state: KybRequiredEvidenceState;
    if (current.status === "REJECTED") state = "rejected";
    else if (type.expiryApplicable && isDocumentExpired(current, asOf)) state = "expired";
    else if (current.status === "ACCEPTED") state = "accepted";
    else state = "awaiting";
    required.push({ documentType: type.type, state, documentId: current.id });
  }

  const completeness = checkKybCompleteness(application, documents);
  const fieldGaps = completeness.missing.filter((item) => item.key === "registeredAddress" || item.key === "businessActivity");

  const counts = {
    required: required.length,
    accepted: required.filter((item) => item.state === "accepted").length,
    awaiting: required.filter((item) => item.state === "awaiting").length,
    rejected: required.filter((item) => item.state === "rejected").length,
    expired: required.filter((item) => item.state === "expired").length,
    missing: required.filter((item) => item.state === "missing").length,
  };
  const blockers = [
    ...required.filter((item) => item.state !== "accepted").map((item) => ({ key: item.documentType as string, state: item.state })),
    ...fieldGaps.map((item) => ({ key: item.key, state: "field" as const })),
  ];
  return { required, counts, fieldGaps, blockers, approvable: blockers.length === 0 };
}

/** Application statuses in which a document outcome may still be recorded by the console. */
export const KYB_DOCUMENT_REVIEWABLE_APPLICATION_STATUSES: readonly KybApplicationStatus[] = ["SUBMITTED", "UNDER_REVIEW", "RESUBMISSION_REQUIRED"];
