"use server";

import { revalidatePath } from "next/cache";

import { createPriceDifferential, createPriceSource, recordPriceObservation, updatePriceDifferential, updatePriceSource, type PriceWriteOutcome } from "@/lib/admin/prices";
import type { ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 T049 — thin Server Actions over `lib/admin/prices.ts`. They convert FormData to plain input and
 * delegate every check (validation → live `is_platform_admin()` → RLS → Feature 011's `revalidateReferencePrices()`)
 * to the layer, then refresh the console's OWN private paths. Public cache invalidation is NOT done here — it lives
 * in the layer, exactly once per successful write.
 */

type Result = ActionFeedbackResult<PriceWriteOutcome>;

function fields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") out[key] = value;
  return out;
}

function refreshConsole(paths: readonly string[]) {
  for (const path of ["/dashboard-admin/prices", ...paths]) revalidatePath(path);
}

export async function savePriceSource(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.sourceId ? await updatePriceSource(input) : await createPriceSource(input);
  if (result.ok) refreshConsole([`/dashboard-admin/prices/sources/${result.data.id}`]);
  return result;
}

export async function savePriceObservation(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = await recordPriceObservation(input);
  if (result.ok) refreshConsole([`/dashboard-admin/prices/sources/${input.sourceId}`]);
  return result;
}

export async function savePriceDifferential(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const input = fields(formData);
  const result = input.differentialId ? await updatePriceDifferential(input) : await createPriceDifferential(input);
  if (result.ok) refreshConsole([`/dashboard-admin/prices/differentials/${result.data.id}`]);
  return result;
}
