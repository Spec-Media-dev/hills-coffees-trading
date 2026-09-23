"use server";

import { revalidatePath } from "next/cache";

import {
  createCoffee,
  createOrigin,
  createRegion,
  createTaxonomyEntry,
  createWarehouse,
  createWarehouseLocation,
  listCoffeeMedia,
  removeCoffeeImage,
  saveArabicTranslation,
  setCoffeeMediaPrimary,
  setCoffeeMediaSortOrder,
  transitionCoffee,
  updateCoffee,
  updateOrigin,
  updateRegion,
  updateTaxonomyEntry,
  updateWarehouse,
  updateWarehouseLocation,
  uploadCoffeeImage,
  type CatalogueWriteOutcome,
  type CoffeeTransitionOutcome,
} from "@/lib/admin/catalogue";
import { isTaxonomyKind, translationKindForTaxonomy, type TranslationKind } from "@/lib/admin/catalogue-validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN E (Phase 7) — thin Server Actions over `lib/admin/catalogue.ts`. They convert
 * FormData to plain input, delegate every check (validation → live `is_platform_admin()` → RLS → the
 * one revalidation seam) to the layer, and revalidate the console's OWN private paths. Public cache
 * invalidation is NOT done here — it lives in `lib/admin/catalogue.ts` (T023), exactly once.
 */

function fields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") out[key] = value;
  return out;
}

type Result = ActionFeedbackResult<CatalogueWriteOutcome>;

function revalidateAdmin(paths: readonly string[]) {
  for (const path of paths) revalidatePath(path);
  revalidatePath("/dashboard-admin");
}

/**
 * Pre-Stripe hardening run — bilingual CREATE. The create forms carry optional `nameAr` /
 * `descriptionAr` fields so Arabic can be entered in the same step as English. The English record is
 * created first (its own validated, RLS-checked write); only then — with its new id — is the Arabic
 * row written through the SAME `saveArabicTranslation` writer the edit screen uses. Two separate rows,
 * so neither language can overwrite the other. A failed Arabic write never undoes the English record:
 * the detail page's Arabic panel shows exactly what was saved and offers the retry.
 */
async function saveArabicOnCreate(kind: TranslationKind, id: string, input: Record<string, string>) {
  const name = (input.nameAr ?? "").trim();
  if (!name) return;
  await saveArabicTranslation({ kind, entityId: id, name, description: kind === "coffee" || kind === "origin" ? (input.descriptionAr ?? "") : "" });
}

export async function saveCoffee(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.coffeeId ? await updateCoffee(input) : await createCoffee(input);
  if (result.ok && !input.coffeeId) await saveArabicOnCreate("coffee", result.data.id, input);
  if (result.ok) revalidateAdmin(["/dashboard-admin/coffees", `/dashboard-admin/coffees/${result.data.id}`]);
  return result;
}

export async function runCoffeeTransition(_prev: ActionFeedbackResult<CoffeeTransitionOutcome> | undefined, formData: FormData): Promise<ActionFeedbackResult<CoffeeTransitionOutcome>> {
  const input = fields(formData);
  const result = await transitionCoffee({ coffeeId: input.coffeeId, operation: input.operation });
  if (result.ok) revalidateAdmin(["/dashboard-admin/coffees", `/dashboard-admin/coffees/${result.data.id}`]);
  return result;
}

export async function saveOrigin(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.originId ? await updateOrigin(input) : await createOrigin(input);
  if (result.ok && !input.originId) await saveArabicOnCreate("origin", result.data.id, input);
  if (result.ok) revalidateAdmin(["/dashboard-admin/origins", `/dashboard-admin/origins/${result.data.id}`, "/dashboard-admin/coffees"]);
  return result;
}

export async function saveRegion(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.regionId ? await updateRegion(input) : await createRegion(input);
  if (result.ok && !input.regionId) await saveArabicOnCreate("region", result.data.id, input);
  if (result.ok) revalidateAdmin(["/dashboard-admin/regions", `/dashboard-admin/regions/${result.data.id}`, "/dashboard-admin/origins"]);
  return result;
}

export async function saveTaxonomyEntry(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.entryId ? await updateTaxonomyEntry(input) : await createTaxonomyEntry(input);
  const taxonomyTranslationKind = isTaxonomyKind(input.kind) ? translationKindForTaxonomy(input.kind) : null;
  if (result.ok && !input.entryId && taxonomyTranslationKind) await saveArabicOnCreate(taxonomyTranslationKind, result.data.id, input);
  if (result.ok) revalidateAdmin(["/dashboard-admin/taxonomy", `/dashboard-admin/taxonomy/${input.kind}/${result.data.id}`]);
  return result;
}

