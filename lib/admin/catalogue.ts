import { revalidateTag } from "next/cache";

import {
  ArabicStepInput,
  BackedOfferInput,
  CatalogueTranslationInput,
  COFFEE_TRANSITIONS,
  CreateCoffeeIntentInput,
  FeaturedWorkflowInput,
  IdentityStepInput,
  MediaAttachInput,
  MediaWorkflowInput,
  OfferCommercialsInput,
  PublishWorkflowInput,
  RecoverOperationInput,
  TaxonomyStepInput,
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
  type TranslationKind,
} from "@/lib/admin/catalogue-validation";
import { checkRoleFunctionAccess } from "@/lib/admin/guards";
import { TAG_PUBLIC_COFFEES, TAG_PUBLIC_ORIGINS, TAG_PUBLIC_TAXONOMY, tagPublicCoffee, tagPublicOrigin } from "@/lib/public/cache";
import { publicAssetUrl } from "@/lib/storage/public-url";
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
  /** Public URL of the coffee's primary catalogue image, or `null` when it has none. */
  primaryImageUrl: string | null;
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
  let query = supabase.from("coffees").select("id, name, slug, status, updated_at, origins(name), coffee_types(name), coffee_media(is_primary, file_assets(bucket_name, is_private, object_path))").eq("coffee_media.is_primary", true).order("updated_at", { ascending: false }).order("id", { ascending: false }).range(from, from + COFFEE_LIST_PAGE);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error("catalogue_read_failed");
  type FileRef = { bucket_name: string; is_private: boolean; object_path: string };
  type Row = { id: string; name: string; slug: string; status: CoffeeStatus; updated_at: string; origins: { name: string } | { name: string }[] | null; coffee_types: { name: string } | { name: string }[] | null; coffee_media: { is_primary: boolean; file_assets: FileRef | FileRef[] | null }[] | null };
  const rows = ((data ?? []) as unknown as Row[]).slice(0, COFFEE_LIST_PAGE).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    originName: one(row.origins)?.name ?? null,
    coffeeTypeName: one(row.coffee_types)?.name ?? null,
    updatedAt: row.updated_at,
    primaryImageUrl: catalogueImageUrl(one(row.coffee_media?.find((media) => media.is_primary)?.file_assets ?? null)),
  }));
  return { rows, hasMore: (data?.length ?? 0) > COFFEE_LIST_PAGE };
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getCoffee(coffeeId: string): Promise<CoffeeDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coffees")
    .select("id, name, slug, description, status, origin_id, coffee_type_id, variety_id, processing_method_id, packaging_type_id, created_at, updated_at, created_by, updated_by")
    .eq("id", coffeeId)
    .maybeSingle();
  if (error) throw new Error("catalogue_read_failed");
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
  const { data, error } = await supabase.from("origins").select("id, name, slug, description, country_code, status, region_id, parent_origin_id, updated_at, regions(name)").order("name").limit(500);
  if (error) throw new Error("catalogue_read_failed");
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
  const { data, error } = await supabase.from("regions").select("id, name, slug, country_code, updated_at").order("name").limit(500);
  if (error) throw new Error("catalogue_read_failed");
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
    const { data, error } = await supabase.from("coffee_varieties").select("id, name, slug, coffee_type_id, created_at, coffee_types(name)").order("name").limit(500);
    if (error) throw new Error("catalogue_read_failed");
    type Row = { id: string; name: string; slug: string; coffee_type_id: string | null; created_at: string | null; coffee_types: { name: string } | { name: string }[] | null };
    return ((data ?? []) as unknown as Row[]).map((row) => ({ kind, id: row.id, name: row.name, slug: row.slug, coffeeTypeId: row.coffee_type_id, coffeeTypeName: one(row.coffee_types)?.name ?? null, createdAt: row.created_at }));
  }
  const { data, error } = await supabase.from(table).select("id, name, slug, created_at").order("name").limit(500);
  if (error) throw new Error("catalogue_read_failed");
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
  const { data, error } = await supabase.from("warehouses").select("id, code, name, country_code, city, address, is_active, owner_organization_id, updated_at, organizations(display_name)").order("code").limit(500);
  if (error) throw new Error("catalogue_read_failed");
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
  const { data, error } = await supabase.from("warehouse_locations").select("id, warehouse_id, code, name").eq("warehouse_id", warehouseId).order("code");
  if (error) throw new Error("catalogue_read_failed");
  return { warehouse, locations: (data ?? []).map((row) => ({ id: row.id, warehouseId: row.warehouse_id, code: row.code, name: row.name })) };
}

/** Organizations a platform admin may assign as a warehouse owner (`organizations_admin_all`). */
export async function listOrganizationOptions(): Promise<readonly OrganizationOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").select("id, display_name").order("display_name").limit(500);
  if (error) throw new Error("catalogue_read_failed");
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
  file: { originalName: string; mimeType: string; sizeBytes: number; bucketName: string; isPrivate: boolean; objectPath: string } | null;
  /** Public URL of the image when it lives in the `public-assets` bucket; `null` otherwise (legacy/private rows). */
  imageUrl: string | null;
};

export async function listCoffeeMedia(coffeeId: string): Promise<readonly CoffeeMediaRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("coffee_media").select("id, coffee_id, file_asset_id, sort_order, is_primary, created_at, file_assets(original_name, mime_type, size_bytes, bucket_name, is_private, object_path)").eq("coffee_id", coffeeId).order("sort_order").order("created_at");
  if (error) throw new Error("catalogue_read_failed");
  type Row = { id: string; coffee_id: string; file_asset_id: string; sort_order: number; is_primary: boolean; created_at: string; file_assets: { original_name: string; mime_type: string; size_bytes: number; bucket_name: string; is_private: boolean; object_path: string } | { original_name: string; mime_type: string; size_bytes: number; bucket_name: string; is_private: boolean; object_path: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const file = one(row.file_assets);
    return {
      id: row.id,
      coffeeId: row.coffee_id,
      fileAssetId: row.file_asset_id,
      sortOrder: row.sort_order,
      isPrimary: row.is_primary,
      createdAt: row.created_at,
      file: file ? { originalName: file.original_name, mimeType: file.mime_type, sizeBytes: Number(file.size_bytes), bucketName: file.bucket_name, isPrivate: file.is_private, objectPath: file.object_path } : null,
      imageUrl: catalogueImageUrl(file),
    };
  });
}

