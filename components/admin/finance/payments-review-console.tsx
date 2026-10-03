"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PaymentQueueItemDTO, PaymentReviewDetailDTO } from "@/lib/finance/types";
import { PaymentsQueueTable } from "@/components/admin/finance/payments-queue-table";
import { PaymentInspectorSheet } from "@/components/admin/finance/payment-inspector-sheet";

export type PaymentsReviewConsoleProps = {
  queue: PaymentQueueItemDTO[];
  selectedDetail: PaymentReviewDetailDTO | null;
  selectedOrderId: string | null;
};

export function PaymentsReviewConsole({
  queue,
  selectedDetail,
  selectedOrderId,
}: PaymentsReviewConsoleProps) {
  const router = useRouter();
  const [closingOrderId, setClosingOrderId] = React.useState<string | null>(null);

  const isSheetOpen = Boolean(selectedOrderId && selectedDetail && selectedOrderId !== closingOrderId);

  const handleSelectOrder = React.useCallback(
    (orderId: string) => {
      setClosingOrderId(null);
      router.push(`/dashboard-admin/payments?selectedOrder=${orderId}`, { scroll: false });
    },
    [router]
  );

  const handleSheetOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) {
        setClosingOrderId(selectedOrderId);
        router.push("/dashboard-admin/payments", { scroll: false });
      }
    },
    [router, selectedOrderId]
  );

  const handleActionComplete = React.useCallback(() => {
    router.refresh();
    router.push("/dashboard-admin/payments", { scroll: false });
  }, [router]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Bank Transfer Payment Verification
        </h1>
        <p className="text-sm text-muted-foreground">
          Review customer submitted bank payment proofs, confirm inventory conservation, and dispatch automatic delivery fulfillment.
        </p>
      </div>

      <PaymentsQueueTable
        items={queue}
        selectedOrderId={selectedOrderId}
        onSelectOrder={handleSelectOrder}
      />

      <PaymentInspectorSheet
        open={isSheetOpen}
        onOpenChange={handleSheetOpenChange}
        detail={selectedDetail}
        onActionComplete={handleActionComplete}
      />
    </div>
  );
}
