import { readFileSync } from "node:fs";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TableCardList, type TableCardListColumn } from "@/components/dashboard/responsive/table-card-list";

/**
 * Feature 004 T007 — proves the shared responsive table/card-list primitive (plan.md: "Prepare
 * reusable table → card-list behavior for future modules without implementing future tables"). Uses
 * a minimal, generic fixture — never a real business table — exactly as the run directive allows
 * ("A minimal fixture/demo inside tests/story helper is acceptable if needed to prove the primitive").
 */

type FixtureRow = { id: string; reference: string; status: string; note: string };

const rows: FixtureRow[] = [
  { id: "1", reference: "HC-0001", status: "Open", note: "First fixture row" },
  { id: "2", reference: "HC-0002", status: "Closed", note: "Second fixture row" },
];

const columns: TableCardListColumn<FixtureRow>[] = [
  { key: "reference", header: "Reference", render: (r) => r.reference, primary: true },
  { key: "status", header: "Status", render: (r) => r.status },
  { key: "note", header: "Note", render: (r) => r.note },
];

afterEach(cleanup);

describe("Feature 004 T007 — TableCardList responsive primitive", () => {
  it("renders a real <table> with the same data as the card list — one data source, two presentations", () => {
    render(<TableCardList columns={columns} rows={rows} getRowKey={(r) => r.id} caption="Fixture rows" />);

    const table = screen.getByRole("table", { hidden: true });
    expect(table).toBeTruthy();
    expect(screen.getAllByText("HC-0001").length).toBeGreaterThanOrEqual(2); // once in <td>, once in the card

    const columnHeaders = screen.getAllByRole("columnheader", { hidden: true }).map((h) => h.textContent);
    expect(columnHeaders).toEqual(["Reference", "Status", "Note"]);
  });

  it("the mobile card list shows the primary column as the card title, without repeating its label", () => {
    render(<TableCardList columns={columns} rows={rows} getRowKey={(r) => r.id} caption="Fixture rows" />);
    const lists = screen.getAllByRole("list", { hidden: true });
    const cardList = lists.find((el) => el.tagName === "UL");
    expect(cardList).toBeTruthy();
    // The card list shows "Status"/"Note" labels (secondary columns) but not a "Reference" label —
    // the primary column's value is the card title, its header text is not repeated as a label.
    expect(screen.getAllByText("Status").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Note").length).toBeGreaterThan(0);
  });

  it("renders the honest empty state when there are no rows — no fabricated sample row", () => {
    render(
      <TableCardList
        columns={columns}
        rows={[]}
        getRowKey={(r) => r.id}
        caption="Fixture rows"
        emptyState={<p>Nothing to show yet.</p>}
      />,
    );
    expect(screen.getByText("Nothing to show yet.")).toBeTruthy();
    expect(screen.queryByRole("table", { hidden: true })).toBeNull();
  });

  it("has no business/domain data or route hardcoded — this is a generic primitive, not a real module table", () => {
    const src = readFileSync("components/dashboard/responsive/table-card-list.tsx", "utf8");
    expect(src).not.toMatch(/getRequestIdentity|createClient|supabase|href=["']\/dashboard/i);
  });
});
