"use server";

import { revalidatePath } from "next/cache";

import {
  attachCoffeeMediaIntent, createBackedOfferIntent, createCoffeeIntent, publishCoffeeCatalogueOnly, publishCoffeeCoordinated, recoverCatalogueOperation,
  removeCoffeeMediaIntent, saveCoffeeArabic, saveCoffeeIdentity, saveCoffeeTaxonomy, saveOfferCommercials, setCoffeeFeatured, setCoffeePrimaryMedia,
  type WorkflowCoffeeSaved, type WorkflowFeaturedSaved, type WorkflowMediaRemoved, type WorkflowMediaSaved, type WorkflowOfferSaved, type WorkflowPublished, type WorkflowRecovery, type WorkflowResult,
  type WorkflowFailure,
} from "@/lib/admin/catalogue";

/**
 * Feature 018 — thin Server Actions over the controlled catalogue workflow DAL. Each form carries the Coffee id, the
 * revision the operator last saw and ONE stable `requestId` per user intent: a retry sends the same key, so an uncertain
 * outcome can never create a second Coffee/offer/image. The DAL validates again and the database enforces authority,
 * revision and payload binding; nothing here is trusted. Results are plain serializable unions - the stepper turns them
 * into localized toasts and inline messages.
 */

const text = (formData: FormData, key: string): string | undefined => {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
};

/** Cache/route refresh after a commit; a failure here never changes the outcome of a committed write. */
function refresh(coffeeId?: string): void {
  try {
    revalidatePath("/dashboard-admin/coffees");
    if (coffeeId) revalidatePath(`/dashboard-admin/coffees/${coffeeId}`);
  } catch {
    /* the committed result stands; the next navigation re-reads */
  }
}

async function finish<T>(result: WorkflowResult<T>, coffeeId: string | undefined): Promise<WorkflowResult<T>> {
  if (result.ok) refresh(coffeeId);
  return result;
}

export async function createCoffeeAction(_previous: WorkflowResult<WorkflowCoffeeSaved> | undefined, formData: FormData): Promise<WorkflowResult<WorkflowCoffeeSaved>> {
  const result = await createCoffeeIntent({ requestId: text(formData, "requestId"), name: text(formData, "name"), slug: text(formData, "slug"), description: text(formData, "description") });
  return finish(result, result.ok ? result.data.coffeeId : undefined);
}

export async function saveIdentityAction(_previous: WorkflowResult<WorkflowCoffeeSaved> | undefined, formData: FormData): Promise<WorkflowResult<WorkflowCoffeeSaved>> {
  const result = await saveCoffeeIdentity({
    coffeeId: text(formData, "coffeeId"), revision: text(formData, "revision"), requestId: text(formData, "requestId"),
    name: text(formData, "name"), slug: text(formData, "slug"), description: text(formData, "description"),
  });
  return finish(result, text(formData, "coffeeId"));
}

export async function saveArabicAction(_previous: WorkflowResult<WorkflowCoffeeSaved> | undefined, formData: FormData): Promise<WorkflowResult<WorkflowCoffeeSaved>> {
  const result = await saveCoffeeArabic({
    coffeeId: text(formData, "coffeeId"), revision: text(formData, "revision"), requestId: text(formData, "requestId"),
    name: text(formData, "name"), description: text(formData, "description"),
  });
  return finish(result, text(formData, "coffeeId"));
}

export async function saveTaxonomyAction(_previous: WorkflowResult<WorkflowCoffeeSaved> | undefined, formData: FormData): Promise<WorkflowResult<WorkflowCoffeeSaved>> {
  const result = await saveCoffeeTaxonomy({
    coffeeId: text(formData, "coffeeId"), revision: text(formData, "revision"), requestId: text(formData, "requestId"),
    originId: text(formData, "originId"), coffeeTypeId: text(formData, "coffeeTypeId"), varietyId: text(formData, "varietyId"),
    processingMethodId: text(formData, "processingMethodId"), packagingTypeId: text(formData, "packagingTypeId"),
  });
  return finish(result, text(formData, "coffeeId"));
}