export type CoffeeMediaListRow = CoffeeMediaRow & { coffeeName: string; coffeeSlug: string };

/** Every media record across the catalogue (T024 list), newest coffee first — read-only. */
export async function listAllCoffeeMedia(): Promise<readonly CoffeeMediaListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("coffee_media").select("id, coffee_id, file_asset_id, sort_order, is_primary, created_at, coffees(name, slug), file_assets(original_name, mime_type, size_bytes, bucket_name, is_private, object_path)").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error("catalogue_read_failed");
  type Row = { id: string; coffee_id: string; file_asset_id: string; sort_order: number; is_primary: boolean; created_at: string; coffees: { name: string; slug: string } | { name: string; slug: string }[] | null; file_assets: { original_name: string; mime_type: string; size_bytes: number; bucket_name: string; is_private: boolean; object_path: string } | { original_name: string; mime_type: string; size_bytes: number; bucket_name: string; is_private: boolean; object_path: string }[] | null };
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
      file: file ? { originalName: file.original_name, mimeType: file.mime_type, sizeBytes: Number(file.size_bytes), bucketName: file.bucket_name, isPrivate: file.is_private, objectPath: file.object_path } : null,
      imageUrl: catalogueImageUrl(file),
      coffeeName: coffee?.name ?? row.coffee_id,
      coffeeSlug: coffee?.slug ?? "",
    };
  });
}

/**
 * Catalogue image upload (hardening run; supersedes T024's inert "upload unavailable" seam). Bytes go
 * to the EXISTING `public-assets` bucket under `catalogue/{coffeeId}/…` — the bucket's own Storage
 * policy (`public_asset_object_authorized`, `catalogue` branch = `is_platform_admin()`) refuses any
 * other writer — and the `coffee_media` + `file_assets` rows are created only by the SECURITY DEFINER
 * `attach_coffee_media()` RPC (admin re-check, path/MIME/size/count validation). Migration
 * `20260923120000_catalogue_media_and_translations` must be applied for this to work; until then the
 * upload fails honestly (`CATALOGUE_SAVE_FAILED`) and the orphan object is removed.
 */
export const CATALOGUE_MEDIA_UPLOAD_AVAILABLE = true as const;
export const CATALOGUE_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const CATALOGUE_MEDIA_MAX_COUNT = 12;
export const CATALOGUE_MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const CATALOGUE_MEDIA_EXTENSION: Record<(typeof CATALOGUE_MEDIA_MIME_TYPES)[number], string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

function catalogueImageUrl(file: { bucket_name: string; is_private: boolean; object_path: string } | null): string | null {
  if (!file || file.bucket_name !== "public-assets" || file.is_private) return null;
  return publicAssetUrl(file.object_path);
}

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
 * T024 — media RECORD management on existing `coffee_media` rows (primary flag, sort order). Rows are
 * created/removed ONLY by `uploadCoffeeImage` / `removeCoffeeImage` below (through their SECURITY
 * DEFINER RPCs — the console itself still holds no DELETE grant and issues no `.delete()`).
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Upload ONE catalogue image for a coffee. Order: authorize → validate file → confirm coffee → upload
 * bytes (unguessable, timestamped path, `upsert: false`) → `attach_coffee_media()` → on any DB failure
 * remove the just-uploaded object so no orphan remains.
 */
export async function uploadCoffeeImage(coffeeId: unknown, file: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  if (typeof coffeeId !== "string" || !UUID_PATTERN.test(coffeeId)) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { coffeeId: ["Invalid"] } };
  if (!(file instanceof File) || file.size === 0) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { image: ["Required"] } };
  const mime = file.type as (typeof CATALOGUE_MEDIA_MIME_TYPES)[number];
  if (!CATALOGUE_MEDIA_MIME_TYPES.includes(mime) || file.size > CATALOGUE_MEDIA_MAX_BYTES) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_MEDIA_INVALID_FILE };

  const supabase = await createClient();
  const { data: coffee } = await supabase.from("coffees").select("id, slug").eq("id", coffeeId).maybeSingle();
  if (!coffee) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  const { count } = await supabase.from("coffee_media").select("id", { count: "exact", head: true }).eq("coffee_id", coffeeId);
  if ((count ?? 0) >= CATALOGUE_MEDIA_MAX_COUNT) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_MEDIA_LIMIT_REACHED };

  const objectPath = `catalogue/${coffeeId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}${CATALOGUE_MEDIA_EXTENSION[mime]}`;
  const bucket = supabase.storage.from("public-assets");
  const { error: uploadError } = await bucket.upload(objectPath, file, { contentType: mime, upsert: false, cacheControl: "31536000" });
  if (uploadError) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_SAVE_FAILED };

  const { data: mediaId, error: rpcError } = await supabase.rpc("attach_coffee_media", {
    p_coffee_id: coffeeId,
    p_object_path: objectPath,
    p_original_name: file.name.slice(0, 255),
    p_mime_type: mime,
    p_size_bytes: file.size,
  });
  if (rpcError || typeof mediaId !== "string") {
    await bucket.remove([objectPath]).catch(() => undefined);
    const message = typeof rpcError?.message === "string" ? rpcError.message : "";
    return { ok: false, code: message.includes("coffee_media_limit_reached") ? ACTION_FEEDBACK.CATALOGUE_MEDIA_LIMIT_REACHED : ACTION_FEEDBACK.CATALOGUE_SAVE_FAILED };
  }
  return { ok: true, data: { id: mediaId, revalidatedTags: revalidatePublicCatalogue({ kind: "media", slug: coffee.slug }) }, code: ACTION_FEEDBACK.CATALOGUE_MEDIA_UPLOADED };
}

