import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  FOUNDATION_FIXTURES,
  RUN_F_CONFIG_ROWS,
  cleanupAuditorFixture,
  cleanupCatalogueAdminFixture,
  cleanupComplianceFixture,
  cleanupRunFConfigRows,
  cleanupSuperAdminFixture,
  createAnonymousFixtureClient,
  inspectAuditorFixture,
  inspectCatalogueAdminFixture,
  inspectComplianceFixture,
  inspectSuperAdminFixture,
  prepareAuditorFixture,
  prepareCatalogueAdminFixture,
  prepareComplianceFixture,
  prepareSuperAdminFixture,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 010 RUN F — Phase 9 LIVE proof with REAL sessions and REAL rows. The disposable SUPER_ADMIN
 * (decision H1) is the only identity that can pass `is_super_admin()`; the disposable ADMIN (RUN E)
 * is the refused platform-admin role; COMPLIANCE/AUDITOR (disposable), WAREHOUSE/FINANCE/member
 * (standing) and anonymous complete the refusal matrix (T043's literal list).
 *
 * Nothing this suite writes can reach a real checkout: commission policies are dated 2099 (never
 * `effective_from <= now()`), tax/shipping rules use the user-assigned code `ZZ`, the payment
 * account carries placeholder identifiers, and the T027 target is the standing `no-organization`
 * fixture (a member with no operational role). The real AE VAT rule and the real ADMIN row are never
 * matched. Every row is removed and every disposable fixture de-privileged in `afterAll`.
 */

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "hills-acting-org" && cookieState.value ? { value: cookieState.value } : undefined),
    set: (name: string, value: string) => {
      if (name === "hills-acting-org") cookieState.value = value;
    },
    getAll: () => [],
  }),
}));
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));
const redirectCalls = vi.hoisted(() => ({ targets: [] as string[] }));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    redirectCalls.targets.push(target);
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}));
vi.mock("next/cache", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/cache")>()), revalidatePath: () => undefined, revalidateTag: () => undefined }));

afterEach(cleanup);

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}
async function renderPage(element: React.ReactElement) {
  const { LocaleProvider } = await import("@/components/locale/locale-provider");
  return render(<LocaleProvider>{element}</LocaleProvider>);
}

const LIVE_TIMEOUT_MS = 150_000;
const POLICY_NAME = `${RUN_F_CONFIG_ROWS.policyNamePrefix}policy proof`;
const FUTURE_FROM = "2099-01-01T00:00";

let superAdmin: SupabaseClient;
let admin: SupabaseClient;
let compliance: SupabaseClient;
let auditor: SupabaseClient;
let warehouse: SupabaseClient;
let finance: SupabaseClient;
let member: SupabaseClient;
let target: SupabaseClient;
let superAdminId: string;
let targetId: string;

beforeAll(async () => {
  prepareSuperAdminFixture();
  prepareCatalogueAdminFixture();
  prepareComplianceFixture();
  prepareAuditorFixture();
  cleanupRunFConfigRows();
  superAdmin = await signInAsFixture(FOUNDATION_FIXTURES.superAdmin.email);
  superAdminId = (await superAdmin.auth.getUser()).data.user!.id;
  admin = await signInAsFixture(FOUNDATION_FIXTURES.catalogueAdmin.email);
  compliance = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
  auditor = await signInAsFixture(FOUNDATION_FIXTURES.auditor.email);
  warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
  finance = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
  member = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
  target = await signInAsFixture(RUN_F_CONFIG_ROWS.roleTargetEmail);
  targetId = (await target.auth.getUser()).data.user!.id;
}, LIVE_TIMEOUT_MS);

afterAll(async () => {
  cleanupRunFConfigRows();
  for (const [cleanupFixture, inspectFixture] of [
    [cleanupSuperAdminFixture, inspectSuperAdminFixture],
    [cleanupCatalogueAdminFixture, inspectCatalogueAdminFixture],
    [cleanupComplianceFixture, inspectComplianceFixture],
    [cleanupAuditorFixture, inspectAuditorFixture],
  ] as const) {
    const result = cleanupFixture();
    expect(result.activeAdminPrivilege).toBe(false);
    expect(inspectFixture().activeCapability).toBe(false);
  }
}, LIVE_TIMEOUT_MS);

