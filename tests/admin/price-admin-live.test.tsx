import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchActiveDifferentials } from "@/lib/pricing/differentials";
import { fetchBenchmarkSnapshot, fetchObservationsForSource } from "@/lib/pricing/sources";
import { createPublicReadClient } from "@/lib/public/supabase";
import {
  FOUNDATION_FIXTURES,
  PRICE_ADMIN_PREFIX,
  cleanupAuditorFixture,
  cleanupCatalogueAdminFixture,
  cleanupComplianceFixture,
  cleanupPriceAdminRows,
  createAnonymousFixtureClient,
  inspectAuditorFixture,
  inspectCatalogueAdminFixture,
  inspectComplianceFixture,
  prepareAuditorFixture,
  prepareCatalogueAdminFixture,
  prepareComplianceFixture,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 010 T049 — LIVE proof of reference-price administration with REAL sessions, REAL RLS and REAL rows:
 *   - COMPLIANCE / WAREHOUSE / FINANCE / AUDITOR / a trading member are refused by every write (direct action
 *     invocation) and by direct URL; anonymous is refused as unauthenticated; no row is written; nothing revalidates;
 *     the RLS backstop independently refuses their raw writes.
 *   - a disposable platform ADMIN creates / edits a source, records observations, creates / retires a differential;
 *     each SUCCESSFUL write revalidates exactly Feature 011's `reference-prices` tag with `{ expire: 0 }`, and every
 *     refused / invalid / failed write revalidates nothing;
 *   - Feature 011's own licence-gated anonymous read layer (uncached fetchers, the anon key) reflects each change:
 *     PENDING hidden → APPROVED shown with the exact stored text → RESTRICTED / inactive hidden again.
 * `next/cache` is recorded here (no Next runtime in Vitest); the REAL tag invalidation against a running production
 * server is proven by `tests/browser/feature010-price-admin.browser.mjs`. Rows carry `F010P-` and are removed in
 * `afterAll`; every disposable operator is de-privileged.
 */

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, getAll: () => [] }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}));
const cacheCalls = vi.hoisted(() => ({ tags: [] as { tag: string; options: unknown }[], paths: [] as string[] }));
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: (path: string) => {
    cacheCalls.paths.push(path);
  },
  revalidateTag: (tag: string, options: unknown) => {
    cacheCalls.tags.push({ tag, options });
  },
}));

afterEach(cleanup);
beforeEach(() => {
  cacheCalls.tags.length = 0;
  cacheCalls.paths.length = 0;
});

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}
const layer = () => import("@/lib/admin/prices");
async function renderPage(element: React.ReactElement) {
  const { LocaleProvider } = await import("@/components/locale/locale-provider");
  return render(<LocaleProvider>{element}</LocaleProvider>);
}

const LIVE_TIMEOUT_MS = 180_000;
const P = PRICE_ADMIN_PREFIX;
const REVALIDATED_ONCE = [{ tag: "reference-prices", options: { expire: 0 } }];

let admin: SupabaseClient;
const refused: Record<string, SupabaseClient> = {};

async function storedText(table: "price_observations" | "price_differentials", column: "raw_value" | "amount", id: string): Promise<string> {
  const { data, error } = await admin.from(table).select(`${column}::text`).eq("id", id).single();
  if (error) throw new Error(`stored read failed on ${table}: ${error.code}`);
  return String((data as unknown as Record<string, string>)[column]);
}
async function taggedSourceCount(): Promise<number> {
  const { data, error } = await admin.from("price_sources").select("id").like("code", `${P}%`);
  if (error) throw new Error("lookup failed");
  return (data ?? []).length;
}

beforeAll(async () => {
  prepareCatalogueAdminFixture();
  prepareAuditorFixture();
  prepareComplianceFixture();
  cleanupPriceAdminRows();
  admin = await signInAsFixture(FOUNDATION_FIXTURES.catalogueAdmin.email);
  refused.compliance = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
  refused.warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
  refused.finance = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
  refused.auditor = await signInAsFixture(FOUNDATION_FIXTURES.auditor.email);
  refused.member = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
}, LIVE_TIMEOUT_MS);

