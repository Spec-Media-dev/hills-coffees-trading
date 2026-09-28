/** T016 retained provenance contract. This module has no write or delete path. */
export const F013_SOURCE = {
  orders: { s1: "13000000-0000-4000-8000-000000001601", s2: "13000000-0000-4000-8000-000000001602" },
  items: { s1w1: "13000000-0000-4000-8000-000000001611", s1w2: "13000000-0000-4000-8000-000000001612", s2w2: "13000000-0000-4000-8000-000000001613" },
  hillsLots: { w1: "13000000-0000-4000-8000-000000001621", w2: "13000000-0000-4000-8000-000000001622" },
  hillsPositions: { w1: "13000000-0000-4000-8000-000000001631", w2: "13000000-0000-4000-8000-000000001632" },
  hillsOffers: { w1: "13000000-0000-4000-8000-000000001641", w2: "13000000-0000-4000-8000-000000001642" },
  shipments: { s1: "13000000-0000-4000-8000-000000001651", s2: "13000000-0000-4000-8000-000000001652" },
  shipmentItems: { s1w1: "13000000-0000-4000-8000-000000001661", s1w2: "13000000-0000-4000-8000-000000001662", s2w2: "13000000-0000-4000-8000-000000001663" },
  proofAssets: { s1: "13000000-0000-4000-8000-000000001671", s2: "13000000-0000-4000-8000-000000001672" },
  markers: { s1: "13000000-0000-4000-8000-0000000016f1", s2: "13000000-0000-4000-8000-0000000016f2" },
} as const;

export function assertF013SourceIds(): void {
  const ids = Object.values(F013_SOURCE).flatMap((group) => Object.values(group));
  if (new Set(ids).size !== ids.length || ids.some((id) => !/^13000000-0000-4000-8000-0000000016[0-9a-f]{2}$/.test(id))) {
    throw new Error("F013 source ids must be unique exact reserved 16xx ids");
  }
}

export type F013SourceRow = Record<string, unknown> & { id?: string };
export type F013SourceSnapshot = {
  orders: F013SourceRow[];
  items: F013SourceRow[];
  payments: F013SourceRow[];
  reviews: F013SourceRow[];
  proformas: F013SourceRow[];
  reservations: F013SourceRow[];
  reservationItems: F013SourceRow[];
  ownershipEvents: F013SourceRow[];
  allocations: F013SourceRow[];
  positions: F013SourceRow[];
  hillsPositions: F013SourceRow[];
  payouts: F013SourceRow[];
  taxInvoices: F013SourceRow[];
  notifications: F013SourceRow[];
};

export type F013SourceState = "ABSENT" | "COMPLETE_VALID" | "IN_PROGRESS_RESUMABLE" | "DRIFTED";
export type F013SourceClassification = { state: F013SourceState; problems: string[] };

const n = (value: unknown) => Number(value ?? 0);
const byId = (rows: F013SourceRow[], id: string) => rows.find((row) => row.id === id);
const itemSpec = [
  { id: F013_SOURCE.items.s1w1, order: F013_SOURCE.orders.s1, offer: F013_SOURCE.hillsOffers.w1, lot: F013_SOURCE.hillsLots.w1, quantity: 500, buyer: "13000000-0000-4000-8000-000000000003", warehouse: "13000000-0000-4000-8000-000000000021", memberPosition: "13000000-0000-4000-8000-000000000051" },
  { id: F013_SOURCE.items.s1w2, order: F013_SOURCE.orders.s1, offer: F013_SOURCE.hillsOffers.w2, lot: F013_SOURCE.hillsLots.w2, quantity: 50, buyer: "13000000-0000-4000-8000-000000000003", warehouse: "13000000-0000-4000-8000-000000000022", memberPosition: "13000000-0000-4000-8000-000000000054" },
  { id: F013_SOURCE.items.s2w2, order: F013_SOURCE.orders.s2, offer: F013_SOURCE.hillsOffers.w2, lot: F013_SOURCE.hillsLots.w2, quantity: 300, buyer: "13000000-0000-4000-8000-000000000004", warehouse: "13000000-0000-4000-8000-000000000022", memberPosition: "13000000-0000-4000-8000-000000000052" },
] as const;
const orderSpec = [
  { id: F013_SOURCE.orders.s1, code: "F013-SRC-S1", buyer: "13000000-0000-4000-8000-000000000003", marker: F013_SOURCE.markers.s1 },
  { id: F013_SOURCE.orders.s2, code: "F013-SRC-S2", buyer: "13000000-0000-4000-8000-000000000004", marker: F013_SOURCE.markers.s2 },
] as const;
const HILLS = "13000000-0000-4000-8000-000000000005";