/** The five refused operational sessions + the plain member (T043's literal list), by label. */
const refusedSessions = () => [["admin", admin], ["compliance", compliance], ["warehouse", warehouse], ["finance", finance], ["auditor", auditor], ["member", member]] as const;

describe("T043 — every super-admin surface refuses ADMIN, COMPLIANCE, WAREHOUSE, FINANCE, AUDITOR and a plain member by direct action AND direct URL; anonymous is unauthenticated", () => {
  it("direct action: every commission/roles/tax/shipping write and read returns SYSTEM_NOT_CAPABLE / null for each refused role; anonymous gets PROFILE_AUTH_REQUIRED", async () => {
    for (const [label, client] of refusedSessions()) {
      const results = await withLiveClient(client, async () => {
        const commission = await import("@/lib/admin/commission");
        const roles = await import("@/lib/admin/roles");
        const rules = await import("@/lib/admin/pricing-rules");
        return {
          list: await commission.listCommissionPolicies(),
          create: await commission.createCommissionPolicy({ name: POLICY_NAME, effectiveFrom: FUTURE_FROM }),
          tier: await commission.createCommissionTier({ policyId: "f0000000-0000-4000-8000-000000000001", minQuantityKg: "0", percentage: "5" }),
          grant: await roles.grantPlatformAdminRole({ userId: targetId, role: "COMPLIANCE" }),
          admins: await roles.listPlatformAdmins(),
          tax: await rules.createTaxRule({ countryCode: RUN_F_CONFIG_ROWS.ruleCountryCode, taxName: "VAT", ratePercentage: "5", taxableBase: "MERCHANDISE_ONLY", effectiveFrom: FUTURE_FROM }),
          taxes: await rules.listTaxRules(),
          shipping: await rules.createShippingRule({ deliveryMethod: "RUN F courier", flatFee: "1", effectiveFrom: FUTURE_FROM }),
        };
      });
      expect(results.list, label).toBeNull();
      expect(results.admins, label).toBeNull();
      expect(results.taxes, label).toBeNull();
      for (const key of ["create", "tier", "grant", "tax", "shipping"] as const) {
        expect(results[key].ok, `${label} ${key}`).toBe(false);
        if (!results[key].ok) expect(results[key].code, `${label} ${key}`).toBe("system_not_capable");
      }
    }
    const anonymous = await withLiveClient(createAnonymousFixtureClient(), async () => (await import("@/lib/admin/commission")).createCommissionPolicy({ name: POLICY_NAME, effectiveFrom: FUTURE_FROM }));
    expect(anonymous.ok).toBe(false);
    if (!anonymous.ok) expect(anonymous.code).toBe("profile_auth_required");
    // Nothing was written by any refused caller.
    expect((await superAdmin.from("commission_policies").select("id").like("name", `${RUN_F_CONFIG_ROWS.policyNamePrefix}%`)).data ?? []).toEqual([]);
    expect((await superAdmin.from("platform_admins").select("user_id").eq("user_id", targetId)).data ?? []).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  it("direct URL: the commission, roles, tax and shipping pages refuse each operational role with `forbidden`, the member with `no-operational-role`, anonymous with the operator sign-in redirect; RLS refuses the ADMIN's raw commission insert", async () => {
    const pages = ["src/app/dashboard-admin/(system)/(super)/commission/page", "src/app/dashboard-admin/(system)/(super)/roles/page", "src/app/dashboard-admin/(system)/(super)/tax/page", "src/app/dashboard-admin/(system)/(super)/shipping/page"] as const;
    for (const [label, client] of refusedSessions()) {
      for (const page of pages) {
        await withLiveClient(client, async () => {
          const { default: Page } = await import(`@/${page}`);
          await renderPage(await Page());
        });
        const state = label === "member" ? "no-operational-role" : "forbidden";
        expect(document.querySelector(`[data-admin-state="${state}"]`), `${label} → ${page}`).not.toBeNull();
        expect(document.querySelector("[data-commission-semantics], [data-record-form], [data-decision-form]"), `${label} → ${page}`).toBeNull();
        cleanup();
      }
    }
    await withLiveClient(createAnonymousFixtureClient(), async () => {
      const { default: Page } = await import("@/src/app/dashboard-admin/(system)/(super)/commission/page");
      const element = await Page();
      expect(() => render(element)).toThrow("NEXT_REDIRECT:/admin/sign-in/");
    });
    const raw = await admin.from("commission_policies").insert({ name: `${POLICY_NAME} raw`, status: "DRAFT", effective_from: "2099-01-01T00:00:00Z", created_by: (await admin.auth.getUser()).data.user!.id }).select("id");
    expect(raw.error?.code).toBe("42501");
    expect((await admin.from("commission_policies").select("id")).data ?? []).toEqual([]);
  }, LIVE_TIMEOUT_MS);
});

describe("T027 — platform-admin role management LIVE (SUPER_ADMIN)", () => {
  it("SUPER_ADMIN lists operators (itself included), grants COMPLIANCE to the target with created_by attribution, the target's own session then satisfies is_compliance_operator(); duplicate grant refused", async () => {
    const list = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/roles")).listPlatformAdmins());
    expect(list?.find((row) => row.userId === superAdminId)).toMatchObject({ role: "SUPER_ADMIN", isActive: true });
    const lookup = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/roles")).findGrantTarget(targetId));
    expect(lookup).toMatchObject({ id: targetId, alreadyAdmin: false });
    expect((await target.rpc("is_compliance_operator")).data).toBe(false);
    const granted = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/roles")).grantPlatformAdminRole({ userId: targetId, role: "COMPLIANCE" }));
    expect(granted.ok).toBe(true);
    const { data: row } = await superAdmin.from("platform_admins").select("role, is_active, created_by").eq("user_id", targetId).maybeSingle();
    expect(row).toEqual({ role: "COMPLIANCE", is_active: true, created_by: superAdminId });
    expect((await target.rpc("is_compliance_operator")).data).toBe(true);
    const duplicate = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/roles")).grantPlatformAdminRole({ userId: targetId, role: "AUDITOR" }));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("system_duplicate");
    const bogus = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/roles")).grantPlatformAdminRole({ userId: targetId, role: "OWNER" }));
    expect(bogus.ok).toBe(false);
    if (!bogus.ok) expect(bogus.code).toBe("validation_error");
  }, LIVE_TIMEOUT_MS);

  it("role change is compare-and-set (COMPLIANCE → AUDITOR succeeds once; the stale repeat is refused); deactivation removes the capability live; self-change is refused; the ADMIN's raw update affects zero rows", async () => {
    const changed = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/roles")).changePlatformAdminRole({ userId: targetId, role: "AUDITOR", expectedRole: "COMPLIANCE" }));
    expect(changed.ok).toBe(true);
    expect((await target.rpc("is_auditor")).data).toBe(true);
    expect((await target.rpc("is_compliance_operator")).data).toBe(false);
    const stale = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/roles")).changePlatformAdminRole({ userId: targetId, role: "FINANCE", expectedRole: "COMPLIANCE" }));
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("system_stale");
    expect((await superAdmin.from("platform_admins").select("role").eq("user_id", targetId).maybeSingle()).data?.role).toBe("AUDITOR");

    const deactivated = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/roles")).setPlatformAdminActive({ userId: targetId, isActive: "false", expectedRole: "AUDITOR", expectedActive: "true" }));
    expect(deactivated.ok).toBe(true);
    expect((await target.rpc("is_auditor")).data).toBe(false);
    const self = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/roles")).setPlatformAdminActive({ userId: superAdminId, isActive: "false", expectedRole: "SUPER_ADMIN", expectedActive: "true" }));
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.code).toBe("role_self_change_refused");
    expect((await superAdmin.rpc("is_super_admin")).data).toBe(true);
    const { data: tampered } = await admin.from("platform_admins").update({ role: "SUPER_ADMIN" }).eq("user_id", targetId).select("user_id");
    expect(tampered ?? []).toEqual([]);
    // UPDATE attribution gap (D2 ii): the row carries only the grant's created_by — no actor for the change/deactivation.
    const { data: after } = await superAdmin.from("platform_admins").select("role, is_active, created_by").eq("user_id", targetId).maybeSingle();
    expect(after).toEqual({ role: "AUDITOR", is_active: false, created_by: superAdminId });

    await withLiveClient(superAdmin, async () => {
      const { default: OperatorPage } = await import("@/src/app/dashboard-admin/(system)/(super)/roles/[userId]/page");
      await renderPage(await OperatorPage({ params: Promise.resolve({ userId: targetId }) }));
    });
    expect(document.querySelector(`[data-operator="${targetId}"]`)?.getAttribute("data-operator-active")).toBe("false");
    expect(document.querySelector('[data-decision-form="role-change"]')).not.toBeNull();
    expect(document.querySelector('[data-system-notice="attribution-gap"]')).not.toBeNull();
    cleanup();
    await withLiveClient(superAdmin, async () => {
      const { default: OperatorPage } = await import("@/src/app/dashboard-admin/(system)/(super)/roles/[userId]/page");
      await renderPage(await OperatorPage({ params: Promise.resolve({ userId: superAdminId }) }));
    });
    expect(document.querySelector("[data-operator-self]")).not.toBeNull();
    expect(document.querySelector("[data-decision-form]")).toBeNull();
  }, LIVE_TIMEOUT_MS);
});

describe("T042 / T044 / T045 — commission configuration LIVE (SUPER_ADMIN, 2099-dated policy)", () => {
  let policyId = "";

  it("create → DRAFT; bands 0–100 (5%) and 250–NULL (3%); duplicate min, max ≤ min and percentage > 100 refused; the page shows the 100–250 coverage gap and COMMISSION-OPEN-01", async () => {
    const created = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).createCommissionPolicy({ name: POLICY_NAME, effectiveFrom: FUTURE_FROM }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    policyId = created.data.id;
    const { data: stored } = await superAdmin.from("commission_policies").select("status, created_by, effective_from").eq("id", policyId).maybeSingle();
    expect(stored?.status).toBe("DRAFT");
    expect(stored?.created_by).toBe(superAdminId);
    expect(Date.parse(stored!.effective_from)).toBeGreaterThan(Date.now());
    const low = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).createCommissionTier({ policyId, minQuantityKg: "0", maxQuantityKg: "100", percentage: "5" }));
    const high = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).createCommissionTier({ policyId, minQuantityKg: "250", maxQuantityKg: "", percentage: "3" }));
    expect(low.ok && high.ok).toBe(true);
    const duplicate = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).createCommissionTier({ policyId, minQuantityKg: "0", maxQuantityKg: "50", percentage: "1" }));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("system_duplicate");
    const inverted = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).createCommissionTier({ policyId, minQuantityKg: "300", maxQuantityKg: "300", percentage: "1" }));
    expect(inverted.ok).toBe(false);
    if (!inverted.ok) expect(inverted).toMatchObject({ code: "validation_error", fieldErrors: { maxQuantityKg: ["MAX_NOT_ABOVE_MIN"] } });
    const tooHigh = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).createCommissionTier({ policyId, minQuantityKg: "500", percentage: "150" }));
    expect(tooHigh.ok).toBe(false);
    const policy = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).getCommissionPolicy(policyId));
    expect(policy?.tiers.map((t) => [t.minQuantityKg, t.maxQuantityKg, t.percentage])).toEqual([[0, 100, 5], [250, null, 3]]);
    const { evaluateTierCoverage } = await import("@/lib/admin/commission");
    expect(evaluateTierCoverage(policy!.tiers).gaps).toEqual([{ from: 100, to: 250 }]);
    await withLiveClient(superAdmin, async () => {
      const { default: PolicyPage } = await import("@/src/app/dashboard-admin/(system)/(super)/commission/[policyId]/page");
      await renderPage(await PolicyPage({ params: Promise.resolve({ policyId }) }));
    });
    expect(document.querySelector('[data-coverage="gaps"]')).not.toBeNull();
    expect(document.querySelector('[data-coverage-gap="100-250"]')).not.toBeNull();
    expect(document.querySelector('[data-open-item="commission-open-01"]')).not.toBeNull();
    expect(document.querySelector('[data-system-notice="future-only"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-record-form^="tier-"]').length).toBe(3);
    // T044: no control acts on history — the only mentions of those words are statements of absence, never on a button/link.
    for (const control of document.querySelectorAll("button, a, input[type='submit']")) expect(control.textContent ?? "", "control").not.toMatch(/recalculat|restate|backfill|re-?snapshot/i);
  }, LIVE_TIMEOUT_MS);

  it("tier edit persists; status moves only through named operations (activate once, stale repeat refused, deactivate, archive, restore); the 2099 policy is never in force; ADMIN/FINANCE raw reads see nothing", async () => {
    const policy = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).getCommissionPolicy(policyId));
    const lowTier = policy!.tiers[0]!;
    const edited = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).updateCommissionTier({ policyId, tierId: lowTier.id, minQuantityKg: "0", maxQuantityKg: "100", percentage: "6" }));
    expect(edited.ok).toBe(true);
    expect((await superAdmin.from("commission_tiers").select("percentage").eq("id", lowTier.id).maybeSingle()).data?.percentage).toBe(6);
    const run = (operation: string) => withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).transitionCommissionPolicy({ policyId, operation }));
    const activated = await run("activate");
    expect(activated.ok).toBe(true);
    if (activated.ok) expect(activated.data).toMatchObject({ fromStatus: "DRAFT", toStatus: "ACTIVE" });
    const again = await run("activate");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("system_stale");
    const policies = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).listCommissionPolicies());
    const { resolveInForce } = await import("@/lib/admin/commission");
    expect(resolveInForce(policies!).inForce.find((p) => p.id === policyId)).toBeUndefined();
    expect((await run("deactivate")).ok).toBe(true);
    expect((await run("archive")).ok).toBe(true);
    expect((await run("restore")).ok).toBe(true);
    expect((await superAdmin.from("commission_policies").select("status").eq("id", policyId).maybeSingle()).data?.status).toBe("DRAFT");
    const bogus = await run("PUBLISHED");
    expect(bogus.ok).toBe(false);
    if (!bogus.ok) expect(bogus.code).toBe("validation_error");
    expect((await admin.from("commission_policies").select("id").eq("id", policyId)).data ?? []).toEqual([]);
    expect((await finance.from("commission_tiers").select("id").eq("policy_id", policyId)).data ?? []).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  it("T044 — every order_financials snapshot readable by FINANCE is byte-identical before and after the commission mutations above (nothing recalculates history)", async () => {
    const { data: snapshots } = await finance.from("order_financials").select("order_id, commission_policy_id, commission_percentage_snapshot, commission_amount, seller_net_amount, buyer_total_amount, calculated_at").order("order_id");
    const before = JSON.stringify(snapshots ?? []);
    const touched = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/commission")).updateCommissionPolicy({ policyId, name: `${POLICY_NAME} renamed`, effectiveFrom: FUTURE_FROM }));
    expect(touched.ok).toBe(true);
    const { data: after } = await finance.from("order_financials").select("order_id, commission_policy_id, commission_percentage_snapshot, commission_amount, seller_net_amount, buyer_total_amount, calculated_at").order("order_id");
    expect(JSON.stringify(after ?? [])).toBe(before);
  }, LIVE_TIMEOUT_MS);
});

