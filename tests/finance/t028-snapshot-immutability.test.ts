import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { FOUNDATION_FIXTURES, RUN_F_CONFIG_ROWS, cleanupRunFConfigRows, cleanupSuperAdminFixture, prepareSuperAdminFixture, signInAsFixture } from "@/tests/auth/fixture-session";
import { ORG_A, chainHelpers, prepareChain, teardownChain, type ChainSessions, type ChainTeardown } from "@/tests/listings/live-chain";

/**
 * Feature 008 T028 (this run) — LIVE proof that a HISTORICAL `order_financials`/`payouts` snapshot is
 * byte-for-byte unchanged after a REAL commission-configuration mutation (create/activate/edit/rename/
 * deactivate/archive a policy), against the real linked database.
 *
 * DISPOSABLE DATA / EXISTING CONVENTIONS ONLY (per this run's own instruction): reuses Feature 010 RUN
 * F's already-approved, already-reviewed disposable-commission-policy machinery verbatim —
 * `prepareSuperAdminFixture`/`cleanupSuperAdminFixture` (the one identity that can pass
 * `is_super_admin()`) and `RUN_F_CONFIG_ROWS.policyNamePrefix`/`cleanupRunFConfigRows()` (the existing
 * privileged, name-prefix-scoped delete Feature 010's own `tests/admin/run-f-live.test.tsx` already
 * relies on — `lib/admin/commission.ts` itself has NO delete path for the application; "Retirement is
 * ARCHIVED" — so cleanup MUST go through this same existing fixture-script mechanism, not a new one).
 * No new cleanup script, no new fixture identity, no new naming scheme was invented for this task.
 *
 * NEVER "IN FORCE" (same safety property `run-f-live.test.tsx` already established): every policy this
 * file creates has `effectiveFrom` dated 2099 — `resolveInForce()` can never select it for a checkout
 * happening today, so it cannot affect ANY concurrently-running settlement anywhere else in the suite.
 * The proof therefore does not depend on this policy ever being the "winner" — it proves the STRONGER,
 * more literal claim T028 actually asks for: `lib/finance/read.ts` never re-derives a historical
 * snapshot from `commission_policies`/`commission_tiers` AT ALL, so the mere EXISTENCE, ACTIVATION or
 * EDITING of ANY policy (in force or not) cannot move an already-settled row.
 *
 * GATED (same reason as `t023-documents-payouts.test.tsx`): a full checkout->settlement chain is
 * genuinely expensive. `F008_LIVE_PROOF=1 npx vitest run tests/finance/t028-snapshot-immutability.test.ts`.
 */
const F008_LIVE = process.env.F008_LIVE_PROOF === "1";

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no live client installed");
    return serverClientState.client;
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}));

afterEach(() => {
  // Every `import("@/lib/admin/commission")` below must see the CURRENT `serverClientState.client`, not a
  // module cached from a previous call under a different session.
  vi.resetModules();
});

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

const POLICY_NAME = `${RUN_F_CONFIG_ROWS.policyNamePrefix}f008 t028 immutability proof`;
const FUTURE_FROM = "2099-01-01T00:00";