/**
 * Remove ONE catalogue image. `remove_coffee_media()` deletes the `coffee_media` + `file_assets` rows
 * (admin re-checked inside; the next image is promoted to primary) and returns the object path; the
 * object itself is then removed best-effort (an orphan object is harmless — nothing references it).
 */
export async function removeCoffeeImage(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = CoffeeMediaPrimaryInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data: coffee } = await supabase.from("coffees").select("id, slug").eq("id", parsed.data.coffeeId).maybeSingle();
  if (!coffee) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  const { data: target } = await supabase.from("coffee_media").select("id").eq("id", parsed.data.mediaId).eq("coffee_id", parsed.data.coffeeId).maybeSingle();
  if (!target) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  const { data: objectPath, error } = await supabase.rpc("remove_coffee_media", { p_media_id: parsed.data.mediaId });
  if (error) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_SAVE_FAILED };
  if (typeof objectPath === "string" && objectPath.startsWith(`catalogue/${parsed.data.coffeeId}/`)) {
    await supabase.storage.from("public-assets").remove([objectPath]).catch(() => undefined);
  }
  return { ok: true, data: { id: parsed.data.mediaId, revalidatedTags: revalidatePublicCatalogue({ kind: "media", slug: coffee.slug }) }, code: ACTION_FEEDBACK.CATALOGUE_MEDIA_REMOVED };
}

/* ═════════════════════════════ Arabic catalogue content ═════════════════════════════ */

/**
 * Hardening run — bilingual catalogue content. The entity's own base columns are the canonical
 * ENGLISH values (edited by the existing record forms); Arabic lives in the normalized
 * `*_translations` tables (`locale = 'ar'`), written ONLY through the SECURITY DEFINER
 * `set_catalogue_translation()` RPC (admin re-check, length checks, blank name = delete). The two
 * languages are separate rows/columns, so saving one can never overwrite the other, whatever the
 * admin UI's own locale is.
 */
const TRANSLATION_SOURCES: Readonly<Record<TranslationKind, { table: string; key: string; hasDescription: boolean }>> = {
  coffee: { table: "coffee_translations", key: "coffee_id", hasDescription: true },
  origin: { table: "origin_translations", key: "origin_id", hasDescription: true },
  region: { table: "region_translations", key: "region_id", hasDescription: false },
  coffee_type: { table: "coffee_type_translations", key: "coffee_type_id", hasDescription: false },
  variety: { table: "coffee_variety_translations", key: "coffee_variety_id", hasDescription: false },
  processing: { table: "processing_method_translations", key: "processing_method_id", hasDescription: false },
  packaging: { table: "packaging_type_translations", key: "packaging_type_id", hasDescription: false },
  tag: { table: "tag_translations", key: "tag_id", hasDescription: false },
};

export type ArabicTranslation = { name: string; description: string };

/**
 * The saved Arabic value for one entity: `null` when none exists, `"unavailable"` when it cannot be
 * read (e.g. migration 20260923120000 not applied yet — the panel then says so instead of pretending).
 */
export async function getArabicTranslation(kind: TranslationKind, entityId: string): Promise<ArabicTranslation | null | "unavailable"> {
  const source = TRANSLATION_SOURCES[kind];
  const supabase = await createClient();
  const columns = source.hasDescription ? "name, description" : "name";
  const { data, error } = await supabase.from(source.table).select(columns).eq(source.key, entityId).eq("locale", "ar").maybeSingle();
  if (error) return "unavailable";
  if (!data) return null;
  const row = data as unknown as { name: string; description?: string | null };
  return { name: row.name, description: row.description ?? "" };
}

async function publicEffectForTranslation(supabase: Supabase, kind: TranslationKind, entityId: string): Promise<PublicCatalogueEffect | null> {
  if (kind === "coffee") {
    const { data } = await supabase.from("coffees").select("slug").eq("id", entityId).maybeSingle();
    return data ? { kind: "coffee", slugs: [data.slug] } : null;
  }
  if (kind === "origin") {
    const { data } = await supabase.from("origins").select("slug").eq("id", entityId).maybeSingle();
    return data ? { kind: "origin", slugs: [data.slug] } : null;
  }
  if (kind === "region") return { kind: "region" };
  return { kind: "taxonomy" };
}

