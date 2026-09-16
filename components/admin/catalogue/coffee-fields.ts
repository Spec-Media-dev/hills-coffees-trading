import type { RecordField } from "@/components/admin/catalogue/record-form";
import type { CoffeeDetail, CoffeeReferenceOptions } from "@/lib/admin/catalogue";
import { DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH, SLUG_MAX_LENGTH } from "@/lib/admin/catalogue-validation";

/**
 * Feature 010 RUN E (T021) — the coffee form's field declaration (server-side, data only). `status`
 * is deliberately NOT a field: it changes only through the publication panel's named operations.
 * `created_by`/`updated_by`/timestamps are never client-supplied.
 */
export function coffeeFields(options: CoffeeReferenceOptions, coffee: CoffeeDetail | null): RecordField[] {
  const refOptions = (rows: readonly { id: string; name: string }[]) => rows.map((row) => ({ value: row.id, label: row.name }));
  return [
    { name: "name", labelKey: "name", kind: "text", required: true, maxLength: NAME_MAX_LENGTH, defaultValue: coffee?.name ?? "" },
    { name: "slug", labelKey: "slug", hintKey: "slugHint", kind: "text", required: true, ltr: true, maxLength: SLUG_MAX_LENGTH, defaultValue: coffee?.slug ?? "" },
    { name: "originId", labelKey: "origin", kind: "select", allowEmpty: true, options: refOptions(options.origins.map((origin) => ({ id: origin.id, name: `${origin.name} (${origin.status})` }))), defaultValue: coffee?.originId ?? "" },
    { name: "coffeeTypeId", labelKey: "coffeeType", kind: "select", allowEmpty: true, options: refOptions(options.coffeeTypes), defaultValue: coffee?.coffeeTypeId ?? "" },
    { name: "varietyId", labelKey: "variety", kind: "select", allowEmpty: true, options: refOptions(options.varieties), defaultValue: coffee?.varietyId ?? "" },
    { name: "processingMethodId", labelKey: "processingMethod", kind: "select", allowEmpty: true, options: refOptions(options.processingMethods), defaultValue: coffee?.processingMethodId ?? "" },
    { name: "packagingTypeId", labelKey: "packagingType", kind: "select", allowEmpty: true, options: refOptions(options.packagingTypes), defaultValue: coffee?.packagingTypeId ?? "" },
    { name: "description", labelKey: "description", kind: "textarea", maxLength: DESCRIPTION_MAX_LENGTH, defaultValue: coffee?.description ?? "" },
  ];
}
