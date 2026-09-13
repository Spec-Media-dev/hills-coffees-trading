"use server";

import { revalidatePath } from "next/cache";

import { getRequestIdentity } from "@/lib/auth/dal";
import { getManagedListingById } from "@/lib/listings/manage";
import { ListingEditInput } from "@/lib/listings/validation";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 006 RUN C (T017) — seller listing edit/withdraw/remediation Server Actions. Same
 * six-step contract as `dashboard/listings/new/actions.ts` (validate → authenticate/authorize →
 * re-read authority → mutate via explicit allowlist → safe error → revalidate); no parallel state
 * machine anywhere — `validate_offer_transition`'s trigger remains the sole transition authority.
 *
 * EDITABLE-STATUS POLICY (an APPLICATION-level narrowing on top of whatever the trigger itself would
 * technically accept, documented honestly as a product decision, not a DB fact): a listing is only
 * editable through this form while it is DRAFT, PENDING_REVIEW, APPROVED, PUBLISHED, or
 * PARTIALLY_FILLED. REJECTED listings are not edited in place — the seller must first move it back to
 * DRAFT (`moveListingToDraft`, the "remediation route"), then edit/resubmit. SUSPENDED/SOLD_OUT/
 * ARCHIVED are never editable here.
 */
const EDITABLE_STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "PARTIALLY_FILLED"] as const;

/** Mirrors `dashboard/listings/new/actions.ts#requireSellerCapableIdentity` exactly. */
async function requireSellerCapableIdentity() {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) return null;
  if (!identity.isAuthorizedMember) return null;
  if (!identity.organization.canSell) return null;
  return identity;
}

/**
 * T017 — edits `title`/`quantity_kg`/`price_per_kg` only. `currency` is never sent in the update
 * (the live schema's only allowed value is already `USD` — there is nothing to change). Provenance
 * fields (`seller_organization_id`, `created_by`, `lot_id`, `coffee_id`, `warehouse_id`,
 * `source_purchase_order_item_id`) and `status` are NEVER part of the update payload — there is no
 * field anywhere in this action's input shape for a client to influence them.
 *
 * PRICE-SNAPSHOT INTEGRITY (T017's own explicit requirement): this action updates ONLY
 * `coffee_offers` — it never touches `order_items`, which stores its OWN `unit_price_per_kg`
 * SNAPSHOT taken at order-creation time (confirmed live, RUN B's T019 preflight;
 * `validate_order_item_offer`'s trigger copies the offer's price into the order_item once, at
 * creation, and nothing in this codebase ever writes `order_items.unit_price_per_kg` again). Editing
 * a listing's price here therefore cannot retroactively alter any existing order's agreed price —
 * this is a structural guarantee of the schema (no code path exists that would even attempt it), not
 * something this action re-derives at runtime. Feature 007 (order creation) is not implemented in
 * this run — this is a documented boundary proof, not a claim about 007's own future behavior.
 */
export async function updateListing(
  _prevState: ActionFeedbackResult | undefined,
  formData: FormData
): Promise<ActionFeedbackResult> {
  // 1. VALIDATE
  const offerId = formData.get("offerId");
  if (typeof offerId !== "string" || offerId.length === 0) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }
  const parsed = ListingEditInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // 2/3. AUTHENTICATE + AUTHORIZE
  const identity = await requireSellerCapableIdentity();
  if (!identity) {
    return { ok: false, code: ACTION_FEEDBACK.SELLER_NOT_CAPABLE };
  }
  const organizationId = identity.organization!.organizationId;

  // 4. CONTROLLED DATA ACCESS — re-read, org-scoped; a cross-org id is indistinguishable from a
  // nonexistent one, matching every other lookup in this feature.
  const listing = await getManagedListingById({ organizationId, offerId });
  if (!listing) {
    return { ok: false, code: ACTION_FEEDBACK.LISTING_NOT_FOUND };
  }
  if (!(EDITABLE_STATUSES as readonly string[]).includes(listing.status)) {
    return { ok: false, code: ACTION_FEEDBACK.LISTING_NOT_ACCESSIBLE };
  }

  // 8. SAFE UPDATE ALLOWLIST — explicit fields only, never a spread of client input.
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("coffee_offers")
    .update({
      title: parsed.data.title,
      quantity_kg: parsed.data.quantityKg,
      price_per_kg: parsed.data.pricePerKg,
    })
    .eq("id", offerId)
    .eq("seller_organization_id", organizationId)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return { ok: false, code: ACTION_FEEDBACK.LISTING_SAVE_FAILED };
  }

  revalidatePath(`/dashboard/listings/${offerId}`);
  revalidatePath("/dashboard/listings");
  return { ok: true, data: undefined };
}

/**
 * T017 — withdraw. Attempts ONLY `status: "ARCHIVED"` — `validate_offer_transition` permits this
 * from DRAFT/APPROVED/PUBLISHED/PARTIALLY_FILLED, and refuses it from REJECTED/SUSPENDED/SOLD_OUT/
 * ARCHIVED itself; this action never pre-empts that, it only reports the trigger's own outcome.
 */
export async function withdrawListing(
  _prevState: ActionFeedbackResult | undefined,
  formData: FormData
): Promise<ActionFeedbackResult> {
  const offerId = formData.get("offerId");
  if (typeof offerId !== "string" || offerId.length === 0) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }

  const identity = await requireSellerCapableIdentity();
  if (!identity) {
    return { ok: false, code: ACTION_FEEDBACK.SELLER_NOT_CAPABLE };
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("coffee_offers")
    .update({ status: "ARCHIVED" })
    .eq("id", offerId)
    .eq("seller_organization_id", identity.organization!.organizationId)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return { ok: false, code: ACTION_FEEDBACK.LISTING_TRANSITION_REFUSED };
  }

  revalidatePath(`/dashboard/listings/${offerId}`);
  revalidatePath("/dashboard/listings");
  return { ok: true, data: undefined };
}

/**
 * T017 — the "remediation route" for a `REJECTED` listing: the ONE transition
 * `validate_offer_transition` permits FROM `REJECTED` (`REJECTED -> DRAFT`). No compliance action is
 * performed here (this file never sets `APPROVED`/`PUBLISHED`/`SUSPENDED` — those all require
 * `is_compliance_operator()`, which a seller session never satisfies, and the trigger would refuse
 * regardless).
 */
export async function moveListingToDraft(
  _prevState: ActionFeedbackResult | undefined,
  formData: FormData
): Promise<ActionFeedbackResult> {
  const offerId = formData.get("offerId");
  if (typeof offerId !== "string" || offerId.length === 0) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }

  const identity = await requireSellerCapableIdentity();
  if (!identity) {
    return { ok: false, code: ACTION_FEEDBACK.SELLER_NOT_CAPABLE };
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("coffee_offers")
    .update({ status: "DRAFT" })
    .eq("id", offerId)
    .eq("seller_organization_id", identity.organization!.organizationId)
    .eq("status", "REJECTED")
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return { ok: false, code: ACTION_FEEDBACK.LISTING_TRANSITION_REFUSED };
  }

  revalidatePath(`/dashboard/listings/${offerId}`);
  revalidatePath("/dashboard/listings");
  return { ok: true, data: undefined };
}
