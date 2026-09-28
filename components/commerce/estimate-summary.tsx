import type { ReactNode } from "react";

import { Money } from "@/components/commerce/money";
import type { CheckoutEstimate } from "@/lib/commerce/quote";

/**
 * Feature 013 T084 — the full checkout estimate: lines, group shipping, VAT, total. Launch scope: zero
 * discount everywhere (no promotion/tier selection), so the discount row is shown only when the server
 * actually returned a non-zero discount — never misrepresenting a frozen total by hiding a real one.
 */
export function EstimateSummary({ estimate, copy }: {
  estimate: CheckoutEstimate;
  copy: {
    lineHeader: ReactNode; quantityHeader: ReactNode; unitPriceHeader: ReactNode; netHeader: ReactNode;
    discount: ReactNode; shippingGroup: ReactNode; shipping: ReactNode; shippingVat: ReactNode; merchandiseNet: ReactNode; vat: ReactNode; total: ReactNode;
    destinationRequired: ReactNode;
  };
}) {
  return (
    <section className="flex flex-col gap-4" data-slot="estimate-summary">
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
        <table className="w-full min-w-[36rem] text-[length:var(--text-small)]">
          <thead>
            <tr className="border-b border-border bg-muted text-start">
              <th scope="col" className="p-3 text-start font-medium">{copy.lineHeader}</th>
              <th scope="col" className="p-3 text-end font-medium">{copy.quantityHeader}</th>
              <th scope="col" className="p-3 text-end font-medium">{copy.unitPriceHeader}</th>
              {estimate.discountTotal > 0 ? <th scope="col" className="p-3 text-end font-medium">{copy.discount}</th> : null}
              <th scope="col" className="p-3 text-end font-medium">{copy.netHeader}</th>
            </tr>
          </thead>
          <tbody>
            {estimate.lines.map((line) => (
              <tr key={line.offerCode} className="border-b border-border last:border-0">
                <td className="p-3 text-foreground">{line.productName}</td>
                <td className="p-3 text-end" dir="ltr">{line.quantityKg} kg</td>
                <td className="p-3 text-end"><Money amount={line.unitPrice} /></td>
                {estimate.discountTotal > 0 ? <td className="p-3 text-end text-[var(--status-paid)]">−<Money amount={line.discount} /></td> : null}
                <td className="p-3 text-end font-medium"><Money amount={line.net} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {estimate.groups.length > 0 ? (
        <div className="flex flex-col gap-1 text-[length:var(--text-small)]">
          <p className="font-medium text-foreground">{copy.shippingGroup}</p>
          {estimate.groups.map((group, index) => (
            <div key={`${group.sellerId}:${group.warehouseId}:${index}`} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{copy.shipping} ({group.deliveryMethod})</span>
                <Money amount={group.shipping} />
              </div>
              {group.shippingVat > 0 ? (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{copy.shippingVat}</span>
                  <Money amount={group.shippingVat} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <dl className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-muted p-4 text-[length:var(--text-small)]">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{copy.merchandiseNet}</dt>
          <dd><Money amount={estimate.merchandiseNet} /></dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{copy.vat}</dt>
          <dd>{estimate.vatTotal === null ? copy.destinationRequired : <Money amount={estimate.vatTotal} />}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
          <dt>{copy.total}</dt>
          <dd>{estimate.buyerTotal === null ? copy.destinationRequired : <Money amount={estimate.buyerTotal} />}</dd>
        </div>
      </dl>
    </section>
  );
}
