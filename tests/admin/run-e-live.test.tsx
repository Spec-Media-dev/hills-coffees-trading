import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  COMPLETE_DRAFT_TRADE_LICENSE_DOCUMENT_ID,
  FOUNDATION_FIXTURES,
  PHASE89_FIXTURES,
  RUN_E_CATALOGUE_FIXTURES,
  RUN_E_CREATED_ROWS,
  cleanupAuditorFixture,
  cleanupCatalogueAdminFixture,
  cleanupComplianceFixture,
  cleanupRunECreatedRows,
  createAnonymousFixtureClient,
  inspectAuditorFixture,
  inspectCatalogueAdminFixture,
  inspectComplianceFixture,
  prepareAuditorFixture,
  prepareCatalogueAdminFixture,
  prepareComplianceFixture,
  resetCompleteDraftApplication,
  resetRunECatalogueFixture,
  signInAsFixture,
  stageCompleteDraftDocument,
} from "@/tests/auth/fixture-session";

/**
 * Feature 010 RUN E — Phases 7–8 LIVE proof with REAL sessions and REAL rows:
 *   T021/T022  disposable platform ADMIN (role exactly ADMIN) creates / edits / publishes /
 *              unpublishes / archives / restores through the console layer; every other role is
 *              refused by direct action AND by direct URL.
 *   T023       publishing the fixed RUN E proof coffee makes Feature 002's public read return it,
 *              unpublishing makes it return null; the exact Feature 002 tags are revalidated.
 *   T024       media records are manageable; nothing uploads.
 *   T025/T026  disposable AUDITOR reads what the policy grants, is refused every mutation, and the
 *              audit-log view states DB-OPEN-06 from a live zero-row read.
 *   KYB        the server-side approval gate against staged REAL document rows; document-level
 *              outcomes through `create_kyb_review`; the byte route's exact access outcome per role.
 * Every disposable fixture is prepared here and de-privileged in `afterAll`. Rows the suite creates
 * carry `RUN_E_CREATED_ROWS` slugs/codes and are removed again; history/ledger rows are never deleted.
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

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}
async function renderPage(element: React.ReactElement) {
  const { LocaleProvider } = await import("@/components/locale/locale-provider");
  return render(<LocaleProvider>{element}</LocaleProvider>);
}

const LIVE_TIMEOUT_MS = 120_000;
const PROOF = RUN_E_CATALOGUE_FIXTURES;
/** `warehouses.owner_organization_id` is NOT NULL — the buyer-only Foundation organization owns the proof warehouse. */
const OWNER_ORG = "f0000000-0000-4000-8000-000000000001";

let admin: SupabaseClient;
let auditor: SupabaseClient;
let compliance: SupabaseClient;
let warehouse: SupabaseClient;
let finance: SupabaseClient;
let member: SupabaseClient;
let adminUserId: string;

beforeAll(async () => {
  prepareCatalogueAdminFixture();
  prepareAuditorFixture();
  prepareComplianceFixture();
  resetRunECatalogueFixture();
  cleanupRunECreatedRows();
  resetCompleteDraftApplication();
  admin = await signInAsFixture(FOUNDATION_FIXTURES.catalogueAdmin.email);
  adminUserId = (await admin.auth.getUser()).data.user!.id;
  auditor = await signInAsFixture(FOUNDATION_FIXTURES.auditor.email);
  compliance = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
  warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
  finance = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
  member = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
}, LIVE_TIMEOUT_MS);

afterAll(async () => {
  resetRunECatalogueFixture();
  cleanupRunECreatedRows();
  resetCompleteDraftApplication();
  for (const [cleanupFixture, inspectFixture] of [
    [cleanupCatalogueAdminFixture, inspectCatalogueAdminFixture],
    [cleanupAuditorFixture, inspectAuditorFixture],
    [cleanupComplianceFixture, inspectComplianceFixture],
  ] as const) {
    const result = cleanupFixture();
    expect(result.activeAdminPrivilege).toBe(false);
    expect(inspectFixture().activeCapability).toBe(false);
  }
}, LIVE_TIMEOUT_MS);

const coffeeInput = (slug: string) => ({ name: "RUN E created coffee proof", slug, description: "Created through the console by the RUN E live suite.", originId: PROOF.originActiveId, coffeeTypeId: PROOF.coffeeTypeId });

