import { revalidateTag } from "next/cache";

import {
  COFFEE_TRANSITIONS,
  CoffeeFieldsInput,
  CoffeeMediaPrimaryInput,
  CoffeeMediaSortInput,
  CoffeeTransitionInput,
  CoffeeUpdateInput,
  OriginFieldsInput,
  OriginUpdateInput,
  RegionFieldsInput,
  RegionUpdateInput,
  TaxonomyFieldsInput,
  TaxonomyUpdateInput,
  WarehouseFieldsInput,
  WarehouseLocationInput,
  WarehouseLocationUpdateInput,
  WarehouseUpdateInput,
  type CoffeeStatus,
  type CoffeeTransitionKey,
  type OriginStatus,
  type TaxonomyKind,
} from "@/lib/admin/catalogue-validation";
import { checkRoleFunctionAccess } from "@/lib/admin/guards";
import { TAG_PUBLIC_COFFEES, TAG_PUBLIC_ORIGINS, TAG_PUBLIC_TAXONOMY, tagPublicCoffee, tagPublicOrigin } from "@/lib/public/cache";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackCode, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN E (Phase 7, T021–T024) — THE catalogue management layer: the one place the console
 * writes catalogue content and the ONE place it touches the public surface (T023, FR-007,
 * plan.md architecture decision 5).
 *
 * ── AUTHORITY ────────────────────────────────────────────────────────────────────────────────────
 * Every write re-verifies `is_platform_admin()` live (`checkRoleFunctionAccess`) and then runs under
 * the operator's own session, where RLS (`catalog_admin_coffees|origins|regions|types|varieties|
 * processing|packaging|tags|coffee_media|warehouses`, `warehouse_locations_admin` — all
 * `is_platform_admin()` USING + WITH CHECK) is the backstop. Operational roles (WAREHOUSE/FINANCE/
 * COMPLIANCE/AUDITOR) are refused HERE with `CATALOGUE_NOT_CAPABLE` and, independently, by RLS.
 *
 * ── VOCABULARY ───────────────────────────────────────────────────────────────────────────────────
 * `coffees.status` ∈ DRAFT/PUBLISHED/ARCHIVED (`coffees_status_check`) and `origins.status` ∈
 * ACTIVE/INACTIVE/ARCHIVED (`origins_status_check`) — verbatim from the database; nothing invented.
 * Coffee status changes ONLY through the four named operations in `COFFEE_TRANSITIONS`
 * (publish / unpublish / archive / restore), each a compare-and-set on the source status — there is
 * no generic status setter, and the CHECK constraint would refuse any other value regardless.
 *
 * ── NO HARD DELETE ───────────────────────────────────────────────────────────────────────────────
 * This module issues no `.delete()`. Beyond policy, the database itself grants `authenticated` no
 * DELETE privilege on any catalogue table (only `service_role` holds it — schema report
 * `table_grants`), so no console path could hard-delete a coffee, origin, reference row, warehouse
 * or media record even if it tried. Retirement is `ARCHIVED` (coffees/origins), `INACTIVE`
 * (origins) or `is_active = false` (warehouses) — the vocabularies the schema already has.
 *
 * ── PUBLIC CACHE (T023) ──────────────────────────────────────────────────────────────────────────
 * Feature 002's tag register (`lib/public/cache.ts`) is reused EXACTLY — no new tag, no path purge:
 *   coffee    → `public-coffees` + `public-coffee:<slug>` (old AND new slug when it changes)
 *   origin    → `public-origins` + `public-origin:<slug>` (+ `public-coffees`, whose DTOs embed the
 *               origin's name/slug/country)
 *   region    → `public-origins` + `public-coffees` (both DTO families embed the region)
 *   taxonomy  → `public-taxonomy` + `public-coffees` (coffee DTOs embed type/variety/process/packaging/tags)
 *   warehouse → nothing public (Feature 002 renders no warehouse content); media → `public-coffee:<slug>`
 *               + `public-coffees` (only meaningful once a public media consumer exists).
 * `revalidateTag(tag, { expire: 0 })` is Feature 001's pinned invalidation call. Nothing private is
 * ever cached: every admin read below is a fresh, session-scoped query.
 *
 * ── ERRORS ───────────────────────────────────────────────────────────────────────────────────────
 * `mapCatalogueError` maps SQLSTATE only (23505 unique → SLUG_TAKEN, 23503 FK → REFERENCE_INVALID,
 * 23514 CHECK → STATUS_INVALID, everything else → SAVE_FAILED). No message text ever leaves this file.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function requireCatalogueAdmin(): Promise<{ ok: true; userId: string } | { ok: false; code: ActionFeedbackCode }> {
  const access = await checkRoleFunctionAccess("is_platform_admin");
  if (!access.ok) return { ok: false, code: access.denial === "anonymous" ? ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED : ACTION_FEEDBACK.CATALOGUE_NOT_CAPABLE };
  return { ok: true, userId: access.identity.userId };
}

function fieldErrorsOf(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return out;
}

type DatabaseError = { code?: unknown; message?: unknown } | null | undefined;

/** SQLSTATE-only mapping — never the message. */
export function mapCatalogueError(error: DatabaseError): ActionFeedbackCode {
  const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "";
  if (code === "23505") return ACTION_FEEDBACK.CATALOGUE_SLUG_TAKEN;
  if (code === "23503") return ACTION_FEEDBACK.CATALOGUE_REFERENCE_INVALID;
  if (code === "23514") return ACTION_FEEDBACK.CATALOGUE_STATUS_INVALID;
  return ACTION_FEEDBACK.CATALOGUE_SAVE_FAILED;
}

function validationFailure<T>(error: { issues: { path: PropertyKey[]; message: string }[] }): ActionFeedbackResult<T> {
  return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: fieldErrorsOf(error) };
}

/* ═══════════════════════════════ public cache revalidation ═══════════════════════════════ */

export type PublicCatalogueEffect = { kind: "coffee"; slugs: readonly string[] } | { kind: "origin"; slugs: readonly string[] } | { kind: "region" } | { kind: "taxonomy" } | { kind: "warehouse" } | { kind: "media"; slug: string | null };

/** The exact Feature 002 tags one catalogue effect invalidates (exported so tests pin the contract). */
export function publicTagsFor(effect: PublicCatalogueEffect): readonly string[] {
  switch (effect.kind) {
    case "coffee":
      return [TAG_PUBLIC_COFFEES, ...[...new Set(effect.slugs)].map(tagPublicCoffee)];
    case "origin":
      return [TAG_PUBLIC_ORIGINS, ...[...new Set(effect.slugs)].map(tagPublicOrigin), TAG_PUBLIC_COFFEES];
    case "region":
      return [TAG_PUBLIC_ORIGINS, TAG_PUBLIC_COFFEES];
    case "taxonomy":
      return [TAG_PUBLIC_TAXONOMY, TAG_PUBLIC_COFFEES];
    case "media":
      return effect.slug ? [TAG_PUBLIC_COFFEES, tagPublicCoffee(effect.slug)] : [TAG_PUBLIC_COFFEES];
    case "warehouse":
      return [];
  }
}

function revalidatePublicCatalogue(effect: PublicCatalogueEffect): readonly string[] {
  const tags = publicTagsFor(effect);
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return tags;
}

/* ═══════════════════════════════════════ reads ═══════════════════════════════════════ */

export type NamedRef = { id: string; name: string; slug: string };

export type CoffeeListRow = {
  id: string;
  name: string;
  slug: string;
  status: CoffeeStatus;
  originName: string | null;
  coffeeTypeName: string | null;
  updatedAt: string;
};

export type CoffeeDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: CoffeeStatus;
  originId: string | null;
  coffeeTypeId: string | null;
  varietyId: string | null;
  processingMethodId: string | null;
  packagingTypeId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type CoffeeReferenceOptions = {
  origins: readonly (NamedRef & { status: OriginStatus })[];
  coffeeTypes: readonly NamedRef[];
  varieties: readonly (NamedRef & { coffeeTypeId: string | null })[];
  processingMethods: readonly NamedRef[];
  packagingTypes: readonly NamedRef[];
};

const COFFEE_LIST_PAGE = 50;

export async function listCoffees({ page = 0, status }: { page?: number; status?: CoffeeStatus } = {}): Promise<{ rows: readonly CoffeeListRow[]; hasMore: boolean }> {
  const supabase = await createClient();
  const from = Math.max(0, page) * COFFEE_LIST_PAGE;
  let query = supabase.from("coffees").select("id, name, slug, status, updated_at, origins(name), coffee_types(name)").order("updated_at", { ascending: false }).order("id", { ascending: false }).range(from, from + COFFEE_LIST_PAGE);
  if (status) query = query.eq("status", status);
  const { data } = await query;
  type Row = { id: string; name: string; slug: string; status: CoffeeStatus; updated_at: string; origins: { name: string } | { name: string }[] | null; coffee_types: { name: string } | { name: string }[] | null };
  const rows = ((data ?? []) as unknown as Row[]).slice(0, COFFEE_LIST_PAGE).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    originName: one(row.origins)?.name ?? null,
    coffeeTypeName: one(row.coffee_types)?.name ?? null,
    updatedAt: row.updated_at,
  }));
  return { rows, hasMore: (data?.length ?? 0) > COFFEE_LIST_PAGE };
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getCoffee(coffeeId: string): Promise<CoffeeDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("coffees")
    .select("id, name, slug, description, status, origin_id, coffee_type_id, variety_id, processing_method_id, packaging_type_id, created_at, updated_at, created_by, updated_by")
    .eq("id", coffeeId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    status: data.status as CoffeeStatus,
    originId: data.origin_id,
    coffeeTypeId: data.coffee_type_id,
    varietyId: data.variety_id,
    processingMethodId: data.processing_method_id,
    packagingTypeId: data.packaging_type_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by,
    updatedBy: data.updated_by,
  };
}

export async function getCoffeeReferenceOptions(): Promise<CoffeeReferenceOptions> {
  const supabase = await createClient();
  const [origins, types, varieties, processing, packaging] = await Promise.all([
    supabase.from("origins").select("id, name, slug, status").order("name"),
    supabase.from("coffee_types").select("id, name, slug").order("name"),
    supabase.from("coffee_varieties").select("id, name, slug, coffee_type_id").order("name"),
    supabase.from("processing_methods").select("id, name, slug").order("name"),
    supabase.from("packaging_types").select("id, name, slug").order("name"),
  ]);
  return {
    origins: (origins.data ?? []).map((row) => ({ id: row.id, name: row.name, slug: row.slug, status: row.status as OriginStatus })),
    coffeeTypes: (types.data ?? []).map((row) => ({ id: row.id, name: row.name, slug: row.slug })),
    varieties: (varieties.data ?? []).map((row) => ({ id: row.id, name: row.name, slug: row.slug, coffeeTypeId: row.coffee_type_id })),
    processingMethods: (processing.data ?? []).map((row) => ({ id: row.id, name: row.name, slug: row.slug })),
    packagingTypes: (packaging.data ?? []).map((row) => ({ id: row.id, name: row.name, slug: row.slug })),
  };
}

export type OriginRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  countryCode: string | null;
  status: OriginStatus;
  regionId: string | null;
  regionName: string | null;
  parentOriginId: string | null;
  updatedAt: string;
};

export async function listOrigins(): Promise<readonly OriginRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("origins").select("id, name, slug, description, country_code, status, region_id, parent_origin_id, updated_at, regions(name)").order("name").limit(500);
  type Row = { id: string; name: string; slug: string; description: string | null; country_code: string | null; status: OriginStatus; region_id: string | null; parent_origin_id: string | null; updated_at: string; regions: { name: string } | { name: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    countryCode: row.country_code?.trim() ?? null,
    status: row.status,
    regionId: row.region_id,
    regionName: one(row.regions)?.name ?? null,
    parentOriginId: row.parent_origin_id,
    updatedAt: row.updated_at,
  }));
}

export async function getOrigin(originId: string): Promise<OriginRow | null> {
  return (await listOrigins()).find((row) => row.id === originId) ?? null;
}

export type RegionRow = { id: string; name: string; slug: string; countryCode: string | null; updatedAt: string };

export async function listRegions(): Promise<readonly RegionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("regions").select("id, name, slug, country_code, updated_at").order("name").limit(500);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, slug: row.slug, countryCode: row.country_code?.trim() ?? null, updatedAt: row.updated_at }));
}

export async function getRegion(regionId: string): Promise<RegionRow | null> {
  return (await listRegions()).find((row) => row.id === regionId) ?? null;
}

/** Table per taxonomy kind — the only place the kind→table mapping exists; never a caller-supplied table name. */
const TAXONOMY_TABLES: Readonly<Record<TaxonomyKind, "coffee_types" | "coffee_varieties" | "processing_methods" | "packaging_types" | "tags">> = {
  coffeeTypes: "coffee_types",
  varieties: "coffee_varieties",
  processingMethods: "processing_methods",
  packagingTypes: "packaging_types",
  tags: "tags",
};

export type TaxonomyRow = NamedRef & { kind: TaxonomyKind; coffeeTypeId: string | null; coffeeTypeName: string | null; createdAt: string | null };

export async function listTaxonomy(kind: TaxonomyKind): Promise<readonly TaxonomyRow[]> {
  const supabase = await createClient();
  const table = TAXONOMY_TABLES[kind];
  if (kind === "varieties") {
    const { data } = await supabase.from("coffee_varieties").select("id, name, slug, coffee_type_id, created_at, coffee_types(name)").order("name").limit(500);
    type Row = { id: string; name: string; slug: string; coffee_type_id: string | null; created_at: string | null; coffee_types: { name: string } | { name: string }[] | null };
    return ((data ?? []) as unknown as Row[]).map((row) => ({ kind, id: row.id, name: row.name, slug: row.slug, coffeeTypeId: row.coffee_type_id, coffeeTypeName: one(row.coffee_types)?.name ?? null, createdAt: row.created_at }));
  }
  const { data } = await supabase.from(table).select("id, name, slug, created_at").order("name").limit(500);
  return ((data ?? []) as { id: string; name: string; slug: string; created_at: string | null }[]).map((row) => ({ kind, id: row.id, name: row.name, slug: row.slug, coffeeTypeId: null, coffeeTypeName: null, createdAt: row.created_at }));
}

export async function getTaxonomyEntry(kind: TaxonomyKind, entryId: string): Promise<TaxonomyRow | null> {
  return (await listTaxonomy(kind)).find((row) => row.id === entryId) ?? null;
}

export type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  /** `warehouses.country_code` is nullable in the approved schema. */
  countryCode: string | null;
  city: string | null;
  address: string | null;
  isActive: boolean;
  ownerOrganizationId: string | null;
  ownerOrganizationName: string | null;
  updatedAt: string;
};
export type WarehouseLocationRow = { id: string; warehouseId: string; code: string; name: string };
export type OrganizationOption = { id: string; displayName: string };

export async function listWarehouses(): Promise<readonly WarehouseRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("warehouses").select("id, code, name, country_code, city, address, is_active, owner_organization_id, updated_at, organizations(display_name)").order("code").limit(500);
  type Row = { id: string; code: string; name: string; country_code: string | null; city: string | null; address: string | null; is_active: boolean; owner_organization_id: string | null; updated_at: string; organizations: { display_name: string } | { display_name: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    countryCode: row.country_code?.trim() ?? null,
    city: row.city,
    address: row.address,
    isActive: row.is_active,
    ownerOrganizationId: row.owner_organization_id,
    ownerOrganizationName: one(row.organizations)?.display_name ?? null,
    updatedAt: row.updated_at,
  }));
}

export async function getWarehouse(warehouseId: string): Promise<{ warehouse: WarehouseRow; locations: readonly WarehouseLocationRow[] } | null> {
  const warehouse = (await listWarehouses()).find((row) => row.id === warehouseId) ?? null;
  if (!warehouse) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("warehouse_locations").select("id, warehouse_id, code, name").eq("warehouse_id", warehouseId).order("code");
  return { warehouse, locations: (data ?? []).map((row) => ({ id: row.id, warehouseId: row.warehouse_id, code: row.code, name: row.name })) };
}

/** Organizations a platform admin may assign as a warehouse owner (`organizations_admin_all`). */
export async function listOrganizationOptions(): Promise<readonly OrganizationOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("id, display_name").order("display_name").limit(500);
  return (data ?? []).map((row) => ({ id: row.id, displayName: row.display_name }));
}

export type CoffeeMediaRow = {
  id: string;
  coffeeId: string;
  fileAssetId: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
  /** `file_assets` metadata (admin-readable); `null` when the referenced asset row is unreadable/missing. */
  file: { originalName: string; mimeType: string; sizeBytes: number; bucketName: string; isPrivate: boolean } | null;
};

export async function listCoffeeMedia(coffeeId: string): Promise<readonly CoffeeMediaRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("coffee_media").select("id, coffee_id, file_asset_id, sort_order, is_primary, created_at, file_assets(original_name, mime_type, size_bytes, bucket_name, is_private)").eq("coffee_id", coffeeId).order("sort_order").order("created_at");
  type Row = { id: string; coffee_id: string; file_asset_id: string; sort_order: number; is_primary: boolean; created_at: string; file_assets: { original_name: string; mime_type: string; size_bytes: number; bucket_name: string; is_private: boolean } | { original_name: string; mime_type: string; size_bytes: number; bucket_name: string; is_private: boolean }[] | null };
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const file = one(row.file_assets);
    return {
      id: row.id,
      coffeeId: row.coffee_id,
      fileAssetId: row.file_asset_id,
      sortOrder: row.sort_order,
      isPrimary: row.is_primary,
      createdAt: row.created_at,
      file: file ? { originalName: file.original_name, mimeType: file.mime_type, sizeBytes: Number(file.size_bytes), bucketName: file.bucket_name, isPrivate: file.is_private } : null,
    };
  });
}

export type CoffeeMediaListRow = CoffeeMediaRow & { coffeeName: string; coffeeSlug: string };

/** Every media record across the catalogue (T024 list), newest coffee first — read-only. */
export async function listAllCoffeeMedia(): Promise<readonly CoffeeMediaListRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("coffee_media").select("id, coffee_id, file_asset_id, sort_order, is_primary, created_at, coffees(name, slug), file_assets(original_name, mime_type, size_bytes, bucket_name, is_private)").order("created_at", { ascending: false }).limit(500);
  type Row = { id: string; coffee_id: string; file_asset_id: string; sort_order: number; is_primary: boolean; created_at: string; coffees: { name: string; slug: string } | { name: string; slug: string }[] | null; file_assets: { original_name: string; mime_type: string; size_bytes: number; bucket_name: string; is_private: boolean } | { original_name: string; mime_type: string; size_bytes: number; bucket_name: string; is_private: boolean }[] | null };
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const file = one(row.file_assets);
    const coffee = one(row.coffees);
    return {
      id: row.id,
      coffeeId: row.coffee_id,
      fileAssetId: row.file_asset_id,
      sortOrder: row.sort_order,
      isPrimary: row.is_primary,
      createdAt: row.created_at,
      file: file ? { originalName: file.original_name, mimeType: file.mime_type, sizeBytes: Number(file.size_bytes), bucketName: file.bucket_name, isPrivate: file.is_private } : null,
      coffeeName: coffee?.name ?? row.coffee_id,
      coffeeSlug: coffee?.slug ?? "",
    };
  });
}

/**
 * T024 — the byte-upload capability probe: the ONLY Storage bucket the approved schema has is
 * `kyb-evidence` (private, KYB-scoped, written solely by `attach_kyb_document`). No public/catalogue
 * media bucket, Storage policy, or metadata RPC exists (DB-BLOCK-01 remains CURRENT for public
 * media), so the console's upload seam is inert by construction — this constant is what the UI states.
 */
export const CATALOGUE_MEDIA_UPLOAD_AVAILABLE = false as const;

/* ═══════════════════════════════════════ writes ═══════════════════════════════════════ */

export type CatalogueWriteOutcome<T = { id: string }> = T & { revalidatedTags: readonly string[] };

export async function createCoffee(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = CoffeeFieldsInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coffees")
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description,
      status: "DRAFT",
      origin_id: parsed.data.originId,
      coffee_type_id: parsed.data.coffeeTypeId,
      variety_id: parsed.data.varietyId,
      processing_method_id: parsed.data.processingMethodId,
      packaging_type_id: parsed.data.packagingTypeId,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, code: mapCatalogueError(error) };
  // A DRAFT is not public, but the slug's detail entry may hold a cached 404 — invalidate it so a later publish is never masked.
  return { ok: true, data: { id: data.id, revalidatedTags: revalidatePublicCatalogue({ kind: "coffee", slugs: [parsed.data.slug] }) }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

export async function updateCoffee(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = CoffeeUpdateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data: before } = await supabase.from("coffees").select("id, slug").eq("id", parsed.data.coffeeId).maybeSingle();
  if (!before) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  // `status`, `created_by`, `created_at`, `updated_at` are deliberately NOT in this update.
  const { data, error } = await supabase
    .from("coffees")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description,
      origin_id: parsed.data.originId,
      coffee_type_id: parsed.data.coffeeTypeId,
      variety_id: parsed.data.varietyId,
      processing_method_id: parsed.data.processingMethodId,
      packaging_type_id: parsed.data.packagingTypeId,
      updated_by: access.userId,
    })
    .eq("id", parsed.data.coffeeId)
    .select("id, slug")
    .maybeSingle();
  if (error) return { ok: false, code: mapCatalogueError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  return { ok: true, data: { id: data.id, revalidatedTags: revalidatePublicCatalogue({ kind: "coffee", slugs: [before.slug, data.slug] }) }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

export type CoffeeTransitionOutcome = CatalogueWriteOutcome<{ id: string; slug: string; operation: CoffeeTransitionKey; fromStatus: CoffeeStatus; toStatus: CoffeeStatus }>;

/**
 * T021/T023 — one named publication operation, compare-and-set on the operation's source statuses
 * (`COFFEE_TRANSITIONS`). A miss (already moved, wrong source state, unreadable) affects zero rows
 * → `CATALOGUE_STALE`; the console never writes a status outside the four operations' literals.
 */
export async function transitionCoffee(input: unknown): Promise<ActionFeedbackResult<CoffeeTransitionOutcome>> {
  const parsed = CoffeeTransitionInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const spec = COFFEE_TRANSITIONS[parsed.data.operation];
  const supabase = await createClient();
  const { data: before } = await supabase.from("coffees").select("id, slug, status").eq("id", parsed.data.coffeeId).maybeSingle();
  if (!before) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  if (!(spec.from as readonly string[]).includes(before.status)) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_STALE };
  const { data, error } = await supabase
    .from("coffees")
    .update({ status: spec.to, updated_by: access.userId })
    .eq("id", parsed.data.coffeeId)
    .in("status", [...spec.from])
    .select("id, slug, status")
    .maybeSingle();
  if (error) return { ok: false, code: mapCatalogueError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_STALE };
  return {
    ok: true,
    data: { id: data.id, slug: data.slug, operation: parsed.data.operation, fromStatus: before.status as CoffeeStatus, toStatus: data.status as CoffeeStatus, revalidatedTags: revalidatePublicCatalogue({ kind: "coffee", slugs: [data.slug] }) },
    code: ACTION_FEEDBACK.CATALOGUE_SAVED,
  };
}

export async function createOrigin(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = OriginFieldsInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("origins")
    .insert({ name: parsed.data.name, slug: parsed.data.slug, description: parsed.data.description, country_code: parsed.data.countryCode, region_id: parsed.data.regionId, parent_origin_id: parsed.data.parentOriginId, status: parsed.data.status, created_by: access.userId })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, code: mapCatalogueError(error) };
  return { ok: true, data: { id: data.id, revalidatedTags: revalidatePublicCatalogue({ kind: "origin", slugs: [parsed.data.slug] }) }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

export async function updateOrigin(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = OriginUpdateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  if (parsed.data.parentOriginId === parsed.data.originId) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { parentOriginId: ["INVALID_REFERENCE"] } };
  const supabase = await createClient();
  const { data: before } = await supabase.from("origins").select("id, slug").eq("id", parsed.data.originId).maybeSingle();
  if (!before) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  const { data, error } = await supabase
    .from("origins")
    .update({ name: parsed.data.name, slug: parsed.data.slug, description: parsed.data.description, country_code: parsed.data.countryCode, region_id: parsed.data.regionId, parent_origin_id: parsed.data.parentOriginId, status: parsed.data.status })
    .eq("id", parsed.data.originId)
    .select("id, slug")
    .maybeSingle();
  if (error) return { ok: false, code: mapCatalogueError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  return { ok: true, data: { id: data.id, revalidatedTags: revalidatePublicCatalogue({ kind: "origin", slugs: [before.slug, data.slug] }) }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

export async function createRegion(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = RegionFieldsInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data, error } = await supabase.from("regions").insert({ name: parsed.data.name, slug: parsed.data.slug, country_code: parsed.data.countryCode, created_by: access.userId }).select("id").maybeSingle();
  if (error || !data) return { ok: false, code: mapCatalogueError(error) };
  return { ok: true, data: { id: data.id, revalidatedTags: revalidatePublicCatalogue({ kind: "region" }) }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

export async function updateRegion(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = RegionUpdateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data, error } = await supabase.from("regions").update({ name: parsed.data.name, slug: parsed.data.slug, country_code: parsed.data.countryCode }).eq("id", parsed.data.regionId).select("id").maybeSingle();
  if (error) return { ok: false, code: mapCatalogueError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  return { ok: true, data: { id: data.id, revalidatedTags: revalidatePublicCatalogue({ kind: "region" }) }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

function taxonomyRow(input: { kind: TaxonomyKind; name: string; slug: string; coffeeTypeId: string | null }, userId: string, creating: boolean): Record<string, unknown> {
  const row: Record<string, unknown> = { name: input.name, slug: input.slug };
  if (input.kind === "varieties") row.coffee_type_id = input.coffeeTypeId;
  // `tags` has no `created_by`; the other four reference tables do.
  if (creating && input.kind !== "tags") row.created_by = userId;
  return row;
}

export async function createTaxonomyEntry(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = TaxonomyFieldsInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data, error } = await supabase.from(TAXONOMY_TABLES[parsed.data.kind]).insert(taxonomyRow(parsed.data, access.userId, true)).select("id").maybeSingle();
  if (error || !data) return { ok: false, code: mapCatalogueError(error) };
  return { ok: true, data: { id: data.id, revalidatedTags: revalidatePublicCatalogue({ kind: "taxonomy" }) }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

export async function updateTaxonomyEntry(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = TaxonomyUpdateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data, error } = await supabase.from(TAXONOMY_TABLES[parsed.data.kind]).update(taxonomyRow(parsed.data, access.userId, false)).eq("id", parsed.data.entryId).select("id").maybeSingle();
  if (error) return { ok: false, code: mapCatalogueError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  return { ok: true, data: { id: data.id, revalidatedTags: revalidatePublicCatalogue({ kind: "taxonomy" }) }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

/**
 * T022 — warehouse REFERENCE fields only (code/name/country/city/address/owner/is_active). Nothing
 * here touches inventory, custody, allocations or shipments (Phase 6 / Features 005 & 009 authority),
 * and no stock adjustment, reconciliation or quarantine concept exists to expose (DB-OPEN-19).
 */
export async function createWarehouse(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = WarehouseFieldsInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .insert({ code: parsed.data.code, name: parsed.data.name, country_code: parsed.data.countryCode, city: parsed.data.city, address: parsed.data.address, owner_organization_id: parsed.data.ownerOrganizationId, is_active: parsed.data.isActive, created_by: access.userId })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, code: mapCatalogueError(error) };
  return { ok: true, data: { id: data.id, revalidatedTags: revalidatePublicCatalogue({ kind: "warehouse" }) }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

export async function updateWarehouse(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = WarehouseUpdateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .update({ code: parsed.data.code, name: parsed.data.name, country_code: parsed.data.countryCode, city: parsed.data.city, address: parsed.data.address, owner_organization_id: parsed.data.ownerOrganizationId, is_active: parsed.data.isActive })
    .eq("id", parsed.data.warehouseId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, code: mapCatalogueError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  return { ok: true, data: { id: data.id, revalidatedTags: revalidatePublicCatalogue({ kind: "warehouse" }) }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

export async function createWarehouseLocation(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = WarehouseLocationInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data, error } = await supabase.from("warehouse_locations").insert({ warehouse_id: parsed.data.warehouseId, code: parsed.data.code, name: parsed.data.name }).select("id").maybeSingle();
  if (error || !data) return { ok: false, code: mapCatalogueError(error) };
  return { ok: true, data: { id: data.id, revalidatedTags: [] }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

export async function updateWarehouseLocation(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = WarehouseLocationUpdateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data, error } = await supabase.from("warehouse_locations").update({ code: parsed.data.code, name: parsed.data.name }).eq("id", parsed.data.locationId).eq("warehouse_id", parsed.data.warehouseId).select("id").maybeSingle();
  if (error) return { ok: false, code: mapCatalogueError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  return { ok: true, data: { id: data.id, revalidatedTags: [] }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

/**
 * T024 — media RECORD management on existing `coffee_media` rows (primary flag, sort order). No row
 * is created (no byte path exists — `CATALOGUE_MEDIA_UPLOAD_AVAILABLE`), none is deleted (no DELETE
 * grant, and a published coffee may reference it), and `file_assets` is never written here.
 */
export async function setCoffeeMediaPrimary(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = CoffeeMediaPrimaryInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data: coffee } = await supabase.from("coffees").select("id, slug").eq("id", parsed.data.coffeeId).maybeSingle();
  if (!coffee) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  const { data: target } = await supabase.from("coffee_media").select("id").eq("id", parsed.data.mediaId).eq("coffee_id", parsed.data.coffeeId).maybeSingle();
  if (!target) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  const { error: clearError } = await supabase.from("coffee_media").update({ is_primary: false }).eq("coffee_id", parsed.data.coffeeId).neq("id", parsed.data.mediaId);
  if (clearError) return { ok: false, code: mapCatalogueError(clearError) };
  const { error } = await supabase.from("coffee_media").update({ is_primary: true }).eq("id", parsed.data.mediaId).eq("coffee_id", parsed.data.coffeeId);
  if (error) return { ok: false, code: mapCatalogueError(error) };
  return { ok: true, data: { id: parsed.data.mediaId, revalidatedTags: revalidatePublicCatalogue({ kind: "media", slug: coffee.slug }) }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

export async function setCoffeeMediaSortOrder(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = CoffeeMediaSortInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data: coffee } = await supabase.from("coffees").select("id, slug").eq("id", parsed.data.coffeeId).maybeSingle();
  if (!coffee) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  const { data, error } = await supabase.from("coffee_media").update({ sort_order: parsed.data.sortOrder }).eq("id", parsed.data.mediaId).eq("coffee_id", parsed.data.coffeeId).select("id").maybeSingle();
  if (error) return { ok: false, code: mapCatalogueError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  return { ok: true, data: { id: data.id, revalidatedTags: revalidatePublicCatalogue({ kind: "media", slug: coffee.slug }) }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

export { COFFEE_TRANSITIONS };
export type { Supabase as CatalogueSupabaseClient };
