"use server";

import { revalidatePath } from "next/cache";

import { getRequestIdentity } from "@/lib/auth/dal";
import type { RequestIdentity } from "@/lib/auth/types";
import { getInventoryPositionById } from "@/lib/inventory/positions";
import { checkListingEligibility } from "@/lib/listings/eligibility";
import { ListingCreateFormInput } from "@/lib/listings/validation";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 006 RUN B (T014/T015) — the seller listing-creation Server Actions. Follows the SAME
 * six-step contract `dashboard/kyb/actions.ts` established (validate → authenticate/authorize →
 * controlled data access → safe error mapping → revalidate), and the SAME acting-organization
 * discipline: every call resolves identity/organization FRESH from `getRequestIdentity()` — never a
 * client-supplied organization id, and never `organizations[0]`.
 */

export type CreatedListingDraft = {
  id: string;
  title: string | null;
  quantityKg: number;
  pricePerKg: number;
  currency: string;
};

type SellerIdentity = Extract<RequestIdentity, { kind: "authenticated" }> & {
  organization: NonNullable<Extract<RequestIdentity, { kind: "authenticated" }>["organization"]>;
};

/**
 * The authorization boundary this entire file depends on: authenticated, authorized member, AND the
 * ACTING organization's own `canSell` (already resolved via `organization_can_sell()` by
 * `getRequestIdentity()` — never re-derived, never trusted from a client value). `null` here is the
 * single refusal signal every exported action below maps to `ACTION_FEEDBACK.SELLER_NOT_CAPABLE` —
 * covers the buyer-only-member case the run directive requires refused server-side regardless of
 * whether nav/route visibility would have hidden the entry point.
 */
async function requireSellerCapableIdentity(): Promise<SellerIdentity | null> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) return null;
  if (!identity.isAuthorizedMember) return null;
  if (!identity.organization.canSell) return null;
  return identity as SellerIdentity;
}

/**
 * Feature 006 RUN B (T014) — creates a `DRAFT` listing from the seller's own eligible inventory.
 *
 * ORDER OF OPERATIONS (mirrors the run directive's own 10-step sequence exactly):
 * 1. validate (Zod) → 2/3. authenticate + resolve/verify acting org + seller capability →
 * 4. re-read the position server-side (never trust the client's own copy) →
 * 5/6/7. apply `lib/listings/eligibility.ts`'s rule against the REQUESTED quantity, refuse any
 * mismatch → 8. insert an explicit-allowlist `DRAFT` row → 9. return a controlled result →
 * 10. revalidate.
 *
 * NEVER TRUSTS: the client's `positionId` is looked up through `getInventoryPositionById`, which is
 * itself org-scoped (`organizationId` from the SERVER-resolved identity) — a forged/foreign position
 * id returns `null` exactly like a nonexistent one (T004's own established cross-tenant privacy
 * convention), which this action maps to `LISTING_INELIGIBLE` (`POSITION_NOT_OWNED`), never a
 * different, distinguishing error. `seller_organization_id`, `created_by`, `seller_type`,
 * `source_purchase_order_item_id` and `status` are ALL server-derived below — none of them has a
 * corresponding field in `ListingCreateFormInput` for the client to submit in the first place.
 */