export async function saveArabicTranslation(input: unknown): Promise<ActionFeedbackResult<CatalogueWriteOutcome>> {
  const parsed = CatalogueTranslationInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requireCatalogueAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const effect = await publicEffectForTranslation(supabase, parsed.data.kind, parsed.data.entityId);
  if (!effect) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  const { error } = await supabase.rpc("set_catalogue_translation", {
    p_kind: parsed.data.kind,
    p_entity_id: parsed.data.entityId,
    p_locale: "ar",
    p_name: parsed.data.name,
    p_description: TRANSLATION_SOURCES[parsed.data.kind].hasDescription ? parsed.data.description : null,
  });
  if (error) return { ok: false, code: mapCatalogueError(error) };
  return { ok: true, data: { id: parsed.data.entityId, revalidatedTags: revalidatePublicCatalogue(effect) }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

/* ═════════════════════ Feature 018 — unified, resumable Coffee workflow ═════════════════════ */

/**
 * Every write below calls one controlled database routine (`supabase/migrations/20261004120000_*`). The routines
 * re-authorize Platform Admin + MFA, bind the request (actor, operation, target, exact payload), compare the revision and
 * write atomically. This layer validates input, classifies failures into stable codes (never raw database text),
 * handles the Storage side that no transaction can cover, and expires the public cache tags AFTER the commit.
 * A cache-invalidation problem never turns a committed write into a failure.
 */

export type WorkflowErrorCode =
  | "AUTH_REQUIRED" | "NOT_CAPABLE" | "MFA_REQUIRED" | "VALIDATION" | "REVISION_CONFLICT" | "REQUEST_CONFLICT" | "SLUG_TAKEN" | "NOT_FOUND"
  | "ORIGIN_INACTIVE" | "REFERENCE_INVALID" | "NOT_READY" | "NO_ELIGIBLE_STOCK" | "STOCK_INSUFFICIENT" | "ACTIVE_OFFER_EXISTS" | "OFFER_INVALID"
  | "OFFER_NOT_EDITABLE" | "OFFER_NOT_APPROVED" | "PUBLICATION_AUTHORITY_REQUIRED" | "STATUS_INVALID" | "MEDIA_INVALID" | "MEDIA_LIMIT"
  | "MEDIA_NOT_FOUND" | "OUTCOME_UNKNOWN" | "SAVE_FAILED";

export type WorkflowFailure = {
  ok: false;
  code: WorkflowErrorCode;
  fieldErrors?: Record<string, string[]>;
  /** The revision now stored, so a stale editor can reload and retry (REVISION_CONFLICT). */
  currentRevision?: number;
  currentOfferRevision?: number;
  /** Publication readiness requirements still missing (NOT_READY). */
  missing?: readonly string[];
  existingOfferId?: string;
  /** Storage object that could not be removed after a failed attach/removal (retryable residue; never a database fact). */
  cleanup?: "DONE" | "PENDING";
};
export type WorkflowResult<T> = { ok: true; data: T; revalidatedTags: readonly string[]; cleanup?: "DONE" | "PENDING" } | WorkflowFailure;

const WORKFLOW_TOKEN_CODES: ReadonlyArray<readonly [WorkflowErrorCode, readonly string[]]> = [
  ["MFA_REQUIRED", ["mfa_step_up_required"]],
  ["NOT_CAPABLE", ["forbidden"]],
  ["REVISION_CONFLICT", ["revision_conflict"]],
  ["REQUEST_CONFLICT", ["request_payload_conflict", "request_id_conflict"]],
  ["SLUG_TAKEN", ["slug_taken"]],
  ["NOT_FOUND", ["coffee_not_found", "offer_not_found"]],
  ["ORIGIN_INACTIVE", ["origin_inactive"]],
  ["REFERENCE_INVALID", ["reference_invalid"]],
  ["NOT_READY", ["coffee_not_publish_ready"]],
  ["NO_ELIGIBLE_STOCK", ["backing_position_not_eligible"]],
  ["STOCK_INSUFFICIENT", ["offer_quantity_exceeds_inventory", "inventory_position_held"]],
  ["ACTIVE_OFFER_EXISTS", ["active_offer_exists"]],
  ["OFFER_INVALID", ["offer_price_invalid", "offer_quantity_invalid"]],
  ["OFFER_NOT_EDITABLE", ["offer_not_editable"]],
  ["OFFER_NOT_APPROVED", ["offer_not_approved", "coffee_offer_mismatch"]],
  ["PUBLICATION_AUTHORITY_REQUIRED", ["publication_authority_required"]],
  ["STATUS_INVALID", ["coffee_not_publishable_from_status"]],
  ["MEDIA_LIMIT", ["coffee_media_limit_reached"]],
  ["MEDIA_NOT_FOUND", ["coffee_media_not_found"]],
  ["MEDIA_INVALID", ["coffee_media_object_path_invalid", "coffee_media_type_invalid", "coffee_media_size_invalid"]],
  ["VALIDATION", ["catalogue_field_invalid", "catalogue_step_invalid", "expected_revision_required", "request_id_required"]],
];

type RpcFailure = { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null | undefined;

function failureText(error: RpcFailure): string {
  if (!error || typeof error !== "object") return "";
  return ["message", "details", "hint"].map((key) => (typeof error[key as "message"] === "string" ? (error[key as "message"] as string) : "")).join(" ");
}

function jsonDetail(error: RpcFailure): unknown {
  const details = error && typeof error === "object" && typeof error.details === "string" ? error.details : "";
  try { return JSON.parse(details); } catch { return null; }
}

/** SQLSTATE present → the transaction rolled back (a definite failure); absent → a transport failure whose outcome is unknown. */
const DATABASE_STATE = /^[0-9A-Z]{5}$/;

export function classifyWorkflowError(error: RpcFailure): WorkflowFailure {
  const text = failureText(error);
  for (const [code, tokens] of WORKFLOW_TOKEN_CODES) {
    if (!tokens.some((token) => new RegExp(`(^|[^a-z0-9_])${token}([^a-z0-9_]|$)`).test(text))) continue;
    const detail = jsonDetail(error);
    const failure: WorkflowFailure = { ok: false, code };
    if (code === "REVISION_CONFLICT" && detail && typeof detail === "object") {
      const record = detail as { current_revision?: unknown; current_offer_revision?: unknown };
      if (typeof record.current_revision === "number") failure.currentRevision = record.current_revision;
      if (typeof record.current_offer_revision === "number") failure.currentOfferRevision = record.current_offer_revision;
    }
    if (code === "NOT_READY" && Array.isArray(detail)) failure.missing = detail.filter((entry): entry is string => typeof entry === "string");
    if (code === "ACTIVE_OFFER_EXISTS" && detail && typeof detail === "object" && typeof (detail as { offer_id?: unknown }).offer_id === "string") failure.existingOfferId = (detail as { offer_id: string }).offer_id;
    if (code === "VALIDATION") {
      const field = error && typeof error === "object" && typeof error.details === "string" ? error.details : "form";
      failure.fieldErrors = { [field]: ["INVALID"] };
    }
    return failure;
  }
  const state = error && typeof error === "object" && typeof error.code === "string" ? error.code : "";
  if (state === "23505") return { ok: false, code: "SLUG_TAKEN" };
  if (state === "23503") return { ok: false, code: "REFERENCE_INVALID" };
  return { ok: false, code: DATABASE_STATE.test(state) ? "SAVE_FAILED" : "OUTCOME_UNKNOWN" };
}

async function workflowAccess(): Promise<{ ok: true } | WorkflowFailure> {
  const access = await checkRoleFunctionAccess("is_platform_admin");
  if (access.ok) return { ok: true };
  if (access.denial === "anonymous") return { ok: false, code: "AUTH_REQUIRED" };
  if (access.denial === "mfa-step-up") return { ok: false, code: "MFA_REQUIRED" };
  return { ok: false, code: "NOT_CAPABLE" };
}

function workflowValidation(error: { issues: { path: PropertyKey[]; message: string }[] }): WorkflowFailure {
  return { ok: false, code: "VALIDATION", fieldErrors: fieldErrorsOf(error) };
}

async function slugOf(supabase: Supabase, coffeeId: string): Promise<string | null> {
  const { data } = await supabase.from("coffees").select("slug").eq("id", coffeeId).maybeSingle();
  return data?.slug ?? null;
}

function expirePublic(slugs: readonly (string | null)[]): readonly string[] {
  try {
    return revalidatePublicCatalogue({ kind: "coffee", slugs: slugs.filter((slug): slug is string => Boolean(slug)) });
  } catch {
    return [];
  }
}

export type WorkflowCoffeeSaved = { coffeeId: string; revision: number; status: CoffeeStatus; slug?: string };

function savedOf(data: unknown): WorkflowCoffeeSaved | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  const id = (value.coffee_id as string | undefined) ?? undefined;
  const revisionValue = typeof value.revision === "number" ? value.revision : typeof value.coffee_revision === "number" ? value.coffee_revision : null;
  if (typeof id !== "string" || revisionValue === null) return null;
  return { coffeeId: id, revision: revisionValue, status: ((value.status ?? value.coffee_status ?? "DRAFT") as CoffeeStatus), slug: typeof value.slug === "string" ? value.slug : undefined };
}

async function callWorkflow<T>(
  fn: string,
  args: Record<string, unknown>,
  shape: (data: unknown) => T | null,
  invalidate: (supabase: Supabase, data: T) => Promise<readonly string[]>,
): Promise<WorkflowResult<T>> {
  const guard = await workflowAccess();
  if (!guard.ok) return guard;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return classifyWorkflowError(error);
    const shaped = shape(data);
    if (shaped === null) return { ok: false, code: "OUTCOME_UNKNOWN" };
    return { ok: true, data: shaped, revalidatedTags: await invalidate(supabase, shaped) };
  } catch {
    return { ok: false, code: "OUTCOME_UNKNOWN" };
  }
}

/** First confirmed save: creates ONE DRAFT per intent (`requestId`). Repeating the intent returns the same Coffee. */
export async function createCoffeeIntent(input: unknown): Promise<WorkflowResult<WorkflowCoffeeSaved>> {
  const parsed = CreateCoffeeIntentInput.safeParse(input);
  if (!parsed.success) return workflowValidation(parsed.error);
  return callWorkflow(
    "create_catalogue_coffee_intent",
    { p_request_id: parsed.data.requestId, p_payload: { name: parsed.data.name, slug: parsed.data.slug, description: parsed.data.description } },
    savedOf,
    async () => [],
  );
}

export async function saveCoffeeIdentity(input: unknown): Promise<WorkflowResult<WorkflowCoffeeSaved>> {
  const parsed = IdentityStepInput.safeParse(input);
  if (!parsed.success) return workflowValidation(parsed.error);
  const supabase = await createClient();
  const before = await slugOf(supabase, parsed.data.coffeeId);
  return callWorkflow(
    "save_catalogue_step",
    { p_request_id: parsed.data.requestId, p_coffee_id: parsed.data.coffeeId, p_step: "identity", p_expected_revision: parsed.data.revision, p_payload: { name: parsed.data.name, slug: parsed.data.slug, description: parsed.data.description } },
    savedOf,
    async (client, saved) => expirePublic([before, await slugOf(client, saved.coffeeId)]),
  );
}

export async function saveCoffeeArabic(input: unknown): Promise<WorkflowResult<WorkflowCoffeeSaved>> {
  const parsed = ArabicStepInput.safeParse(input);
  if (!parsed.success) return workflowValidation(parsed.error);
  return callWorkflow(
    "save_catalogue_step",
    { p_request_id: parsed.data.requestId, p_coffee_id: parsed.data.coffeeId, p_step: "arabic", p_expected_revision: parsed.data.revision, p_payload: { name: parsed.data.name, description: parsed.data.description } },
    savedOf,
    async (client, saved) => expirePublic([await slugOf(client, saved.coffeeId)]),
  );
}

export async function saveCoffeeTaxonomy(input: unknown): Promise<WorkflowResult<WorkflowCoffeeSaved>> {
  const parsed = TaxonomyStepInput.safeParse(input);
  if (!parsed.success) return workflowValidation(parsed.error);
  return callWorkflow(
    "save_catalogue_step",
    {
      p_request_id: parsed.data.requestId, p_coffee_id: parsed.data.coffeeId, p_step: "taxonomy", p_expected_revision: parsed.data.revision,
      p_payload: { origin_id: parsed.data.originId, coffee_type_id: parsed.data.coffeeTypeId, variety_id: parsed.data.varietyId, processing_method_id: parsed.data.processingMethodId, packaging_type_id: parsed.data.packagingTypeId },
    },
    savedOf,
    async (client, saved) => expirePublic([await slugOf(client, saved.coffeeId)]),
  );
}

/** The browser's upload path is derived from the request key, so a retried intent targets the SAME object. */
export function catalogueMediaPath(coffeeId: string, requestId: string, mime: (typeof CATALOGUE_MEDIA_MIME_TYPES)[number]): string {
  return `catalogue/${coffeeId}/${requestId}${CATALOGUE_MEDIA_EXTENSION[mime]}`;
}

export type WorkflowMediaSaved = { coffeeId: string; revision: number; mediaId: string; objectPath: string; isPrimary: boolean };
export type WorkflowMediaRemoved = { coffeeId: string; revision: number; removedMediaId: string };

/**
 * Attach one image under a stable media intent. Storage is outside the transaction, so: upload (idempotent by path) →
 * attach routine → on a DEFINITE failure remove only the object this intent uploaded and prove no attach committed; on an
 * UNKNOWN outcome recover by the original key BEFORE deciding anything (never delete an attached object).
 */
export async function attachCoffeeMediaIntent(input: unknown, file: unknown): Promise<WorkflowResult<WorkflowMediaSaved>> {
  const parsed = MediaAttachInput.safeParse(input);
  if (!parsed.success) return workflowValidation(parsed.error);
  const guard = await workflowAccess();
  if (!guard.ok) return guard;
  if (!(file instanceof File) || file.size === 0) return { ok: false, code: "MEDIA_INVALID", fieldErrors: { image: ["REQUIRED"] } };
  const mime = file.type as (typeof CATALOGUE_MEDIA_MIME_TYPES)[number];
  if (!CATALOGUE_MEDIA_MIME_TYPES.includes(mime) || file.size > CATALOGUE_MEDIA_MAX_BYTES) return { ok: false, code: "MEDIA_INVALID", fieldErrors: { image: ["INVALID"] } };

  const objectPath = catalogueMediaPath(parsed.data.coffeeId, parsed.data.requestId, mime);
  try {
    const supabase = await createClient();
    const bucket = supabase.storage.from("public-assets");
    const { error: uploadError } = await bucket.upload(objectPath, file, { contentType: mime, upsert: false, cacheControl: "31536000" });
    const alreadyUploaded = uploadError && /exists|duplicate|409/i.test(`${uploadError.message} ${(uploadError as { statusCode?: string }).statusCode ?? ""}`);
    if (uploadError && !alreadyUploaded) return { ok: false, code: "OUTCOME_UNKNOWN" };

    const { data, error } = await supabase.rpc("attach_catalogue_media", {
      p_request_id: parsed.data.requestId, p_coffee_id: parsed.data.coffeeId, p_expected_revision: parsed.data.revision,
      p_object_path: objectPath, p_original_name: file.name.slice(0, 255), p_mime_type: mime, p_size_bytes: file.size,
    });
    let committed = data as Record<string, unknown> | null;
    let failure: WorkflowFailure | null = null;
    if (error) {
      failure = classifyWorkflowError(error);
      if (failure.code === "OUTCOME_UNKNOWN") {
        const { data: recovered, error: recoverError } = await supabase.rpc("recover_catalogue_operation", { p_request_id: parsed.data.requestId });
        const state = recovered as { status?: string; response?: Record<string, unknown> } | null;
        if (!recoverError && state?.status === "COMMITTED") { committed = state.response ?? null; failure = null; }
        else if (recoverError || state?.status !== "NOT_COMMITTED") return { ok: false, code: "OUTCOME_UNKNOWN" };
      }
    }
    if (failure || !committed || typeof committed.media_id !== "string") {
      // Conclusively not attached (a definite failure, or recovery said NOT_COMMITTED): remove the orphan this intent created.
      let cleanup: "DONE" | "PENDING" = "DONE";
      if (!alreadyUploaded) {
        const removed = await bucket.remove([objectPath]).then(() => true).catch(() => false);
        cleanup = removed ? "DONE" : "PENDING";
      }
      return { ...(failure ?? { ok: false as const, code: "SAVE_FAILED" as const }), cleanup };
    }
    const slug = await slugOf(supabase, parsed.data.coffeeId);
    return {
      ok: true,
      data: { coffeeId: parsed.data.coffeeId, revision: Number(committed.revision), mediaId: committed.media_id, objectPath, isPrimary: committed.is_primary === true },
      revalidatedTags: expirePublic([slug]),
    };
  } catch {
    return { ok: false, code: "OUTCOME_UNKNOWN" };
  }
}

export async function removeCoffeeMediaIntent(input: unknown): Promise<WorkflowResult<WorkflowMediaRemoved>> {
  const parsed = MediaWorkflowInput.safeParse(input);
  if (!parsed.success) return workflowValidation(parsed.error);
  const guard = await workflowAccess();
  if (!guard.ok) return guard;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("remove_catalogue_media", {
      p_request_id: parsed.data.requestId, p_coffee_id: parsed.data.coffeeId, p_expected_revision: parsed.data.revision, p_media_id: parsed.data.mediaId,
    });
    if (error) return classifyWorkflowError(error);
    const value = data as { object_path?: unknown; revision?: unknown } | null;
    let cleanup: "DONE" | "PENDING" = "DONE";
    // Only an object under THIS Coffee's own prefix is ever removed, and only after the database commit.
    if (typeof value?.object_path === "string" && value.object_path.startsWith(`catalogue/${parsed.data.coffeeId}/`)) {
      cleanup = await supabase.storage.from("public-assets").remove([value.object_path]).then(() => "DONE" as const).catch(() => "PENDING" as const);
    }
    const slug = await slugOf(supabase, parsed.data.coffeeId);
    return { ok: true, data: { coffeeId: parsed.data.coffeeId, revision: Number(value?.revision ?? 0), removedMediaId: parsed.data.mediaId }, revalidatedTags: expirePublic([slug]), cleanup };
  } catch {
    return { ok: false, code: "OUTCOME_UNKNOWN" };
  }
}

