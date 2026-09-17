import { z } from "zod";

/**
 * Feature 010 RUN E (T021/T022) — catalogue input contracts. Every status vocabulary below is the
 * database's own CHECK constraint, verbatim (`coffees_status_check`, `origins_status_check`); the
 * reference tables (`regions`, `coffee_types`, `coffee_varieties`, `processing_methods`,
 * `packaging_types`, `tags`) carry NO status column, and `warehouses` carries only the `is_active`
 * boolean — none of them gets an invented one here.
 *
 * VALIDATION IS NOT AUTHORIZATION: a well-formed input proves nothing about the caller's role — every
 * write in `lib/admin/catalogue.ts` re-verifies `is_platform_admin()` live and RLS
 * (`catalog_admin_*`, all `is_platform_admin()`) decides underneath.
 *
 * DB-OWNED / NEVER CLIENT-SUPPLIED: `id` on create, `created_by`/`updated_by` (derived from the
 * session), `created_at`/`updated_at` (defaults/trigger), and — for coffees — `status` is never a free
 * form field: it changes only through the named transition operations.
 */

export const COFFEE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type CoffeeStatus = (typeof COFFEE_STATUSES)[number];

export const ORIGIN_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export type OriginStatus = (typeof ORIGIN_STATUSES)[number];

/**
 * The console's OWN publication workflow over `coffees_status_check` (the database has no
 * transition trigger for coffees — any of the three values is storable; this map is the product
 * narrowing the UI offers and the compare-and-set source the write enforces). `publish` is the only
 * way into `PUBLISHED`; `unpublish` returns to `DRAFT`; `archive` retires a coffee (public 404 like
 * DRAFT — Feature 002 treats both identically); `restore` brings an archived coffee back to DRAFT for
 * editing. No operation deletes anything.
 */
export const COFFEE_TRANSITIONS = {
  publish: { from: ["DRAFT"], to: "PUBLISHED" },
  unpublish: { from: ["PUBLISHED"], to: "DRAFT" },
  archive: { from: ["DRAFT", "PUBLISHED"], to: "ARCHIVED" },
  restore: { from: ["ARCHIVED"], to: "DRAFT" },
} as const satisfies Record<string, { from: readonly CoffeeStatus[]; to: CoffeeStatus }>;
export type CoffeeTransitionKey = keyof typeof COFFEE_TRANSITIONS;
export const COFFEE_TRANSITION_KEYS = Object.keys(COFFEE_TRANSITIONS) as readonly CoffeeTransitionKey[];

export function coffeeTransitionsFor(status: CoffeeStatus): readonly CoffeeTransitionKey[] {
  return COFFEE_TRANSITION_KEYS.filter((key) => (COFFEE_TRANSITIONS[key].from as readonly CoffeeStatus[]).includes(status));
}

/** Feature 002's public route/tag slug shape (`/^public-coffee:([a-z0-9-]{1,100})$/` in its cache-proof allowlist). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const NAME_MAX_LENGTH = 120;
export const SLUG_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 4000;

const uuid = z.string().uuid("INVALID_REFERENCE");
const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .pipe(z.string().uuid("INVALID_REFERENCE").nullable());
const name = z.string().trim().min(2, "NAME_REQUIRED").max(NAME_MAX_LENGTH, "NAME_TOO_LONG");
const slug = z.string().trim().toLowerCase().min(1, "SLUG_REQUIRED").max(SLUG_MAX_LENGTH, "SLUG_TOO_LONG").regex(SLUG_PATTERN, "SLUG_INVALID");
const description = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX_LENGTH, "DESCRIPTION_TOO_LONG")
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));
/** ISO 3166-1 alpha-2, upper-cased — the `character(2)` columns' shape. */
const optionalCountryCode = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value.toUpperCase() : null))
  .pipe(z.string().regex(/^[A-Z]{2}$/, "COUNTRY_CODE_INVALID").nullable());

// ── Coffees ─────────────────────────────────────────────────────────────────────────────────────

export const CoffeeFieldsInput = z.object({
  name,
  slug,
  description,
  originId: optionalUuid,
  coffeeTypeId: optionalUuid,
  varietyId: optionalUuid,
  processingMethodId: optionalUuid,
  packagingTypeId: optionalUuid,
});
export type CoffeeFieldsInput = z.infer<typeof CoffeeFieldsInput>;

export const CoffeeUpdateInput = CoffeeFieldsInput.extend({ coffeeId: uuid });
export type CoffeeUpdateInput = z.infer<typeof CoffeeUpdateInput>;