afterAll(async () => {
  cleanupPriceAdminRows();
  expect(await taggedSourceCount()).toBe(0);
  for (const [cleanupFixture, inspectFixture] of [
    [cleanupCatalogueAdminFixture, inspectCatalogueAdminFixture],
    [cleanupAuditorFixture, inspectAuditorFixture],
    [cleanupComplianceFixture, inspectComplianceFixture],
  ] as const) {
    expect(cleanupFixture().activeAdminPrivilege).toBe(false);
    expect(inspectFixture().activeCapability).toBe(false);
  }
}, LIVE_TIMEOUT_MS);

const SOURCE = { name: "F010P Live Source", code: `${P}LIVE`, sourceType: "ICE_ARABICA", licenceStatus: "PENDING", delayType: "DELAYED", delayMinutes: "15", sourceUrl: "", isActive: "on" };
const ids: { source?: string; observation?: string; differential?: string } = {};

describe("1. authorization — only a platform ADMIN may administer reference prices", () => {
  it("COMPLIANCE, WAREHOUSE, FINANCE, AUDITOR and a trading member are refused by EVERY write (CATALOGUE_NOT_CAPABLE); anonymous is refused as unauthenticated; no row, no revalidation", async () => {
    const anyUuid = "f0110000-0000-4000-8000-000000000001";
    const attempts = async () => {
      const l = await layer();
      return [
        await l.createPriceSource({ ...SOURCE, code: `${P}TAMPER` }),
        await l.updatePriceSource({ ...SOURCE, sourceId: anyUuid, licenceStatus: "RESTRICTED" }),
        await l.recordPriceObservation({ sourceId: anyUuid, symbol: "KC", commodityType: "ARABICA", rawValue: "1", rawCurrency: "USD", rawUnit: "cents/lb", observedAt: "2026-09-01T00:00" }),
        await l.createPriceDifferential({ differentialType: "OTHER", amount: "1", currency: "USD", unit: "KG", effectiveFrom: "2026-09-01T00:00", notes: `${P}tamper`, isActive: "on" }),
        await l.updatePriceDifferential({ differentialId: anyUuid, isActive: "" }),
      ];
    };
    for (const [role, client] of Object.entries(refused)) {
      const results = await withLiveClient(client, attempts);
      for (const result of results) expect(result, role).toEqual({ ok: false, code: "catalogue_not_capable" });
    }
    const anonymous = await withLiveClient(createAnonymousFixtureClient(), attempts);
    for (const result of anonymous) expect(result).toEqual({ ok: false, code: "profile_auth_required" });
    expect(cacheCalls.tags).toEqual([]);
    expect(await taggedSourceCount()).toBe(0);
    const { data: diffs } = await admin.from("price_differentials").select("id").like("notes", `${P}%`);
    expect(diffs ?? []).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  it("the RLS backstop refuses the same roles' RAW writes too (the app gate is not the only defence)", async () => {
    for (const [role, client] of Object.entries(refused)) {
      const { error, data } = await client.from("price_sources").insert({ name: "F010P raw tamper", code: `${P}RAW`, source_type: "OTHER" }).select("id");
      expect(error !== null || (data ?? []).length === 0, role).toBe(true);
    }
    expect(await taggedSourceCount()).toBe(0);
  }, LIVE_TIMEOUT_MS);

  it("DIRECT URL: every price page refuses the operational roles with `forbidden`, a member with `no-operational-role`, anonymous with a redirect — the catalogue group layout refuses too", async () => {
    const pages = [
      ["@/src/app/dashboard-admin/(catalogue)/prices/page", {}],
      ["@/src/app/dashboard-admin/(catalogue)/prices/sources/new/page", {}],
      ["@/src/app/dashboard-admin/(catalogue)/prices/sources/[sourceId]/page", { sourceId: "f0110000-0000-4000-8000-000000000001" }],
      ["@/src/app/dashboard-admin/(catalogue)/prices/differentials/new/page", {}],
      ["@/src/app/dashboard-admin/(catalogue)/prices/differentials/[differentialId]/page", { differentialId: "f0110000-0000-4000-8000-0000000000d1" }],
    ] as const;
    for (const [modulePath, params] of pages) {
      for (const role of ["compliance", "warehouse", "finance", "auditor"]) {
        await withLiveClient(refused[role], async () => {
          const { default: Page } = await import(/* @vite-ignore */ modulePath);
          await renderPage(await Page({ params: Promise.resolve(params), searchParams: Promise.resolve({}) }));
        });
        expect(document.querySelector('[data-admin-state="forbidden"]'), `${modulePath} × ${role}`).not.toBeNull();
        expect(document.querySelector("[data-record-form], table"), `${modulePath} × ${role}`).toBeNull();
        cleanup();
      }
      await withLiveClient(refused.member, async () => {
        const { default: Page } = await import(/* @vite-ignore */ modulePath);
        await renderPage(await Page({ params: Promise.resolve(params), searchParams: Promise.resolve({}) }));
      });
      expect(document.querySelector('[data-admin-state="no-operational-role"]'), modulePath).not.toBeNull();
      cleanup();
      await withLiveClient(createAnonymousFixtureClient(), async () => {
        const { default: Page } = await import(/* @vite-ignore */ modulePath);
        const element = await Page({ params: Promise.resolve(params), searchParams: Promise.resolve({}) });
        expect(() => render(element)).toThrow("NEXT_REDIRECT:/admin/sign-in/");
      });
      cleanup();
    }
    await withLiveClient(refused.warehouse, async () => {
      const { default: Layout } = await import("@/src/app/dashboard-admin/(catalogue)/layout");
      await renderPage(<>{await Layout({ children: <p data-leaked-child>child</p> })}</>);
    });
    expect(document.querySelector('[data-admin-state="forbidden"]')).not.toBeNull();
    expect(document.querySelector("[data-leaked-child]")).toBeNull();
  }, LIVE_TIMEOUT_MS * 2);
});

describe("2. the platform ADMIN's supported mutations — each revalidates `reference-prices` exactly once; licence status stays authoritative", () => {
  it("create a PENDING source → revalidated; it is NOT public (licence gate)", async () => {
    const created = await withLiveClient(admin, async () => (await layer()).createPriceSource(SOURCE));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    ids.source = created.data.id;
    expect(created.data.revalidatedTags).toEqual(["reference-prices"]);
    expect(cacheCalls.tags).toEqual(REVALIDATED_ONCE);
    const { data: row } = await admin.from("price_sources").select("code, source_type, licence_status, delay_type, delay_minutes, is_active, created_by").eq("id", ids.source).single();
    const adminId = (await admin.auth.getUser()).data.user!.id;
    expect(row).toEqual({ code: `${P}LIVE`, source_type: "ICE_ARABICA", licence_status: "PENDING", delay_type: "DELAYED", delay_minutes: 15, is_active: true, created_by: adminId });
    expect(await fetchObservationsForSource(createPublicReadClient(), ids.source)).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  it("record an observation → revalidated; the stored decimal is EXACTLY the entered text (the column scale only pads zeros); still hidden while PENDING", async () => {
    const recorded = await withLiveClient(admin, async () => (await layer()).recordPriceObservation({ sourceId: ids.source, symbol: "KC", commodityType: "ARABICA", rawValue: "187.4321", rawCurrency: "USD", rawUnit: "cents/lb", observedAt: "2026-09-10T09:30" }));
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    ids.observation = recorded.data.id;
    expect(cacheCalls.tags).toEqual(REVALIDATED_ONCE);
    const stored = await storedText("price_observations", "raw_value", ids.observation);
    expect(stored).toMatch(/^187\.43210*$/);
    const { data: obs } = await admin.from("price_observations").select("raw_currency, raw_unit, observed_at, is_stale, commodity_type").eq("id", ids.observation).single();
    expect(obs).toMatchObject({ raw_currency: "USD", raw_unit: "cents/lb", is_stale: false, commodity_type: "ARABICA" });
    expect(Date.parse(obs!.observed_at)).toBe(Date.parse("2026-09-10T09:30:00Z")); // entered as UTC, stored as that instant
    expect(await fetchObservationsForSource(createPublicReadClient(), ids.source!)).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  it("approve the source → revalidated; Feature 011's anonymous layer now returns the observation with the exact stored text, raw unit and raw currency — nothing converted", async () => {
    const approved = await withLiveClient(admin, async () => (await layer()).updatePriceSource({ ...SOURCE, sourceId: ids.source, licenceStatus: "APPROVED" }));
    expect(approved.ok).toBe(true);
    expect(cacheCalls.tags).toEqual(REVALIDATED_ONCE);
    const stored = await storedText("price_observations", "raw_value", ids.observation!);
    const publicRecords = await fetchObservationsForSource(createPublicReadClient(), ids.source!);
    expect(publicRecords.map((r) => [r.symbol, r.rawValue, r.rawUnit, r.rawCurrency, r.isStale])).toEqual([["KC", stored, "cents/lb", "USD", false]]);
    const snapshot = await fetchBenchmarkSnapshot(createPublicReadClient(), new Date().toISOString());
    const mine = snapshot.records.filter((r) => r.source.code === `${P}LIVE`);
    expect(mine.map((r) => r.rawValue)).toEqual([stored]);
    expect(JSON.stringify(mine)).not.toMatch(/USD\/kg|USD\/MT|187\.43(?!210*")/);
  }, LIVE_TIMEOUT_MS);

  it("a newer observation supersedes the older one publicly (append-only; the older row is untouched)", async () => {
    const recorded = await withLiveClient(admin, async () => (await layer()).recordPriceObservation({ sourceId: ids.source, symbol: "KC", commodityType: "ARABICA", rawValue: "0.000001", rawCurrency: "USD", rawUnit: "cents/lb", observedAt: "2026-09-11T09:30" }));
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    expect(cacheCalls.tags).toEqual(REVALIDATED_ONCE);
    expect(await storedText("price_observations", "raw_value", recorded.data.id)).toBe("0.000001");
    expect((await fetchObservationsForSource(createPublicReadClient(), ids.source!)).map((r) => r.rawValue)).toEqual(["0.000001"]);
    expect(await storedText("price_observations", "raw_value", ids.observation!)).toMatch(/^187\.43210*$/);
  }, LIVE_TIMEOUT_MS);

  it("RESTRICT the licence → revalidated and hidden publicly at once; re-approve but deactivate → still hidden (licence AND activity gate)", async () => {
    const restricted = await withLiveClient(admin, async () => (await layer()).updatePriceSource({ ...SOURCE, sourceId: ids.source, licenceStatus: "RESTRICTED" }));
    expect(restricted.ok).toBe(true);
    expect(cacheCalls.tags).toEqual(REVALIDATED_ONCE);
    expect(await fetchObservationsForSource(createPublicReadClient(), ids.source!)).toEqual([]);
    cacheCalls.tags.length = 0;
    const inactive = await withLiveClient(admin, async () => (await layer()).updatePriceSource({ ...SOURCE, sourceId: ids.source, licenceStatus: "APPROVED", isActive: "" }));
    expect(inactive.ok).toBe(true);
    expect(cacheCalls.tags).toEqual(REVALIDATED_ONCE);
    expect(await fetchObservationsForSource(createPublicReadClient(), ids.source!)).toEqual([]);
    const { data } = await admin.from("price_sources").select("licence_status, is_active, code, source_type").eq("id", ids.source!).single();
    expect(data).toEqual({ licence_status: "APPROVED", is_active: false, code: `${P}LIVE`, source_type: "ICE_ARABICA" });
  }, LIVE_TIMEOUT_MS);

  it("create a general differential → revalidated and public with its exact amount; retire it (inactive) → revalidated and gone; amount/currency/unit never change", async () => {
    const created = await withLiveClient(admin, async () => (await layer()).createPriceDifferential({ differentialType: "QUALITY", amount: "-1.25", currency: "usd", unit: "KG", effectiveFrom: "2026-09-01T00:00", notes: `${P}live differential`, isActive: "on" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    ids.differential = created.data.id;
    expect(cacheCalls.tags).toEqual(REVALIDATED_ONCE);
    const stored = await storedText("price_differentials", "amount", ids.differential);
    expect(stored).toMatch(/^-1\.250*$/);
    const general = await fetchActiveDifferentials(createPublicReadClient(), { kind: "general" }, new Date());
    expect(general.filter((d) => d.amount === stored).map((d) => [d.type, d.amount, d.currency, d.unit])).toEqual([["QUALITY", stored, "USD", "KG"]]);
    expect(JSON.stringify(general)).not.toContain(`${P}live differential`); // internal notes never public

    cacheCalls.tags.length = 0;
    const retired = await withLiveClient(admin, async () => (await layer()).updatePriceDifferential({ differentialId: ids.differential, isActive: "", notes: `${P}live differential (retired)` }));
    expect(retired.ok).toBe(true);
    expect(cacheCalls.tags).toEqual(REVALIDATED_ONCE);
    expect((await fetchActiveDifferentials(createPublicReadClient(), { kind: "general" }, new Date())).filter((d) => d.amount === stored)).toEqual([]);
    const { data } = await admin.from("price_differentials").select("amount::text, currency, unit, differential_type, is_active").eq("id", ids.differential).single();
    expect(data).toEqual({ amount: stored, currency: "USD", unit: "KG", differential_type: "QUALITY", is_active: false });
  }, LIVE_TIMEOUT_MS);

  it("the admin surfaces render the real rows: the list shows the source and its exact stored value; the detail page shows the forms", async () => {
    await withLiveClient(admin, async () => {
      const { default: Page } = await import("@/src/app/dashboard-admin/(catalogue)/prices/page");
      await renderPage(await Page());
    });
    expect(document.body.textContent).toContain(`${P}LIVE`);
    expect(document.querySelector(`[data-stored-value="${await storedText("price_observations", "raw_value", ids.observation!)}"]`)).not.toBeNull();
    expect(document.querySelector('[data-admin-state="error"]')).toBeNull();
    cleanup();
    await withLiveClient(admin, async () => {
      const { default: Page } = await import("@/src/app/dashboard-admin/(catalogue)/prices/sources/[sourceId]/page");
      await renderPage(await Page({ params: Promise.resolve({ sourceId: ids.source! }) }));
    });
    expect(document.querySelector('[data-record-form="price-source"]')).not.toBeNull();
    expect(document.querySelector('[data-record-form="price-observation"]')).not.toBeNull();
    // TableCardList renders the table AND the narrow-screen cards — count distinct stored values
    const values = new Set([...document.querySelectorAll("[data-stored-value]")].map((el) => el.getAttribute("data-stored-value")));
    expect([...values].sort()).toEqual(["0.000001", await storedText("price_observations", "raw_value", ids.observation!)].sort());
  }, LIVE_TIMEOUT_MS);
});

describe("3. failed or refused mutations NEVER revalidate", () => {
  it("duplicate source code → CODE_TAKEN on the field; duplicate observation instant → OBSERVATION_DUPLICATE; unknown ids → NOT_FOUND; invalid input (exchange-rate commodity, 7 decimals, both scopes, bad window) → VALIDATION_ERROR — and zero revalidations", async () => {
    const results = await withLiveClient(admin, async () => {
      const l = await layer();
      return {
        duplicateCode: await l.createPriceSource(SOURCE),
        duplicateObservation: await l.recordPriceObservation({ sourceId: ids.source, symbol: "KC", commodityType: "ARABICA", rawValue: "5", rawCurrency: "USD", rawUnit: "cents/lb", observedAt: "2026-09-10T09:30" }),
        missingSourceUpdate: await l.updatePriceSource({ ...SOURCE, sourceId: "00000000-0000-4000-8000-000000000000" }),
        missingSourceObservation: await l.recordPriceObservation({ sourceId: "00000000-0000-4000-8000-000000000000", symbol: "KC", commodityType: "ARABICA", rawValue: "5", rawCurrency: "USD", rawUnit: "cents/lb", observedAt: "2026-09-10T09:30" }),
        missingDifferential: await l.updatePriceDifferential({ differentialId: "00000000-0000-4000-8000-000000000000", isActive: "on" }),
        exchangeRate: await l.recordPriceObservation({ sourceId: ids.source, symbol: "EURUSD", commodityType: "FX", rawValue: "1.08", rawCurrency: "USD", rawUnit: "rate", observedAt: "2026-09-10T09:30" }),
        tooPrecise: await l.recordPriceObservation({ sourceId: ids.source, symbol: "KC", commodityType: "ARABICA", rawValue: "1.1234567", rawCurrency: "USD", rawUnit: "cents/lb", observedAt: "2026-09-12T09:30" }),
        bothScopes: await l.createPriceDifferential({ differentialType: "ORIGIN", amount: "1", currency: "USD", unit: "KG", effectiveFrom: "2026-09-01T00:00", coffeeId: "f0000000-0000-4000-8000-000000000044", originId: "f0000000-0000-4000-8000-000000000044", notes: `${P}x` }),
        badWindow: await l.updatePriceDifferential({ differentialId: ids.differential, effectiveUntil: "2020-01-01T00:00", isActive: "on" }),
      };
    });
    expect(results.duplicateCode).toEqual({ ok: false, code: "validation_error", fieldErrors: { code: ["CODE_TAKEN"] } });
    expect(results.duplicateObservation).toEqual({ ok: false, code: "validation_error", fieldErrors: { observedAt: ["OBSERVATION_DUPLICATE"] } });
    expect(results.missingSourceUpdate).toEqual({ ok: false, code: "catalogue_not_found" });
    expect(results.missingSourceObservation).toEqual({ ok: false, code: "catalogue_not_found" });
    expect(results.missingDifferential).toEqual({ ok: false, code: "catalogue_not_found" });
    expect(results.exchangeRate).toMatchObject({ ok: false, code: "validation_error", fieldErrors: { commodityType: ["COMMODITY_INVALID"] } });
    expect(results.tooPrecise).toMatchObject({ ok: false, code: "validation_error", fieldErrors: { rawValue: ["VALUE_INVALID"] } });
    expect(results.bothScopes).toMatchObject({ ok: false, code: "validation_error", fieldErrors: { originId: ["SCOPE_SINGLE"] } });
    expect(results.badWindow).toEqual({ ok: false, code: "validation_error", fieldErrors: { effectiveUntil: ["EFFECTIVE_UNTIL_BEFORE_FROM"] } });
    expect(cacheCalls.tags).toEqual([]);
    const { data: fx } = await admin.from("price_observations").select("id").eq("price_source_id", ids.source!).neq("commodity_type", "ARABICA");
    expect(fx ?? []).toEqual([]);
    const { count } = await admin.from("price_observations").select("id", { count: "exact", head: true }).eq("price_source_id", ids.source!);
    expect(count).toBe(2);
  }, LIVE_TIMEOUT_MS);

  it("nothing is deletable: `authenticated` (even a platform ADMIN) holds no DELETE on the three tables", async () => {
    const deleted = await admin.from("price_sources").delete().eq("id", ids.source!).select("id");
    expect(deleted.error?.code).toBe("42501");
    expect(await taggedSourceCount()).toBe(1);
  }, LIVE_TIMEOUT_MS);
});
