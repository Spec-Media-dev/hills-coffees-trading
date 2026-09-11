/**
 * Feature 003 RUN B — client-safe KYB status types + pure helpers.
 *
 * Deliberately contains NO import of `lib/supabase/server` (or anything that pulls in
 * `next/headers`) — this file is imported by client components (`components/account/kyb-document-
 * row.tsx` and friends) as well as server code, and a server-only import here would leak
 * `next/headers` into the client bundle. `lib/kyb/status.ts` re-exports everything from this file
 * for server-side callers' convenience, so most callers can keep importing from `lib/kyb/status`;
 * only client components need to import from here directly.
 */

export const KYB_APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "RESUBMISSION_REQUIRED",
  "SUSPENDED",
] as const;
export type KybApplicationStatus = (typeof KYB_APPLICATION_STATUSES)[number];

export const KYB_EDITABLE_STATUSES: readonly KybApplicationStatus[] = ["DRAFT", "RESUBMISSION_REQUIRED"];

export type KybApplicationSummary = {
  id: string;
  organizationId: string;
  status: KybApplicationStatus;
  registeredAddress: string | null;
  businessActivity: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
};

export type KybDocumentSummary = {
  id: string;
  documentType: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "SUPERSEDED";
  version: number;
  supersedesDocumentId: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  expiresAt: string | null;
  createdAt: string;
};

export type KybWorkspace = {
  application: KybApplicationSummary | null;
  /** Every document for the application, INCLUDING superseded ones (needed for T020's version history). */
  documents: KybDocumentSummary[];
};

/** Only the CURRENT (non-superseded) documents — what the draft/upload UI and completeness care about. */
export type CurrentKybDocumentSummary = Omit<KybDocumentSummary, "status"> & {
  status: Exclude<KybDocumentSummary["status"], "SUPERSEDED">;
};

export function currentDocuments(documents: readonly KybDocumentSummary[]): CurrentKybDocumentSummary[] {
  return documents.filter(
    (document): document is CurrentKybDocumentSummary => document.status !== "SUPERSEDED"
  );
}

/** True if a required, current, non-expired document exists past its `expires_at` (T022). */
export function isDocumentExpired(document: Pick<KybDocumentSummary, "expiresAt">, asOf: Date = new Date()): boolean {
  if (!document.expiresAt) return false;
  return new Date(document.expiresAt).getTime() < asOf.getTime();
}
