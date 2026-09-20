import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  COMPLETE_DRAFT_TRADE_LICENSE_DOCUMENT_ID,
  FOUNDATION_FIXTURES,
  RUN_E_CATALOGUE_FIXTURES,
  RUN_E_CREATED_ROWS,
  cleanupCatalogueAdminFixture,
  cleanupRunECreatedRows,
  createAnonymousFixtureClient,
  inspectCatalogueAdminFixture,
  inspectUpdatedAtColumns,
  prepareCatalogueAdminFixture,
  resetCompleteDraftApplication,
  resetRunECatalogueFixture,
  signInAsFixture,
  stageCompleteDraftDocument,
} from "@/tests/auth/fixture-session";

/**
 * Database hygiene RUN M2 — LIVE proof that, after migration `20260920140000_database_hygiene_updated_at.sql`, the
 * DATABASE owns `updated_at` on the mutable tables. **Run only after the migration is applied** (before that it fails,
 * correctly: the column does not exist on the group-A tables).
 *
 * Representative tables, driven through the console's own domain functions with the disposable catalogue ADMIN:
 *   group B (column pre-existed, trigger new): regions, origins, warehouses
 *   group A (column + trigger new):            tags (taxonomy), warehouse_locations, coffee_media, kyb_documents
 * plus the read-only per-table column report for ALL 13 tables and the proof that append-only tables have no column.
 * Disposable rows only (RUN E's fixed slugs/codes, removed in `afterAll`; the proof coffee's media and the
 * complete-draft KYB document are restored by their existing reset commands). No business decision is made.
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
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

const LIVE_TIMEOUT_MS = 180_000;
const OWNER_ORG = "f0000000-0000-4000-8000-000000000001";
const M2_TABLES = ["kyb_documents", "order_items", "coffee_media", "warehouse_locations", "coffee_types", "coffee_varieties", "processing_methods", "packaging_types", "tags", "origins", "regions", "warehouses", "offer_sensory_notes"] as const;
const APPEND_ONLY_SAMPLE = ["audit_logs", "notifications", "payment_events", "order_status_history", "account_status_history", "kyb_reviews", "dispute_evidence", "file_assets"] as const;

let admin: SupabaseClient;
let finance: SupabaseClient;
let member: SupabaseClient;

const catalogue = async () => import("@/lib/admin/catalogue");
async function updatedAt(client: SupabaseClient, table: string, id: string): Promise<number> {
  const { data, error } = await client.from(table).select("updated_at").eq("id", id).single();
  if (error || !data) throw new Error(`updated_at read failed on ${table}: ${error?.code}`);
  return Date.parse((data as { updated_at: string }).updated_at);
}
/** Everything about a row except updated_at, as a stable string. */
async function rowWithoutUpdatedAt(client: SupabaseClient, table: string, id: string): Promise<string> {
  const { data, error } = await client.from(table).select("*").eq("id", id).single();
  if (error || !data) throw new Error(`row read failed on ${table}: ${error?.code}`);
  const { updated_at: _ignored, ...rest } = data as Record<string, unknown>;
  void _ignored;
  return JSON.stringify(rest);
}
async function allRowsSnapshot(client: SupabaseClient, table: string, excludeIds: readonly string[]): Promise<string> {
  const { data, error } = await client.from(table).select("*").order("id");
  if (error) throw new Error(`snapshot failed on ${table}: ${error.code}`);
  return JSON.stringify((data ?? []).filter((row) => !excludeIds.includes((row as { id: string }).id)));
}

beforeAll(async () => {
  prepareCatalogueAdminFixture();
  resetRunECatalogueFixture();
  cleanupRunECreatedRows();
  resetCompleteDraftApplication();
  admin = await signInAsFixture(FOUNDATION_FIXTURES.catalogueAdmin.email);
  finance = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
  member = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
}, LIVE_TIMEOUT_MS);

