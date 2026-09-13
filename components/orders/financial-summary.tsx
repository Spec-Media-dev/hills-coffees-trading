import { AppBilingual } from "@/components/locale/app-bilingual";
import type { OrderFinancialsDTO } from "@/lib/orders/validation";

/**
 * Feature 007 RUN C (T017) — PURE presentational rendering of one authoritative `order_financials`
 * snapshot. Input: the DTO exactly as `lib/orders/read.ts` passed it through. Output: labelled,
 * currency-explicit figures. There is deliberately NO arithmetic in this file — no subtotal, VAT,
 * commission, total or net is ever derived, summed or rounded here (FR-010); `format()` only turns
 * a stored number into text. Commission and seller-net are seller/finance-facing and are NOT shown
 * to the buyer.
 *
 * Money always carries its currency; quantity always carries its unit (`kg`). Figures are `dir="ltr"`
 * inside an otherwise RTL-safe grid so numerals read correctly under Arabic.
 */
export function formatMoney(currency: string, amount: number): string {
  return `${currency} ${amount}`;
}

export function FinancialSummary({ financials }: { financials: OrderFinancialsDTO }) {
  const rows: Array<{ key: string; label: React.ReactNode; value: string; emphasis?: boolean }> = [
    { key: "base", label: <AppBilingual pick={(c) => c.orders.financials.baseSubtotal} />, value: formatMoney(financials.currency, financials.baseSubtotal) },
    { key: "shipping", label: <AppBilingual pick={(c) => c.orders.financials.shipping} />, value: formatMoney(financials.currency, financials.shippingAmount) },
    { key: "vat", label: <AppBilingual pick={(c) => c.orders.financials.vat} />, value: formatMoney(financials.currency, financials.vatAmount) },
    { key: "quantity", label: <AppBilingual pick={(c) => c.orders.financials.totalQuantity} />, value: `${financials.totalQuantityKg} kg` },
    { key: "total", label: <AppBilingual pick={(c) => c.orders.financials.buyerTotal} />, value: formatMoney(financials.currency, financials.buyerTotalAmount), emphasis: true },
  ];

  return (
    <dl data-slot="financial-summary" className="grid grid-cols-1 gap-3 text-[length:var(--text-small)] sm:grid-cols-2 lg:grid-cols-5">
      {rows.map((row) => (
        <div key={row.key} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className={row.emphasis ? "font-mono font-semibold tabular-nums text-foreground" : "font-mono tabular-nums text-foreground"} dir="ltr">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