export async function setCoffeePrimaryMedia(input: unknown): Promise<WorkflowResult<WorkflowCoffeeSaved>> {
  const parsed = MediaWorkflowInput.safeParse(input);
  if (!parsed.success) return workflowValidation(parsed.error);
  return callWorkflow(
    "set_catalogue_media_primary",
    { p_request_id: parsed.data.requestId, p_coffee_id: parsed.data.coffeeId, p_expected_revision: parsed.data.revision, p_media_id: parsed.data.mediaId },
    savedOf,
    async (client, saved) => expirePublic([await slugOf(client, saved.coffeeId)]),
  );
}

export type BackingPosition = {
  positionId: string; lotId: string; lotCode: string; warehouseName: string; locationCode: string | null;
  availableKg: number; reservedKg: number; tradableKg: number; held: boolean; eligible: boolean;
  existingOfferId: string | null; existingOfferStatus: string | null;
};

export type BackingPositionsResult = { ok: true; positions: readonly BackingPosition[] } | WorkflowFailure;

/** Real Hills stock for this Coffee. An empty list is the Warehouse hand-off state; stock is never created here. */
export async function listBackingPositions(coffeeId: string): Promise<BackingPositionsResult> {
  const guard = await workflowAccess();
  if (!guard.ok) return guard;
  if (!UUID_PATTERN.test(coffeeId)) return { ok: false, code: "VALIDATION" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("list_catalogue_backing_positions", { p_coffee_id: coffeeId });
    if (error) return classifyWorkflowError(error);
    const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    return {
      ok: true,
      positions: rows.map((row) => ({
        positionId: String(row.position_id), lotId: String(row.lot_id), lotCode: String(row.lot_code), warehouseName: String(row.warehouse_name ?? ""),
        locationCode: typeof row.location_code === "string" ? row.location_code : null,
        availableKg: Number(row.available_kg), reservedKg: Number(row.reserved_kg), tradableKg: Number(row.tradable_kg),
        held: row.held === true, eligible: row.eligible === true,
        existingOfferId: typeof row.existing_offer_id === "string" ? row.existing_offer_id : null,
        existingOfferStatus: typeof row.existing_offer_status === "string" ? row.existing_offer_status : null,
      })),
    };
  } catch {
    return { ok: false, code: "OUTCOME_UNKNOWN" };
  }
}

