import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { CartGroup } from "@/components/commerce/cart-group";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";
import { getRequestIdentity } from "@/lib/auth/dal";
import { readCart, type CartLine } from "@/lib/commerce/cart";

export const metadata: Metadata = { title: "Cart" };

export default async function CartPage() {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || !identity.organization) return <StateScreen kind="unauthorized" />;
  if (!identity.isAuthorizedMember || !identity.organization.canBuy || identity.requiresMfaStepUp) return <StateScreen kind="forbidden" />;
  const cart = await readCart(identity.organization.organizationId);
  const groups = new Map<string, CartLine[]>();
  for (const line of cart.lines) {
    const key = `${line.sellerOrganizationId}:${line.warehouseId ?? "unknown"}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  const sellerIds = [...new Set(cart.lines.map((line) => line.sellerOrganizationId))];
  const sellerNumber = new Map(sellerIds.map((id, index) => [id, index + 1]));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => c.commerce.cartUi.title} />} description={<AppBilingual pick={(c) => c.commerce.cartUi.description} />} />
      <p className="rounded-[var(--radius-md)] border border-border bg-muted p-4 text-[length:var(--text-small)] text-foreground">
        <AppBilingual pick={(c) => c.commerce.cartUi.notReserved} />
      </p>
      {!cart.orderId || cart.lines.length === 0 ? (
        <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-card p-6 text-center sm:p-10">
          <h2 className="text-xl font-semibold"><AppBilingual pick={(c) => c.commerce.cartUi.emptyTitle} /></h2>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground"><AppBilingual pick={(c) => c.commerce.cartUi.emptyDescription} /></p>
          <Button className="mt-5 min-h-11" nativeButton={false} render={<Link href="/dashboard/coffee" />}><AppBilingual pick={(c) => c.commerce.cartUi.browse} /></Button>
        </section>
      ) : (
        <>
          {[...groups].map(([key, lines]) => (
            <CartGroup key={key} orderId={cart.orderId!} lines={lines} sellerLabel={String(sellerNumber.get(lines[0].sellerOrganizationId))} warehouseName={lines[0].warehouseName} />
          ))}
          <div className="flex flex-col items-end gap-2">
            <Button type="button" disabled aria-disabled="true">
              <AppBilingual pick={(c) => c.commerce.cartUi.checkout} />
            </Button>
            <p className="text-[length:var(--text-small)] text-muted-foreground"><AppBilingual pick={(c) => c.commerce.cartUi.checkoutPending} /></p>
          </div>
        </>
      )}
    </div>
  );
}