export async function attachMediaAction(_previous: WorkflowResult<WorkflowMediaSaved> | undefined, formData: FormData): Promise<WorkflowResult<WorkflowMediaSaved>> {
  const result = await attachCoffeeMediaIntent({ coffeeId: text(formData, "coffeeId"), revision: text(formData, "revision"), requestId: text(formData, "requestId") }, formData.get("image"));
  return finish(result, text(formData, "coffeeId"));
}

export async function removeMediaAction(_previous: WorkflowResult<WorkflowMediaRemoved> | undefined, formData: FormData): Promise<WorkflowResult<WorkflowMediaRemoved>> {
  const result = await removeCoffeeMediaIntent({ coffeeId: text(formData, "coffeeId"), revision: text(formData, "revision"), requestId: text(formData, "requestId"), mediaId: text(formData, "mediaId") });
  return finish(result, text(formData, "coffeeId"));
}

export async function setPrimaryMediaAction(_previous: WorkflowResult<WorkflowCoffeeSaved> | undefined, formData: FormData): Promise<WorkflowResult<WorkflowCoffeeSaved>> {
  const result = await setCoffeePrimaryMedia({ coffeeId: text(formData, "coffeeId"), revision: text(formData, "revision"), requestId: text(formData, "requestId"), mediaId: text(formData, "mediaId") });
  return finish(result, text(formData, "coffeeId"));
}

export async function createOfferAction(_previous: WorkflowResult<WorkflowOfferSaved> | undefined, formData: FormData): Promise<WorkflowResult<WorkflowOfferSaved>> {
  const result = await createBackedOfferIntent({
    coffeeId: text(formData, "coffeeId"), revision: text(formData, "revision"), requestId: text(formData, "requestId"), positionId: text(formData, "positionId"),
    priceUsdPerKg: text(formData, "priceUsdPerKg"), quantityKg: text(formData, "quantityKg"), title: text(formData, "title"),
  });
  return finish(result, text(formData, "coffeeId"));
}

export async function saveOfferAction(_previous: WorkflowResult<WorkflowOfferSaved> | undefined, formData: FormData): Promise<WorkflowResult<WorkflowOfferSaved>> {
  const result = await saveOfferCommercials({
    offerId: text(formData, "offerId"), coffeeId: text(formData, "coffeeId"), revision: text(formData, "revision"), requestId: text(formData, "requestId"),
    priceUsdPerKg: text(formData, "priceUsdPerKg"), quantityKg: text(formData, "quantityKg"), title: text(formData, "title"),
  });
  return finish(result, text(formData, "coffeeId"));
}

export async function setFeaturedAction(_previous: WorkflowResult<WorkflowFeaturedSaved> | undefined, formData: FormData): Promise<WorkflowResult<WorkflowFeaturedSaved>> {
  const result = await setCoffeeFeatured({ coffeeId: text(formData, "coffeeId"), revision: text(formData, "revision"), requestId: text(formData, "requestId"), enabled: text(formData, "enabled") });
  return finish(result, text(formData, "coffeeId"));
}

export async function publishCatalogueOnlyAction(_previous: WorkflowResult<WorkflowPublished> | undefined, formData: FormData): Promise<WorkflowResult<WorkflowPublished>> {
  const result = await publishCoffeeCatalogueOnly({ coffeeId: text(formData, "coffeeId"), revision: text(formData, "revision"), requestId: text(formData, "requestId") });
  return finish(result, text(formData, "coffeeId"));
}

export async function publishCoordinatedAction(_previous: WorkflowResult<WorkflowPublished> | undefined, formData: FormData): Promise<WorkflowResult<WorkflowPublished>> {
  const result = await publishCoffeeCoordinated({
    coffeeId: text(formData, "coffeeId"), revision: text(formData, "revision"), requestId: text(formData, "requestId"),
    offerId: text(formData, "offerId"), offerRevision: text(formData, "offerRevision"),
  });
  return finish(result, text(formData, "coffeeId"));
}

export async function recoverOperationAction(_previous: ({ ok: true; recovery: WorkflowRecovery } | WorkflowFailure) | undefined, formData: FormData): Promise<{ ok: true; recovery: WorkflowRecovery } | WorkflowFailure> {
  const result = await recoverCatalogueOperation({ requestId: text(formData, "requestId") });
  if (result.ok && result.recovery.status === "COMMITTED") refresh(text(formData, "coffeeId"));
  return result;
}