export async function saveWarehouse(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.warehouseId ? await updateWarehouse(input) : await createWarehouse(input);
  if (result.ok) revalidateAdmin(["/dashboard-admin/warehouses", `/dashboard-admin/warehouses/${result.data.id}`, "/dashboard-admin/inventory"]);
  return result;
}

export async function saveWarehouseLocation(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.locationId ? await updateWarehouseLocation(input) : await createWarehouseLocation(input);
  if (result.ok) revalidateAdmin(["/dashboard-admin/warehouses", `/dashboard-admin/warehouses/${input.warehouseId}`]);
  return result;
}

export async function markCoffeeMediaPrimary(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = await setCoffeeMediaPrimary(input);
  if (result.ok) revalidateAdmin([`/dashboard-admin/coffees/${input.coffeeId}`, "/dashboard-admin/media"]);
  return result;
}

export async function reorderCoffeeMedia(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = await setCoffeeMediaSortOrder(input);
  if (result.ok) revalidateAdmin([`/dashboard-admin/coffees/${input.coffeeId}`, "/dashboard-admin/media"]);
  return result;
}

/**
 * Hardening run — catalogue image upload. Accepts one or more `images` files; each goes through the
 * layer's full check (live admin → MIME/size/count → coffee exists → upload → `attach_coffee_media`).
 * Stops at the first refusal and reports it; images already attached stay attached (each is complete
 * on its own — there is no half-uploaded state).
 */
export async function uploadCoffeeImages(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const coffeeId = formData.get("coffeeId");
  const files = formData.getAll("images").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length === 0) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { images: ["Required"] } };
  let last: Result | undefined;
  for (const file of files) {
    last = await uploadCoffeeImage(coffeeId, file);
    if (!last.ok) break;
  }
  revalidateAdmin([`/dashboard-admin/coffees/${String(coffeeId)}`, "/dashboard-admin/media", "/dashboard-admin/coffees"]);
  return last!;
}

export async function deleteCoffeeImage(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = await removeCoffeeImage(input);
  if (result.ok) revalidateAdmin([`/dashboard-admin/coffees/${input.coffeeId}`, "/dashboard-admin/media", "/dashboard-admin/coffees"]);
  return result;
}

/**
 * Replace = upload the new file, give it the old image's position (and primary flag), then remove the
 * old one. If the upload is refused nothing is removed, so a failed replace never loses an image.
 */
export async function replaceCoffeeImage(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const current = (await listCoffeeMedia(input.coffeeId ?? "").catch(() => [])).find((row) => row.id === input.mediaId);
  if (!current) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  const uploaded = await uploadCoffeeImage(input.coffeeId, formData.get("image"));
  if (!uploaded.ok) return uploaded;
  await setCoffeeMediaSortOrder({ coffeeId: input.coffeeId, mediaId: uploaded.data.id, sortOrder: String(current.sortOrder) });
  if (current.isPrimary) await setCoffeeMediaPrimary({ coffeeId: input.coffeeId, mediaId: uploaded.data.id });
  const removed = await removeCoffeeImage({ coffeeId: input.coffeeId, mediaId: current.id });
  revalidateAdmin([`/dashboard-admin/coffees/${input.coffeeId}`, "/dashboard-admin/media", "/dashboard-admin/coffees"]);
  return removed.ok ? { ok: true, data: uploaded.data, code: ACTION_FEEDBACK.CATALOGUE_MEDIA_UPLOADED } : removed;
}

/** Move one image a step earlier/later: renumbers the coffee's images 0..n-1 in the new order. */
export async function moveCoffeeImage(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const media = await listCoffeeMedia(input.coffeeId ?? "").catch(() => null);
  if (!media) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  const order = [...media];
  const index = order.findIndex((row) => row.id === input.mediaId);
  const target = input.direction === "earlier" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= order.length) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { direction: ["Invalid"] } };
  [order[index], order[target]] = [order[target]!, order[index]!];
  let last: Result = { ok: false, code: ACTION_FEEDBACK.CATALOGUE_SAVE_FAILED };
  for (const [position, row] of order.entries()) {
    if (row.sortOrder === position) continue;
    last = await setCoffeeMediaSortOrder({ coffeeId: input.coffeeId, mediaId: row.id, sortOrder: String(position) });
    if (!last.ok) return last;
  }
  revalidateAdmin([`/dashboard-admin/coffees/${input.coffeeId}`, "/dashboard-admin/media"]);
  return last.ok ? last : { ok: true, data: { id: input.mediaId!, revalidatedTags: [] }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

/** Hardening run — save (or, with a blank name, clear) one entity's Arabic catalogue content. */
export async function saveCatalogueArabic(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = await saveArabicTranslation(input);
  if (result.ok && typeof input.returnPath === "string" && input.returnPath.startsWith("/dashboard-admin/")) revalidateAdmin([input.returnPath]);
  return result;
}