describe("T028 — tax and shipping rules LIVE (SUPER_ADMIN; ZZ only; the real AE rule untouched)", () => {
  it("tax: create (inactive, 2099) → edit → duplicate key refused → invalid rate refused; the real AE VAT rule is still the in-force one; ADMIN refused; snapshots unchanged", async () => {
    const { data: aeBefore } = await superAdmin.from("tax_rules").select("id, rate_percentage, is_active").eq("country_code", "AE").order("effective_from", { ascending: false });
    const created = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/pricing-rules")).createTaxRule({ countryCode: "zz", taxName: "VAT", ratePercentage: "5", taxableBase: "MERCHANDISE_ONLY", effectiveFrom: FUTURE_FROM, isActive: "" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { data: stored } = await superAdmin.from("tax_rules").select("country_code, is_active, created_by").eq("id", created.data.id).maybeSingle();
    expect(stored).toEqual({ country_code: "ZZ", is_active: false, created_by: superAdminId });
    const edited = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/pricing-rules")).updateTaxRule({ ruleId: created.data.id, countryCode: "ZZ", taxName: "VAT", ratePercentage: "7.5", taxableBase: "MERCHANDISE_AND_SHIPPING", effectiveFrom: FUTURE_FROM, isActive: "" }));
    expect(edited.ok).toBe(true);
    const duplicate = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/pricing-rules")).createTaxRule({ countryCode: "ZZ", taxName: "VAT", ratePercentage: "1", taxableBase: "MERCHANDISE_ONLY", effectiveFrom: FUTURE_FROM }));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("system_duplicate");
    const invalid = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/pricing-rules")).createTaxRule({ countryCode: "ZZ", taxName: "GST", ratePercentage: "150", taxableBase: "MERCHANDISE_ONLY", effectiveFrom: FUTURE_FROM }));
    expect(invalid.ok).toBe(false);
    const rules = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/pricing-rules")).listTaxRules());
    const { resolveInForceTaxRule } = await import("@/lib/admin/pricing-rules");
    expect(resolveInForceTaxRule(rules!, "AE")?.id).toBe(aeBefore?.[0]?.id);
    expect(resolveInForceTaxRule(rules!, "ZZ")).toBeNull();
    const { data: aeAfter } = await superAdmin.from("tax_rules").select("id, rate_percentage, is_active").eq("country_code", "AE").order("effective_from", { ascending: false });
    expect(aeAfter).toEqual(aeBefore);
    const refused = await withLiveClient(admin, async () => (await import("@/lib/admin/pricing-rules")).updateTaxRule({ ruleId: created.data.id, countryCode: "ZZ", taxName: "VAT", ratePercentage: "9", taxableBase: "MERCHANDISE_ONLY", effectiveFrom: FUTURE_FROM }));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("system_not_capable");
    await withLiveClient(superAdmin, async () => {
      const { default: TaxPage } = await import("@/src/app/dashboard-admin/(system)/(super)/tax/page");
      await renderPage(await TaxPage());
    });
    expect(document.querySelector('[data-system-notice="future-only"]')).not.toBeNull();
    expect(document.querySelector('[data-system-notice="attribution-gap"]')).not.toBeNull();
  }, LIVE_TIMEOUT_MS);

  it("shipping: create → edit (ZZ, 2099); the page states honestly that no checkout/shipment path consumes the rows; ADMIN refused", async () => {
    const created = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/pricing-rules")).createShippingRule({ countryCode: "zz", deliveryMethod: "RUN F courier", flatFee: "12.5", effectiveFrom: FUTURE_FROM, isActive: "on" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { data: stored } = await superAdmin.from("shipping_rules").select("country_code, flat_fee, currency, created_by").eq("id", created.data.id).maybeSingle();
    expect(stored).toMatchObject({ country_code: "ZZ", flat_fee: 12.5, created_by: superAdminId });
    expect(String(stored?.currency).trim()).toBe("USD");
    const wrongCurrency = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/pricing-rules")).updateShippingRule({ ruleId: created.data.id, countryCode: "ZZ", deliveryMethod: "RUN F courier", flatFee: "12.5", currency: "AED", effectiveFrom: FUTURE_FROM }));
    expect(wrongCurrency.ok).toBe(false);
    const edited = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/pricing-rules")).updateShippingRule({ ruleId: created.data.id, countryCode: "ZZ", deliveryMethod: "RUN F courier", flatFee: "0", effectiveFrom: FUTURE_FROM, isActive: "" }));
    expect(edited.ok).toBe(true);
    const refused = await withLiveClient(admin, async () => (await import("@/lib/admin/pricing-rules")).createShippingRule({ deliveryMethod: "tamper", flatFee: "1", effectiveFrom: FUTURE_FROM }));
    expect(refused.ok).toBe(false);
    await withLiveClient(superAdmin, async () => {
      const { default: ShippingPage } = await import("@/src/app/dashboard-admin/(system)/(super)/shipping/page");
      await renderPage(await ShippingPage());
    });
    expect(document.querySelector('[data-system-notice="shipping-unconsumed"]')).not.toBeNull();
  }, LIVE_TIMEOUT_MS);
});