describe("T021 — authorization: only the disposable platform ADMIN may manage coffees", () => {
  it("WAREHOUSE, FINANCE, COMPLIANCE, AUDITOR and a plain member are refused by direct action (CATALOGUE_NOT_CAPABLE); anonymous is refused as unauthenticated — no row is written", async () => {
    for (const [label, client] of [["warehouse", warehouse], ["finance", finance], ["compliance", compliance], ["auditor", auditor], ["member", member]] as const) {
      const result = await withLiveClient(client, async () => {
        const { createCoffee } = await import("@/lib/admin/catalogue");
        return createCoffee(coffeeInput(`${RUN_E_CREATED_ROWS.coffeeSlug}-${label}`));
      });
      expect(result.ok, label).toBe(false);
      if (!result.ok) expect(result.code, label).toBe("catalogue_not_capable");
      const transition = await withLiveClient(client, async () => {
        const { transitionCoffee } = await import("@/lib/admin/catalogue");
        return transitionCoffee({ coffeeId: PROOF.proofCoffeeId, operation: "publish" });
      });
      expect(transition.ok, label).toBe(false);
      if (!transition.ok) expect(transition.code, label).toBe("catalogue_not_capable");
    }
    const anonymous = await withLiveClient(createAnonymousFixtureClient(), async () => {
      const { createCoffee } = await import("@/lib/admin/catalogue");
      return createCoffee(coffeeInput(`${RUN_E_CREATED_ROWS.coffeeSlug}-anon`));
    });
    expect(anonymous.ok).toBe(false);
    if (!anonymous.ok) expect(anonymous.code).toBe("profile_auth_required");
    const { data: stray } = await admin.from("coffees").select("id").like("slug", `${RUN_E_CREATED_ROWS.coffeeSlug}-%`);
    expect(stray ?? []).toEqual([]);
    const { data: proof } = await admin.from("coffees").select("status").eq("id", PROOF.proofCoffeeId).maybeSingle();
    expect(proof?.status).toBe("DRAFT");
  }, LIVE_TIMEOUT_MS);

  it("DIRECT URL: the coffees page refuses WAREHOUSE/FINANCE/COMPLIANCE/AUDITOR with `forbidden`, a member with `no-operational-role`, anonymous with a redirect to the operator sign-in", async () => {
    for (const [label, client] of [["warehouse", warehouse], ["finance", finance], ["compliance", compliance], ["auditor", auditor]] as const) {
      await withLiveClient(client, async () => {
        const { default: CoffeesPage } = await import("@/src/app/dashboard-admin/(catalogue)/coffees/page");
        await renderPage(await CoffeesPage({ searchParams: Promise.resolve({}) }));
      });
      expect(document.querySelector('[data-admin-state="forbidden"]'), label).not.toBeNull();
      expect(document.querySelector("[data-record-form], [data-coffee-filter]"), label).toBeNull();
      cleanup();
    }
    await withLiveClient(member, async () => {
      const { default: CoffeesPage } = await import("@/src/app/dashboard-admin/(catalogue)/coffees/page");
      await renderPage(await CoffeesPage({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector('[data-admin-state="no-operational-role"]')).not.toBeNull();
    cleanup();
    await withLiveClient(createAnonymousFixtureClient(), async () => {
      redirectCalls.targets.length = 0;
      const { default: CoffeesPage } = await import("@/src/app/dashboard-admin/(catalogue)/coffees/page");
      const element = await CoffeesPage({ searchParams: Promise.resolve({}) });
      expect(() => render(element)).toThrow("NEXT_REDIRECT:/admin/sign-in/");
    });
  }, LIVE_TIMEOUT_MS);
});

describe("T021 — coffee management LIVE (disposable ADMIN)", () => {
  it("list shows the DRAFT proof coffee with real reference names; create writes a DRAFT attributed to the operator; a duplicate slug is SLUG_TAKEN; edit changes only content fields", async () => {
    const list = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).listCoffees({ status: "DRAFT" }));
    const proofRow = list.rows.find((row) => row.id === PROOF.proofCoffeeId);
    expect(proofRow).toMatchObject({ slug: PROOF.proofCoffeeSlug, status: "DRAFT" });
    expect(proofRow?.originName).toBeTruthy();

    const created = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).createCoffee(coffeeInput(RUN_E_CREATED_ROWS.coffeeSlug)));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.revalidatedTags).toEqual(["public-coffees", `public-coffee:${RUN_E_CREATED_ROWS.coffeeSlug}`]);
    const { data: row } = await admin.from("coffees").select("status, created_by, updated_by, origin_id").eq("id", created.data.id).maybeSingle();
    expect(row).toEqual({ status: "DRAFT", created_by: adminUserId, updated_by: adminUserId, origin_id: PROOF.originActiveId });

    const duplicate = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).createCoffee(coffeeInput(RUN_E_CREATED_ROWS.coffeeSlug)));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("catalogue_slug_taken");

    const edited = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).updateCoffee({ ...coffeeInput(RUN_E_CREATED_ROWS.coffeeSlug), coffeeId: created.data.id, description: "Edited by the RUN E live suite." }));
    expect(edited.ok).toBe(true);
    const { data: after } = await admin.from("coffees").select("description, status").eq("id", created.data.id).maybeSingle();
    expect(after).toEqual({ description: "Edited by the RUN E live suite.", status: "DRAFT" });

    const invalid = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).createCoffee({ name: "x", slug: "Bad Slug!" }));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid).toMatchObject({ code: "validation_error", fieldErrors: { name: ["NAME_REQUIRED"], slug: ["SLUG_INVALID"] } });
  }, LIVE_TIMEOUT_MS);

  it("a status value outside the four named operations is refused before any write; archive/restore respect coffees_status_check", async () => {
    const bogus = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).transitionCoffee({ coffeeId: PROOF.proofCoffeeId, operation: "PUBLISHED" }));
    expect(bogus.ok).toBe(false);
    if (!bogus.ok) expect(bogus.code).toBe("validation_error");
    // restore from DRAFT is not a valid source state → STALE, no write.
    const restoreFromDraft = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).transitionCoffee({ coffeeId: PROOF.proofCoffeeId, operation: "restore" }));
    expect(restoreFromDraft.ok).toBe(false);
    if (!restoreFromDraft.ok) expect(restoreFromDraft.code).toBe("catalogue_stale");
    const archived = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).transitionCoffee({ coffeeId: PROOF.proofCoffeeId, operation: "archive" }));
    expect(archived.ok).toBe(true);
    if (archived.ok) expect(archived.data).toMatchObject({ fromStatus: "DRAFT", toStatus: "ARCHIVED" });
    const restored = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).transitionCoffee({ coffeeId: PROOF.proofCoffeeId, operation: "restore" }));
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.data).toMatchObject({ fromStatus: "ARCHIVED", toStatus: "DRAFT" });
    // The database CHECK is the backstop: a raw invalid status is refused by Postgres (23514 → STATUS_INVALID mapping).
    const { error } = await admin.from("coffees").update({ status: "LIVE" }).eq("id", PROOF.proofCoffeeId);
    expect(error?.code).toBe("23514");
    const { mapCatalogueError } = await import("@/lib/admin/catalogue");
    expect(mapCatalogueError(error)).toBe("catalogue_status_invalid");
  }, LIVE_TIMEOUT_MS);
});

