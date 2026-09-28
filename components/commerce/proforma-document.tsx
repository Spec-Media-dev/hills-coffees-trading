import type { ReactNode } from "react";

import { CommerceStatusBadge } from "@/components/commerce/commerce-status-badge";
import { Money } from "@/components/commerce/money";
import type { ProformaDetailDTO } from "@/lib/commerce/read";

/**
 * Feature 013 T086 — the frozen proforma document. Shows exactly what was snapshotted at issuance
 * (FIN-001) — nothing here is recomputed. H2 (buyer financial privacy): this component receives only
 * `ProformaDetailDTO`, which never carries commission, seller net or Hills share; there is no prop
 * this file could even render that would leak them.
 */
export function ProformaDocument({ proforma, displayStatus, sellerTypeLabel, notATaxInvoiceLabel, validUntilLabel, totalsCopy }: {
  proforma: ProformaDetailDTO;
  displayStatus?: ProformaDetailDTO["status"];
  sellerTypeLabel: (sellerType: string) => ReactNode;
  notATaxInvoiceLabel: ReactNode;
  validUntilLabel: ReactNode;
  totalsCopy: { merchandiseNet: ReactNode; shippingGroup: ReactNode; shipping: ReactNode; shippingVat: ReactNode; vat: ReactNode; total: ReactNode };
}) {
  return (
    <article className="flex flex-col gap-6" data-slot="proforma-document">
      <header className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-lg font-semibold text-foreground" dir="ltr">
            {proforma.proformaCode} <span className="text-muted-foreground">· v{proforma.version}</span>
          </span>
          <CommerceStatusBadge status={displayStatus ?? proforma.status} />
        </div>
        <p className="text-[length:var(--text-small)] font-medium text-muted-foreground">{notATaxInvoiceLabel}</p>
        {proforma.status === "ISSUED" ? (
          <p className="text-[length:var(--text-small)] text-muted-foreground">
            {validUntilLabel} <time dateTime={proforma.validUntil} className="font-mono" dir="ltr">{proforma.validUntil}</time>
          </p>
        ) : null}
      </header>

      {proforma.destination ? (
        <section className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5 text-[length:var(--text-small)]">
          <p className="font-medium text-foreground">{proforma.destination.label}</p>
          <p className="text-muted-foreground">
            {proforma.destination.addressLines.join(", ")}, {proforma.destination.city}, {proforma.destination.countryCode}
          </p>
          <p className="text-muted-foreground" dir="ltr">{proforma.destination.contactPhone}</p>
        </section>
      ) : null}

      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
        <table className="w-full min-w-[40rem] text-[length:var(--text-small)]">
          <tbody>
            {proforma.lines.map((line) => (
              <tr key={line.id} className="border-b border-border last:border-0">
                <td className="p-3">
                  <span className="block font-medium text-foreground">{line.productName}</span>
                  <span className="text-muted-foreground">{sellerTypeLabel(line.sellerType)}</span>
                </td>
                <td className="p-3 text-end" dir="ltr">{line.quantityKg} kg</td>
                <td className="p-3 text-end"><Money amount={line.unitPrice} /></td>
                {line.discountAmount > 0 ? <td className="p-3 text-end text-[var(--status-paid)]">−<Money amount={line.discountAmount} /></td> : null}
                <td className="p-3 text-end font-medium"><Money amount={line.lineTotal} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {proforma.groups.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border p-4 text-[length:var(--text-small)]">
          <h2 className="font-medium text-foreground">{totalsCopy.shippingGroup}</h2>
          {proforma.groups.map((group) => (
            <div key={group.id} className="flex flex-col gap-1 text-muted-foreground">
              <div className="flex items-center justify-between gap-3"><span>{totalsCopy.shipping} ({group.deliveryMethod})</span><Money amount={group.shippingAmount} /></div>
              {group.shippingVatAmount > 0 ? <div className="flex items-center justify-between gap-3"><span>{totalsCopy.shippingVat}</span><Money amount={group.shippingVatAmount} /></div> : null}
            </div>
          ))}
        </section>
      ) : null}

      <dl className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-muted p-4 text-[length:var(--text-small)]">
        <div className="flex items-center justify-between"><dt className="text-muted-foreground">{totalsCopy.merchandiseNet}</dt><dd><Money amount={proforma.merchandiseNet} /></dd></div>
        <div className="flex items-center justify-between"><dt className="text-muted-foreground">{totalsCopy.shipping}</dt><dd><Money amount={proforma.shippingTotal} /></dd></div>
        <div className="flex items-center justify-between"><dt className="text-muted-foreground">{totalsCopy.vat}</dt><dd><Money amount={proforma.vatTotal} /></dd></div>
        <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-foreground"><dt>{totalsCopy.total}</dt><dd><Money amount={proforma.buyerTotal} /></dd></div>
      </dl>
    </article>
  );
}