describe("T029 — payment accounts LIVE (ADMIN reads, SUPER_ADMIN writes; OPS-01 stated; no member path)", () => {
  it("ADMIN can list (masked) but its create is refused in-app AND by RLS; SUPER_ADMIN creates/edits with attribution; member/anonymous refused; the ADMIN page states the read-only rule", async () => {
    const adminList = await withLiveClient(admin, async () => (await import("@/lib/admin/payment-accounts")).listPaymentAccounts());
    expect(adminList).not.toBeNull();
    const adminCreate = await withLiveClient(admin, async () => (await import("@/lib/admin/payment-accounts")).createPaymentAccount({ accountName: `${RUN_F_CONFIG_ROWS.accountNamePrefix}tamper`, bankName: "Test Bank" }));
    expect(adminCreate.ok).toBe(false);
    if (!adminCreate.ok) expect(adminCreate.code).toBe("system_not_capable");
    const raw = await admin.from("payment_accounts").insert({ account_name: `${RUN_F_CONFIG_ROWS.accountNamePrefix}raw`, bank_name: "Test Bank", currency: "USD", created_by: (await admin.auth.getUser()).data.user!.id }).select("id");
    expect(raw.error?.code).toBe("42501");

    const created = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/payment-accounts")).createPaymentAccount({ accountName: `${RUN_F_CONFIG_ROWS.accountNamePrefix}proof account`, bankName: "Test Bank (fixture)", iban: "zz00 test 0000 0000 0000 0001", swiftCode: "testzz00", isActive: "on" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const detail = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/payment-accounts")).getPaymentAccount(created.data.id));
    const { maskIdentifier } = await import("@/lib/admin/payment-accounts");
    expect(detail).toMatchObject({ createdBy: superAdminId, currency: "USD", swiftCode: "TESTZZ00", iban: "ZZ00 TEST 0000 0000 0000 0001", ibanMasked: maskIdentifier("ZZ00 TEST 0000 0000 0000 0001") });
    expect(detail?.ibanMasked).toMatch(/^•+0001$/);
    const listed = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/payment-accounts")).listPaymentAccounts());
    const row = listed!.find((account) => account.id === created.data.id)!;
    expect("iban" in row).toBe(false);
    expect(row.ibanMasked).toMatch(/^•+0001$/);
    const edited = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/payment-accounts")).updatePaymentAccount({ accountId: created.data.id, accountName: `${RUN_F_CONFIG_ROWS.accountNamePrefix}proof account`, bankName: "Test Bank (fixture)", isActive: "" }));
    expect(edited.ok).toBe(true);
    expect((await superAdmin.from("payment_accounts").select("is_active").eq("id", created.data.id).maybeSingle()).data?.is_active).toBe(false);

    for (const [label, client] of [["member", member], ["finance", finance]] as const) {
      const refused = await withLiveClient(client, async () => (await import("@/lib/admin/payment-accounts")).listPaymentAccounts());
      expect(refused, label).toBeNull();
    }
    expect((await member.from("payment_accounts").select("id")).data ?? []).toEqual([]);
    await withLiveClient(admin, async () => {
      const { default: Page } = await import("@/src/app/dashboard-admin/(system)/payment-accounts/page");
      await renderPage(await Page());
    });
    expect(document.querySelector("[data-payment-accounts-read-only]")).not.toBeNull();
    expect(document.querySelector('[data-system-notice="ops-01"]')).not.toBeNull();
    expect(document.querySelector('[data-system-notice="high-risk"]')).not.toBeNull();
    expect(document.querySelector('a[href="/dashboard-admin/payment-accounts/new"]')).toBeNull();
    cleanup();
    await withLiveClient(member, async () => {
      const { default: Page } = await import("@/src/app/dashboard-admin/(system)/payment-accounts/page");
      await renderPage(await Page());
    });
    expect(document.querySelector('[data-admin-state="no-operational-role"]')).not.toBeNull();
    cleanup();
    await withLiveClient(createAnonymousFixtureClient(), async () => {
      const { default: Page } = await import("@/src/app/dashboard-admin/(system)/payment-accounts/page");
      const element = await Page();
      expect(() => render(element)).toThrow("NEXT_REDIRECT:/admin/sign-in/");
    });
  }, LIVE_TIMEOUT_MS);
});