afterAll(() => {
  resetRunECatalogueFixture();
  cleanupRunECreatedRows();
  resetCompleteDraftApplication();
  expect(cleanupCatalogueAdminFixture().activeAdminPrivilege).toBe(false);
  expect(inspectCatalogueAdminFixture().activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

describe("M2 live — schema shape (read-only)", () => {
  it("all 13 M2 tables expose a non-NULL updated_at through the API; append-only tables have no such column", async () => {
    const report = inspectUpdatedAtColumns();
    for (const table of M2_TABLES) {
      expect(report[table], `${table} report`).toBeDefined();
      expect(report[table]!.readable, `${table}.updated_at readable`).toBe(true);
      expect(report[table]!.nullUpdatedAt, `${table} NULL updated_at`).toBe(0);
    }
    for (const table of APPEND_ONLY_SAMPLE) {
      const { error } = await admin.from(table).select("updated_at").limit(1);
      expect(error, `${table} must NOT have updated_at`).not.toBeNull();
      expect(error?.code).toBe("42703");
    }
  }, LIVE_TIMEOUT_MS);
});

describe("M2 live — the database advances updated_at on real console edits (group B: regions, origins, warehouses)", () => {
  it("region / origin / warehouse: creation stamps updated_at; an edit advances it; a client-supplied backdate is overridden; unrelated rows are untouched", async () => {
    const siblingRegionBefore = await rowWithoutUpdatedAt(admin, "regions", RUN_E_CATALOGUE_FIXTURES.regionId);
    const siblingRegionStamp = await updatedAt(admin, "regions", RUN_E_CATALOGUE_FIXTURES.regionId);
    const siblingOriginBefore = await rowWithoutUpdatedAt(admin, "origins", RUN_E_CATALOGUE_FIXTURES.originActiveId);
    const siblingOriginStamp = await updatedAt(admin, "origins", RUN_E_CATALOGUE_FIXTURES.originActiveId);

    const region = await withLiveClient(admin, async () => (await catalogue()).createRegion({ name: "RUN E region proof", slug: RUN_E_CREATED_ROWS.regionSlug }));
    expect(region.ok).toBe(true);
    if (!region.ok) return;
    const regionCreated = await updatedAt(admin, "regions", region.data.id);
    const renamedRegion = await withLiveClient(admin, async () => (await catalogue()).updateRegion({ regionId: region.data.id, name: "RUN E region proof (edited)", slug: RUN_E_CREATED_ROWS.regionSlug }));
    expect(renamedRegion.ok).toBe(true);
    expect(await updatedAt(admin, "regions", region.data.id)).toBeGreaterThan(regionCreated);
    const backdated = await admin.from("regions").update({ name: "RUN E region proof (backdated)", updated_at: "2001-01-01T00:00:00Z" }).eq("id", region.data.id).select("updated_at").single();
    expect(backdated.error).toBeNull();
    expect(Date.parse(backdated.data!.updated_at as string)).toBeGreaterThan(Date.parse("2020-01-01"));

    const origin = await withLiveClient(admin, async () => (await catalogue()).createOrigin({ name: "RUN E origin proof", slug: RUN_E_CREATED_ROWS.originSlug, status: "INACTIVE", countryCode: "ET", regionId: region.data.id }));
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    const originCreated = await updatedAt(admin, "origins", origin.data.id);
    const activated = await withLiveClient(admin, async () => (await catalogue()).updateOrigin({ originId: origin.data.id, name: "RUN E origin proof", slug: RUN_E_CREATED_ROWS.originSlug, status: "ACTIVE", countryCode: "ET", regionId: region.data.id }));
    expect(activated.ok).toBe(true);
    expect(await updatedAt(admin, "origins", origin.data.id), "origins.updated_at advances (before M2 nothing maintained it)").toBeGreaterThan(originCreated);

    const warehouse = await withLiveClient(admin, async () => (await catalogue()).createWarehouse({ code: RUN_E_CREATED_ROWS.warehouseCode, name: "RUN E warehouse proof", countryCode: "AE", city: "Dubai", ownerOrganizationId: OWNER_ORG, isActive: "on" }));
    expect(warehouse.ok).toBe(true);
    if (!warehouse.ok) return;
    const warehouseCreated = await updatedAt(admin, "warehouses", warehouse.data.id);
    const deactivated = await withLiveClient(admin, async () => (await catalogue()).updateWarehouse({ warehouseId: warehouse.data.id, code: RUN_E_CREATED_ROWS.warehouseCode, name: "RUN E warehouse proof", countryCode: "AE", ownerOrganizationId: OWNER_ORG, isActive: "" }));
    expect(deactivated.ok).toBe(true);
    expect(await updatedAt(admin, "warehouses", warehouse.data.id)).toBeGreaterThan(warehouseCreated);

    // unrelated rows: content AND timestamp unchanged
    expect(await rowWithoutUpdatedAt(admin, "regions", RUN_E_CATALOGUE_FIXTURES.regionId)).toBe(siblingRegionBefore);
    expect(await updatedAt(admin, "regions", RUN_E_CATALOGUE_FIXTURES.regionId)).toBe(siblingRegionStamp);
    expect(await rowWithoutUpdatedAt(admin, "origins", RUN_E_CATALOGUE_FIXTURES.originActiveId)).toBe(siblingOriginBefore);
    expect(await updatedAt(admin, "origins", RUN_E_CATALOGUE_FIXTURES.originActiveId)).toBe(siblingOriginStamp);
  }, LIVE_TIMEOUT_MS);
});

describe("M2 live — group A (column AND trigger are new): tags, warehouse_locations, coffee_media, kyb_documents", () => {
  it("tags (taxonomy) and warehouse_locations: DEFAULT now() on insert, trigger advances on edit, backdate overridden, unrelated rows untouched", async () => {
    cleanupRunECreatedRows(); // the previous test's disposable warehouse/region/origin (fixed codes) must be gone before re-creating
    const otherTypeBefore = await rowWithoutUpdatedAt(admin, "coffee_types", RUN_E_CATALOGUE_FIXTURES.coffeeTypeId);
    const otherTypeStamp = await updatedAt(admin, "coffee_types", RUN_E_CATALOGUE_FIXTURES.coffeeTypeId);

    const tag = await withLiveClient(admin, async () => (await catalogue()).createTaxonomyEntry({ kind: "tags", name: "RUN E tag proof", slug: RUN_E_CREATED_ROWS.tagSlug }));
    expect(tag.ok).toBe(true);
    if (!tag.ok) return;
    const tagsBefore = await allRowsSnapshot(admin, "tags", [tag.data.id]);
    const created = await updatedAt(admin, "tags", tag.data.id);
    expect(Math.abs(created - Date.now()), "insert stamps updated_at with now()").toBeLessThan(10 * 60_000);
    const edited = await withLiveClient(admin, async () => (await catalogue()).updateTaxonomyEntry({ kind: "tags", entryId: tag.data.id, name: "RUN E tag proof (edited)", slug: RUN_E_CREATED_ROWS.tagSlug }));
    expect(edited.ok).toBe(true);
    expect(await updatedAt(admin, "tags", tag.data.id), "tags.updated_at advances on edit").toBeGreaterThan(created);
    const backdated = await admin.from("tags").update({ name: "RUN E tag proof (backdated)", updated_at: "2001-01-01T00:00:00Z" }).eq("id", tag.data.id).select("updated_at").single();
    expect(backdated.error).toBeNull();
    expect(Date.parse(backdated.data!.updated_at as string)).toBeGreaterThan(Date.parse("2020-01-01"));
    expect(await allRowsSnapshot(admin, "tags", [tag.data.id]), "no other tag row changed (content or updated_at)").toBe(tagsBefore);
    expect(await rowWithoutUpdatedAt(admin, "coffee_types", RUN_E_CATALOGUE_FIXTURES.coffeeTypeId)).toBe(otherTypeBefore);
    expect(await updatedAt(admin, "coffee_types", RUN_E_CATALOGUE_FIXTURES.coffeeTypeId)).toBe(otherTypeStamp);

    const warehouse = await withLiveClient(admin, async () => (await catalogue()).createWarehouse({ code: RUN_E_CREATED_ROWS.warehouseCode, name: "RUN E warehouse proof", countryCode: "AE", city: "Dubai", ownerOrganizationId: OWNER_ORG, isActive: "on" }));
    expect(warehouse.ok).toBe(true);
    if (!warehouse.ok) return;
    const location = await withLiveClient(admin, async () => (await catalogue()).createWarehouseLocation({ warehouseId: warehouse.data.id, code: "A-01", name: "Rack A-01" }));
    expect(location.ok).toBe(true);
    if (!location.ok) return;
    const locationCreated = await updatedAt(admin, "warehouse_locations", location.data.id);
    const renamed = await withLiveClient(admin, async () => (await catalogue()).updateWarehouseLocation({ warehouseId: warehouse.data.id, locationId: location.data.id, code: "A-01", name: "Rack A-01 (edited)" }));
    expect(renamed.ok).toBe(true);
    expect(await updatedAt(admin, "warehouse_locations", location.data.id), "warehouse_locations.updated_at advances on edit").toBeGreaterThan(locationCreated);
  }, LIVE_TIMEOUT_MS);

  it("coffee_media: a sort-order edit advances updated_at and nothing else on that row or its siblings", async () => {
    const media = RUN_E_CATALOGUE_FIXTURES.proofMediaId;
    const { data: siblings } = await admin.from("coffee_media").select("id").neq("id", media);
    const siblingIds = (siblings ?? []).map((row) => row.id as string);
    const siblingsBefore = await allRowsSnapshot(admin, "coffee_media", [media]);
    const before = await updatedAt(admin, "coffee_media", media);
    const reordered = await withLiveClient(admin, async () => (await catalogue()).setCoffeeMediaSortOrder({ coffeeId: RUN_E_CATALOGUE_FIXTURES.proofCoffeeId, mediaId: media, sortOrder: "7" }));
    expect(reordered.ok).toBe(true);
    expect(await updatedAt(admin, "coffee_media", media)).toBeGreaterThan(before);
    expect((await admin.from("coffee_media").select("sort_order").eq("id", media).single()).data?.sort_order).toBe(7);
    expect(await allRowsSnapshot(admin, "coffee_media", [media]), `${siblingIds.length} sibling media rows untouched`).toBe(siblingsBefore);
  }, LIVE_TIMEOUT_MS);

  it("kyb_documents: a real UPDATE (fixture staging) advances updated_at on a status change", async () => {
    const id = COMPLETE_DRAFT_TRADE_LICENSE_DOCUMENT_ID;
    const before = await updatedAt(admin, "kyb_documents", id);
    stageCompleteDraftDocument("PENDING");
    const staged = await updatedAt(admin, "kyb_documents", id);
    expect(staged, "kyb_documents.updated_at advances on a status change").toBeGreaterThan(before);
    expect((await admin.from("kyb_documents").select("status").eq("id", id).single()).data?.status).toBe("PENDING");
    resetCompleteDraftApplication();
    expect((await admin.from("kyb_documents").select("status").eq("id", id).single()).data?.status).toBe("ACCEPTED");
    expect(await updatedAt(admin, "kyb_documents", id)).toBeGreaterThanOrEqual(staged);
  }, LIVE_TIMEOUT_MS);
});

describe("M2 live — access is exactly as before (RLS/grants unchanged)", () => {
  it("finance, member and anonymous still cannot edit a catalogue row (raw update touches nothing; updated_at does not move)", async () => {
    const id = RUN_E_CATALOGUE_FIXTURES.regionId;
    const stamp = await updatedAt(admin, "regions", id);
    const before = await rowWithoutUpdatedAt(admin, "regions", id);
    for (const [label, client] of [["finance", finance], ["member", member], ["anonymous", createAnonymousFixtureClient()]] as const) {
      const raw = await client.from("regions").update({ name: "tampered" }).eq("id", id).select("id");
      expect(raw.error !== null || (raw.data ?? []).length === 0, label).toBe(true);
    }
    expect(await rowWithoutUpdatedAt(admin, "regions", id)).toBe(before);
    expect(await updatedAt(admin, "regions", id)).toBe(stamp);
  }, LIVE_TIMEOUT_MS);
});