/** Full retained-history validation; a partial chain is resumable only when every extant row is canonical. */
export function classifyF013Source(snapshot: F013SourceSnapshot): F013SourceClassification {
  assertF013SourceIds();
  const problems: string[] = [];
  const keys = Object.keys(snapshot) as (keyof F013SourceSnapshot)[];
  if (keys.every((key) => snapshot[key].length === 0)) return { state: "ABSENT", problems };
  const exact = (rows: F013SourceRow[], ids: readonly string[], label: string) => {
    if (rows.some((row) => !row.id || !ids.includes(row.id))) problems.push(`${label}: unexpected id`);
    if (new Set(rows.map((row) => row.id)).size !== rows.length) problems.push(`${label}: duplicate id`);
  };
  exact(snapshot.orders, orderSpec.map((row) => row.id), "orders");
  exact(snapshot.items, itemSpec.map((row) => row.id), "items");
  for (const expected of orderSpec) {
    const order = byId(snapshot.orders, expected.id);
    if (!order) continue;
    if (order.commerce_flow !== "LEGACY" || order.buyer_organization_id !== expected.buyer || order.order_code !== expected.code || order.correlation_id !== expected.marker || !["DRAFT", "CONFIRMED", "HOLD", "PAYMENT_PROOF_SUBMITTED", "PAYMENT_UNDER_REVIEW", "PAID"].includes(String(order.status))) problems.push(`${expected.code}: order identity/flow/status drift`);
  }
  for (const expected of itemSpec) {
    const item = byId(snapshot.items, expected.id);
    if (!item) continue;
    if (item.order_id !== expected.order || item.offer_id !== expected.offer || item.lot_id !== expected.lot || item.seller_organization_id !== HILLS || item.seller_type_snapshot !== "HILLS" || n(item.quantity_kg) !== expected.quantity) problems.push(`${expected.id}: source item drift`);
  }
  for (const row of snapshot.payments) if (!orderSpec.some((o) => o.id === row.order_id) || row.payment_method === "PROVIDER" || !["PENDING", "PROOF_SUBMITTED", "UNDER_REVIEW", "CONFIRMED"].includes(String(row.status))) problems.push("payment drift");
  for (const row of snapshot.reviews) {
    if (!snapshot.payments.some((payment) => payment.id === row.payment_id) || row.decision !== "CONFIRMED") problems.push("payment review drift");
  }
  for (const row of snapshot.proformas) if (!orderSpec.some((o) => o.id === row.order_id) || !["ISSUED", "PAID"].includes(String(row.status))) problems.push("proforma drift");
  for (const row of snapshot.reservations) if (!orderSpec.some((o) => o.id === row.order_id) || !["ACTIVE", "CONSUMED"].includes(String(row.status))) problems.push("reservation drift");
  for (const row of snapshot.reservationItems) if (!snapshot.reservations.some((reservation) => reservation.id === row.reservation_id) || ![F013_SOURCE.hillsOffers.w1, F013_SOURCE.hillsOffers.w2].includes(String(row.offer_id) as typeof F013_SOURCE.hillsOffers.w1) || n(row.quantity_kg) <= 0) problems.push("reservation item drift");
  for (const row of snapshot.ownershipEvents) {
    const expected = itemSpec.find((item) => item.id === row.order_item_id);
    if (!expected || row.event_type !== "SALE" || row.from_organization_id !== HILLS || row.to_organization_id !== expected.buyer || row.lot_id !== expected.lot || n(row.quantity_kg) !== expected.quantity) problems.push("ownership event drift");
  }
  for (const row of snapshot.allocations) {
    const expected = itemSpec.find((item) => item.id === row.order_item_id);
    if (!expected || row.status !== "STORED" || row.owner_organization_id !== expected.buyer || row.lot_id !== expected.lot || row.warehouse_id !== expected.warehouse || n(row.quantity_kg) !== expected.quantity) problems.push("storage allocation drift");
  }
  for (const row of snapshot.positions) {
    const expected = itemSpec.find((item) => item.memberPosition === row.id);
    if (!expected || row.owner_organization_id !== expected.buyer || row.lot_id !== expected.lot || row.warehouse_id !== expected.warehouse || n(row.available_quantity_kg) < 0 || n(row.available_quantity_kg) > expected.quantity || n(row.reserved_quantity_kg) !== 0) problems.push("member position drift");
  }
  for (const row of snapshot.hillsPositions) {
    const w1 = row.id === F013_SOURCE.hillsPositions.w1;
    const w2 = row.id === F013_SOURCE.hillsPositions.w2;
    const maximum = w1 ? 500 : w2 ? 350 : -1;
    if (maximum < 0 || row.owner_organization_id !== HILLS || row.lot_id !== (w1 ? F013_SOURCE.hillsLots.w1 : F013_SOURCE.hillsLots.w2) || n(row.available_quantity_kg) < 0 || n(row.available_quantity_kg) > maximum || n(row.reserved_quantity_kg) < 0) problems.push("Hills source position drift");
  }
  if (snapshot.payouts.length || snapshot.taxInvoices.length || snapshot.notifications.length) problems.push("retained source has payout, tax invoice, or notification event");
  if (snapshot.payments.length > 2 || snapshot.reviews.length > 2 || snapshot.proformas.length > 2 || snapshot.reservations.length > 2 || snapshot.ownershipEvents.length > 3 || snapshot.allocations.length > 3 || snapshot.reservationItems.length > 3) problems.push("retained source has duplicate dependent rows");
  if (problems.length) return { state: "DRIFTED", problems };

  const complete = orderSpec.every((expected) => {
    const order = byId(snapshot.orders, expected.id);
    const payment = snapshot.payments.filter((row) => row.order_id === expected.id);
    const proforma = snapshot.proformas.filter((row) => row.order_id === expected.id);
    const reservation = snapshot.reservations.filter((row) => row.order_id === expected.id);
    return order?.status === "PAID" && payment.length === 1 && payment[0]?.status === "CONFIRMED" &&
      snapshot.reviews.filter((row) => row.payment_id === payment[0]?.id && row.decision === "CONFIRMED").length === 1 &&
      proforma.length === 1 && proforma[0]?.status === "PAID" && reservation.length === 1 && reservation[0]?.status === "CONSUMED";
  }) && itemSpec.every((expected) => {
    const item = byId(snapshot.items, expected.id);
    const reservation = snapshot.reservations.find((row) => row.order_id === expected.order);
    const reservationLines = snapshot.reservationItems.filter((row) => row.reservation_id === reservation?.id && row.offer_id === expected.offer && n(row.quantity_kg) === expected.quantity);
    const events = snapshot.ownershipEvents.filter((row) => row.order_item_id === expected.id);
    const allocations = snapshot.allocations.filter((row) => row.order_item_id === expected.id);
    const position = byId(snapshot.positions, expected.memberPosition);
    return !!item && reservationLines.length === 1 && events.length === 1 && events[0]?.event_type === "SALE" && events[0]?.from_organization_id === HILLS && events[0]?.to_organization_id === expected.buyer && n(events[0]?.quantity_kg) === expected.quantity &&
      allocations.length === 1 && allocations[0]?.status === "STORED" && allocations[0]?.owner_organization_id === expected.buyer && allocations[0]?.lot_id === expected.lot && allocations[0]?.warehouse_id === expected.warehouse && n(allocations[0]?.quantity_kg) === expected.quantity &&
      position?.owner_organization_id === expected.buyer && position.lot_id === expected.lot && position.warehouse_id === expected.warehouse && n(position.available_quantity_kg) === expected.quantity && n(position.reserved_quantity_kg) === 0;
  }) && snapshot.items.length === 3 && snapshot.orders.length === 2 && snapshot.payments.length === 2 && snapshot.reviews.length === 2 && snapshot.proformas.length === 2 && snapshot.reservations.length === 2 && snapshot.reservationItems.length === 3 && snapshot.ownershipEvents.length === 3 && snapshot.allocations.length === 3;
  if (complete) {
    const hillsW1 = byId(snapshot.hillsPositions, F013_SOURCE.hillsPositions.w1);
    const hillsW2 = byId(snapshot.hillsPositions, F013_SOURCE.hillsPositions.w2);
    if (hillsW1 && hillsW2 && n(hillsW1.available_quantity_kg) === 0 && n(hillsW2.available_quantity_kg) === 0 && n(hillsW1.reserved_quantity_kg) === 0 && n(hillsW2.reserved_quantity_kg) === 0) return { state: "COMPLETE_VALID", problems };
    return { state: "DRIFTED", problems: ["Hills fixture stock consumption mismatch"] };
  }
  return { state: "IN_PROGRESS_RESUMABLE", problems };
}