describe("T023 — publish makes the coffee publicly visible; unpublish makes it a public null; exact Feature 002 tags revalidated", () => {
  it("DRAFT → not public; publish → Feature 002's public detail returns it and the anonymous RLS read sees it; second publish is STALE; unpublish → null again", async () => {
    const { __fetchCoffeeDetailUncached, __fetchCoffeeIndexUncached } = await import("@/lib/public/coffees");
    const anonymous = createAnonymousFixtureClient();
    expect(await __fetchCoffeeDetailUncached(PROOF.proofCoffeeSlug)).toBeNull();
    expect((await anonymous.from("coffees").select("id").eq("slug", PROOF.proofCoffeeSlug)).data ?? []).toEqual([]);

    cacheCalls.tags.length = 0;
    const published = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).transitionCoffee({ coffeeId: PROOF.proofCoffeeId, operation: "publish" }));
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.data).toMatchObject({ fromStatus: "DRAFT", toStatus: "PUBLISHED", revalidatedTags: ["public-coffees", `public-coffee:${PROOF.proofCoffeeSlug}`] });
    expect(cacheCalls.tags).toEqual([
      { tag: "public-coffees", options: { expire: 0 } },
      { tag: `public-coffee:${PROOF.proofCoffeeSlug}`, options: { expire: 0 } },
    ]);

    const publicDetail = await __fetchCoffeeDetailUncached(PROOF.proofCoffeeSlug);
    expect(publicDetail?.slug).toBe(PROOF.proofCoffeeSlug);
    expect((await __fetchCoffeeIndexUncached()).some((coffee) => coffee.slug === PROOF.proofCoffeeSlug)).toBe(true);
    expect((await anonymous.from("coffees").select("status").eq("slug", PROOF.proofCoffeeSlug).maybeSingle()).data?.status).toBe("PUBLISHED");

    const again = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).transitionCoffee({ coffeeId: PROOF.proofCoffeeId, operation: "publish" }));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("catalogue_stale");

    cacheCalls.tags.length = 0;
    const unpublished = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).transitionCoffee({ coffeeId: PROOF.proofCoffeeId, operation: "unpublish" }));
    expect(unpublished.ok).toBe(true);
    if (unpublished.ok) expect(unpublished.data).toMatchObject({ fromStatus: "PUBLISHED", toStatus: "DRAFT" });
    expect(cacheCalls.tags.map((call) => call.tag)).toEqual(["public-coffees", `public-coffee:${PROOF.proofCoffeeSlug}`]);
    expect(await __fetchCoffeeDetailUncached(PROOF.proofCoffeeSlug)).toBeNull();
    expect((await anonymous.from("coffees").select("id").eq("slug", PROOF.proofCoffeeSlug)).data ?? []).toEqual([]);
  }, LIVE_TIMEOUT_MS);
});

