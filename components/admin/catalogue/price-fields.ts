import type { RecordField } from "@/components/admin/catalogue/record-form";
import type { PriceDifferentialRow, PriceScopeOptions, PriceSourceRow } from "@/lib/admin/prices";
import { PRICE_DELAY_TYPES, PRICE_DIFFERENTIAL_TYPES, PRICE_LICENCE_STATUSES, PRICE_OBSERVATION_COMMODITIES, PRICE_SOURCE_TYPES } from "@/lib/admin/price-validation";

/**
 * Feature 010 T049 — field declarations for the reference-price forms (server-side data only). Each form exposes
 * exactly the columns its own zod contract accepts; select options are the contract's own vocabularies (labels are
 * resolved in the viewer's locale by `RecordForm`). Fixed-once-created facts (source code/type, a differential's
 * amount/currency/unit/type/scope) are never edit fields. Instants are entered and shown as UTC.
 */

const vocab = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

/** `datetime-local` value (`YYYY-MM-DDTHH:MM`) of an ISO instant, in UTC. */
export function utcLocalValue(iso: string | null): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  return Number.isNaN(time) ? "" : new Date(time).toISOString().slice(0, 16);
}

export function priceSourceFields(source: PriceSourceRow | null): RecordField[] {
  const fields: RecordField[] = [{ name: "name", labelKey: "name", kind: "text", required: true, maxLength: 120, defaultValue: source?.name ?? "" }];
  if (!source) {
    fields.push(
      { name: "code", labelKey: "code", hintKey: "codeHint", kind: "text", required: true, ltr: true, maxLength: 32, defaultValue: "" },
      { name: "sourceType", labelKey: "sourceType", kind: "select", statusOptions: "sourceType", options: vocab(PRICE_SOURCE_TYPES), required: true, defaultValue: "OTHER" },
    );
  }
  fields.push(
    { name: "licenceStatus", labelKey: "licenceStatus", kind: "select", statusOptions: "licenceStatus", options: vocab(PRICE_LICENCE_STATUSES), required: true, defaultValue: source?.licenceStatus ?? "PENDING" },
    { name: "delayType", labelKey: "delayType", kind: "select", statusOptions: "delayType", options: vocab(PRICE_DELAY_TYPES), required: true, defaultValue: source?.delayType ?? "DELAYED" },
    { name: "delayMinutes", labelKey: "delayMinutes", hintKey: "delayMinutesHint", kind: "number", min: 0, step: 1, defaultValue: source?.delayMinutes === null || source?.delayMinutes === undefined ? "" : String(source.delayMinutes) },
    { name: "sourceUrl", labelKey: "sourceUrl", hintKey: "sourceUrlHint", kind: "text", ltr: true, maxLength: 500, defaultValue: source?.sourceUrl ?? "" },
    { name: "isActive", labelKey: "isActive", hintKey: "isActiveHint", kind: "checkbox", defaultValue: source ? source.isActive : true },
  );
  return fields;
}

/** A NEW observation only — observations are append-only, so there is no edit form. */
export function priceObservationFields(): RecordField[] {
  return [
    { name: "symbol", labelKey: "symbol", hintKey: "symbolHint", kind: "text", required: true, ltr: true, maxLength: 32, defaultValue: "" },
    { name: "commodityType", labelKey: "commodityType", kind: "select", statusOptions: "commodity", options: vocab(PRICE_OBSERVATION_COMMODITIES), required: true, defaultValue: "ARABICA" },
    // A text input, not type=number: the value must reach the server as the exact entered digits (no locale/float handling).
    { name: "rawValue", labelKey: "rawValue", hintKey: "rawValueHint", kind: "text", required: true, ltr: true, maxLength: 20, defaultValue: "" },
    { name: "rawCurrency", labelKey: "rawCurrency", hintKey: "currencyHint", kind: "text", required: true, ltr: true, maxLength: 3, defaultValue: "USD" },
    { name: "rawUnit", labelKey: "rawUnit", hintKey: "unitHint", kind: "text", required: true, ltr: true, maxLength: 32, defaultValue: "" },
    { name: "observedAt", labelKey: "observedAt", kind: "datetime", required: true, defaultValue: "" },
    { name: "isStale", labelKey: "isStale", hintKey: "isStaleHint", kind: "checkbox", defaultValue: false },
  ];
}

export function priceDifferentialCreateFields(scope: PriceScopeOptions): RecordField[] {
  return [
    { name: "differentialType", labelKey: "differentialType", kind: "select", statusOptions: "differentialType", options: vocab(PRICE_DIFFERENTIAL_TYPES), required: true, defaultValue: "ORIGIN" },
    { name: "amount", labelKey: "amount", hintKey: "amountHint", kind: "text", required: true, ltr: true, maxLength: 20, defaultValue: "" },
    { name: "currency", labelKey: "currency", hintKey: "currencyHint", kind: "text", required: true, ltr: true, maxLength: 3, defaultValue: "USD" },
    { name: "unit", labelKey: "unit", hintKey: "unitHint", kind: "text", required: true, ltr: true, maxLength: 32, defaultValue: "KG" },
    { name: "effectiveFrom", labelKey: "effectiveFrom", kind: "datetime", required: true, defaultValue: utcLocalValue(new Date().toISOString()) },
    { name: "effectiveUntil", labelKey: "effectiveUntil", kind: "datetime", defaultValue: "" },
    { name: "coffeeId", labelKey: "coffeeId", kind: "select", allowEmpty: true, options: scope.coffees.map((row) => ({ value: row.id, label: row.name })), defaultValue: "" },
    { name: "originId", labelKey: "originId", kind: "select", allowEmpty: true, options: scope.origins.map((row) => ({ value: row.id, label: row.name })), defaultValue: "" },
    { name: "notes", labelKey: "notes", hintKey: "notesHint", kind: "textarea", maxLength: 1000, defaultValue: "" },
    { name: "isActive", labelKey: "isActive", hintKey: "isActiveHint", kind: "checkbox", defaultValue: true },
  ];
}

/** Lifecycle only — the fixed facts are shown read-only on the page, not as fields. */
export function priceDifferentialLifecycleFields(differential: PriceDifferentialRow): RecordField[] {
  return [
    { name: "effectiveUntil", labelKey: "effectiveUntil", kind: "datetime", defaultValue: utcLocalValue(differential.effectiveUntil) },
    { name: "notes", labelKey: "notes", hintKey: "notesHint", kind: "textarea", maxLength: 1000, defaultValue: differential.notes ?? "" },
    { name: "isActive", labelKey: "isActive", hintKey: "isActiveHint", kind: "checkbox", defaultValue: differential.isActive },
  ];
}
