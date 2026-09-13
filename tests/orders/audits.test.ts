import { describe, expect, it } from "vitest";

/**
 * Feature 007 RUN A — the mandatory end-of-run source audits: no `checkout_order()`/
 * `expire_order_hold()` call site, no service-role, no shared cache, no title-transfer write, no
 * warehouse-progression status, anywhere in this run's own files.
 */
const RUN_A_FILES = [
  "lib/orders/validation.ts",
  "lib/orders/errors.ts",
  "lib/orders/read.ts",
  "lib/orders/drafts.ts",
  "src/app/dashboard/orders/actions.ts",
  "src/app/dashboard/orders/page.tsx",
  "src/app/dashboard/orders/start-order-button.tsx",
  "src/app/dashboard/orders/[orderId]/page.tsx",
  "src/app/dashboard/orders/[orderId]/shipment/actions.ts",
  "components/orders/draft-editor.tsx",
  "components/orders/shipment-planner.tsx",
  "components/orders/order-status-badge.tsx",
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("RUN A audit — no checkout_order()/expire_order_hold() call site anywhere in this run's files", () => {
  it.each(RUN_A_FILES)("%s never calls checkout_order or expire_order_hold", async (path) => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync(path, "utf8"));
    expect(source).not.toMatch(/checkout_order/);
    expect(source).not.toMatch(/expire_order_hold/);
  });

  it("a repo-wide grep for checkout_order/expire_order_hold matches nothing under lib/orders or src/app/dashboard/orders (T029's own future check, verified early)", async () => {
    const { execFileSync } = await import("node:child_process");
    let output = "";
    try {
      output = execFileSync("git", ["grep", "-l", "-E", "checkout_order|expire_order_hold", "--", "lib/orders", "src/app/dashboard/orders"], { encoding: "utf8" });
    } catch (error) {
      // `git grep` exits 1 when there are zero matches — that is the expected, passing outcome.
      const status = (error as { status?: number }).status;
      if (status !== 1) throw error;
    }
    expect(output.trim()).toBe("");
  });
});

describe("RUN A audit — no service-role, no shared cache, anywhere in this run's own files", () => {
  it.each(RUN_A_FILES)("%s never references a service-role key or a shared cache directive", async (path) => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync(path, "utf8"));
    expect(source).not.toMatch(/SERVICE_ROLE/);
    expect(source).not.toMatch(/unstable_cache|"use cache"|cacheTag|cacheLife|updateTag/);
    expect(source).not.toMatch(/\bRedis\b|\bUpstash\b/);
  });
});

describe("RUN A audit — no title-transfer / no warehouse-progression status anywhere in this run's own files", () => {
  it.each(RUN_A_FILES)("%s never references inventory_ownership_events", async (path) => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync(path, "utf8"));
    expect(source).not.toMatch(/inventory_ownership_events/);
  });

  it("the shipment actions file never writes a warehouse-owned status (CAPACITY_CONFIRMED/READY/RESERVED/PICKING/BOOKED/DISPATCHED/...)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/orders/[orderId]/shipment/actions.ts", "utf8");
    for (const forbidden of ["CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED", "DISPATCHED", "PARTIALLY_DELIVERED", "DELIVERED", "CANCELLED", "FAILED", "DISPUTED"]) {
      expect(source).not.toContain(`"${forbidden}"`);
    }
  });
});

describe("RUN A audit — no application-side financial computation", () => {
  // `lib/orders/read.ts` legitimately PASSES THROUGH `order_financials`' own column names (that is
  // its entire job, FR-010) — excluded here; the requirement is no ARITHMETIC recomputation, which
  // this same describe block's second test checks for directly in that file.
  const filesThatMustNeverMentionFinancialColumns = RUN_A_FILES.filter((path) => path !== "lib/orders/read.ts");

  it("no UI/action/write file in this run recomputes or even mentions base/shipping/vat/commission/buyer totals", async () => {
    const { readFileSync } = await import("node:fs");
    for (const path of filesThatMustNeverMentionFinancialColumns) {
      const source = stripComments(readFileSync(path, "utf8"));
      expect(source).not.toMatch(/base_subtotal|buyer_total_amount|commission_amount|vat_amount|seller_net_amount/i);
    }
  });

  it("read.ts's own financial pass-through never combines two financial/quantity fields with arithmetic", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/orders/read.ts", "utf8"));
    expect(source).not.toMatch(/base_subtotal\s*[+*]|buyer_total_amount\s*[+*]|\+\s*row\.\w*amount/i);
  });
});

describe("RUN A audit — no client-trusted organization/status authority in the Server Action allowlists", () => {
  it("drafts.ts's orders insert never includes a client-suppliable status/organization override", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/orders/drafts.ts", "utf8"));
    expect(source).toMatch(/\.insert\(\{\s*buyer_organization_id:\s*organizationId,\s*created_by:\s*userId\s*\}\)/);
    expect(source).toMatch(/\.insert\(\{\s*order_id:\s*orderId,\s*offer_id:\s*offerId,\s*quantity_kg:\s*quantityKg\s*\}\)/);
  });
});