export type WorkflowOfferSaved = { offerId: string; offerCode: string | null; status: string; revision: number; coffeeRevision: number | null };

function offerOf(data: unknown): WorkflowOfferSaved | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  if (typeof value.offer_id !== "string" || typeof value.revision !== "number") return null;
  return { offerId: value.offer_id, offerCode: typeof value.offer_code === "string" ? value.offer_code : null, status: String(value.status ?? "DRAFT"), revision: value.revision, coffeeRevision: typeof value.coffee_revision === "number" ? value.coffee_revision : null };
}

/** Creates a DRAFT offer on an EXPLICITLY selected real position. Compliance review and stock stay with their owners. */
export async function createBackedOfferIntent(input: unknown): Promise<WorkflowResult<WorkflowOfferSaved>> {
  const parsed = BackedOfferInput.safeParse(input);
  if (!parsed.success) return workflowValidation(parsed.error);
  return callWorkflow(
    "create_backed_offer_intent",
    { p_request_id: parsed.data.requestId, p_coffee_id: parsed.data.coffeeId, p_expected_coffee_revision: parsed.data.revision, p_position_id: parsed.data.positionId, p_price_per_kg: parsed.data.priceUsdPerKg, p_quantity_kg: parsed.data.quantityKg, p_title: parsed.data.title },
    offerOf,
    async () => [],
  );
}

