"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getRequestIdentity } from "@/lib/auth/dal";
import type { RequestIdentity } from "@/lib/auth/types";
import { addOrderItem, createDraftOrder, removeOrderItem, updateOrderItemQuantity } from "@/lib/orders/drafts";
import { AddOrderItemInput, RemoveOrderItemInput, UpdateOrderItemQuantityInput } from "@/lib/orders/validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 007 RUN A (T004) — the draft-order Server Actions. Follows the SAME six-step contract
 * `dashboard/kyb/actions.ts`/`dashboard/listings/new/actions.ts` established (validate →
 * authenticate/authorize → controlled data access → mutate via explicit allowlist → safe error
 * mapping → revalidate), and the SAME acting-organization discipline: every call resolves identity
 * FRESH from `getRequestIdentity()` — never a client-supplied organization id, never
 * `organizations[0]`.
 */

type BuyerIdentity = Extract<RequestIdentity, { kind: "authenticated" }> & {
  organization: NonNullable<Extract<RequestIdentity, { kind: "authenticated" }>["organization"]>;
};

/**
 * The authorization boundary this entire file depends on: authenticated, authorized member, AND the
 * ACTING organization's own `canBuy` (already resolved via `organization_can_buy()` by
 * `getRequestIdentity()` — never re-derived, never trusted from a client value). `null` maps every
 * exported action below to `ACTION_FEEDBACK.BUYER_NOT_CAPABLE` — refused server-side regardless of
 * whether nav/route visibility would have hidden the entry point (SEC-001).
 */
async function requireBuyerCapableIdentity(): Promise<BuyerIdentity | null> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) return null;
  if (!identity.isAuthorizedMember) return null;
  if (!identity.organization.canBuy) return null;
  return identity as BuyerIdentity;
}

/**
 * T004 (PS1 scenario 1) — creates a new `DRAFT` order for the caller's acting organization and
 * redirects to its detail page. No client input at all beyond the implicit submission itself —
 * `buyer_organization_id`/`created_by` are entirely server-derived
 * (see `lib/orders/drafts.ts#createDraftOrder`). On failure, returns the safe error normally — only
 * a genuine success calls `redirect()` (which Next.js implements as a thrown control-flow signal,
 * never reaching the `return` below).
 */
export async function createOrder(): Promise<ActionFeedbackResult> {
  const identity = await requireBuyerCapableIdentity();
  if (!identity) {
    return { ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE };
  }

  const result = await createDraftOrder({ organizationId: identity.organization.organizationId, userId: identity.userId });
  if (!result.ok) return result;

  revalidatePath("/dashboard/orders");
  redirect(`/dashboard/orders/${result.data.id}`);
}

/**
 * T004 (PS1 scenarios 2/3) — adds one item to the caller's own DRAFT order. `orderId` arrives as a
 * hidden form field (the page/component supplies it) but is NEVER trusted as ownership proof by
 * itself — `lib/orders/drafts.ts#addOrderItem` re-reads the order under the caller's OWN
 * organization id before ever attempting the insert.
 */
export async function addItemToOrder(_prevState: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || orderId.length === 0) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }

  const parsed = AddOrderItemInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const identity = await requireBuyerCapableIdentity();
  if (!identity) {
    return { ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE };
  }

  const result = await addOrderItem({
    organizationId: identity.organization.organizationId,
    orderId,
    offerId: parsed.data.offerId,
    quantityKg: parsed.data.quantityKg,
  });
  if (!result.ok) return result;

  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true, data: undefined };
}

/**
 * DB-OPEN-13 (resolved 2026-09-13; T004 PS1 scenario 4) — changes an item's quantity on the caller's own
 * DRAFT order. Same six-step contract as `addItemToOrder`; `orderId`/`orderItemId` are never trusted as
 * ownership proof (`lib/orders/drafts.ts` re-reads under the acting organization, the database
 * function re-checks everything).
 */
export async function updateItemQuantity(_prevState: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || orderId.length === 0) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }

  const parsed = UpdateOrderItemQuantityInput.safeParse({ orderItemId: formData.get("orderItemId"), quantityKg: formData.get("quantityKg") });
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const identity = await requireBuyerCapableIdentity();
  if (!identity) {
    return { ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE };
  }

  const result = await updateOrderItemQuantity({
    organizationId: identity.organization.organizationId,
    orderId,
    orderItemId: parsed.data.orderItemId,
    quantityKg: parsed.data.quantityKg,
  });
  if (!result.ok) return result;

  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true, data: undefined };
}

/** DB-OPEN-13 (resolved 2026-09-13; T004) — removes an item from the caller's own DRAFT order. */
export async function removeItemFromOrder(_prevState: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || orderId.length === 0) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }

  const parsed = RemoveOrderItemInput.safeParse({ orderItemId: formData.get("orderItemId") });
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const identity = await requireBuyerCapableIdentity();
  if (!identity) {
    return { ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE };
  }

  const result = await removeOrderItem({ organizationId: identity.organization.organizationId, orderId, orderItemId: parsed.data.orderItemId });
  if (!result.ok) return result;

  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true, data: undefined };
}