describe("T022 — origins, regions, taxonomy and warehouse reference data LIVE (disposable ADMIN)", () => {
  it("region → origin (status vocabulary enforced) → tag → warehouse + location: created, edited, attributed; duplicates are SLUG_TAKEN; non-admin refused", async () => {
    const region = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).createRegion({ name: "RUN E region proof", slug: RUN_E_CREATED_ROWS.regionSlug, countryCode: "et" }));
    expect(region.ok).toBe(true);
    if (!region.ok) return;
    expect(region.data.revalidatedTags).toEqual(["public-origins", "public-coffees"]);
    const duplicateRegion = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).createRegion({ name: "RUN E region proof", slug: RUN_E_CREATED_ROWS.regionSlug }));
    expect(duplicateRegion.ok).toBe(false);
    if (!duplicateRegion.ok) expect(duplicateRegion.code).toBe("catalogue_slug_taken");

    const badStatus = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).createOrigin({ name: "RUN E origin proof", slug: RUN_E_CREATED_ROWS.originSlug, status: "PUBLISHED", regionId: region.data.id }));
    expect(badStatus.ok).toBe(false);
    if (!badStatus.ok) expect(badStatus.code).toBe("validation_error");
    const origin = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).createOrigin({ name: "RUN E origin proof", slug: RUN_E_CREATED_ROWS.originSlug, status: "INACTIVE", countryCode: "ET", regionId: region.data.id }));
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    expect(origin.data.revalidatedTags).toEqual(["public-origins", `public-origin:${RUN_E_CREATED_ROWS.originSlug}`, "public-coffees"]);
    // INACTIVE is not public (public_read_origins = status ACTIVE).
    expect((await createAnonymousFixtureClient().from("origins").select("id").eq("slug", RUN_E_CREATED_ROWS.originSlug)).data ?? []).toEqual([]);
    const activated = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).updateOrigin({ originId: origin.data.id, name: "RUN E origin proof", slug: RUN_E_CREATED_ROWS.originSlug, status: "ACTIVE", countryCode: "ET", regionId: region.data.id }));
    expect(activated.ok).toBe(true);
    expect((await createAnonymousFixtureClient().from("origins").select("status").eq("slug", RUN_E_CREATED_ROWS.originSlug).maybeSingle()).data?.status).toBe("ACTIVE");
    const selfParent = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).updateOrigin({ originId: origin.data.id, name: "RUN E origin proof", slug: RUN_E_CREATED_ROWS.originSlug, status: "ACTIVE", parentOriginId: origin.data.id }));
    expect(selfParent.ok).toBe(false);

    const tag = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).createTaxonomyEntry({ kind: "tags", name: "RUN E tag proof", slug: RUN_E_CREATED_ROWS.tagSlug }));
    expect(tag.ok).toBe(true);
    if (tag.ok) expect(tag.data.revalidatedTags).toEqual(["public-taxonomy", "public-coffees"]);
    const badKind = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).createTaxonomyEntry({ kind: "organizations", name: "x", slug: "x" }));
    expect(badKind.ok).toBe(false);

    const warehouseRow = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).createWarehouse({ code: RUN_E_CREATED_ROWS.warehouseCode, name: "RUN E warehouse proof", countryCode: "AE", city: "Dubai", ownerOrganizationId: OWNER_ORG, isActive: "on" }));
    expect(warehouseRow.ok).toBe(true);
    if (!warehouseRow.ok) return;
    expect(warehouseRow.data.revalidatedTags).toEqual([]);
    const location = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).createWarehouseLocation({ warehouseId: warehouseRow.data.id, code: "A-01", name: "Rack A-01" }));
    expect(location.ok).toBe(true);
    const deactivated = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).updateWarehouse({ warehouseId: warehouseRow.data.id, code: RUN_E_CREATED_ROWS.warehouseCode, name: "RUN E warehouse proof", countryCode: "AE", ownerOrganizationId: OWNER_ORG, isActive: "" }));
    expect(deactivated.ok).toBe(true);
    const { data: stored } = await admin.from("warehouses").select("is_active, created_by").eq("id", warehouseRow.data.id).maybeSingle();
    expect(stored).toEqual({ is_active: false, created_by: adminUserId });
    // An inactive warehouse is hidden from the public/member read (public_read_warehouses = is_active).
    expect((await member.from("warehouses").select("id").eq("id", warehouseRow.data.id)).data ?? []).toEqual([]);

    for (const [label, client] of [["finance", finance], ["auditor", auditor]] as const) {
      const refused = await withLiveClient(client, async () => (await import("@/lib/admin/catalogue")).updateWarehouse({ warehouseId: warehouseRow.data.id, code: RUN_E_CREATED_ROWS.warehouseCode, name: "tampered", countryCode: "AE", ownerOrganizationId: OWNER_ORG, isActive: "on" }));
      expect(refused.ok, label).toBe(false);
      if (!refused.ok) expect(refused.code, label).toBe("catalogue_not_capable");
    }
  }, LIVE_TIMEOUT_MS);
});

