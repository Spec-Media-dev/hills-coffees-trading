"use server";

import { revalidatePath } from "next/cache";

import {
  createCoffee,
  createOrigin,
  createRegion,
  createTaxonomyEntry,
  createWarehouse,
  createWarehouseLocation,
  setCoffeeMediaPrimary,
  setCoffeeMediaSortOrder,
  transitionCoffee,
  updateCoffee,
  updateOrigin,
  updateRegion,
  updateTaxonomyEntry,
  updateWarehouse,
  updateWarehouseLocation,
  type CatalogueWriteOutcome,
  type CoffeeTransitionOutcome,
} from "@/lib/admin/catalogue";
import type { ActionFeedbackResult } from "@/lib/types/action-feedback";

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

export async function saveCoffee(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.coffeeId ? await updateCoffee(input) : await createCoffee(input);
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
  if (result.ok) revalidateAdmin(["/dashboard-admin/origins", `/dashboard-admin/origins/${result.data.id}`, "/dashboard-admin/coffees"]);
  return result;
}

export async function saveRegion(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.regionId ? await updateRegion(input) : await createRegion(input);
  if (result.ok) revalidateAdmin(["/dashboard-admin/regions", `/dashboard-admin/regions/${result.data.id}`, "/dashboard-admin/origins"]);
  return result;
}

export async function saveTaxonomyEntry(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.entryId ? await updateTaxonomyEntry(input) : await createTaxonomyEntry(input);
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
