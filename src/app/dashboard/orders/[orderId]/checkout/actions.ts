"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { executeCheckout } from "@/lib/orders/checkout";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 007 RUN B (T009) — the checkout Server Action. Deliberately THIN: it carries no
 * transaction logic of its own. `lib/orders/checkout.ts#executeCheckout` owns the entire
 * application boundary (validate → authenticate → resolve acting org → verify capability → re-read
 * the order → readiness → confirm → the ONE `checkout_order()` call → safe error mapping); this
 * action only hands it the order id from the form and routes the outcome.
 *
 * The ONLY value read from the client is `orderId`. There is no field for an amount, price,
 * quantity, seller, hold duration, idempotency key, or total — none is ever read, so none can be
 * forged (proven in `tests/orders/checkout-action.test.ts`).
 *
 * On success (including the function's own idempotent-retry path) the buyer is sent to the order's
 * detail page, which presents the `HOLD` outcome from the database (T010). Next.js implements
 * `redirect()` as a thrown control-flow signal, so a genuine success never reaches the `return`.
 */
export async function confirmCheckout(_prevState: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || orderId.length === 0) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }

  const result = await executeCheckout(orderId);
  if (!result.ok) return result;

  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/dashboard/orders");
  redirect(`/dashboard/orders/${orderId}`);
}