export const CoffeeTransitionInput = z.object({ coffeeId: uuid, operation: z.enum(["publish", "unpublish", "archive", "restore"]) });
export type CoffeeTransitionInput = z.infer<typeof CoffeeTransitionInput>;

// ── Origins / regions ───────────────────────────────────────────────────────────────────────────

export const OriginFieldsInput = z.object({
  name,
  slug,
  description,
  countryCode: optionalCountryCode,
  regionId: optionalUuid,
  parentOriginId: optionalUuid,
  status: z.enum(ORIGIN_STATUSES),
});
export type OriginFieldsInput = z.infer<typeof OriginFieldsInput>;
export const OriginUpdateInput = OriginFieldsInput.extend({ originId: uuid });
export type OriginUpdateInput = z.infer<typeof OriginUpdateInput>;

export const RegionFieldsInput = z.object({ name, slug, countryCode: optionalCountryCode });
export type RegionFieldsInput = z.infer<typeof RegionFieldsInput>;
export const RegionUpdateInput = RegionFieldsInput.extend({ regionId: uuid });
export type RegionUpdateInput = z.infer<typeof RegionUpdateInput>;

// ── Taxonomy (five reference tables, each its own DTO path — never a generic table editor) ──────

export const TAXONOMY_KINDS = ["coffeeTypes", "varieties", "processingMethods", "packagingTypes", "tags"] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];
export function isTaxonomyKind(value: string | undefined): value is TaxonomyKind {
  return value !== undefined && (TAXONOMY_KINDS as readonly string[]).includes(value);
}

export const TaxonomyFieldsInput = z.object({
  kind: z.enum(TAXONOMY_KINDS),
  name,
  slug,
  /** `coffee_varieties.coffee_type_id` only — ignored (must be absent) for every other kind. */
  coffeeTypeId: optionalUuid,
});
export type TaxonomyFieldsInput = z.infer<typeof TaxonomyFieldsInput>;
export const TaxonomyUpdateInput = TaxonomyFieldsInput.extend({ entryId: uuid });
export type TaxonomyUpdateInput = z.infer<typeof TaxonomyUpdateInput>;

// ── Warehouses (reference/configuration fields ONLY — never inventory, custody or shipments) ────

const warehouseCode = z.string().trim().toUpperCase().min(2, "CODE_REQUIRED").max(32, "CODE_TOO_LONG").regex(/^[A-Z0-9][A-Z0-9-]*$/, "CODE_INVALID");
/** HTML checkbox semantics: an unchecked box is simply ABSENT from the FormData, so the key is optional and absent = false. */
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal(""), z.boolean()])
  .optional()
  .transform((value) => value === "on" || value === "true" || value === true);

export const WarehouseFieldsInput = z.object({
  code: warehouseCode,
  name,
  /** Nullable in the approved schema (`warehouses.country_code`), like origins/regions. */
  countryCode: optionalCountryCode,
  city: z
    .string()
    .trim()
    .max(120, "CITY_TOO_LONG")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  address: z
    .string()
    .trim()
    .max(500, "ADDRESS_TOO_LONG")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  /** `warehouses.owner_organization_id` is NOT NULL in the approved schema — every warehouse has an owner organization. */
  ownerOrganizationId: uuid,
  isActive: checkbox,
});
export type WarehouseFieldsInput = z.infer<typeof WarehouseFieldsInput>;
export const WarehouseUpdateInput = WarehouseFieldsInput.extend({ warehouseId: uuid });
export type WarehouseUpdateInput = z.infer<typeof WarehouseUpdateInput>;

export const WarehouseLocationInput = z.object({ warehouseId: uuid, code: warehouseCode, name });
export type WarehouseLocationInput = z.infer<typeof WarehouseLocationInput>;
export const WarehouseLocationUpdateInput = WarehouseLocationInput.extend({ locationId: uuid });
export type WarehouseLocationUpdateInput = z.infer<typeof WarehouseLocationUpdateInput>;

// ── Media records (T024 — metadata only; no byte path exists, DB-BLOCK-01) ─────────────────────

export const CoffeeMediaPrimaryInput = z.object({ coffeeId: uuid, mediaId: uuid });
export type CoffeeMediaPrimaryInput = z.infer<typeof CoffeeMediaPrimaryInput>;
export const CoffeeMediaSortInput = z.object({ coffeeId: uuid, mediaId: uuid, sortOrder: z.coerce.number().int("SORT_ORDER_INVALID").min(0, "SORT_ORDER_INVALID").max(9999, "SORT_ORDER_INVALID") });
export type CoffeeMediaSortInput = z.infer<typeof CoffeeMediaSortInput>;