export async function saveOfferCommercials(input: unknown): Promise<WorkflowResult<WorkflowOfferSaved>> {
  const parsed = OfferCommercialsInput.safeParse(input);
  if (!parsed.success) return workflowValidation(parsed.error);
  return callWorkflow(
    "save_offer_commercials",
    { p_request_id: parsed.data.requestId, p_offer_id: parsed.data.offerId, p_expected_revision: parsed.data.revision, p_price_per_kg: parsed.data.priceUsdPerKg, p_quantity_kg: parsed.data.quantityKg, p_title: parsed.data.title },
    offerOf,
    async () => [],
  );
}

export type WorkflowFeaturedSaved = { coffeeId: string; featured: boolean; featuredAt: string | null; revision: number };

export async function setCoffeeFeatured(input: unknown): Promise<WorkflowResult<WorkflowFeaturedSaved>> {
  const parsed = FeaturedWorkflowInput.safeParse(input);
  if (!parsed.success) return workflowValidation(parsed.error);
  return callWorkflow(
    "set_coffee_featured",
    { p_coffee_id: parsed.data.coffeeId, p_enabled: parsed.data.enabled, p_expected_revision: parsed.data.revision, p_request_id: parsed.data.requestId },
    (data) => {
      const value = data as Record<string, unknown> | null;
      if (!value || typeof value.coffee_id !== "string" || typeof value.revision !== "number") return null;
      return { coffeeId: value.coffee_id, featured: value.featured === true, featuredAt: typeof value.featured_at === "string" ? value.featured_at : null, revision: value.revision };
    },
    async (client, saved) => expirePublic([await slugOf(client, saved.coffeeId)]),
  );
}

export type CatalogueReadiness = {
  coffeeId: string; revision: number; status: CoffeeStatus; ready: boolean; missing: readonly string[];
  checks: { english: boolean; arabic: boolean; origin: boolean; primaryImage: boolean };
};

export async function readCoffeeReadiness(coffeeId: string): Promise<{ ok: true; readiness: CatalogueReadiness } | WorkflowFailure> {
  const guard = await workflowAccess();
  if (!guard.ok) return guard;
  if (!UUID_PATTERN.test(coffeeId)) return { ok: false, code: "VALIDATION" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_catalogue_readiness", { p_coffee_id: coffeeId });
    if (error) return classifyWorkflowError(error);
    const value = data as { coffee_id?: string; revision?: number; status?: CoffeeStatus; ready?: boolean; missing?: string[]; checks?: Record<string, { ok?: boolean }> } | null;
    if (!value || typeof value.coffee_id !== "string") return { ok: false, code: "NOT_FOUND" };
    return {
      ok: true,
      readiness: {
        coffeeId: value.coffee_id, revision: Number(value.revision), status: (value.status ?? "DRAFT") as CoffeeStatus, ready: value.ready === true, missing: value.missing ?? [],
        checks: { english: value.checks?.english?.ok === true, arabic: value.checks?.arabic?.ok === true, origin: value.checks?.origin?.ok === true, primaryImage: value.checks?.primary_image?.ok === true },
      },
    };
  } catch {
    return { ok: false, code: "OUTCOME_UNKNOWN" };
  }
}

export type WorkflowPublished = { coffeeId: string; coffeeStatus: CoffeeStatus; coffeeRevision: number; offerId: string | null; offerStatus: string | null; offerRevision: number | null; mode: "CATALOGUE_ONLY" | "COORDINATED" };

