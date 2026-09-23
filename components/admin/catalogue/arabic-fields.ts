import type { RecordField } from "@/components/admin/catalogue/record-form";

/**
 * Pre-Stripe hardening run — the optional Arabic fields appended to the catalogue CREATE forms, so
 * Arabic content can be entered in the same step as the English record (the actions write it through
 * `saveArabicTranslation` once the record exists). Always `lang="ar" dir="rtl"`. Edit screens use the
 * dedicated Arabic tab (`ArabicContentPanel`) instead.
 */
export function arabicCreateFields(withDescription: boolean): RecordField[] {
  const fields: RecordField[] = [{ name: "nameAr", labelKey: "nameAr", hintKey: "arabicCreateHint", kind: "text", rtl: true, maxLength: 200 }];
  if (withDescription) fields.push({ name: "descriptionAr", labelKey: "descriptionAr", kind: "textarea", rtl: true, maxLength: 4000 });
  return fields;
}
