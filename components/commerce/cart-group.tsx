import { AppBilingual } from "@/components/locale/app-bilingual";
import type { CartLine as CartLineData } from "@/lib/commerce/cart";
import { CartLine } from "./cart-line";

export function CartGroup({ orderId, lines, sellerLabel, warehouseName }: { orderId: string; lines: CartLineData[]; sellerLabel: string; warehouseName: string | null }) {
  return (
    <section className="min-w-0 rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-6">
      <h2 className="flex flex-wrap gap-x-2 gap-y-1 text-lg font-semibold text-foreground">
        <span><AppBilingual pick={(c) => c.commerce.cartUi.groupSeller} />: {sellerLabel}</span>
        <span aria-hidden="true">·</span>
        <span><AppBilingual pick={(c) => c.commerce.cartUi.groupWarehouse} />: {warehouseName ?? <AppBilingual pick={(c) => c.commerce.cartUi.warehouseUnavailable} />}</span>
      </h2>
      <ul className="mt-4"><CartGroupLines orderId={orderId} lines={lines} /></ul>
    </section>
  );
}

function CartGroupLines({ orderId, lines }: { orderId: string; lines: CartLineData[] }) {
  return lines.map((line) => <CartLine key={line.id} orderId={orderId} line={line} />);
}
