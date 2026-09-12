import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "cn";

/**
 * Feature 004 T007 — the shared "table on desktop, card list on mobile" primitive plan.md's
 * "Responsive strategy is layout-level" decision calls for. Built ONCE here so 005–009/012 inherit
 * identical responsive behaviour rather than each re-solving it — no future module needs its own
 * table/card breakpoint logic.
 *
 * GENERIC AND DATA-FREE: this component reads no business data and imports nothing from `lib/`
 * beyond its own props. It is proven by a fixture in `tests/dashboard/responsive.test.tsx`, not by a
 * real business table — building a real Inventory/Orders table here would be exactly the
 * "speculative business table just to demonstrate it" the run directive forbids.
 *
 * A `<table>` renders at `lg:` and above (real `<table>`/`<th>`/`<td>` semantics — screen readers get
 * genuine table structure, not a div grid dressed up to look like one). Below `lg`, the exact same
 * `rows` render as a stacked list of cards, one row per card, each cell shown as a label/value pair
 * so a long value (an email, a company name) can wrap without breaking a rigid column width. Both
 * renders come from the SAME `columns`/`rows` props — there is only ever one data source, never two
 * views that could drift apart.
 */
export type TableCardListColumn<Row> = {
  key: string;
  header: ReactNode;
  /** Rendered in both the desktop `<td>` and the mobile card's value slot. */
  render: (row: Row) => ReactNode;
  /**
   * The one column shown as the mobile card's own title (e.g. a reference code) — its label is not
   * repeated on mobile, since the card's position already implies it.
   */
  primary?: boolean;
};

export function TableCardList<Row>({
  columns,
  rows,
  getRowKey,
  emptyState,
  caption,
}: {
  columns: readonly TableCardListColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => string;
  emptyState?: ReactNode;
  /** Visually-hidden `<caption>` for the desktop `<table>` — required for a real table landmark name. */
  caption: string;
}) {
  if (rows.length === 0) {
    return emptyState ? <div className="py-6">{emptyState}</div> : null;
  }

  const primaryColumn = columns.find((column) => column.primary) ?? columns[0];
  const secondaryColumns = columns.filter((column) => column !== primaryColumn);

  return (
    <>
      <table className="hidden w-full text-start text-sm lg:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-start text-[length:var(--text-small)] text-muted-foreground">
            {columns.map((column) => (
              <th key={column.key} scope="col" className="py-2 pe-4 text-start font-medium">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="border-b border-border last:border-b-0">
              {columns.map((column) => (
                <td key={column.key} className="py-3 pe-4 align-top text-foreground">
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className={cn("flex flex-col gap-3 lg:hidden")}>
        {rows.map((row) => (
          <li key={getRowKey(row)}>
            <Card>
              <CardContent className="flex flex-col gap-2">
                <div className="font-semibold text-foreground">{primaryColumn!.render(row)}</div>
                {secondaryColumns.map((column) => (
                  <div key={column.key} className="flex items-baseline justify-between gap-3 text-[length:var(--text-small)]">
                    <span className="shrink-0 text-muted-foreground">{column.header}</span>
                    <span className="min-w-0 truncate text-foreground">{column.render(row)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
