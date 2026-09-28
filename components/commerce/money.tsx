/**
 * Feature 013 T084 — money display, never money arithmetic. Every number reaching this component is
 * already computed and frozen server-side (SEC-003/FIN-001); this file only formats. Money is always
 * rendered in an LTR span (currency codes and Arabic numerals read left-to-right regardless of page
 * direction), per house convention (`tests/commerce/no-ts-money-math.test.ts`).
 */
export function Money({ amount, currency = "USD", className }: { amount: number | null; currency?: string; className?: string }) {
  if (amount === null) {
    return (
      <span dir="ltr" className={className}>
        —
      </span>
    );
  }
  const formatted = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  return (
    <span dir="ltr" className={className}>
      {currency} {formatted}
    </span>
  );
}
