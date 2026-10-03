"use client";

import * as React from "react";
import type { PaymentReviewDetailDTO } from "@/lib/finance/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ConfirmPaymentModal } from "@/components/admin/finance/confirm-payment-modal";
import { RejectPaymentModal } from "@/components/admin/finance/reject-payment-modal";
import { getProofSignedUrlAction } from "@/src/app/dashboard-admin/(finance)/payments/actions";

export type PaymentInspectorSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: PaymentReviewDetailDTO | null;
  isLoading?: boolean;
  onActionComplete?: () => void;
};

export function PaymentInspectorSheet({
  open,
  onOpenChange,
  detail,
  isLoading = false,
  onActionComplete,
}: PaymentInspectorSheetProps) {
  const [signedProof, setSignedProof] = React.useState<{
    url: string;
    mimeType: string;
    filename: string;
  } | null>(null);
  const [loadingProof, setLoadingProof] = React.useState(false);
  const [proofError, setProofError] = React.useState<string | null>(null);

  const [confirmModalOpen, setConfirmModalOpen] = React.useState(false);
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);

  // Fetch short-lived signed URL when detail changes
  React.useEffect(() => {
    if (!open || !detail?.proof.fileAssetId) {
      return;
    }

    let isCancelled = false;
    React.startTransition(() => {
      setLoadingProof(true);
      setProofError(null);
    });

    getProofSignedUrlAction({ fileAssetId: detail.proof.fileAssetId })
      .then((res) => {
        if (isCancelled) return;
        if (res.ok && res.data) {
          setSignedProof({
            url: res.data.signedUrl,
            mimeType: res.data.mimeType,
            filename: res.data.filename,
          });
        } else {
          setProofError(res.message ?? "Could not load proof document.");
        }
      })
      .catch((err: unknown) => {
        if (isCancelled) return;
        setProofError(err instanceof Error ? err.message : "Error retrieving proof.");
      })
      .finally(() => {
        if (!isCancelled) setLoadingProof(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [open, detail?.proof.fileAssetId]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="inline-end"
          className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto p-6"
        >
          {isLoading ? (
            <div className="flex flex-col gap-4 py-8 animate-pulse" aria-busy="true">
              <div className="h-6 w-32 rounded bg-muted" />
              <div className="h-8 w-64 rounded bg-muted" />
              <div className="h-40 rounded-lg bg-muted/60" />
              <div className="h-40 rounded-lg bg-muted/60" />
            </div>
          ) : !detail ? (
            <div className="py-12 text-center text-muted-foreground">
              <p>No payment details selected.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Header */}
              <SheetHeader className="text-start border-b border-border pb-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
                    ORDER {detail.orderCode}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {detail.paymentStatus}
                  </Badge>
                </div>
                <SheetTitle className="text-lg font-heading font-semibold text-foreground">
                  Payment Verification & Handoff
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Buyer: <strong className="text-foreground">{detail.buyerOrganizationName}</strong>
                </SheetDescription>
              </SheetHeader>

              {/* Action Buttons Bar */}
              <div className="flex items-center justify-end gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-3 shadow-sm">
                <Button
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setRejectModalOpen(true)}
                >
                  <Icon name="x" className="size-4 me-1.5" />
                  Reject Payment
                </Button>
                <Button
                  onClick={() => setConfirmModalOpen(true)}
                >
                  <Icon name="check" className="size-4 me-1.5" />
                  Confirm & Dispatch Handoff
                </Button>
              </div>

              {/* Section 1: Claimed Payment Proof */}
              <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
                    <Icon name="file-text" className="size-4 text-primary" />
                    Submitted Payment Proof
                  </h4>
                  <Badge variant="outline" className="text-xs">
                    Status: {detail.proof.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs border-y border-border py-2.5">
                  <div>
                    <span className="text-muted-foreground">Claimed Amount: </span>
                    <strong className="text-foreground font-semibold">
                      {detail.proof.claimedAmount.toFixed(2)} {detail.proof.claimedCurrency}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Bank Reference: </span>
                    <strong className="text-foreground font-semibold font-mono">
                      {detail.proof.bankReference || "None"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Transfer Date: </span>
                    <span className="text-foreground">
                      {detail.proof.transferDate || "Not specified"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Submitted: </span>
                    <span className="text-foreground">
                      {new Date(detail.proof.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Proof Document Viewer / Download */}
                <div className="flex flex-col gap-2 pt-1">
                  <span className="text-xs font-medium text-foreground">Proof Document Preview:</span>
                  {loadingProof ? (
                    <div className="h-28 rounded-md bg-muted/60 animate-pulse flex items-center justify-center text-xs text-muted-foreground">
                      Generating secure preview link...
                    </div>
                  ) : proofError ? (
                    <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                      {proofError}
                    </div>
                  ) : signedProof ? (
                    <div className="flex flex-col gap-2">
                      {signedProof.mimeType.startsWith("image/") ? (
                        <div className="overflow-hidden rounded-md border border-border bg-muted/20 text-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={signedProof.url}
                            alt="Payment Proof"
                            className="max-h-64 w-auto mx-auto object-contain rounded"
                          />
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate max-w-[200px] text-muted-foreground">
                          {signedProof.filename}
                        </span>
                        <a
                          href={signedProof.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                          <Icon name="external-link" className="size-3.5" />
                          Open Proof Document (New Tab)
                        </a>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Proof file not available</span>
                  )}
                </div>
              </div>

              {/* Section 2: Authoritative Proforma Snapshot */}
              <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
                    <Icon name="receipt" className="size-4 text-primary" />
                    Authoritative Proforma Snapshot ({detail.proforma.proformaCode})
                  </h4>
                  <Badge variant="default" className="text-xs">
                    {detail.proforma.status}
                  </Badge>
                </div>

                <div className="flex items-center justify-between bg-muted/40 p-2.5 rounded-md text-xs">
                  <span>Authoritative Buyer Total:</span>
                  <span className="font-semibold text-foreground text-sm">
                    {detail.proforma.buyerTotal.toFixed(2)} {detail.proforma.currency}
                  </span>
                </div>

                {/* Items */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    Order Lines ({detail.proforma.items.length})
                  </span>
                  <div className="divide-y divide-border border border-border rounded-md overflow-hidden text-xs">
                    {detail.proforma.items.map((item) => (
                      <div key={item.orderItemId} className="p-2.5 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{item.productName}</span>
                          <span className="text-muted-foreground text-[11px]">
                            {item.quantityKg} kg @ {item.unitPrice.toFixed(2)} / kg
                          </span>
                        </div>
                        <span className="font-semibold text-foreground">
                          {item.amount.toFixed(2)} {detail.proforma.currency}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fulfillment Groups */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    Fulfillment Handoff Groups ({detail.proforma.fulfillmentGroups.length})
                  </span>
                  <div className="divide-y divide-border border border-border rounded-md overflow-hidden text-xs">
                    {detail.proforma.fulfillmentGroups.map((group, idx) => (
                      <div key={group.id} className="p-2.5 flex items-center justify-between bg-muted/10">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            Group #{idx + 1} — {group.deliveryMethod}
                          </span>
                          <span className="text-muted-foreground text-[11px] font-mono">
                            Warehouse: {group.warehouseId.slice(0, 8)}...
                          </span>
                        </div>
                        <span className="text-foreground">
                          Shipping: {group.shippingAmount.toFixed(2)} {detail.proforma.currency}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Destination */}
                <div className="text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-md flex flex-col gap-0.5">
                  <span className="font-medium text-foreground">Delivery Destination:</span>
                  <span>
                    {detail.proforma.destination.contactName} ({detail.proforma.destination.contactPhone})
                  </span>
                  <span>
                    {detail.proforma.destination.addressLines.join(", ")},{" "}
                    {detail.proforma.destination.city}, {detail.proforma.destination.countryCode}
                  </span>
                </div>
              </div>

              {/* Section 3: Stock Reservation Context */}
              <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
                    <Icon name="package" className="size-4 text-primary" />
                    Stock Reservation ({detail.reservation.status})
                  </h4>
                  <span className="text-xs text-muted-foreground font-mono">
                    ID: {detail.reservation.id.slice(0, 8)}...
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Expires At:{" "}
                  <span className="text-foreground">
                    {new Date(detail.reservation.expiresAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {detail.reservation.items.length} reserved item line(s) held in stock.
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmation Modal */}
      {detail ? (
        <ConfirmPaymentModal
          open={confirmModalOpen}
          onOpenChange={setConfirmModalOpen}
          orderId={detail.orderId}
          orderCode={detail.orderCode}
          paymentId={detail.paymentId}
          amount={detail.amount}
          currency={detail.currency}
          onConfirmed={() => {
            onOpenChange(false);
            if (onActionComplete) onActionComplete();
          }}
        />
      ) : null}

      {/* Rejection Modal */}
      {detail ? (
        <RejectPaymentModal
          open={rejectModalOpen}
          onOpenChange={setRejectModalOpen}
          orderId={detail.orderId}
          orderCode={detail.orderCode}
          paymentId={detail.paymentId}
          onRejected={() => {
            onOpenChange(false);
            if (onActionComplete) onActionComplete();
          }}
        />
      ) : null}
    </>
  );
}
