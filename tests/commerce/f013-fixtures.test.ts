import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { F013_FIXTURES } from "@/tests/auth/fixture-session";
import { assertF013ComplianceActor, assertF013G1, assertF013G2, assertF013G3, assertF013SourceIds, classifyF013Source, F013_G1_DEPENDENCIES, F013_SOURCE, type F013SourceSnapshot } from "@/scripts/f013-provenance";

/**
 * Feature 013 T016 — the Feature 013 fixture tooling targets exact identities only.
 *
 * Static checks over scripts/seed-test-fixtures.ts (the F013 block): fixed ids in the reserved `13000000-` range,
 * `+f013-test@example.com` identities, no wildcard/pattern/range filter, no hard delete of any business row, an
 * explicit per-run approval gate and a project-ref check before any write, and constants mirrored exactly in
 * tests/auth/fixture-session.ts.
 */
const script = readFileSync("scripts/seed-test-fixtures.ts", "utf8").replace(/\r\n/g, "\n");
const block = script.slice(script.indexOf("// Feature 013 T016"), script.indexOf("async function main(): Promise<void> {"));
const cleanup = block.slice(block.indexOf("async function cleanupF013Fixtures"));
const prepare = block.slice(block.indexOf("async function prepareF013Fixtures"), block.indexOf("async function cleanupF013Fixtures"));

/**
 * The ONE hard-delete exception (owner-approved 2026-09-25, T025/T016): disposable PRE-FINANCIAL M1 proof orders only.
 * It lives in exactly one function, `deleteF013M1ProofOrders`; everything else in the block stays under the generic
 * "never hard-delete" rule.
 */
const EXCEPTION_NAME = "async function deleteF013M1ProofOrders(";
const functionText = (source: string, header: string) => {
  const start = source.indexOf(header);
  return start === -1 ? "" : source.slice(start, source.indexOf("\n}\n", start) + 3);
};
const exceptionFn = functionText(block, EXCEPTION_NAME);
/**
 * The SECOND named exception (owner-approved 2026-09-25, T031 "clean them up afterwards by exact id"): the two
 * disposable T031 proof destinations only, in `deleteF013T031ProofDestinations`.
 */
