import type { Metadata } from "next";
import { checkAreaAccess } from "@/lib/admin/guards";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { getPendingPaymentsQueue, getPaymentReviewDetail } from "@/lib/finance/read";
import { PaymentsReviewConsole } from "@/components/admin/finance/payments-review-console";

export const metadata: Metadata = {
  title: "Pending Payments Verification | Operations Console",
  robots: { index: false, follow: false },
};

/**
 * Feature 016 T032: Payments Review Protected Server Page.
 * Composes queue, inspector sheet, modal actions, and unauthorized states.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ selectedOrder?: string }>;
}) {
  const access = await checkAreaAccess("payments");
  if (!access.ok) {
    return <AdminAccessDenied denial={access.denial} requiredFunction="is_finance_operator" />;
  }

  const params = searchParams ? await searchParams : {};
  const selectedOrderId = params.selectedOrder || null;

  const [queue, selectedDetail] = await Promise.all([
    getPendingPaymentsQueue(),
    selectedOrderId ? getPaymentReviewDetail(selectedOrderId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PaymentsReviewConsole
        queue={queue}
        selectedDetail={selectedDetail}
        selectedOrderId={selectedOrderId}
      />
    </div>
  );
}
