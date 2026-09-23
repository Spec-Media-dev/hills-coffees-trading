import type { ReactNode } from "react";

/**
 * Pre-Stripe hardening run — the dark page opener's inline-end panel on the catalogue indexes: a few
 * COUNTS derived from the same public DTOs the page already renders (never a claimed figure). It fills
 * the opener's formerly empty half with real, scannable information for a B2B buyer. Server Component.
 */
export function OpeningStats({ items }: { items: readonly { key: string; label: ReactNode; value: number }[] }) {
  return (
    <dl className="grid min-w-[16rem] grid-cols-2 overflow-hidden rounded-[var(--radius-xl)] border border-[rgba(238,228,209,0.16)] bg-[rgba(8,24,18,0.35)] backdrop-blur-sm lg:grid-cols-1" data-opening-stats>
      {items.map((item) => (
        <div key={item.key} className="flex flex-col gap-1 border-b border-e border-[rgba(238,228,209,0.12)] px-5 py-4 last:border-b-0 lg:border-e-0">
          <dt className="text-[length:var(--text-meta)] text-[#EEE4D1]/70">{item.label}</dt>
          <dd className="font-heading text-[clamp(1.8rem,1.4rem+1.2vw,2.6rem)] font-semibold leading-none tabular-nums text-[#EEE4D1]">
            <span dir="ltr">{item.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
