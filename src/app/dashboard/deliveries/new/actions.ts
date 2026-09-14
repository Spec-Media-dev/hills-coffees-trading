"use server";

/**
 * Feature 009 RUN B (T015) — the Server Action surface for `/dashboard/deliveries/new`.
 *
 * REUSE, NOT DUPLICATION: `components/orders/shipment-planner.tsx` (rendered on this page) already
 * imports its own actions directly from the canonical, already-live-tested location
 * (`src/app/dashboard/orders/[orderId]/shipment/actions.ts`, itself delegating to
 * `lib/delivery/buyer.ts` since T014) — Server Actions are globally addressable regardless of which
 * page renders the component that dispatches them, so no second copy is needed there. This file exists
 * only because T015 names `actions.ts` as this page's own deliverable; it re-exports the SAME four
 * functions under this path rather than defining a second, drifting implementation.
 */
export { createShipment, addShipmentItem, requestShipment, cancelShipment } from "@/src/app/dashboard/orders/[orderId]/shipment/actions";
