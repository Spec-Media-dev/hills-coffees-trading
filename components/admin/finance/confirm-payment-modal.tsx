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
import { confirmPaymentProofAction } from "@/src/app/dashboard-admin/(finance)/payments/actions";

export type ConfirmPaymentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderCode: string;
  paymentId: string;
  amount: number;
  currency: string;
  onConfirmed?: () => void;
};

export function ConfirmPaymentModal({
  open,
  onOpenChange,
  orderId,
  orderCode,
  paymentId,
  amount,
  currency,
  onConfirmed,
}: ConfirmPaymentModalProps) {
  const [notes, setNotes] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setErrorMsg(null);
      setNotes("");
    }
    onOpenChange(nextOpen);
  }

  async function handleConfirm() {
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await confirmPaymentProofAction({
        orderId,
        paymentId,
        notes: notes.trim() || undefined,
        requestId: crypto.randomUUID(),
      });

      if (!res.ok) {
        setErrorMsg(res.message ?? "Failed to confirm payment review.");
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      handleOpenChange(false);
      if (onConfirmed) onConfirmed();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred.");
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Bank Transfer Payment</DialogTitle>
          <DialogDescription>
            You are approving the bank transfer for order{" "}
            <strong className="text-foreground font-mono">{orderCode}</strong> in the
            amount of{" "}
            <strong className="text-foreground">
              {amount.toFixed(2)} {currency}
            </strong>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {errorMsg ? (
            <InlineAlert tone="danger" title="Review Error">
              {errorMsg}
            </InlineAlert>
          ) : null}

          <div className="rounded-[var(--radius-md)] border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex flex-col gap-1">
            <div>
              <span className="font-semibold text-foreground">Action Summary:</span>
            </div>
            <ul className="list-disc ps-4 space-y-0.5">
              <li>Order transitions to <strong>PAID</strong></li>
              <li>Stock reservation is <strong>CONSUMED</strong></li>
              <li>Inventory titles transfer to buyer</li>
              <li>Final tax invoice is issued</li>
              <li>Automatic <strong>FULFILLMENT</strong> shipment handoff dispatched</li>
            </ul>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-notes" className="text-xs font-medium text-foreground">
              Optional Verification Notes
            </label>
            <Textarea
              id="confirm-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Bank slip verified against bank account statement on 2026-10-02"
              rows={3}
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
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Confirming..." : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