describe("T024 — media records (disposable ADMIN)", () => {
  it("records are readable and manageable through the console layer; a missing record is NOT_FOUND; the detail page states the upload gap with no file input", async () => {
    const media = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).listCoffeeMedia(PROOF.proofCoffeeId));
    const record = media.find((row) => row.id === PROOF.proofMediaId);
    expect(record).toMatchObject({ coffeeId: PROOF.proofCoffeeId, sortOrder: 0, isPrimary: false });
    expect(record?.file?.originalName).toBe("run-e-proof-media.jpg");
    // Manage the REAL record: primary flag and sort order persist; nothing else on the row changes.
    const primary = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).setCoffeeMediaPrimary({ coffeeId: PROOF.proofCoffeeId, mediaId: PROOF.proofMediaId }));
    expect(primary.ok).toBe(true);
    if (primary.ok) expect(primary.data.revalidatedTags).toEqual(["public-coffees", `public-coffee:${PROOF.proofCoffeeSlug}`]);
    const reordered = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).setCoffeeMediaSortOrder({ coffeeId: PROOF.proofCoffeeId, mediaId: PROOF.proofMediaId, sortOrder: "3" }));
    expect(reordered.ok).toBe(true);
    const { data: stored } = await admin.from("coffee_media").select("is_primary, sort_order, file_asset_id").eq("id", PROOF.proofMediaId).maybeSingle();
    expect(stored).toEqual({ is_primary: true, sort_order: 3, file_asset_id: "f0000000-0000-4000-8000-000000000045" });
    const refused = await withLiveClient(finance, async () => (await import("@/lib/admin/catalogue")).setCoffeeMediaSortOrder({ coffeeId: PROOF.proofCoffeeId, mediaId: PROOF.proofMediaId, sortOrder: "9" }));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("catalogue_not_capable");
    const missing = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).setCoffeeMediaPrimary({ coffeeId: PROOF.proofCoffeeId, mediaId: "f0000000-0000-4000-8000-0000000000ff" }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("catalogue_not_found");
    await withLiveClient(admin, async () => {
      const { default: CoffeeDetailPage } = await import("@/src/app/dashboard-admin/(catalogue)/coffees/[coffeeId]/page");
      await renderPage(await CoffeeDetailPage({ params: Promise.resolve({ coffeeId: PROOF.proofCoffeeId }) }));
    });
    expect(document.querySelector('[data-media-upload="unavailable"]')).not.toBeNull();
    expect(document.querySelector(`[data-media-record="${PROOF.proofMediaId}"]`)).not.toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.querySelector('[data-record-form="coffee"]')).not.toBeNull();
    expect(document.querySelector('[data-decision-form="publication"]')).not.toBeNull();
    expect(screen.getAllByText(/Image upload is not available yet/).length).toBeGreaterThan(0);
  }, LIVE_TIMEOUT_MS);
});

