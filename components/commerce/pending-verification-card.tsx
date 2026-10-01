"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/locale/locale-provider";

interface Props {
  orderCode: string;
}

/**
 * Feature 015 T049 — Pending Verification UI shown only after committed payment-proof finalization.
 * Boundary stop: Feature 015 ends here.
 */
export function PendingVerificationCard({ orderCode }: Props) {
  const { direction } = useLocale();
  const isRtl = direction === "rtl";

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-primary/30 bg-primary/5 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-foreground">
          {isRtl ? "قيد التحقق من الدفع" : "Payment Pending Verification"}
        </h3>
        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
          {isRtl ? "قيد المراجعة المالية" : "Pending Finance Review"}
        </span>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        {isRtl
          ? `تم إرسال إشعار الدفع بنجاح للطلب ${orderCode}. يقوم الفريق المالي بمراجعة التحويل البنكي وتأكيده. سيبقى حجز المخزون الخاص بك محفوظاً أثناء فترة المراجعة.`
          : `Your payment proof has been successfully submitted for order ${orderCode}. Our finance team is currently reviewing and verifying the bank transfer. Your reserved inventory remains secured during this review.`}
      </p>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button className="min-h-11" nativeButton={false} render={<Link href="/dashboard/orders" />}>
          {isRtl ? "عرض طلباتي" : "View My Orders"}
        </Button>
        <Button variant="outline" className="min-h-11" nativeButton={false} render={<Link href="/dashboard/coffee" />}>
          {isRtl ? "تصفح المزيد من القهوة" : "Browse More Coffee"}
        </Button>
      </div>
    </section>
  );
}
