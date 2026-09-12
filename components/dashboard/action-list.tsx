import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { ActionItem } from "@/lib/dashboard/modules";

/**
 * Feature 004 T013 — the "needs your action" area. Every item names the specific missing thing
 * (design system's core content rule) and links directly to the exact screen that resolves it —
 * never a generic "Action required" (`ActionItem.label` is always a specific, localized string,
 * never invented here). T014's honest empty state renders when there is genuinely nothing
 * outstanding, rather than an empty list with no explanation.
 */
export function ActionList({
  title,
  items,
  emptyMessage,
}: {
  title: ReactNode;
  items: readonly ActionItem[];
  emptyMessage: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{title}</h2>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-[var(--warning-surface)] p-4 text-foreground transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Icon name="alert-circle" aria-hidden="true" className="size-5 shrink-0 text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]" />
                  <span className="min-w-0 truncate font-medium">{item.label}</span>
                </span>
                <Icon name="chevron-right" aria-hidden="true" className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="min-w-0 border-dashed border-border bg-[var(--surface-subtle)]">
          <CardContent className="pt-(--card-spacing)">
            <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">{emptyMessage}</p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