function publishedOf(data: unknown): WorkflowPublished | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  if (typeof value.coffee_id !== "string") return null;
  return {
    coffeeId: value.coffee_id,
    coffeeStatus: (value.coffee_status ?? value.status ?? "PUBLISHED") as CoffeeStatus,
    coffeeRevision: Number(value.coffee_revision ?? value.revision ?? 0),
    offerId: typeof value.offer_id === "string" ? value.offer_id : null,
    offerStatus: typeof value.offer_status === "string" ? value.offer_status : null,
    offerRevision: typeof value.offer_revision === "number" ? value.offer_revision : null,
    mode: value.mode === "COORDINATED" ? "COORDINATED" : "CATALOGUE_ONLY",
  };
}

/** Publishes the Coffee for the public catalogue; no executable offer is required and none is created. */
export async function publishCoffeeCatalogueOnly(input: unknown): Promise<WorkflowResult<WorkflowPublished>> {
  const parsed = PublishWorkflowInput.safeParse(input);
  if (!parsed.success) return workflowValidation(parsed.error);
  return callWorkflow(
    "publish_coffee_catalogue_only",
    { p_coffee_id: parsed.data.coffeeId, p_expected_revision: parsed.data.revision, p_request_id: parsed.data.requestId },
    publishedOf,
    async (client, saved) => expirePublic([await slugOf(client, saved.coffeeId)]),
  );
}

/** Coffee + APPROVED offer, one transaction: both published or neither. Needs catalogue AND offer-publication authority. */
export async function publishCoffeeCoordinated(input: unknown): Promise<WorkflowResult<WorkflowPublished>> {
  const parsed = PublishWorkflowInput.safeParse(input);
  if (!parsed.success) return workflowValidation(parsed.error);
  if (!parsed.data.offerId || !parsed.data.offerRevision) return { ok: false, code: "VALIDATION", fieldErrors: { offerId: ["INVALID_REFERENCE"] } };
  return callWorkflow(
    "publish_coffee_with_approved_offer",
    { p_coffee_id: parsed.data.coffeeId, p_offer_id: parsed.data.offerId, p_expected_coffee_revision: parsed.data.revision, p_expected_offer_revision: parsed.data.offerRevision, p_request_id: parsed.data.requestId },
    publishedOf,
    async (client, saved) => expirePublic([await slugOf(client, saved.coffeeId)]),
  );
}

export type WorkflowRecovery = { status: "COMMITTED"; operation: string } | { status: "NOT_COMMITTED" };

/** Resolves an uncertain operation by its original intent key; the original payload is never re-sent. */
export async function recoverCatalogueOperation(input: unknown): Promise<{ ok: true; recovery: WorkflowRecovery } | WorkflowFailure> {
  const parsed = RecoverOperationInput.safeParse(input);
  if (!parsed.success) return workflowValidation(parsed.error);
  const guard = await workflowAccess();
  if (!guard.ok) return guard;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("recover_catalogue_operation", { p_request_id: parsed.data.requestId });
    if (error) return classifyWorkflowError(error);
    const value = data as { status?: string; operation?: string } | null;
    return { ok: true, recovery: value?.status === "COMMITTED" ? { status: "COMMITTED", operation: String(value.operation ?? "") } : { status: "NOT_COMMITTED" } };
  } catch {
    return { ok: false, code: "OUTCOME_UNKNOWN" };
  }
}

/* ───────── resumable state: everything the stepper shows is re-read from the normalized records ───────── */

export type WorkflowOffer = {
  id: string; code: string; status: string; title: string | null; priceUsdPerKg: number; quantityKg: number; reservedKg: number; filledKg: number;
  revision: number; lotId: string; rejectionReason: string | null;
};

export type CoffeeWorkflowState = {
  coffee: CoffeeDetail & { revision: number; featuredAt: string | null };
  arabic: ArabicTranslation | null | "unavailable";
  media: readonly CoffeeMediaRow[];
  offers: readonly WorkflowOffer[];
  options: CoffeeReferenceOptions;
  readiness: CatalogueReadiness | null;
  positions: readonly BackingPosition[] | null;
};

/**
 * Loads one Coffee exactly as stored. Nothing about step completion is client state: a reload, another device or another
 * operator sees the same truth. A read failure of one panel degrades only that panel (`null`/`"unavailable"`).
 */
export async function readCoffeeWorkflow(coffeeId: string): Promise<CoffeeWorkflowState | null> {
  if (!UUID_PATTERN.test(coffeeId)) return null;
  if (!(await workflowAccess()).ok) return null;
  const supabase = await createClient();
  const { data: row, error } = await supabase.from("coffees").select("revision, featured_at").eq("id", coffeeId).maybeSingle();
  if (error) throw new Error("catalogue_read_failed");
  const coffee = await getCoffee(coffeeId);
  if (!coffee || !row) return null;
  const [arabic, media, options, readinessResult, positionsResult, offersResult] = await Promise.all([
    getArabicTranslation("coffee", coffeeId),
    listCoffeeMedia(coffeeId),
    getCoffeeReferenceOptions(),
    readCoffeeReadiness(coffeeId),
    listBackingPositions(coffeeId),
    supabase.from("coffee_offers").select("id, offer_code, status, title, price_per_kg, quantity_kg, reserved_quantity_kg, filled_quantity_kg, revision, lot_id, rejection_reason").eq("coffee_id", coffeeId).is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  return {
    coffee: { ...coffee, revision: Number(row.revision), featuredAt: row.featured_at },
    arabic,
    media,
    offers: (offersResult.data ?? []).map((offer) => ({
      id: offer.id, code: offer.offer_code, status: offer.status, title: offer.title, priceUsdPerKg: Number(offer.price_per_kg), quantityKg: Number(offer.quantity_kg),
      reservedKg: Number(offer.reserved_quantity_kg), filledKg: Number(offer.filled_quantity_kg), revision: Number(offer.revision), lotId: offer.lot_id, rejectionReason: offer.rejection_reason,
    })),
    options,
    readiness: readinessResult.ok ? readinessResult.readiness : null,
    positions: positionsResult.ok ? positionsResult.positions : null,
  };
}

export { COFFEE_TRANSITIONS };
export type { Supabase as CatalogueSupabaseClient };