const T031_EXCEPTION_NAME = "async function deleteF013T031ProofDestinations(";
const t031ExceptionFn = functionText(block, T031_EXCEPTION_NAME);
const cleanupWithoutException = cleanup.replace(exceptionFn, "").replace(t031ExceptionFn, "");
/** Every condition the T031 destination exception must keep; each returned string is a violation. */
function t031ExceptionViolations(fn: string, source: string): string[] {
  const problems: string[] = [];
  if (!fn) return ["T031 exception function missing"];
  if ((fn.match(/\.delete\(\)/g) ?? []).length !== 1) problems.push("expected exactly one delete");
  if (!/await admin\.from\("delivery_destinations"\)\.delete\(\)\.in\("id", ids\)\.eq\("label", F013_T031_PROOF_LABEL\);/.test(fn)) problems.push("delete is not delivery_destinations by checked ids AND the proof label");
  if (!/await admin\.from\("delivery_destinations"\)\.select\("id, label, organization_id"\)\.in\("id", F013_T031_ALL_DESTINATION_IDS\);/.test(fn)) problems.push("candidates are not read by the exact id list");
  if (!/const ids = \(rows \?\? \[\]\)\.map\(\(row\) => row\.id as string\);/.test(fn)) problems.push("delete ids are not exactly the rows read");
  if (!/row\.label !== F013_T031_PROOF_LABEL/.test(fn)) problems.push("proof-label precondition missing");
  if (!/row\.organization_id !== ORGANIZATION_IDS\.buyerOnly && row\.organization_id !== ORGANIZATION_IDS\.buyerAndSeller/.test(fn)) problems.push("fixture-org precondition missing");
  if (!/admin\.from\("orders"\)\.select\("id", \{ count: "exact", head: true \}\)\.in\("delivery_destination_id", ids\)[\s\S]*?if \(\(count \?\? 0\) !== 0\) problems\.push/.test(fn)) problems.push("order-reference precondition missing");
  const refusal = fn.indexOf("if (problems.length > 0) throw new SafeFixtureError");
  if (refusal === -1 || refusal > fn.indexOf(".delete()")) problems.push("refusal does not precede the delete");
  const ids = /const F013_T031_DESTINATION_IDS = \{([\s\S]*?)\} as const;/.exec(source)?.[1] ?? "";
  const literal = [...ids.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  if (literal.length !== 2 || !literal.every((id) => /^13000000-0000-4000-8000-0000000002[0-9a-f]{2}$/.test(id))) problems.push("proof destination ids are not the 2 exact reserved 13000000-…-0000000002xx ids");
  if (!/const F013_T031_ALL_DESTINATION_IDS = Object\.values\(F013_T031_DESTINATION_IDS\);/.test(source)) problems.push("F013_T031_ALL_DESTINATION_IDS is not exactly the proof id list");
  if (!/const F013_T031_PROOF_LABEL = "F013 T031 PROOF FIXTURE";/.test(source)) problems.push("proof label changed");
  return problems;
}
/** Tables that reference public.orders(id), except order_status_history (the only child a proof order may have). */
function tablesReferencingOrders(): string[] {
  const files = ["supabase/trading_schema.sql", ...readdirSync("supabase/migrations").map((f: string) => `supabase/migrations/${f}`)];
  const tables = new Set<string>();
  for (const file of files) {
    const sql = readFileSync(file, "utf8");
    for (const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      if (/\breferences public\.orders\(id\)/.test(m[2]!)) tables.add(m[1]!);
    }
    for (const m of sql.matchAll(/alter table public\.(\w+)[^;]*?\badd column \w+ uuid[^;,]*references public\.orders\(id\)/g)) tables.add(m[1]!);
  }
  tables.delete("order_status_history");
  return [...tables].sort();
}
/** Every condition the exception must keep; each returned string is a violation. */
function exceptionViolations(fn: string, source: string): string[] {
  const problems: string[] = [];
  if (!fn) return ["exception function missing"];
  const deletes = [...fn.matchAll(/\.delete\(\)/g)];
  if (deletes.length !== 1) problems.push(`expected exactly one delete, found ${deletes.length}`);
  if (!/await admin\.from\("orders"\)\.delete\(\)\.in\("id", ids\)\.eq\("correlation_id", F013_M1_PROOF_MARKER\);/.test(fn)) problems.push("delete is not orders by exact proof ids AND the proof marker");
  if (!/const \{ data: orders, error \} = await admin\.from\("orders"\)\.select\("id, correlation_id, buyer_organization_id"\)\.in\("id", F013_M1_ALL_IDS\);/.test(fn)) problems.push("candidate ids are not read by the exact F013_M1_ALL_IDS list");
  if (!/const ids = \(orders \?\? \[\]\)\.map\(\(order\) => order\.id as string\);/.test(fn)) problems.push("delete ids are not exactly the rows read");
  if (!/order\.correlation_id !== F013_M1_PROOF_MARKER/.test(fn)) problems.push("proof-marker precondition missing");
  if (!/order\.buyer_organization_id !== ORGANIZATION_IDS\.buyerOnly/.test(fn)) problems.push("fixture-org precondition missing");
  if (!/for \(const table of F013_M1_ORDER_DEPENDENTS\)[\s\S]*?\.in\("order_id", ids\)[\s\S]*?if \(\(count \?\? 0\) !== 0\) problems\.push/.test(fn)) problems.push("dependent-row precondition missing");
  const refusal = fn.indexOf("if (problems.length > 0) throw new SafeFixtureError");
  if (refusal === -1 || refusal > fn.indexOf(".delete()")) problems.push("refusal does not precede the delete");
  const ids = /const F013_M1_ORDER_IDS = \{([\s\S]*?)\} as const;/.exec(source)?.[1] ?? "";
  const literal = [...ids.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  if (literal.length !== 10 || !literal.every((id) => /^13000000-0000-4000-8000-0000000001[0-9a-f]{2}$/.test(id))) problems.push("proof ids are not the 10 exact reserved 13000000-…-0000000001xx ids");
  if (!/const F013_M1_ALL_IDS = Object\.values\(F013_M1_ORDER_IDS\);/.test(source)) problems.push("F013_M1_ALL_IDS is not exactly the proof id list");
  if (!/const F013_M1_PROOF_MARKER = "13000000-0000-4000-8000-0000000001ff";/.test(source)) problems.push("proof marker changed");
  const dependents = /const F013_M1_ORDER_DEPENDENTS = \[([\s\S]*?)\] as const;/.exec(source)?.[1] ?? "";
  const listed = [...dependents.matchAll(/"(\w+)"/g)].map((m) => m[1]!).sort();
  if (JSON.stringify(listed) !== JSON.stringify(tablesReferencingOrders())) problems.push(`dependent list ${listed.join(",")} != tables referencing orders ${tablesReferencingOrders().join(",")}`);
  return problems;
}

describe("T016 — Feature 013 fixtures are exact-identity only", () => {
  it("every fixed id is in the reserved 13000000- range and unique", () => {
    const ids = [...block.matchAll(/"(13000000-0000-4000-8000-[0-9a-f]{12})"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(20);
    expect(new Set(ids).size).toBe(ids.length);
    const anyOtherUuid = block.match(/"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g)?.filter((u) => !u.startsWith('"13000000-'));
    expect(anyOtherUuid ?? []).toEqual([]);
  });

  it("every identity is a reserved example.com +f013-test address", () => {
    const emails = [...block.matchAll(/email: "([^"]+)"/g)].map((m) => m[1]!);
    expect(emails).toHaveLength(8);
    for (const email of emails) expect(email).toMatch(/^[a-z0-9-]+\+f013-test@example\.com$/);
  });

  it("uses no wildcard, pattern or range filter anywhere in the F013 block", () => {
    expect(block).not.toMatch(/\.(like|ilike|neq|gt|gte|lt|lte|not|or|match|textSearch)\(/);
  });

  it("cleanup never hard-deletes a business or financial row (operator de-privilege goes through the existing helper)", () => {
    // Generic rule, unchanged: the only code allowed to delete is the one named proof-fixture exception below.
    expect(cleanupWithoutException).not.toMatch(/\.delete\(/);
    expect(cleanup).toMatch(/cleanupDisposableOperatorFixture\(admin, operator\)/);
    for (const call of cleanup.matchAll(/\.update\([^)]*\)\.eq\("id", ([^)]+)\)/g)) {
      expect(call[1]).toMatch(/^(orgId|listing\.offer|F013_FIXTURE_IDS\.[A-Za-z0-9]+|F013_M1_ORDER_IDS\[key\])$/);
    }
  });

  it("the block has exactly two hard deletes, one inside each named proof-fixture exception", () => {
    expect((block.match(/\.delete\(/g) ?? []).length).toBe(2);
    expect((exceptionFn.match(/\.delete\(/g) ?? []).length).toBe(1);
    expect((t031ExceptionFn.match(/\.delete\(/g) ?? []).length).toBe(1);
  });

  it("the T031 proof-destination exception keeps every condition (exact ids, proof label, fixture orgs, unreferenced, refusal first)", () => {
    expect(t031ExceptionViolations(t031ExceptionFn, block)).toEqual([]);
  });

  it.each([
    ["delete without the proof label", (s: string) => s.replace('.eq("label", F013_T031_PROOF_LABEL);', ";")],
    ["delete of a different table", (s: string) => s.replace('admin.from("delivery_destinations").delete()', 'admin.from("orders").delete()')],
    ["delete by the raw id list", (s: string) => s.replace('.delete().in("id", ids)', '.delete().in("id", F013_T031_ALL_DESTINATION_IDS)')],
    ["no refusal before the delete", (s: string) => s.replace("if (problems.length > 0) throw new SafeFixtureError", "if (false) console.log")],
    ["order-reference check removed", (s: string) => s.replace("if ((count ?? 0) !== 0) problems.push", "if (false) problems.push")],
    ["label check removed", (s: string) => s.replace("row.label !== F013_T031_PROOF_LABEL", "false")],
    ["a second delete", (s: string) => s.replace("return ids.length;", 'await admin.from("delivery_destinations").delete().in("id", ids);\n  return ids.length;')],
  ])("the T031 exception check rejects: %s", (_label, mutate) => {
    expect(t031ExceptionViolations(mutate(t031ExceptionFn), block).length).toBeGreaterThan(0);
  });

  it("T031 setup writes the proof label on every destination and never touches orders", () => {
    const setup = functionText(block, "async function setupF013T031(");
    expect(setup).toContain("label: F013_T031_PROOF_LABEL,");
    expect(setup).not.toMatch(/from\("orders"\)/);
  });

  it("the proof-fixture exception keeps every owner-approved condition (exact ids, proof marker, fixture org, no dependent row, refusal first)", () => {
    expect(exceptionViolations(exceptionFn, block)).toEqual([]);
  });

  it("every proof order is stamped with the proof marker by the dedicated setup/probe commands", () => {
    const setup = functionText(block, "async function setupF013M1LiveOrders(");
    const probe = functionText(block, "async function probeF013M1Transitions(");
    expect(setup).toContain("correlation_id: F013_M1_PROOF_MARKER,");
    expect(probe).toContain("correlation_id: F013_M1_PROOF_MARKER });");
    // the two M1 proof inserts, plus the three LOCAL-only service_role LEGACY fixture paths (T071)
    expect((block.match(/admin\.from\("orders"\)\.insert\(/g) ?? []).length).toBe(5);
    const localWriters = ["async function prepareF013Provenance(", "async function prepareF013T071Run(", "async function createLegacyFixtureDraft("].map((header) => functionText(block, header));
    for (const fn of localWriters) {
      expect((fn.match(/admin\.from\("orders"\)\.insert\(/g) ?? []).length).toBeGreaterThan(0);
      expect(fn.indexOf("assertF013LocalWrite();")).toBeGreaterThan(-1);
      expect(fn.indexOf("assertF013LocalWrite();")).toBeLessThan(fn.indexOf(".insert("));
    }
  });

  it.each([
    ["delete without the proof marker", (s: string) => s.replace('.eq("correlation_id", F013_M1_PROOF_MARKER);', ";")],
    ["delete of a different table", (s: string) => s.replace('admin.from("orders").delete()', 'admin.from("payments").delete()')],
    ["delete by the raw id list instead of the checked rows", (s: string) => s.replace('.delete().in("id", ids)', '.delete().in("id", F013_M1_ALL_IDS)')],
    ["no refusal before the delete", (s: string) => s.replace("if (problems.length > 0) throw new SafeFixtureError", "if (false) console.log")],
    ["dependent-row check removed", (s: string) => s.replace("if ((count ?? 0) !== 0) problems.push", "if (false) problems.push")],
    ["marker check removed", (s: string) => s.replace("order.correlation_id !== F013_M1_PROOF_MARKER", "false")],
    ["a second delete", (s: string) => s.replace("return ids.length;", 'await admin.from("orders").delete().in("id", ids);\n  return ids.length;')],
  ])("the exception check rejects: %s", (_label, mutate) => {
    expect(exceptionViolations(mutate(exceptionFn), block).length).toBeGreaterThan(0);
  });

  it.each([
    ["a dependent table dropped from the list", (s: string) => s.replace(/(const F013_M1_ORDER_DEPENDENTS = \[[\s\S]*?)"payouts", /, "$1")],
    ["a non-reserved proof id", (s: string) => s.replace('"13000000-0000-4000-8000-000000000101"', '"f0000000-0000-4000-8000-000000000101"')],
    ["a different marker", (s: string) => s.replace('F013_M1_PROOF_MARKER = "13000000-0000-4000-8000-0000000001ff"', 'F013_M1_PROOF_MARKER = "13000000-0000-4000-8000-0000000001fe"')],
  ])("the exception check rejects a source change: %s", (_label, mutate) => {
    expect(exceptionViolations(exceptionFn, mutate(block)).length).toBeGreaterThan(0);
  });

  it("prepare retains its per-run approval and delegates target refusal to the shared guard", () => {
    expect(prepare.indexOf("assertF013Project()")).toBeGreaterThan(-1);
    expect(prepare.indexOf('F013_FIXTURES_APPROVED !== "1"')).toBeGreaterThan(prepare.indexOf("assertF013Project()"));
    expect(prepare.indexOf('F013_FIXTURES_APPROVED !== "1"')).toBeLessThan(prepare.indexOf("await upsert("));
    expect(script).toContain('from "./f013-local-target"');
    expect(block).not.toContain('const F013_PROJECT_REF = "mxejnutukgxyccnohglo"');
    const main = script.slice(script.indexOf("async function main(): Promise<void> {"));
    expect(main.indexOf("const mode = resolveF013Mode()")).toBeGreaterThan(-1);
    expect(main.indexOf("const target = requireF013LocalTarget()")).toBeLessThan(main.indexOf("loadEnvLocal()"));
    expect(main.indexOf("const target = requireF013LocalTarget()")).toBeLessThan(main.indexOf("const admin = createAdminClient()"));
    expect(main).toContain("F013_LOCAL_WRITE_FLAGS.has(f013Flag)");
    expect(main).toContain('F013_FIXTURES_APPROVED !== "1"');
  });

  it("preparation never activates global F013 configuration or fabricates member stock", () => {
    expect(prepare).not.toMatch(/insertIfAbsent\("(payment_accounts|shipping_rules|commission_policies|commission_tiers)"/);
    expect(prepare).toContain('if (listing.sellerType === "MEMBER_SELLER")');
    expect(prepare).toContain("available_quantity_kg: 0, reserved_quantity_kg: 0");
    expect(prepare).toContain("await inspectF013G1(admin)");
    expect(prepare).toContain("await inspectF013G3(admin)");
    expect(prepare).toContain("await inspectF013G2(admin)");
    expect(prepare).not.toContain('status: "PUBLISHED"');
  });

  it("tests/auth/fixture-session.ts mirrors the script's identities and ids exactly", () => {
    for (const member of Object.values(F013_FIXTURES.members)) {
      expect(block).toContain(`email: "${member.email}"`);
      expect(block).toContain(`"${member.organizationId}"`);
    }
    for (const operator of Object.values(F013_FIXTURES.operators)) {
      expect(block).toContain(`email: "${operator.email}"`);
      expect(block).toContain(`platformAdminRole: "${operator.role}"`);
    }
    for (const id of [...Object.values(F013_FIXTURES.offers), ...Object.values(F013_FIXTURES.warehouses), ...Object.values(F013_FIXTURES.config), F013_FIXTURES.hillsOrganizationId]) {
      expect(block).toContain(`"${id}"`);
    }
  });
});

const emptySnapshot = (): F013SourceSnapshot => ({
  orders: [], items: [], payments: [], reviews: [], proformas: [], reservations: [], reservationItems: [],
  ownershipEvents: [], allocations: [], positions: [], hillsPositions: [], payouts: [], taxInvoices: [], notifications: [],
});

function completeSnapshot(): F013SourceSnapshot {
  const rows = emptySnapshot();
  const s1 = "13000000-0000-4000-8000-000000000003";
  const s2 = "13000000-0000-4000-8000-000000000004";
  const hills = "13000000-0000-4000-8000-000000000005";
  const w1 = "13000000-0000-4000-8000-000000000021";
  const w2 = "13000000-0000-4000-8000-000000000022";
  const specs = [
    { id: F013_SOURCE.items.s1w1, order: F013_SOURCE.orders.s1, offer: F013_SOURCE.hillsOffers.w1, lot: F013_SOURCE.hillsLots.w1, buyer: s1, warehouse: w1, position: "13000000-0000-4000-8000-000000000051", qty: 500, reservation: "res1" },
    { id: F013_SOURCE.items.s1w2, order: F013_SOURCE.orders.s1, offer: F013_SOURCE.hillsOffers.w2, lot: F013_SOURCE.hillsLots.w2, buyer: s1, warehouse: w2, position: "13000000-0000-4000-8000-000000000054", qty: 50, reservation: "res1" },
    { id: F013_SOURCE.items.s2w2, order: F013_SOURCE.orders.s2, offer: F013_SOURCE.hillsOffers.w2, lot: F013_SOURCE.hillsLots.w2, buyer: s2, warehouse: w2, position: "13000000-0000-4000-8000-000000000052", qty: 300, reservation: "res2" },
  ];
  rows.orders = [
    { id: F013_SOURCE.orders.s1, order_code: "F013-SRC-S1", correlation_id: F013_SOURCE.markers.s1, commerce_flow: "LEGACY", buyer_organization_id: s1, status: "PAID" },
    { id: F013_SOURCE.orders.s2, order_code: "F013-SRC-S2", correlation_id: F013_SOURCE.markers.s2, commerce_flow: "LEGACY", buyer_organization_id: s2, status: "PAID" },
  ];
  rows.payments = [{ id: "pay1", order_id: F013_SOURCE.orders.s1, status: "CONFIRMED" }, { id: "pay2", order_id: F013_SOURCE.orders.s2, status: "CONFIRMED" }];
  rows.reviews = [{ id: "review1", payment_id: "pay1", decision: "CONFIRMED" }, { id: "review2", payment_id: "pay2", decision: "CONFIRMED" }];
  rows.proformas = [{ id: "pi1", order_id: F013_SOURCE.orders.s1, status: "PAID" }, { id: "pi2", order_id: F013_SOURCE.orders.s2, status: "PAID" }];
  rows.reservations = [{ id: "res1", order_id: F013_SOURCE.orders.s1, status: "CONSUMED" }, { id: "res2", order_id: F013_SOURCE.orders.s2, status: "CONSUMED" }];
  for (const spec of specs) {
    rows.items.push({ id: spec.id, order_id: spec.order, offer_id: spec.offer, lot_id: spec.lot, seller_organization_id: hills, seller_type_snapshot: "HILLS", quantity_kg: spec.qty });
    rows.reservationItems.push({ id: spec.id, reservation_id: spec.reservation, offer_id: spec.offer, quantity_kg: spec.qty });
    rows.ownershipEvents.push({ id: `event-${spec.id}`, order_item_id: spec.id, event_type: "SALE", from_organization_id: hills, to_organization_id: spec.buyer, lot_id: spec.lot, quantity_kg: spec.qty });
    rows.allocations.push({ id: `allocation-${spec.id}`, order_item_id: spec.id, status: "STORED", owner_organization_id: spec.buyer, lot_id: spec.lot, warehouse_id: spec.warehouse, quantity_kg: spec.qty });
    rows.positions.push({ id: spec.position, owner_organization_id: spec.buyer, lot_id: spec.lot, warehouse_id: spec.warehouse, available_quantity_kg: spec.qty, reserved_quantity_kg: 0 });
  }
  rows.hillsPositions = [
    { id: F013_SOURCE.hillsPositions.w1, owner_organization_id: hills, lot_id: F013_SOURCE.hillsLots.w1, available_quantity_kg: 0, reserved_quantity_kg: 0 },
    { id: F013_SOURCE.hillsPositions.w2, owner_organization_id: hills, lot_id: F013_SOURCE.hillsLots.w2, available_quantity_kg: 0, reserved_quantity_kg: 0 },
  ];
  return rows;
}

describe("T016 retained LEGACY provenance — guard mutations", () => {
  it("pins every source id to unique reserved 16xx UUIDs", () => {
    expect(() => assertF013SourceIds()).not.toThrow();
    const ids = Object.values(F013_SOURCE).flatMap((group) => Object.values(group));
    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids.every((id) => /^13000000-0000-4000-8000-0000000016[0-9a-f]{2}$/.test(id))).toBe(true);
  });

  const cleanPosition = { id: "13000000-0000-4000-8000-000000000051", owner_organization_id: "13000000-0000-4000-8000-000000000003", lot_id: "13000000-0000-4000-8000-000000000041", warehouse_id: "13000000-0000-4000-8000-000000000021", available_quantity_kg: 500, reserved_quantity_kg: 0 };
  const noDependencies = Object.fromEntries(F013_G1_DEPENDENCIES.map((key) => [key, 0]));
  it("G1 admits only the exact isolated known residue", () => {
    expect(() => assertF013G1(cleanPosition, noDependencies)).not.toThrow();
    expect(() => assertF013G1(cleanPosition, {})).toThrow(/incomplete/);
  });
  it.each(["offers", "ownershipEvents", "allocations", "orderItems", "reservationItems", "varianceEvents", "positionReservations"])("G1 refuses a %s dependent", (key) => {
    expect(() => assertF013G1(cleanPosition, { ...noDependencies, [key]: 1 })).toThrow(/G1/);
  });
  it("G1 refuses unrelated ids, owner, lot, warehouse, reserved stock and arbitrary positive stock", () => {
    for (const mutation of [
      { id: F013_SOURCE.hillsPositions.w1 }, { owner_organization_id: "other" }, { lot_id: "other" },
      { warehouse_id: "other" }, { reserved_quantity_kg: 1 }, { available_quantity_kg: 499 },
    ]) expect(() => assertF013G1({ ...cleanPosition, ...mutation }, noDependencies)).toThrow(/G1/);
  });
  it("G2 refuses any outside authorized member", () => {
    expect(() => assertF013G2([])).not.toThrow();
    expect(() => assertF013G2([{ id: "outside" }])).toThrow(/G2/);
  });
  it.each(["checkoutEnabled", "commissionActive", "shippingActive", "paymentAccountActive", "paymentAccountDefault"] as const)("G3 refuses %s", (key) => {
    const safe = { checkoutEnabled: false, commissionActive: false, shippingActive: false, paymentAccountActive: false, paymentAccountDefault: false };
    expect(() => assertF013G3(safe)).not.toThrow();
    expect(() => assertF013G3({ ...safe, [key]: true })).toThrow(/G3/);
  });
  it("cannot use a non-compliance session to suspend or republish", () => {
    expect(() => assertF013ComplianceActor("COMPLIANCE")).not.toThrow();
    expect(() => assertF013ComplianceActor("ADMIN")).not.toThrow();
    expect(() => assertF013ComplianceActor("service_role")).toThrow(/compliance/);
  });
  it("absent is distinct from drift, and drift never becomes resumable", () => {
    expect(classifyF013Source(emptySnapshot()).state).toBe("ABSENT");
    const unexpected = emptySnapshot();
    unexpected.orders.push({ id: F013_SOURCE.orders.s1, commerce_flow: "BANK_TRANSFER_V1" });
    expect(classifyF013Source(unexpected).state).toBe("DRIFTED");
    const payout = emptySnapshot();
    payout.payouts.push({ id: "payout" });
    expect(classifyF013Source(payout).state).toBe("DRIFTED");
  });
  it("classifies all four rerun states and refuses a zero-payout mutation", () => {
    expect(classifyF013Source(emptySnapshot()).state).toBe("ABSENT");
    const partial = completeSnapshot();
    partial.orders[0]!.status = "HOLD";
    expect(classifyF013Source(partial).state).toBe("IN_PROGRESS_RESUMABLE");
    const complete = completeSnapshot();
    expect(classifyF013Source(complete).state).toBe("COMPLETE_VALID");
    complete.payouts.push({ id: "unexpected-payout", order_id: F013_SOURCE.orders.s1 });
    expect(classifyF013Source(complete).state).toBe("DRIFTED");
  });
  it("drifts if source buyer, Hills seller, stock or financial evidence mutates", () => {
    const mutate = [
      (s: F013SourceSnapshot) => { s.orders[0]!.buyer_organization_id = "other"; },
      (s: F013SourceSnapshot) => { s.items[0]!.seller_organization_id = "13000000-0000-4000-8000-000000000004"; },
      (s: F013SourceSnapshot) => { s.hillsPositions[0]!.available_quantity_kg = 1; },
      (s: F013SourceSnapshot) => { s.taxInvoices.push({ id: "unexpected-invoice" }); },
      (s: F013SourceSnapshot) => { s.notifications.push({ id: "unexpected-event" }); },
    ];
    for (const change of mutate) { const snapshot = completeSnapshot(); change(snapshot); expect(classifyF013Source(snapshot).state).toBe("DRIFTED"); }
  });
  it("retained financial history has no hard-delete path", () => {
    const source = readFileSync("scripts/f013-provenance.ts", "utf8");
    expect(source).not.toMatch(/\.delete\(|\bdelete\s+from\b/i);
    expect(block.match(/\.delete\(/g)).toHaveLength(2); // unchanged exact-id historical exceptions
  });
  it("the local provenance writer is local-only, reuses only a complete chain and never continues a partial one", () => {
    const fn = functionText(block, "async function prepareF013Provenance(");
    const firstWrite = fn.indexOf(".insert(");
    expect(fn.indexOf("assertF013LocalWrite();")).toBeGreaterThan(-1);
    expect(fn.indexOf("assertF013LocalWrite();")).toBeLessThan(firstWrite);
    expect(fn.indexOf("await validateF013Provenance(admin)")).toBeLessThan(firstWrite);
    expect(fn).toContain('if (before.classification.state === "COMPLETE_VALID") return');
    expect(fn).toContain("a partial LEGACY chain is never continued automatically");
    expect(fn).toContain('if (after.classification.state !== "COMPLETE_VALID")');
    // real primitives only: member RLS writes, the real checkout/proof/review RPCs, graph transitions guarded by status
    for (const rpc of ['rpc("checkout_order"', 'rpc("submit_payment_proof"', 'rpc("admin_review_payment"']) expect(fn).toContain(rpc);
    expect(fn).not.toMatch(/\.delete\(|\.upsert\(|status: "PUBLISHED"|status: "PAID"|is_hills_internal|session_replication_role|disable trigger/i);
    expect(fn).not.toMatch(/admin\.from\("(orders|order_shipments|coffee_offers|payments|inventory_positions)"\)\.update\(/);
    const guard = functionText(block, "function assertF013LocalWrite(");
    expect(guard).toContain("activeF013ProjectRef !== F013_LOCAL_PROJECT_ID || !activeF013LocalTarget");
    expect(guard).toContain('process.env.F013_FIXTURES_APPROVED !== "1"');
  });
  it("listings are published only through the review graph by a real operator session, never inserted as PUBLISHED", () => {
    const fn = functionText(block, "async function publishF013OfferLocally(");
    expect(fn.indexOf("assertF013LocalWrite();")).toBeGreaterThan(-1);
    expect(fn).toContain('[["DRAFT", "PENDING_REVIEW"], ["PENDING_REVIEW", "APPROVED"], ["APPROVED", "PUBLISHED"]]');
    expect(fn).toContain('statusClient.from("coffee_offers").update({ status: to }).eq("id", offerId).eq("status", from).select("id"), 1)');
    expect(fn).not.toContain('admin.from("coffee_offers").update(');
  });
  it("the legacy-suite LEGACY draft path is local-only, exact-org, member-checked and writes one LEGACY DRAFT", () => {
    const fn = functionText(block, "async function createLegacyFixtureDraft(");
    expect(block).toContain("const LEGACY_FIXTURE_DRAFT_ORGS: readonly string[] = [ORGANIZATION_IDS.buyerOnly, ORGANIZATION_IDS.buyerAndSeller];");
    expect(block).toContain("const LEGACY_SYNTHETIC_TEST_DRAFT_ORGS: readonly string[] = [PHASE89_ORGANIZATION_IDS.suspended];");
    expect(fn.indexOf("assertF013LocalWrite();")).toBeLessThan(fn.indexOf("const approvedOrganization ="));
    expect(fn).toContain("LEGACY_FIXTURE_DRAFT_ORGS.includes(organizationId) || LEGACY_SYNTHETIC_TEST_DRAFT_ORGS.includes(organizationId)");
    expect(fn.indexOf('.eq("is_active", true)')).toBeLessThan(fn.indexOf(".insert("));
    expect(fn).toContain('.insert({ buyer_organization_id: organizationId, created_by: userId, status: "DRAFT", commerce_flow: "LEGACY" })');
    expect((fn.match(/\.insert\(/g) ?? []).length).toBe(1);
    expect(fn).not.toMatch(/\.update\(|\.upsert\(|\.delete\(/);
  });
  it("the T071 run writer is local-only and the T071 state inspector is read-only", () => {
    const run = functionText(block, "async function prepareF013T071Run(");
    expect(run.indexOf("assertF013LocalWrite();")).toBeGreaterThan(-1);
    expect(run.indexOf("assertF013LocalWrite();")).toBeLessThan(run.indexOf(".insert("));
    expect(run).not.toMatch(/\.delete\(|\.upsert\(|bank_transfer_checkout_enabled/);
    const inspect = functionText(block, "async function inspectF013T071State(");
    expect(inspect).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  });
  it("the historical destination snapshot fixture is local-only, approval-gated and uses the real M2a guard", () => {
    const fn = functionText(block, "async function prepareF013T071SnapshotOrder(");
    expect(script).toContain('"--prepare-f013-t071-snapshot-order"');
    expect(fn.indexOf("assertF013LocalWrite();")).toBeGreaterThan(-1);
    expect(fn.indexOf("assertF013LocalWrite();")).toBeLessThan(fn.indexOf("runF013DockerPsqlStdin("));
    expect(fn).toContain("set local role service_role;");
    expect(fn).toContain("set local app.internal_transition = 'true';");
    expect(fn).toContain("from public.delivery_destinations d");
    expect(fn).toContain("d.is_default and d.retired_at is null");
    expect(fn).toContain("get diagnostics v_inserted = row_count;");
    for (const field of ["label", "country_code", "city", "address_lines", "contact_name", "contact_phone", "delivery_method"]) {
      expect(fn).toContain(`'${field}'`);
    }
    expect(fn).not.toMatch(/disable trigger|disable row level security|session_replication_role|\.delete\(|\.upsert\(/i);
  });
});
