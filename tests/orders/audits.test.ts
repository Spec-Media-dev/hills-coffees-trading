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

/** Feature 007 RUN B (T008–T011) — `lib/orders/checkout.ts` is the ONE sanctioned `checkout_order()` caller. */
const RUN_B_FILES = [
  "lib/orders/checkout.ts",
  "src/app/dashboard/orders/[orderId]/checkout/actions.ts",
  "src/app/dashboard/orders/[orderId]/checkout/page.tsx",
  "components/orders/checkout-confirm-button.tsx",
  "components/orders/hold-countdown.tsx",
];

/** Feature 007 RUN C (T012–T018) — `lib/orders/expiry.ts` is the ONE sanctioned `expire_order_hold()` caller. */
const RUN_C_FILES = ["lib/orders/expiry.ts", "components/orders/financial-summary.tsx"];

const ALL_FILES = [...RUN_A_FILES, ...RUN_B_FILES, ...RUN_C_FILES];
const SOLE_CHECKOUT_CALLER = "lib/orders/checkout.ts";
const SOLE_EXPIRY_CALLER = "lib/orders/expiry.ts";

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("RUN A/B/C audit — checkout_order() and expire_order_hold() each have exactly one caller", () => {
  it.each(ALL_FILES.filter((path) => path !== SOLE_CHECKOUT_CALLER && path !== SOLE_EXPIRY_CALLER))("%s never calls checkout_order or expire_order_hold", async (path) => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync(path, "utf8"));
    expect(source).not.toMatch(/checkout_order/);
    expect(source).not.toMatch(/expire_order_hold/);
  });

  it("lib/orders/checkout.ts calls checkout_order exactly once and never expire_order_hold", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync(SOLE_CHECKOUT_CALLER, "utf8"));
    expect(source.match(/"checkout_order"/g)?.length).toBe(1);
    expect(source).not.toMatch(/expire_order_hold/);
  });

  it("lib/orders/expiry.ts calls expire_order_hold exactly once and never checkout_order", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync(SOLE_EXPIRY_CALLER, "utf8"));
    expect(source.match(/"expire_order_hold"/g)?.length).toBe(1);
    expect(source).not.toMatch(/checkout_order/);
  });

  it("a repo-wide grep (untracked included, comments stripped) finds checkout_order/expire_order_hold in code only in their two sole-caller files (T029's own future check, verified early)", async () => {
    const { execFileSync } = await import("node:child_process");
    const { readFileSync } = await import("node:fs");
    let output = "";
    try {
      output = execFileSync("git", ["grep", "-l", "--untracked", "-E", "checkout_order|expire_order_hold", "--", "lib", "src", "components"], { encoding: "utf8" });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 1) throw error;
    }
    const codeReferences = output
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((file) => /checkout_order|expire_order_hold/.test(stripComments(readFileSync(file, "utf8"))));
    expect(codeReferences.sort()).toEqual([SOLE_CHECKOUT_CALLER, SOLE_EXPIRY_CALLER]);
  });
});

describe("RUN A audit — no service-role, no shared cache, anywhere in this run's own files", () => {
  it.each(ALL_FILES)("%s never references a service-role key or a shared cache directive", async (path) => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync(path, "utf8"));
    expect(source).not.toMatch(/SERVICE_ROLE/);
    expect(source).not.toMatch(/unstable_cache|"use cache"|cacheTag|cacheLife|updateTag/);
    expect(source).not.toMatch(/\bRedis\b|\bUpstash\b/);
  });
});

describe("RUN A audit — no title-transfer / no warehouse-progression status anywhere in this run's own files", () => {
  it.each(ALL_FILES)("%s never references inventory_ownership_events", async (path) => {
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
  const filesThatMustNeverMentionFinancialColumns = ALL_FILES.filter((path) => path !== "lib/orders/read.ts");

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
