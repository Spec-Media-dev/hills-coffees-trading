/**
 * Agreement registry and version gate (Feature 003, T003 — spec FR-014, PS5).
 *
 * REGISTRY/GATE FOUNDATION ONLY. The presentation + acceptance UI (`components/account/agreements/`)
 * and the acceptance Server Action that writes `agreement_acceptances` are Phase 6's scope — this
 * module owns exactly two things: the current agreement types/versions, and the pure "has this
 * organization accepted the CURRENT version?" check every later gate calls.
 *
 * DOCUMENT CONTENT IS NOT THIS FEATURE'S TO INVENT. Per spec.md's Assumptions, agreement documents
 * and their versions are supplied by Legal; this feature only presents and evidences them. No real
 * legal text exists in this codebase yet, so `documentHash` below is an explicit, honestly-labelled
 * PENDING sentinel — never a fabricated SHA-256 standing in for a document that does not exist. When
 * Legal supplies real, approved document text, its real version string and its real hash replace the
 * sentinel here; nothing else in this module changes.
 *
 * VERSION-BUMP SEMANTICS (the one behaviour this task's Verify actually exercises): an acceptance is
 * a record of exactly which `(type, version)` pair a user/organization accepted. Bumping the version
 * in `CURRENT_AGREEMENTS` therefore makes every prior acceptance at the old version stop satisfying
 * the gate immediately — there is no migration path that "carries forward" an old acceptance, by
 * design (spec PS5 scenario 3, FR-014).
 */

export const AGREEMENT_TYPES = [
  "platform_terms",
  "purchase_terms",
  "storage_custody_terms",
  "marketplace_terms",
  "privacy_policy",
] as const;

export type AgreementType = (typeof AGREEMENT_TYPES)[number];

export type AgreementDefinition = {
  type: AgreementType;
  /** The current approved version string for this agreement type. */
  version: string;
  /**
   * SHA-256 (hex) of the exact approved document text this version represents. `"PENDING_LEGAL_DOCUMENT"`
   * is the explicit placeholder sentinel used until Legal supplies real, approved text — it is never
   * treated as a real hash and must never be recorded as evidence of a real acceptance.
   */
  documentHash: string;
};

/**
 * The current version of every agreement type this platform requires. Bump a `version` string here
 * the moment Legal approves a new document — that single edit re-gates every organization that
 * accepted the prior version, with no other code change required.
 */
export const CURRENT_AGREEMENTS: readonly AgreementDefinition[] = [
  { type: "platform_terms", version: "0.1.0-pending-legal", documentHash: "PENDING_LEGAL_DOCUMENT" },
  { type: "purchase_terms", version: "0.1.0-pending-legal", documentHash: "PENDING_LEGAL_DOCUMENT" },
  { type: "storage_custody_terms", version: "0.1.0-pending-legal", documentHash: "PENDING_LEGAL_DOCUMENT" },
  { type: "marketplace_terms", version: "0.1.0-pending-legal", documentHash: "PENDING_LEGAL_DOCUMENT" },
  { type: "privacy_policy", version: "0.1.0-pending-legal", documentHash: "PENDING_LEGAL_DOCUMENT" },
];

/** The recorded shape of one acceptance — the fields the gate actually needs to check. */
export type AcceptanceRecord = {
  type: AgreementType;
  version: string;
};

export function getCurrentAgreement(type: AgreementType): AgreementDefinition {
  const definition = CURRENT_AGREEMENTS.find((agreement) => agreement.type === type);
  if (!definition) throw new Error(`No current agreement definition for type "${type}".`);
  return definition;
}

/** Has the current version of this ONE agreement type been accepted? */
export function hasAcceptedCurrentVersion(
  acceptances: readonly AcceptanceRecord[],
  type: AgreementType
): boolean {
  const current = getCurrentAgreement(type);
  return acceptances.some(
    (acceptance) => acceptance.type === type && acceptance.version === current.version
  );
}

/** Has EVERY required agreement type been accepted at its current version? The full trading gate. */
export function hasAcceptedAllCurrentAgreements(acceptances: readonly AcceptanceRecord[]): boolean {
  return CURRENT_AGREEMENTS.every((agreement) => hasAcceptedCurrentVersion(acceptances, agreement.type));
}

/** The specific agreement types still requiring acceptance — named, never a generic count. */
export function outstandingAgreements(acceptances: readonly AcceptanceRecord[]): AgreementType[] {
  return CURRENT_AGREEMENTS.filter((agreement) => !hasAcceptedCurrentVersion(acceptances, agreement.type)).map(
    (agreement) => agreement.type
  );
}
