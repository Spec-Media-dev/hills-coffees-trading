import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OverviewCard as OverviewCardData } from "@/lib/dashboard/modules";

/**
 * Feature 004 T012 — the shared overview-card rendering + a titled-section wrapper with an honest
 * empty state (T014). Reused for every overview area (`account`/`bought`/`owe`/`where`) so 005–009/012
 * inherit one visual system instead of each building their own card treatment.
 */

/** A reference/tracking code in monospace tabular figures, per the approved design system. */
export function ReferenceCode({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[length:var(--text-small)] tabular-nums">{children}</span>;
}

function OverviewCardView({ card }: { card: OverviewCardData }) {
  return (
    <Card className="min-w-0 border-border bg-[var(--surface-card)]">
      <CardHeader>
        <CardTitle className="hc-heading-4">{card.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-[length:var(--text-h4)] font-semibold tabular-nums text-foreground">{card.value}</p>
        {card.description ? <CardDescription>{card.description}</CardDescription> : null}
      </CardContent>
    </Card>
  );
}

export function OverviewCardSection({
  title,
  cards,
  emptyMessage,
}: {
  title: ReactNode;
  cards: readonly OverviewCardData[];
  /** Omitted only for an area the contract guarantees is never empty (e.g. the account area). */
  emptyMessage?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{title}</h2>
      {cards.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <OverviewCardView key={card.id} card={card} />
          ))}
        </div>
      ) : emptyMessage ? (
        <Card className="min-w-0 border-dashed border-border bg-[var(--surface-subtle)]">
          <CardContent className="pt-(--card-spacing)">
            <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">{emptyMessage}</p>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
