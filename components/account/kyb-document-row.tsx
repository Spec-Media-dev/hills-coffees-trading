"use client";

import { useActionState, useState } from "react";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Icon } from "@/components/ui/icon";
import {
  isKybDocumentType,
  kybDocumentTypeConfig,
  KYB_DOCUMENT_TYPE_VALUES,
  type KybDocumentType,
} from "@/lib/validation/kyb-application";
import { isDocumentExpired, type CurrentKybDocumentSummary } from "@/lib/kyb/status-types";
import type { KybDocumentReview } from "@/lib/kyb/review-items";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { uploadKybDocument } from "@/src/app/dashboard/kyb/actions";

const ACCEPT = "application/pdf,image/jpeg,image/png";

/**
 * Feature 003 T017/T020/T022 — one required-document row: current status, expiry, the exact
 * Compliance-recorded rejection reason (never a raw `reviewer_user_id` — `reviewerLabel` is always
 * `list_kyb_document_reviews`'s fixed `"Hills Compliance"` constant), and the upload/replace control.
 */
export function KybDocumentRow({
  documentType,
  currentDocument,
  review,
}: {
  documentType: KybDocumentType;
  currentDocument: CurrentKybDocumentSummary | undefined;
  review: KybDocumentReview | undefined;
}) {
  const { tApp, locale } = useLocale();
  const copy = tApp.kyb.documents;
  const config = kybDocumentTypeConfig(documentType);
  const [state, dispatch, isPending] = useActionState(uploadKybDocument, undefined);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileError =
    state?.ok === false && state.fieldErrors?.file
      ? state.code === ACTION_FEEDBACK.KYB_FILE_REQUIRED
        ? copy.fileRequired
        : state.code === ACTION_FEEDBACK.KYB_FILE_TYPE_INVALID
          ? copy.invalidFileType
          : copy.fileTooLarge
      : undefined;
  useActionToast(
    state,
    state?.ok === true
      ? { tone: "success", message: tApp.kyb.toast.uploadSuccess }
      : state?.ok === false && !state.fieldErrors?.file
        ? {
            tone: "error",
            message:
              state.code === ACTION_FEEDBACK.KYB_APPLICATION_NOT_EDITABLE
                ? tApp.kyb.toast.applicationNotEditable
                : state.code === ACTION_FEEDBACK.KYB_REPLACEMENT_STALE
                  ? tApp.kyb.toast.replacementStale
                  : tApp.kyb.toast.uploadFailed,
          }
        : null
  );

  const status: "missing" | CurrentKybDocumentSummary["status"] = currentDocument?.status ?? "missing";
  const expired = config.expiryApplicable && currentDocument ? isDocumentExpired(currentDocument) : false;
  const dateFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { dateStyle: "medium" });

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold text-foreground">{copy.types[documentType]}</p>
          <p className="hc-meta text-muted-foreground">{copy.status[status]}</p>
          {currentDocument?.expiresAt ? (
            <p className={`hc-meta ${expired ? "text-destructive" : "text-muted-foreground"}`}>
              {(expired ? copy.expired : copy.expiresOn).replace("{date}", dateFormatter.format(new Date(currentDocument.expiresAt)))}
            </p>
          ) : null}
          {status === "REJECTED" && review?.reason ? (
            <p className="hc-meta text-destructive">{copy.rejectionReason.replace("{reason}", review.reason)}</p>
          ) : null}
        </div>
        <Icon
          name={status === "ACCEPTED" ? "check" : status === "REJECTED" ? "circle-x" : status === "PENDING" ? "clock" : "file"}
          className={
            status === "ACCEPTED"
              ? "size-5 shrink-0 text-[var(--success)]"
              : status === "REJECTED"
                ? "size-5 shrink-0 text-destructive"
                : "size-5 shrink-0 text-muted-foreground"
          }
        />
      </div>

      <form action={dispatch} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="documentType" value={documentType} />
        {status === "REJECTED" && currentDocument ? (
          <input type="hidden" name="supersedesDocumentId" value={currentDocument.id} />
        ) : null}
        <FileUpload
          name="file"
          accept={ACCEPT}
          disabled={isPending}
          className="max-w-xs"
          onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? null)}
        />
        <Button type="submit" variant="outline" size="sm" disabled={isPending || !fileName}>
          {isPending ? copy.uploading : status === "missing" ? copy.upload : copy.replace}
        </Button>
      </form>
      {fileError ? <p role="alert" className="hc-meta text-destructive">{fileError}</p> : null}
    </li>
  );
}

export { KYB_DOCUMENT_TYPE_VALUES, isKybDocumentType };
