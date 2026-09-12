/**
 * Feature 004 T012 — narrow, reusable overview-figure formatting helpers. Deliberately NOT a full
 * financial formatting framework (currency-locale tables, rounding-mode configuration, etc.) — just
 * the three closed shapes the approved design system requires (design reference examples:
 * `USD 4.80 / kg`, `320 bags · 60kg`, `HC-2026-0418`), reusable as-is by 005–009/012 when they
 * register real overview cards.
 */

/** `formatMoney(4.8, "USD", "kg")` → `"USD 4.80 / kg"`. `perUnit` omitted → `"USD 4.80"`. */
export function formatMoney(amount: number, currency: string, perUnit?: string): string {
  const value = amount.toFixed(2);
  return perUnit ? `${currency} ${value} / ${perUnit}` : `${currency} ${value}`;
}

/** `formatQuantity(320, "bags", 60, "kg")` → `"320 bags · 60kg"`. Secondary pair is optional. */
export function formatQuantity(
  amount: number,
  unit: string,
  secondaryAmount?: number,
  secondaryUnit?: string
): string {
  const primary = `${amount} ${unit}`;
  if (secondaryAmount === undefined || !secondaryUnit) return primary;
  return `${primary} · ${secondaryAmount}${secondaryUnit}`;
}
