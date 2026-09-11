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
import { KYB_EVIDENCE_ALLOWED_MIME_TYPES, KYB_EVIDENCE_MAX_SIZE_BYTES } from "@/lib/kyb/limits";
import type { KybDocumentReview } from "@/lib/kyb/review-items";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { uploadKybDocument } from "@/src/app/dashboard/kyb/actions";

// Derived from the same canonical registry the Server Action enforces (`lib/kyb/limits.ts`) — never
// a second, independently-typed MIME list.
const ACCEPT = KYB_EVIDENCE_ALLOWED_MIME_TYPES.join(",");

/**
 * Client-side pre-validation against the EXACT SAME canonical contract the Server Action enforces
 * (`lib/kyb/limits.ts`) — UX only, never the real boundary. Catches an invalid selection (wrong
 * type, too large, or genuinely empty) before the file is ever serialized into the Server Action's
 * request body, so an oversized file never hits the Next.js transport body-size limit and never
 * reaches the Next.js Runtime Error overlay for an entirely expected, everyday input mistake.
 */
function validateKybFileSelection(file: File | null): "fileRequired" | "invalidFileType" | "fileTooLarge" | null {
  if (!file) return null; // No selection yet is not itself an error — only an empty *submission* is.
  if (file.size === 0) return "fileRequired";
  if (!(KYB_EVIDENCE_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) return "invalidFileType";
  if (file.size > KYB_EVIDENCE_MAX_SIZE_BYTES) return "fileTooLarge";
  return null;
}

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const serverFileError =
    state?.ok === false && state.fieldErrors?.file
      ? state.code === ACTION_FEEDBACK.KYB_FILE_REQUIRED
        ? copy.fileRequired
        : state.code === ACTION_FEEDBACK.KYB_FILE_TYPE_INVALID
          ? copy.invalidFileType
          : copy.fileTooLarge
      : undefined;
  // Same canonical check the Server Action performs (`validateKybFileSelection` /
  // `lib/kyb/limits.ts`), run the moment a file is chosen — never on submit alone — so an
  // oversized/invalid file never reaches the Server Action's request body at all. Once a file is
  // selected in this row, its own (possibly passing) client result governs the displayed message,
  // rather than a stale server-returned error from a previous, different attempt.
  const clientValidation = validateKybFileSelection(selectedFile);
  const fileError = selectedFile
    ? clientValidation
      ? copy[clientValidation]
      : undefined
    : serverFileError;
  const canSubmit = selectedFile !== null && clientValidation === null;
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

      <form
        action={dispatch}
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          // Belt-and-suspenders alongside the disabled submit button below (e.g. a stray Enter
          // keypress) — an invalid/oversized selection must never reach the Server Action's request
          // body, so it never has a chance to hit the Next.js transport body-size limit.
          if (!canSubmit) event.preventDefault();
        }}
      >
        <input type="hidden" name="documentType" value={documentType} />
        {status === "REJECTED" && currentDocument ? (
          <input type="hidden" name="supersedesDocumentId" value={currentDocument.id} />
        ) : null}
        <FileUpload
          name="file"
          accept={ACCEPT}
          disabled={isPending}
          className="max-w-xs"
          onChange={(event) => setSelectedFile(event.currentTarget.files?.[0] ?? null)}
        />
        <Button type="submit" variant="outline" size="sm" disabled={isPending || !canSubmit}>
          {isPending ? copy.uploading : status === "missing" ? copy.upload : copy.replace}
        </Button>
      </form>
      {fileError ? <p role="alert" className="hc-meta text-destructive">{fileError}</p> : null}
    </li>
  );
}

export { KYB_DOCUMENT_TYPE_VALUES, isKybDocumentType };