/** G1: only the exact old fabricated position, with no dependents, may ever be corrected. */
export const F013_G1_DEPENDENCIES = ["ownershipEvents", "allocations", "orderItems", "varianceEvents", "offers", "reservationItems", "positionReservations"] as const;
export function assertF013G1(position: F013SourceRow | null, dependentCounts: Record<string, number>): void {
  if (F013_G1_DEPENDENCIES.some((key) => dependentCounts[key] !== 0) || Object.values(dependentCounts).some((count) => count !== 0)) throw new Error("G1: S1 W1 fabricated stock has a dependent row or an incomplete dependency scan");
  if (!position) return;
  if (position.id !== "13000000-0000-4000-8000-000000000051" || position.owner_organization_id !== "13000000-0000-4000-8000-000000000003" || position.lot_id !== "13000000-0000-4000-8000-000000000041" || position.warehouse_id !== "13000000-0000-4000-8000-000000000021" || n(position.reserved_quantity_kg) !== 0) throw new Error("G1: S1 W1 position identity/stock drift");
  if (n(position.available_quantity_kg) !== 0 && n(position.available_quantity_kg) !== 500) throw new Error("G1: S1 W1 stock is neither zero nor the known 500 kg residue");
}

/** G2: caller must supply the full authorized-member read, not an advisory sample. */
export function assertF013G2(outsideAuthorizedMembers: F013SourceRow[]): void {
  if (outsideAuthorizedMembers.length !== 0) throw new Error("G2: outside authorized members exist; fixture offer publication refused");
}

/** G3: no provenance step may turn on the fixture global settings or checkout. */
export function assertF013G3(input: { checkoutEnabled: boolean; commissionActive: boolean; shippingActive: boolean; paymentAccountActive: boolean; paymentAccountDefault: boolean }): void {
  if (Object.values(input).length !== 5 || Object.values(input).some((value) => typeof value !== "boolean")) throw new Error("G3: incomplete configuration scan");
  if (input.checkoutEnabled || input.commissionActive || input.shippingActive || input.paymentAccountActive || input.paymentAccountDefault) throw new Error("G3: F013 global commerce configuration must remain inactive");
}

export function assertF013ComplianceActor(role: string): void {
  if (role !== "COMPLIANCE" && role !== "ADMIN") throw new Error("F013 offer status change requires compliance/admin session");
}
