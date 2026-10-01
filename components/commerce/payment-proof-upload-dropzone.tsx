"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/locale/locale-provider";
import { createClient } from "@/lib/supabase/client";
import {
  preparePaymentProofAction,
  finalizePaymentProofAction,
} from "@/src/app/dashboard/orders/[orderId]/proforma/actions";

interface Props {
  orderId: string;
  buyerTotal: number;
  currency: string;
  expiresAt: string;
}

const MAX_FILE_SIZE = 10485760; // 10 MB
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/**
 * Feature 015 T041 / T048 — Direct browser upload dropzone with 2-phase upload intent,
 * stable request ID retention, and structured expiry mapping.
 */
export function PaymentProofUploadDropzone({
  orderId,
  buyerTotal,
  currency,
  expiresAt,
}: Props) {
  const router = useRouter();
  const { direction } = useLocale();
  const isRtl = direction === "rtl";

  const [file, setFile] = useState<File | null>(null);
  const [claimedAmount, setClaimedAmount] = useState<string>(buyerTotal.toFixed(2));
  const [transferDate, setTransferDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [bankReference, setBankReference] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [uploadIntentId, setUploadIntentId] = useState<string | null>(null);
  const [prepareRequestId] = useState<string>(() => crypto.randomUUID());
  const [finalizeRequestId] = useState<string>(() => crypto.randomUUID());

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const selected = e.target.files?.[0];
    if (!selected) {
      setFile(null);
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(selected.type)) {
      setErrorMessage(
        isRtl
          ? "نوع الملف غير مدعوم. يُسمح فقط بملفات PDF أو PNG أو JPEG."
          : "Unsupported file type. Only PDF, PNG, or JPEG files are allowed."
      );
      setFile(null);
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      setErrorMessage(
        isRtl
          ? "حجم الملف يتجاوز الحد المسموح به (10 ميجابايت)."
          : "File size exceeds the 10 MB limit."
      );
      setFile(null);
      return;
    }

    setFile(selected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // 1. Client deadline pre-check
    if (new Date(expiresAt).getTime() <= Date.now()) {
      setIsExpired(true);
      return;
    }

    if (!file) {
      setErrorMessage(
        isRtl ? "يرجى تحديد ملف إشعار التحويل البنكي." : "Please select your payment proof file."
      );
      return;
    }

    if (!bankReference.trim()) {
      setErrorMessage(
        isRtl ? "يرجى إدخال الرقم المرجعي للتحويل البنكي." : "Please enter the bank transfer reference."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // Phase A: Prepare Intent (or reuse existing intent with prepareRequestId)
      let intentId = uploadIntentId;
      let bucket = "payment-proofs";
      let objectPath = "";

      const prepareForm = new FormData();
      prepareForm.set("orderId", orderId);
      prepareForm.set("requestId", prepareRequestId);
      prepareForm.set("displayFilename", file.name);

      const prepResult = await preparePaymentProofAction(undefined, prepareForm);
      if (!prepResult.ok) {
        if (prepResult.code === "reservation_expired") {
          setIsExpired(true);
          setIsSubmitting(false);
          return;
        }
        setErrorMessage(
          isRtl
            ? `فشل تجهيز التحميل: ${prepResult.code}`
            : `Failed to prepare upload: ${prepResult.code}`
        );
        setIsSubmitting(false);
        return;
      }

      intentId = prepResult.data.uploadIntentId;
      bucket = prepResult.data.bucketName;
      objectPath = prepResult.data.objectPath;
      setUploadIntentId(intentId);

      // Phase B: Direct Storage Upload without upsert (HIGH 5: policy grants INSERT only)
      const supabase = createClient();
      const { error: storageError } = await supabase.storage
        .from(bucket)
        .upload(objectPath, file, {
          upsert: false,
          contentType: file.type,
        });

      if (storageError) {
        // If object already exists from a previous network attempt, proceed to finalize
        const isDuplicate =
          storageError.message?.toLowerCase().includes("already exists") ||
          storageError.message?.toLowerCase().includes("duplicate") ||
          (storageError as { statusCode?: string | number }).statusCode === "409" ||
          (storageError as { statusCode?: string | number }).statusCode === 409;

        if (!isDuplicate) {
          setErrorMessage(
            isRtl
              ? `فشل رفع الملف إلى التخزين: ${storageError.message}`
              : `Failed to upload file: ${storageError.message}`
          );
          setIsSubmitting(false);
          return;
        }
      }

      // Phase C: Finalize Payment Proof (separate stable finalizeRequestId)
      const finalizeForm = new FormData();
      finalizeForm.set("orderId", orderId);
      finalizeForm.set("uploadIntentId", intentId);
      finalizeForm.set("requestId", finalizeRequestId);
      finalizeForm.set("customerClaimedAmount", claimedAmount);
      finalizeForm.set("customerTransferDate", transferDate);
      finalizeForm.set("customerBankReference", bankReference.trim());
      if (notes.trim()) {
        finalizeForm.set("customerReferenceText", notes.trim());
      }

      const finalizeResult = await finalizePaymentProofAction(undefined, finalizeForm);

      if (!finalizeResult.ok) {
        if (finalizeResult.code === "reservation_expired") {
          setIsExpired(true);
          setIsSubmitting(false);
          return;
        }
        setErrorMessage(
          isRtl
            ? `فشل تسجيل إشعار الدفع: ${finalizeResult.code}`
            : `Failed to finalize proof: ${finalizeResult.code}`
        );
        setIsSubmitting(false);
        return;
      }

      // Success: refresh proforma page to display Pending Verification
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected upload error";
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  if (isExpired) {
    return (
      <div role="alert" className="rounded-[var(--radius-lg)] border border-destructive/40 bg-destructive/5 p-6 text-center">
        <h3 className="text-lg font-semibold text-destructive">
          {isRtl ? "انتهت صلاحية الحجز" : "Reservation Expired"}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {isRtl
            ? "انتهت فترة الحجز البالغة 20 دقيقة لهذا الطلب وتم تحرير الكميات. يرجى بدء طلب جديد."
            : "The 20-minute reservation window has expired and inventory has been released. Please start a new order."}
        </p>
        <Button className="mt-4 min-h-11" nativeButton={false} render={<Link href="/dashboard/coffee" />}>
          {isRtl ? "تصفح القهوة" : "Browse Coffee"}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-border bg-card p-6 shadow-sm sm:p-8"
      noValidate
    >
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          {isRtl ? "إرسال إشعار التحويل البنكي" : "Submit Bank Transfer Payment Proof"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {isRtl
            ? "حمّل إشعار التحويل البنكي (PDF أو PNG أو JPEG، بحجم أقصاه 10 ميجابايت) قبل انتهاء وقت الحجز."
            : "Upload your bank transfer receipt (PDF, PNG, or JPEG, max 10 MB) before the reservation timer expires."}
        </p>
      </div>

      {errorMessage ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="proof-file" className="text-sm font-medium text-foreground">
          {isRtl ? "ملف الإشعار (PDF, PNG, JPEG)" : "Payment receipt file (PDF, PNG, JPEG)"}
        </label>
        <input
          id="proof-file"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={handleFileChange}
          disabled={isSubmitting}
          className="file:me-4 file:rounded-[var(--radius-md)] file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:opacity-90 min-h-11 text-sm text-foreground cursor-pointer"
          required
        />
        {file ? (
          <span className="text-xs text-muted-foreground">
            {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="claimed-amount" className="text-sm font-medium text-foreground">
            {isRtl ? `المبلغ المحوّل (${currency})` : `Transfer amount (${currency})`}
          </label>
          <input
            id="claimed-amount"
            type="number"
            step="0.01"
            min="0"
            value={claimedAmount}
            onChange={(e) => setClaimedAmount(e.target.value)}
            disabled={isSubmitting}
            dir="ltr"
            className="min-h-11 rounded-[var(--radius-md)] border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="transfer-date" className="text-sm font-medium text-foreground">
            {isRtl ? "تاريخ التحويل" : "Transfer date"}
          </label>
          <input
            id="transfer-date"
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
            disabled={isSubmitting}
            dir="ltr"
            className="min-h-11 rounded-[var(--radius-md)] border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="bank-reference" className="text-sm font-medium text-foreground">
          {isRtl ? "الرقم المرجعي للتحويل / رقم المعاملة" : "Bank transfer reference / transaction ID"}
        </label>
        <input
          id="bank-reference"
          type="text"
          maxLength={80}
          value={bankReference}
          onChange={(e) => setBankReference(e.target.value)}
          placeholder={isRtl ? "مثال: FT260929123456" : "e.g. FT260929123456"}
          disabled={isSubmitting}
          dir="ltr"
          className="min-h-11 rounded-[var(--radius-md)] border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="proof-notes" className="text-sm font-medium text-foreground">
          {isRtl ? "ملاحظات إضافية (اختياري)" : "Additional notes (optional)"}
        </label>
        <textarea
          id="proof-notes"
          maxLength={500}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isSubmitting}
          className="rounded-[var(--radius-md)] border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button
        type="submit"
        disabled={isSubmitting || !file || !bankReference.trim()}
        className="min-h-11 self-start sm:w-auto"
      >
        {isSubmitting
          ? isRtl
            ? "جارٍ إرسال الإشعار والتحقق…"
            : "Submitting proof…"
          : isRtl
          ? "إرسال إشعار الدفع"
          : "Submit Payment Proof"}
      </Button>
    </form>
  );
}