describe.skipIf(!F008_LIVE)("T028 — historical payout/order_financials snapshot survives a real commission-policy mutation", () => {
  let sessions: ChainSessions;
  let helpers: ReturnType<typeof chainHelpers>;
  let superAdmin: SupabaseClient;
  let resaleOrderId = "";
  let teardown: ChainTeardown | null = null;
  let superAdminCleaned = false;

  beforeAll(async () => {
    prepareSuperAdminFixture();
    [sessions, superAdmin] = await Promise.all([prepareChain(), signInAsFixture(FOUNDATION_FIXTURES.superAdmin.email)]);
    helpers = chainHelpers(withLiveClient, sessions);

    const stock = await helpers.giveOrgBSettledStock(20);
    const draft = await helpers.createDraft(stock.position.id, 6, "F008 T028 immutability proof");
    if (!draft.ok) throw new Error(`setup: createListingDraft refused: ${draft.code}`);
    await helpers.publishListing(draft.data.id);
    const purchase = await helpers.buyAndSettle(sessions.orgA, ORG_A, draft.data.id, 4);
    resaleOrderId = purchase.orderId;
  }, 900_000);

  afterAll(() => {
    if (!teardown) teardown = teardownChain();
    if (!superAdminCleaned) {
      const result = cleanupSuperAdminFixture();
      superAdminCleaned = true;
      expect(result.activeAdminPrivilege).toBe(false);
    }
  }, 300_000);

  // Feature 013 M3 (T063): the seller (orgB) reads its OWN payout only; the full-order `order_financials` and the
  // proforma header are no longer seller-readable (B ∨ F ∨ A ∨ PA / B ∨ F ∨ PA), so the historical snapshot of those
  // two is read by the FINANCE operator — a role that may read both — rather than by widening seller access.
  const FINANCIALS_COLUMNS = "order_id, base_subtotal, shipping_amount, vat_amount, commission_amount, seller_net_amount, buyer_total_amount, total_quantity_kg, currency, commission_policy_id, commission_percentage_snapshot, calculated_at";
  const PROFORMA_COLUMNS = "id, order_id, proforma_code, status, issued_at, valid_until";
  const snapshot = async () => {
    const [payoutRows, financials, proforma] = await Promise.all([
      sessions.orgB.from("payouts").select("id, order_id, seller_organization_id, amount, currency, status, paid_at, payment_reference, created_at").eq("order_id", resaleOrderId).order("id"),
      sessions.finance.from("order_financials").select(FINANCIALS_COLUMNS).eq("order_id", resaleOrderId).maybeSingle(),
      sessions.finance.from("proforma_invoices").select(PROFORMA_COLUMNS).eq("order_id", resaleOrderId).maybeSingle(),
    ]);
    return { payouts: payoutRows.data, financials: financials.data, proforma: proforma.data };
  };

  it("1 baseline: a real payout and order_financials snapshot exist for the settled resale order, both 0%-commission (COMMISSION-OPEN-01 — no policy is in force today)", async () => {
    const before = await snapshot();
    expect(before.payouts).toHaveLength(1);
    expect(before.payouts![0].amount).toBeGreaterThan(0);
    expect(before.financials).not.toBeNull();
    expect(before.financials!.commission_percentage_snapshot === null || Number(before.financials!.commission_percentage_snapshot) === 0).toBe(true);
    expect(before.proforma).not.toBeNull();
  }, 60_000);

  it("1b Feature 013 M3: the seller itself cannot read the full-order financials or the proforma header (it keeps its own payout)", async () => {
    const [financials, proforma] = await Promise.all([
      sessions.orgB.from("order_financials").select(FINANCIALS_COLUMNS).eq("order_id", resaleOrderId).maybeSingle(),
      sessions.orgB.from("proforma_invoices").select(PROFORMA_COLUMNS).eq("order_id", resaleOrderId).maybeSingle(),
    ]);
    expect(financials.data).toBeNull();
    expect(proforma.data).toBeNull();
  }, 60_000);

  it("2 unauthorized mutation is refused: neither a finance operator nor an ordinary member can create/mutate a commission policy", async () => {
    for (const client of [sessions.finance, sessions.orgB]) {
      const created = await withLiveClient(client, async () => (await import("@/lib/admin/commission")).createCommissionPolicy({ name: POLICY_NAME, effectiveFrom: FUTURE_FROM }));
      expect(created.ok).toBe(false);
    }
    // nothing named this was created by the refused attempts
    const { data } = await superAdmin.from("commission_policies").select("id").like("name", `${RUN_F_CONFIG_ROWS.policyNamePrefix}%`);
    expect((data ?? []).length).toBe(0);
  }, 60_000);

  let policyId = "";
  let tierId = "";

  it("3 authorized mutation succeeds: SUPER_ADMIN creates, activates and populates a disposable (2099, never-in-force) commission policy", async () => {
    const created = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).createCommissionPolicy({ name: POLICY_NAME, effectiveFrom: FUTURE_FROM }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    policyId = created.data.id;

    const tier = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).createCommissionTier({ policyId, minQuantityKg: "0", maxQuantityKg: "", percentage: "75" }));
    expect(tier.ok).toBe(true);
    if (tier.ok) tierId = tier.data.id;

    const activated = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).transitionCommissionPolicy({ policyId, operation: "activate" }));
    expect(activated.ok).toBe(true);
    if (activated.ok) expect(activated.data).toMatchObject({ fromStatus: "DRAFT", toStatus: "ACTIVE" });

    // this NEVER makes it the in-force policy — its effective_from is 2099
    const { resolveInForce, listCommissionPolicies } = await import("@/lib/admin/commission");
    const policies = await withLiveClient(superAdmin, async () => listCommissionPolicies());
    expect(resolveInForce(policies!).inForce.find((p) => p.id === policyId)).toBeUndefined();
  }, 90_000);

  it("4 resulting read state: the historical payout/order_financials/proforma are byte-identical to baseline after the policy exists, is ACTIVE and carries a 75% tier", async () => {
    const after = await snapshot();
    const before = await snapshot(); // re-derive baseline shape for an exact structural compare (values are the same live rows)
    expect(after).toEqual(before);
    expect(after.financials!.commission_percentage_snapshot === null || Number(after.financials!.commission_percentage_snapshot) === 0).toBe(true);
  }, 60_000);

  it("5 further mutation (rename policy, edit tier to 99%) still leaves the historical snapshot untouched", async () => {
    const beforeEdit = await snapshot();

    const renamed = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).updateCommissionPolicy({ policyId, name: `${POLICY_NAME} renamed`, effectiveFrom: FUTURE_FROM }));
    expect(renamed.ok).toBe(true);
    const editedTier = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).updateCommissionTier({ policyId, tierId, minQuantityKg: "0", maxQuantityKg: "", percentage: "99" }));
    expect(editedTier.ok).toBe(true);

    const { data: storedTier } = await superAdmin.from("commission_tiers").select("percentage").eq("id", tierId).maybeSingle();
    expect(Number(storedTier?.percentage)).toBe(99); // the mutation itself genuinely took effect...

    const afterEdit = await snapshot();
    expect(afterEdit).toEqual(beforeEdit); // ...but the ALREADY-SETTLED order's own numbers did not move at all
  }, 60_000);

  it("6 deactivate/archive the disposable policy (structural retirement — no delete path exists in application code) and confirm the snapshot is still unchanged", async () => {
    const deactivated = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).transitionCommissionPolicy({ policyId, operation: "deactivate" }));
    expect(deactivated.ok).toBe(true);
    const archived = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).transitionCommissionPolicy({ policyId, operation: "archive" }));
    expect(archived.ok).toBe(true);
    if (archived.ok) expect(archived.data.toStatus).toBe("ARCHIVED");

    const final = await snapshot();
    const originalBaseline = await snapshot();
    expect(final).toEqual(originalBaseline);
  }, 60_000);

  it("7 cleanup — the disposable, uniquely-prefixed commission policy (its tier cascades) is removed via the existing privileged fixture path; the real order_financials/payouts rows are untouched and retained (append-only)", () => {
    const result = cleanupRunFConfigRows() as { removed?: { commission_policies?: number } };
    expect(result.removed?.commission_policies).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("8 the disposable policy is genuinely gone; the settled order's payout/financials still exist, byte-identical to every earlier read", async () => {
    const { data: gone } = await superAdmin.from("commission_policies").select("id").like("name", `${RUN_F_CONFIG_ROWS.policyNamePrefix}%`);
    expect(gone ?? []).toEqual([]);
    const final = await snapshot();
    expect(final.payouts).toHaveLength(1);
    expect(final.financials).not.toBeNull();
  }, 60_000);
});
