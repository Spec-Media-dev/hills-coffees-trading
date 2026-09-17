import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r/g, "");
const seed = read("scripts/seed-test-fixtures.ts");
const driver = read("scripts/t013-delivery-live-proof.ts");
const fixtureSession = read("tests/auth/fixture-session.ts");

describe("Feature 009 T013 live-proof hardening", () => {
  it("keeps FINANCE narrow and declares a separately opt-in disposable ADMIN fixture", () => {
    const financeStart = seed.indexOf('label: "finance-admin"');
    const financeBlock = seed.slice(financeStart, seed.indexOf("\n];", financeStart));
    expect(financeBlock).toContain('platformAdminRole: "FINANCE"');
    expect(financeBlock).not.toContain('platformAdminRole: "ADMIN"');
    expect(seed).toContain('const T013_DELIVERY_ADMIN_FIXTURE: Fixture');
    // The ADMIN capability is declared ON the fixture (`platformAdminRole`) and granted from it by the
    // shared `createDisposableOperatorFixture` (`insert({ …, role, … })`) — there is no hard-coded
    // `role: "ADMIN"` insert any more (Feature 010 RUN B refactor), so the check is scoped to the
    // T013 fixture block and requires exactly ADMIN, no organization, and the opt-in email.
    const t013Start = seed.indexOf("const T013_DELIVERY_ADMIN_FIXTURE: Fixture");
    const t013Block = seed.slice(t013Start, seed.indexOf("\n};", t013Start));
    expect(t013Block).toContain('email: "delivery-admin+t013-test@example.com"');
    expect(t013Block).toContain("organization: null");
    expect(t013Block).toContain('platformAdminRole: "ADMIN"');
    expect(t013Block).not.toContain('platformAdminRole: "SUPER_ADMIN"');
    expect(seed).toContain("await createDisposableOperatorFixture(admin, password, T013_DELIVERY_ADMIN_FIXTURE,");
    expect(seed).not.toMatch(/insert\(\{[^}]*role: "ADMIN"/);
    expect(fixtureSession).toContain('deliveryAdmin:');
    expect(fixtureSession).toContain("platform_admins.role = 'FINANCE'");
  });

  it("makes T013 preparation and cleanup exact-scope operations, not generic delivery-offer deletion", () => {
    const deliverySection = seed.slice(seed.indexOf("// 009-delivery-shipments RUN A2 T013 fixtures"), seed.indexOf("// Supabase admin access"));
    expect(deliverySection).toContain('const T013_ORDER_PREFIX = "T013-ORD-"');
    expect(deliverySection).toContain('T013 cleanup scope mismatch; refusing to mutate any fixture row.');
    expect(deliverySection).toContain('deleteExactIds(admin, "orders", orderIds, "orders")');
    expect(deliverySection).toContain('businessFixtureResidue: "zero"');
    expect(deliverySection).toContain('retainedImmutableOwnershipEvents');
    expect(deliverySection).not.toContain('deleteOrdersReferencingOffer');
  });

  it("documents the live submit_payment_proof()/validate_order_transition() incompatibility this run discovered, and advances the order through the SAME state-machine-permitted transitions submit_payment_proof() itself would need, via the disposable ADMIN fixture — not a buyer or FINANCE impersonation, and not an unreviewed fix to the unrelated live function", () => {
    expect(driver).toContain('async function checkoutAndSubmitPaymentProof');
    expect(driver).toContain("own body issues exactly one order update");
    expect(driver).toContain('empirically reproduced against the real database, not assumed');
    expect(driver).toContain('status: "PAYMENT_PROOF_SUBMITTED"');
    expect(driver).toContain('status: "PAYMENT_UNDER_REVIEW"');
    expect(driver).toContain('reviewPayment(s.finance, paymentId, true)');
  });

  it("proves independent competition, direct duplicate cancellation, and delivery-reserved resale denial", () => {
    expect(driver).toContain('buyerCompeting: SupabaseClient');
    expect(driver).toContain('Promise.allSettled([\n    addShipmentItem(s.buyer, shipmentA');
    expect(driver).toContain('const duplicateCancel = await updateShipmentStatus');
    expect(driver).toContain('scenario17_resaleDeniedAgainstDeliveryReservation');
    expect(driver).toContain('delivery-reserved resale denial');
    expect(driver).toContain('member resale/listing against delivery-reserved stock is refused by the live database');
  });

  it("retries an actual 40P01 from fresh real sessions and always cleans the disposable ADMIN capability", () => {
    expect(driver).toContain('if (cancelDeadlock)');
    expect(driver).toContain('const retryWarehouse = await signInAsFixture');
    expect(driver).toContain('if (settleDeadlock)');
    expect(driver).toContain('const retryFinance = await signInAsFixture');
    expect(driver).toContain('finally {');
    expect(driver).toContain('"--cleanup-t013-live-fixtures"');
    expect(driver).not.toMatch(/createClient\([^]*SUPABASE_SERVICE_ROLE_KEY/);
  });
});
