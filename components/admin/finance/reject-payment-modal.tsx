"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { InlineAlert } from "@/components/ui/inline-alert";
import { rejectPaymentProofAction } from "@/src/app/dashboard-admin/(finance)/payments/actions";

export type RejectPaymentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderCode: string;
  paymentId: string;
  onRejected?: () => void;
};

export function RejectPaymentModal({
  open,
  onOpenChange,
  orderId,
  orderCode,
  paymentId,
  onRejected,
}: RejectPaymentModalProps) {
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setErrorMsg(null);
      setReason("");
      setNotes("");
    }
    onOpenChange(nextOpen);
  }

  async function handleReject() {
    if (reason.trim().length < 3) {
      setErrorMsg("Rejection reason must be at least 3 characters.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await rejectPaymentProofAction({
        orderId,
        paymentId,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        requestId: crypto.randomUUID(),
      });

      if (!res.ok) {
        setErrorMsg(res.message ?? "Failed to reject payment review.");
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      handleOpenChange(false);
      if (onRejected) onRejected();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred.");
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Reject Payment Proof</DialogTitle>
          <DialogDescription>
            You are rejecting the submitted payment proof for order{" "}
            <strong className="text-foreground font-mono">{orderCode}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {errorMsg ? (
            <InlineAlert tone="danger" title="Review Error">
              {errorMsg}
            </InlineAlert>
          ) : null}

          <div className="rounded-[var(--radius-md)] border border-destructive/20 bg-destructive/5 p-3 text-xs text-muted-foreground flex flex-col gap-1">
            <div>
              <span className="font-semibold text-destructive">Terminal Rejection Warning:</span>
            </div>
            <ul className="list-disc ps-4 space-y-0.5 text-foreground/80">
              <li>This rejection is <strong>permanent and terminal</strong></li>
              <li>Order transitions to <strong>PAYMENT_REJECTED</strong></li>
              <li>Reserved stock is immediately released back to sellers</li>
              <li>No invoice, ownership transfer, or shipments will be created</li>
            </ul>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="reject-reason" className="text-xs font-semibold text-foreground">
              Mandatory Rejection Reason <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Bank reference not found in statement; amount mismatch"
              rows={3}
              minLength={3}
              maxLength={500}
              required
              aria-required="true"
              disabled={isSubmitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="reject-notes" className="text-xs font-medium text-foreground">
              Optional Internal Audit Notes
            </label>
            <Textarea
              id="reject-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal operator notes (optional)"
              rows={2}
              maxLength={1000}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleReject}
            disabled={isSubmitting || reason.trim().length < 3}
          >
            {isSubmitting ? "Rejecting..." : "Confirm Rejection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
