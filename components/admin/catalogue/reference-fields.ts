import type { RecordField } from "@/components/admin/catalogue/record-form";
import type { OrganizationOption, OriginRow, RegionRow, TaxonomyRow, WarehouseLocationRow, WarehouseRow } from "@/lib/admin/catalogue";
import { DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH, SLUG_MAX_LENGTH, type TaxonomyKind } from "@/lib/admin/catalogue-validation";

/**
 * Feature 010 RUN E (T022) — per-resource field declarations (server-side data only). Each resource
 * exposes exactly the columns its own zod contract accepts; nothing DB-owned is a field. Status
 * selects use the database vocabulary (`origins_status_check`); warehouses expose the `is_active`
 * boolean the schema actually has, never an invented archive state.
 */
export function originFields(origin: OriginRow | null, regions: readonly RegionRow[], parents: readonly OriginRow[]): RecordField[] {
  return [
    { name: "name", labelKey: "name", kind: "text", required: true, maxLength: NAME_MAX_LENGTH, defaultValue: origin?.name ?? "" },
    { name: "slug", labelKey: "slug", hintKey: "slugHint", kind: "text", required: true, ltr: true, maxLength: SLUG_MAX_LENGTH, defaultValue: origin?.slug ?? "" },
    { name: "status", labelKey: "status", kind: "select", statusOptions: "origin", required: true, defaultValue: origin?.status ?? "ACTIVE" },
    { name: "countryCode", labelKey: "countryCode", hintKey: "countryCodeHint", kind: "text", ltr: true, maxLength: 2, defaultValue: origin?.countryCode ?? "" },
    { name: "regionId", labelKey: "region", kind: "select", allowEmpty: true, options: regions.map((row) => ({ value: row.id, label: row.name })), defaultValue: origin?.regionId ?? "" },
    { name: "parentOriginId", labelKey: "parentOrigin", kind: "select", allowEmpty: true, options: parents.filter((row) => row.id !== origin?.id).map((row) => ({ value: row.id, label: row.name })), defaultValue: origin?.parentOriginId ?? "" },
    { name: "description", labelKey: "description", kind: "textarea", maxLength: DESCRIPTION_MAX_LENGTH, defaultValue: origin?.description ?? "" },
  ];
}

export function regionFields(region: RegionRow | null): RecordField[] {
  return [
    { name: "name", labelKey: "name", kind: "text", required: true, maxLength: NAME_MAX_LENGTH, defaultValue: region?.name ?? "" },
    { name: "slug", labelKey: "slug", hintKey: "slugHint", kind: "text", required: true, ltr: true, maxLength: SLUG_MAX_LENGTH, defaultValue: region?.slug ?? "" },
    { name: "countryCode", labelKey: "countryCode", hintKey: "countryCodeHint", kind: "text", ltr: true, maxLength: 2, defaultValue: region?.countryCode ?? "" },
  ];
}

export function taxonomyFields(kind: TaxonomyKind, entry: TaxonomyRow | null, coffeeTypes: readonly TaxonomyRow[]): RecordField[] {
  const fields: RecordField[] = [
    { name: "name", labelKey: "name", kind: "text", required: true, maxLength: NAME_MAX_LENGTH, defaultValue: entry?.name ?? "" },
    { name: "slug", labelKey: "slug", hintKey: "slugHint", kind: "text", required: true, ltr: true, maxLength: SLUG_MAX_LENGTH, defaultValue: entry?.slug ?? "" },
  ];
  if (kind === "varieties") {
    fields.push({ name: "coffeeTypeId", labelKey: "coffeeType", kind: "select", allowEmpty: true, options: coffeeTypes.map((row) => ({ value: row.id, label: row.name })), defaultValue: entry?.coffeeTypeId ?? "" });
  }
  return fields;
}

export function warehouseFields(warehouse: WarehouseRow | null, organizations: readonly OrganizationOption[]): RecordField[] {
  return [
    { name: "code", labelKey: "code", hintKey: "codeHint", kind: "text", required: true, ltr: true, maxLength: 32, defaultValue: warehouse?.code ?? "" },
    { name: "name", labelKey: "name", kind: "text", required: true, maxLength: NAME_MAX_LENGTH, defaultValue: warehouse?.name ?? "" },
    { name: "countryCode", labelKey: "countryCode", hintKey: "countryCodeHint", kind: "text", ltr: true, maxLength: 2, defaultValue: warehouse?.countryCode ?? "" },
    { name: "city", labelKey: "city", kind: "text", maxLength: 120, defaultValue: warehouse?.city ?? "" },
    { name: "ownerOrganizationId", labelKey: "owner", kind: "select", required: true, allowEmpty: !warehouse, options: organizations.map((row) => ({ value: row.id, label: row.displayName })), defaultValue: warehouse?.ownerOrganizationId ?? "" },
    { name: "address", labelKey: "address", kind: "textarea", maxLength: 500, defaultValue: warehouse?.address ?? "" },
    { name: "isActive", labelKey: "isActive", hintKey: "isActiveHint", kind: "checkbox", defaultValue: warehouse ? warehouse.isActive : true },
  ];
}

export function warehouseLocationFields(location: WarehouseLocationRow | null): RecordField[] {
  return [
    { name: "code", labelKey: "code", hintKey: "codeHint", kind: "text", required: true, ltr: true, maxLength: 32, defaultValue: location?.code ?? "" },
    { name: "name", labelKey: "name", kind: "text", required: true, maxLength: NAME_MAX_LENGTH, defaultValue: location?.name ?? "" },
  ];
}
