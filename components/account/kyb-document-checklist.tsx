"use client";

import { useLocale } from "@/components/locale/locale-provider";
import { KybDocumentRow } from "@/components/account/kyb-document-row";
import { KYB_DOCUMENT_TYPES } from "@/lib/validation/kyb-application";
import type { CurrentKybDocumentSummary } from "@/lib/kyb/status-types";
import type { KybDocumentReview } from "@/lib/kyb/review-items";

/** Feature 003 T017/T020 — the required-document checklist. One `KybDocumentRow` per closed document type. */
export function KybDocumentChecklist({
  currentDocuments,
  reviews,
}: {
  currentDocuments: CurrentKybDocumentSummary[];
  reviews: KybDocumentReview[];
}) {
  const { tApp } = useLocale();
  const copy = tApp.kyb.documents;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{copy.title}</h2>
        <p className="text-[length:var(--text-small)] text-muted-foreground">{copy.lead}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {KYB_DOCUMENT_TYPES.map((documentType) => {
          const current = currentDocuments.find((document) => document.documentType === documentType.type);
          const review = current ? reviews.find((entry) => entry.documentId === current.id) : undefined;
          // Keyed by id/status (not just the document type) so a successful upload's server-driven
          // re-render remounts the row with fresh local state, instead of needing an effect-based
          // `setState` reset inside `KybDocumentRow` for its selected-filename UI state.
          const rowKey = `${documentType.type}-${current?.id ?? "none"}-${current?.status ?? "missing"}`;
          return <KybDocumentRow key={rowKey} documentType={documentType.type} currentDocument={current} review={review} />;
        })}
      </ul>
    </div>
  );
}
