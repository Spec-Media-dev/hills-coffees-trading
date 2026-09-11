import { KYB_DOCUMENT_TYPES, type KybDocumentType } from "@/lib/validation/kyb-application";
import type { KybApplicationSummary, KybDocumentSummary } from "@/lib/kyb/status-types";

/**
 * Feature 003 T015 — deterministic KYB completeness checks. Reusable by the draft screen (T016),
 * the submit action (T018 — which MUST re-run this server-side, never trust client state alone), and
 * the status screen (T019). Every missing item is named specifically (never a generic "incomplete"
 * message) — that is this module's entire contract.
 */

export type MissingItem = {
  /** Stable key for the specific missing item — a document type, or a scalar field name. */
  key: string;
  /** The exact, specific reason this is missing (never a generic "Application incomplete."). */
  label: string;
};

export type CompletenessResult = {
  complete: boolean;
  missing: MissingItem[];
};

/**
 * The current (non-superseded) document of a given type, if any — the one whose status actually
 * matters for completeness. `getKybWorkspace` (`lib/kyb/status.ts`) already filters out `SUPERSEDED`
 * rows, but this function does not trust that filtering blindly (defence in depth): it re-derives
 * "current" the same way.
 */
function currentDocumentOfType(documents: readonly KybDocumentSummary[], type: KybDocumentType): KybDocumentSummary | undefined {
  return documents.find((document) => document.documentType === type && document.status !== "SUPERSEDED");
}

/**
 * Checks whether an application is complete enough to submit. Returns the FULL specific list of
 * missing items — never stops at the first one — so the draft/status screens can show everything
 * that still needs attention in one pass.
 */
export function checkKybCompleteness(
  application: Pick<KybApplicationSummary, "registeredAddress" | "businessActivity"> | null,
  documents: readonly KybDocumentSummary[]
): CompletenessResult {
  const missing: MissingItem[] = [];

  if (!application || !application.registeredAddress) {
    missing.push({ key: "registeredAddress", label: "Registered business address is required." });
  }

  if (!application || !application.businessActivity) {
    missing.push({ key: "businessActivity", label: "A description of your business activity is required." });
  }

  for (const documentType of KYB_DOCUMENT_TYPES) {
    if (!documentType.required) continue;
    const current = currentDocumentOfType(documents, documentType.type);
    if (!current) {
      missing.push({ key: documentType.type, label: `${documentTypeLabel(documentType.type)} is required.` });
      continue;
    }
    if (current.status === "REJECTED") {
      missing.push({ key: documentType.type, label: `${documentTypeLabel(documentType.type)} was rejected — upload a replacement.` });
    }
  }

  return { complete: missing.length === 0, missing };
}

/**
 * English fallback labels for completeness messages (server-generated, generic-error-safe — never a
 * raw DB/Storage error). The localized display label for a document type in the UI itself comes from
 * `lib/app/copy` (`kyb.documentTypes`), not from here; this function only feeds the specific-item
 * wording this module is responsible for.
 */
function documentTypeLabel(type: KybDocumentType): string {
  const labels: Record<KybDocumentType, string> = {
    TRADE_LICENSE: "Trade licence",
    PROOF_OF_INCORPORATION: "Proof of incorporation",
    AUTHORIZED_SIGNATORY_ID: "Authorized signatory identity document",
    UBO_DECLARATION: "Ultimate beneficial ownership declaration",
    BANKING_EVIDENCE: "Bank account evidence",
  };
  return labels[type];
}