describe("T025 / T026 — AUDITOR is read-only by construction (disposable AUDITOR)", () => {
  it("AUDITOR reaches the audit area only; listings/custody reads return real rows; every mutation path refuses the role; a direct table write affects zero rows", async () => {
    await withLiveClient(auditor, async () => {
      const { checkAreaAccess, checkGroupAccess } = await import("@/lib/admin/guards");
      expect((await checkAreaAccess("audit")).ok).toBe(true);
      for (const group of ["compliance", "warehouse", "finance", "catalogue", "system"] as const) expect((await checkGroupAccess(group)).ok, group).toBe(false);
      const { listAuditListings, listAuditPositions } = await import("@/lib/admin/audit");
      expect((await listAuditListings()).rows.length).toBeGreaterThan(0);
      expect((await listAuditPositions()).rows.length).toBeGreaterThan(0);
    });
    const listing = await withLiveClient(auditor, async () => (await import("@/lib/admin/decisions")).decideListing({ offerId: "06000000-0000-4000-8000-00000000000d", decision: "APPROVED" }));
    expect(listing.ok).toBe(false);
    if (!listing.ok) expect(listing.code).toBe("compliance_not_capable");
    const kyb = await withLiveClient(auditor, async () => (await import("@/lib/admin/decisions")).decideKybApplication({ applicationId: PHASE89_FIXTURES.underReview.applicationId, decision: "REJECTED", reason: "auditor must not decide" }));
    expect(kyb.ok).toBe(false);
    if (!kyb.ok) expect(kyb.code).toBe("compliance_not_capable");
    const coffee = await withLiveClient(auditor, async () => (await import("@/lib/admin/catalogue")).transitionCoffee({ coffeeId: PROOF.proofCoffeeId, operation: "publish" }));
    expect(coffee.ok).toBe(false);
    if (!coffee.ok) expect(coffee.code).toBe("catalogue_not_capable");
    const { data: touched } = await auditor.from("coffee_offers").update({ rejection_reason: "auditor tamper" }).eq("id", "06000000-0000-4000-8000-00000000000d").select("id");
    expect(touched ?? []).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  it("the audit pages render zero mutation controls for AUDITOR; the log view states DB-OPEN-06 from a live zero-row read (audit_admin_read = is_platform_admin() only); member and anonymous are refused", async () => {
    await withLiveClient(auditor, async () => {
      const { default: AuditPage } = await import("@/src/app/dashboard-admin/(audit)/audit/page");
      await renderPage(await AuditPage({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector("[data-audit-read-only]")).not.toBeNull();
    expect(document.querySelector("form, button[type='submit'], input, textarea, select, [data-decision-form], [data-record-form]")).toBeNull();
    cleanup();
    const probe = await withLiveClient(auditor, async () => (await import("@/lib/admin/audit")).probeAuditLog({ isPlatformAdmin: false }));
    expect(probe).toEqual({ readable: false, reason: "policy" });
    expect((await auditor.from("audit_logs").select("id").limit(1)).data ?? []).toEqual([]);
    await withLiveClient(auditor, async () => {
      const { default: AuditPage } = await import("@/src/app/dashboard-admin/(audit)/audit/page");
      await renderPage(await AuditPage({ searchParams: Promise.resolve({ view: "log" }) }));
    });
    expect(document.querySelector('[data-capability-gap="db-open-06"]')).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/permission denied|row-level security|42501/);
    cleanup();
    await withLiveClient(member, async () => {
      const { default: AuditPage } = await import("@/src/app/dashboard-admin/(audit)/audit/page");
      await renderPage(await AuditPage({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector('[data-admin-state="no-operational-role"]')).not.toBeNull();
    cleanup();
    await withLiveClient(createAnonymousFixtureClient(), async () => {
      const { default: AuditPage } = await import("@/src/app/dashboard-admin/(audit)/audit/page");
      const element = await AuditPage({ searchParams: Promise.resolve({}) });
      expect(() => render(element)).toThrow("NEXT_REDIRECT:/admin/sign-in/");
    });
  }, LIVE_TIMEOUT_MS);
});

describe("KYB review coherence LIVE (COMPLIANCE fixture) — the server-side approval gate against real rows", () => {
  const APP = PHASE89_FIXTURES.completeDraft.applicationId;
  async function submitCompleteDraft() {
    resetCompleteDraftApplication();
    const owner = await signInAsFixture(PHASE89_FIXTURES.completeDraft.email);
    const { error } = await owner.rpc("submit_kyb_application", { p_application_id: APP });
    if (error) throw new Error(`fixture submit failed: ${error.message}`);
  }
  const approve = () => withLiveClient(compliance, async () => (await import("@/lib/admin/decisions")).decideKybApplication({ applicationId: APP, decision: "APPROVED" }));
  const reviewCount = async () => ((await compliance.from("kyb_reviews").select("id").eq("application_id", APP)).data ?? []).length;

  it("missing required evidence (the under-review fixture has no documents) blocks APPROVED — no status change, no review row", async () => {
    const before = await reviewCount();
    const result = await withLiveClient(compliance, async () => (await import("@/lib/admin/decisions")).decideKybApplication({ applicationId: PHASE89_FIXTURES.underReview.applicationId, decision: "APPROVED" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result).toMatchObject({ code: "kyb_approval_blocked", fieldErrors: { decision: expect.arrayContaining(["missing:TRADE_LICENSE"]) } });
    expect((await compliance.from("kyb_applications").select("status").eq("id", PHASE89_FIXTURES.underReview.applicationId).maybeSingle()).data?.status).toBe("UNDER_REVIEW");
    expect(await reviewCount()).toBe(before);
  }, LIVE_TIMEOUT_MS);

  it("PENDING, REJECTED and EXPIRED required evidence each block APPROVED on the SUBMITTED complete-draft application; accepted current evidence permits it", async () => {
    await submitCompleteDraft();
    for (const [mode, state] of [["PENDING", "awaiting"], ["REJECTED", "rejected"], ["EXPIRED", "expired"]] as const) {
      stageCompleteDraftDocument(mode);
      const result = await approve();
      expect(result.ok, mode).toBe(false);
      if (!result.ok) expect(result, mode).toMatchObject({ code: "kyb_approval_blocked", fieldErrors: { decision: [`${state}:TRADE_LICENSE`] } });
      expect((await compliance.from("kyb_applications").select("status").eq("id", APP).maybeSingle()).data?.status, mode).toBe("SUBMITTED");
      // The page derives the same verdict from the same rows.
      await withLiveClient(compliance, async () => {
        const { default: KybApplicationPage } = await import("@/src/app/dashboard-admin/(compliance)/kyb/[applicationId]/page");
        await renderPage(await KybApplicationPage({ params: Promise.resolve({ applicationId: APP }) }));
      });
      expect(document.querySelector('[data-approval-readiness="blocked"]'), mode).not.toBeNull();
      expect(document.querySelector(`[data-approval-blocker="${state}:TRADE_LICENSE"]`), mode).not.toBeNull();
      expect(document.querySelector("[data-approval-blocked]"), mode).not.toBeNull();
      expect(document.querySelector('[data-decision-option="APPROVED"]'), mode).toBeNull();
      cleanup();
    }
    stageCompleteDraftDocument("ACCEPTED");
    await withLiveClient(compliance, async () => {
      const { default: KybApplicationPage } = await import("@/src/app/dashboard-admin/(compliance)/kyb/[applicationId]/page");
      await renderPage(await KybApplicationPage({ params: Promise.resolve({ applicationId: APP }) }));
    });
    expect(document.querySelector('[data-approval-readiness="ready"]')).not.toBeNull();
    expect(document.querySelector('[data-decision-option="APPROVED"]')).not.toBeNull();
    expect(document.querySelector("[data-readiness-accepted]")?.getAttribute("data-readiness-accepted")).toBe("5");
    cleanup();
    const approved = await approve();
    expect(approved.ok).toBe(true);
    if (approved.ok) expect(approved.data.toStatus).toBe("APPROVED");
    resetCompleteDraftApplication();
  }, LIVE_TIMEOUT_MS * 2);

  it("document outcome: rejection without a reason is a field error; an already-ACCEPTED document is STALE (no ledger write); a staged PENDING document is ACCEPTED through create_kyb_review with reviewer attribution", async () => {
    await submitCompleteDraft();
    const ledger = async () => ((await compliance.from("kyb_review_items").select("id, decision, reviewer_user_id").eq("document_id", COMPLETE_DRAFT_TRADE_LICENSE_DOCUMENT_ID).order("created_at")).data ?? []);
    const before = await ledger();
    const noReason = await withLiveClient(compliance, async () => (await import("@/lib/admin/decisions")).reviewKybDocument({ applicationId: APP, documentId: COMPLETE_DRAFT_TRADE_LICENSE_DOCUMENT_ID, decision: "REJECTED" }));
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason).toMatchObject({ code: "validation_error", fieldErrors: { reason: ["REASON_REQUIRED"] } });
    const stale = await withLiveClient(compliance, async () => (await import("@/lib/admin/decisions")).reviewKybDocument({ applicationId: APP, documentId: COMPLETE_DRAFT_TRADE_LICENSE_DOCUMENT_ID, decision: "ACCEPTED" }));
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("kyb_document_review_stale");
    expect(await ledger()).toEqual(before);

    stageCompleteDraftDocument("PENDING");
    await withLiveClient(compliance, async () => {
      const { default: KybApplicationPage } = await import("@/src/app/dashboard-admin/(compliance)/kyb/[applicationId]/page");
      await renderPage(await KybApplicationPage({ params: Promise.resolve({ applicationId: APP }) }));
    });
    expect(document.querySelector(`[data-decision-form="document-${COMPLETE_DRAFT_TRADE_LICENSE_DOCUMENT_ID}"]`)).not.toBeNull();
    cleanup();
    const recorded = await withLiveClient(compliance, async () => (await import("@/lib/admin/decisions")).reviewKybDocument({ applicationId: APP, documentId: COMPLETE_DRAFT_TRADE_LICENSE_DOCUMENT_ID, decision: "ACCEPTED" }));
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    expect(recorded.data.documentStatus).toBe("ACCEPTED");
    const after = await ledger();
    expect(after.length).toBe(before.length + 1);
    const complianceUserId = (await compliance.auth.getUser()).data.user!.id;
    expect(after.at(-1)).toMatchObject({ id: recorded.data.reviewId, decision: "ACCEPTED", reviewer_user_id: complianceUserId });
    for (const previous of before) expect(after.find((row) => row.id === previous.id)).toBeTruthy();
    // A non-compliance operator cannot record an outcome (the RPC requires is_compliance_operator()).
    const refused = await withLiveClient(finance, async () => (await import("@/lib/admin/decisions")).reviewKybDocument({ applicationId: APP, documentId: COMPLETE_DRAFT_TRADE_LICENSE_DOCUMENT_ID, decision: "ACCEPTED" }));
    expect(refused.ok).toBe(false);
    resetCompleteDraftApplication();
  }, LIVE_TIMEOUT_MS * 2);

  it("document bytes: a pure COMPLIANCE role cannot locate the file record (unlocatable → empty 404); the byte route never distinguishes refusal from absence", async () => {
    const outcome = await withLiveClient(compliance, async () => (await import("@/lib/admin/kyb-documents")).readKybDocumentFile({ applicationId: APP, documentId: COMPLETE_DRAFT_TRADE_LICENSE_DOCUMENT_ID }));
    expect(outcome).toEqual({ ok: false, reason: "unlocatable" });
    const forbidden = await withLiveClient(finance, async () => (await import("@/lib/admin/kyb-documents")).readKybDocumentFile({ applicationId: APP, documentId: COMPLETE_DRAFT_TRADE_LICENSE_DOCUMENT_ID }));
    expect(forbidden).toEqual({ ok: false, reason: "forbidden" });
    const response = await withLiveClient(finance, async () => {
      const { GET } = await import("@/src/app/dashboard-admin/(compliance)/kyb/[applicationId]/documents/[documentId]/file/route");
      return GET(new Request("http://localhost/x"), { params: Promise.resolve({ applicationId: APP, documentId: COMPLETE_DRAFT_TRADE_LICENSE_DOCUMENT_ID }) });
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("");
    await withLiveClient(compliance, async () => {
      const { default: KybApplicationPage } = await import("@/src/app/dashboard-admin/(compliance)/kyb/[applicationId]/page");
      await renderPage(await KybApplicationPage({ params: Promise.resolve({ applicationId: APP }) }));
    });
    expect(document.querySelector("[data-document-view]")).toBeNull();
    expect(document.querySelector("[data-document-view-unavailable]")).not.toBeNull();
    expect(document.querySelector('[data-kyb-section="summary"]')).not.toBeNull();
  }, LIVE_TIMEOUT_MS);
});