export async function createListingDraft(
  _prevState: ActionFeedbackResult<CreatedListingDraft> | undefined,
  formData: FormData
): Promise<ActionFeedbackResult<CreatedListingDraft>> {
  // 1. VALIDATE
  const parsed = ListingCreateFormInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // 2/3. AUTHENTICATE + AUTHORIZE
  const identity = await requireSellerCapableIdentity();
  if (!identity) {
    return { ok: false, code: ACTION_FEEDBACK.SELLER_NOT_CAPABLE };
  }
  const organizationId = identity.organization.organizationId;

  // 4. CONTROLLED DATA ACCESS — re-read the position under the ACTING org, server-side.
  const position = await getInventoryPositionById({ organizationId, positionId: parsed.data.positionId });
  if (!position) {
    return { ok: false, code: ACTION_FEEDBACK.LISTING_INELIGIBLE, fieldErrors: { positionId: ["POSITION_NOT_OWNED"] } };
  }

  // 5/6/7. ELIGIBILITY RULE — the REQUESTED quantity, never the client's own eligibility claim.
  const eligibility = await checkListingEligibility({
    organizationId,
    canSell: identity.organization.canSell,
    positionId: position.id,
    requestedQuantityKg: parsed.data.quantityKg,
  });

  if (!eligibility.eligible) {
    if (eligibility.reason === "SELLER_NOT_CAPABLE") {
      return { ok: false, code: ACTION_FEEDBACK.SELLER_NOT_CAPABLE };
    }
    return { ok: false, code: ACTION_FEEDBACK.LISTING_INELIGIBLE, fieldErrors: { positionId: [eligibility.reason] } };
  }

  // A CONFIRMED, NEW gap found while building this action (not anticipated by RUN A): `coffee_id` is
  // NOT NULL on `coffee_offers`, but `coffee_lots` (the only table that maps `lot_id -> coffee_id`)
  // has the SAME broken, self-referential member-read policy DB-OPEN-05 already documents — a member
  // session can never read it. Best-effort, RLS-respecting recovery via the position's OWN
  // originating listing (never a service-role read, never a guess); honestly refused if unavailable.
  // See `lib/types/action-feedback.ts`'s own doc comment on `LISTING_COFFEE_CONTEXT_UNAVAILABLE`.
  const coffeeId = await resolveCoffeeIdForLot(position.lotId, eligibility.sourcePurchaseOrderItemId);
  if (!coffeeId) {
    return { ok: false, code: ACTION_FEEDBACK.LISTING_COFFEE_CONTEXT_UNAVAILABLE };
  }

  // 8. SAFE INSERT ALLOWLIST — explicit fields only, never a spread of client input.
  // `status`/`is_visible`/`reserved_quantity_kg`/`filled_quantity_kg` are OMITTED entirely, relying on
  // the column's own DB default (`DRAFT`/`false`/`0`/`0`) — there is no field anywhere in this
  // request the client could use to select a status, not even indirectly.
  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("coffee_offers")
    .insert({
      coffee_id: coffeeId,
      lot_id: position.lotId,
      seller_organization_id: organizationId,
      // A real authenticated member session can never act as `hillsOrg` (Feature 005's own fixture
      // architecture keeps it deliberately unsignable-in-as) — every listing this member-facing
      // action can ever create is a member resale listing.
      seller_type: "MEMBER_SELLER",
      source_purchase_order_item_id: eligibility.sourcePurchaseOrderItemId,
      warehouse_id: position.warehouseId,
      warehouse_location_id: position.warehouseLocationId,
      title: parsed.data.title,
      quantity_kg: parsed.data.quantityKg,
      price_per_kg: parsed.data.pricePerKg,
      currency: parsed.data.currency,
      created_by: identity.userId,
    })
    .select("id, title, quantity_kg, price_per_kg, currency")
    .single();

  // 5 (again). SAFE ERROR MAPPING — the database trigger/constraints remain authoritative; any
  // refusal (ownership/custody/quantity/transition/the `uq_active_offer_per_lot_owner` unique
  // invariant/anything else) maps to ONE generic, safe code. Never the raw Postgres message,
  // SQLSTATE, constraint or trigger name.
  if (error || !inserted) {
    return { ok: false, code: ACTION_FEEDBACK.LISTING_SAVE_FAILED };
  }

  // 10. REVALIDATE
  revalidatePath("/dashboard/listings/new");

  return {
    ok: true,
    data: {
      id: inserted.id,
      title: inserted.title,
      quantityKg: Number(inserted.quantity_kg),
      pricePerKg: Number(inserted.price_per_kg),
      currency: inserted.currency,
    },
  };
}

/**
 * Attempts to recover `coffee_id` for a lot from the position's OWN originating purchase — the
 * `order_items` row the eligibility rule already verified — through the SAME RLS-respecting session
 * (no service role, no bypass). `sourcePurchaseOrderItemId`'s own `order_items.offer_id` points at the
 * ORIGINAL listing that was purchased; if that original `coffee_offers` row is still readable under
 * ordinary RLS (`member_read_published_offers` if still published, or `offers_owner_or_admin` if this
 * caller happens to also own it), its `coffee_id` is read directly — no `coffee_lots` join at all. The
 * `lot_id` cross-check guards against ever attaching a mismatched value even in an unexpected case.
 * Returns `null` (never a guess) when this cannot be resolved — confirmed, in the current live
 * database, to be the common case, since `coffee_lots` itself can never be read by a member session.
 */
async function resolveCoffeeIdForLot(lotId: string, sourcePurchaseOrderItemId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: orderItem } = await supabase.from("order_items").select("offer_id").eq("id", sourcePurchaseOrderItemId).maybeSingle();
  if (!orderItem?.offer_id) return null;

  const { data: originalOffer } = await supabase.from("coffee_offers").select("coffee_id, lot_id").eq("id", orderItem.offer_id).maybeSingle();
  if (!originalOffer || originalOffer.lot_id !== lotId) return null;

  return originalOffer.coffee_id;
}

/**
 * Feature 006 RUN B (T015) — the permitted `DRAFT -> PENDING_REVIEW` transition. Implements NO
 * parallel state machine: `validate_offer_transition`'s own trigger is the sole authority on
 * transition legality. The `.eq("status", "DRAFT")` clause below is this action's own defence in
 * depth (never attempt a transition this action does not itself believe is legal), not a substitute
 * for the trigger — a forbidden transition is refused by the trigger regardless.
 *
 * `.select(...).maybeSingle()` after the update is required to DETECT a no-op: Supabase's `.update()`
 * reports no error when RLS/the `.eq()` filters simply matched zero rows (cross-org id, wrong current
 * status, or a non-creator org member — `offers_owner_or_admin`'s own WITH CHECK additionally
 * requires `created_by = auth.uid()`) — without re-selecting, that silent zero-row case would be
 * indistinguishable from genuine success.
 */
export async function submitListingForReview(
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
    .update({ status: "PENDING_REVIEW" })
    .eq("id", offerId)
    .eq("seller_organization_id", identity.organization.organizationId)
    .eq("status", "DRAFT")
    .select("id, status")
    .maybeSingle();

  if (error || !updated) {
    return { ok: false, code: ACTION_FEEDBACK.LISTING_TRANSITION_REFUSED };
  }

  revalidatePath("/dashboard/listings/new");
  return { ok: true, data: undefined };
}
