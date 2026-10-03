/**
 * Feature 016 Test Fixtures & Builders
 *
 * Implements:
 * - T002: Duplicate logical-key and no-auto-merge preflight fixtures
 * - T003: Fixture builders for confirmed proforma, payment, reservation, exact finalized proof, and multi-fulfillment-group test graphs
 */

export interface LogicalPositionKey {
  lotId: string;
  ownerOrganizationId: string;
  warehouseId: string;
  warehouseLocationId: string | null;
}

export interface InventoryPositionRecord extends LogicalPositionKey {
  id: string;
  availableQuantityKg: number;
  reservedQuantityKg: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Preflight runner testing the migration's duplicate-check behavior (Decision 5 / T002) */
export function preflightDetectDuplicatePositions(positions: InventoryPositionRecord[]): {
  hasDuplicates: boolean;
  duplicateCount: number;
  details: string;
} {
  const groups = new Map<string, InventoryPositionRecord[]>();

  for (const pos of positions) {
    // NULLS NOT DISTINCT grouping: represent null location as '__NULL__'
    const locKey = pos.warehouseLocationId === null ? "__NULL__" : pos.warehouseLocationId;
    const compositeKey = `${pos.lotId}::${pos.ownerOrganizationId}::${pos.warehouseId}::${locKey}`;

    const existing = groups.get(compositeKey) ?? [];
    existing.push(pos);
    groups.set(compositeKey, existing);
  }

  const duplicates: { key: LogicalPositionKey; count: number }[] = [];
  for (const [, list] of groups.entries()) {
    if (list.length > 1) {
      duplicates.push({
        key: {
          lotId: list[0]!.lotId,
          ownerOrganizationId: list[0]!.ownerOrganizationId,
          warehouseId: list[0]!.warehouseId,
          warehouseLocationId: list[0]!.warehouseLocationId,
        },
        count: list.length,
      });
    }
  }

  if (duplicates.length > 0) {
    const details = duplicates
      .map(
        (d) =>
          `(lot=${d.key.lotId}, owner=${d.key.ownerOrganizationId}, wh=${d.key.warehouseId}, loc=${d.key.warehouseLocationId ?? "null"}, count=${d.count})`
      )
      .join("; ");

    return {
      hasDuplicates: true,
      duplicateCount: duplicates.length,
      details,
    };
  }

  return {
    hasDuplicates: false,
    duplicateCount: 0,
    details: "none",
  };
}

export function assertNoDuplicatePositionsPreflight(positions: InventoryPositionRecord[]): void {
  const check = preflightDetectDuplicatePositions(positions);
  if (check.hasDuplicates) {
    throw new Error(
      `migration_aborted: duplicate logical inventory positions detected. Manual reconciliation required: ${check.details}`
    );
  }
}

// ── T002 Preflight Fixture Datasets ──────────────────────────────────────────

export const DUPLICATE_POSITIONS_FIXTURE_NULL_LOCATION: InventoryPositionRecord[] = [
  {
    id: "16000000-0000-0000-0000-000000000001",
    lotId: "16000000-0000-0000-0000-0000000000a1",
    ownerOrganizationId: "16000000-0000-0000-0000-0000000000b1",
    warehouseId: "16000000-0000-0000-0000-0000000000c1",
    warehouseLocationId: null,
    availableQuantityKg: 500,
    reservedQuantityKg: 0,
  },
  {
    id: "16000000-0000-0000-0000-000000000002",
    lotId: "16000000-0000-0000-0000-0000000000a1",
    ownerOrganizationId: "16000000-0000-0000-0000-0000000000b1",
    warehouseId: "16000000-0000-0000-0000-0000000000c1",
    warehouseLocationId: null, // duplicate under NULLS NOT DISTINCT!
    availableQuantityKg: 300,
    reservedQuantityKg: 0,
  },
];

export const DUPLICATE_POSITIONS_FIXTURE_EXPLICIT_LOCATION: InventoryPositionRecord[] = [
  {
    id: "16000000-0000-0000-0000-000000000003",
    lotId: "16000000-0000-0000-0000-0000000000a2",
    ownerOrganizationId: "16000000-0000-0000-0000-0000000000b2",
    warehouseId: "16000000-0000-0000-0000-0000000000c2",
    warehouseLocationId: "16000000-0000-0000-0000-0000000000d2",
    availableQuantityKg: 200,
    reservedQuantityKg: 50,
  },
  {
    id: "16000000-0000-0000-0000-000000000004",
    lotId: "16000000-0000-0000-0000-0000000000a2",
    ownerOrganizationId: "16000000-0000-0000-0000-0000000000b2",
    warehouseId: "16000000-0000-0000-0000-0000000000c2",
    warehouseLocationId: "16000000-0000-0000-0000-0000000000d2",
    availableQuantityKg: 100,
    reservedQuantityKg: 0,
  },
];

export const CLEAN_POSITIONS_FIXTURE: InventoryPositionRecord[] = [
  {
    id: "16000000-0000-0000-0000-000000000005",
    lotId: "16000000-0000-0000-0000-0000000000a3",
    ownerOrganizationId: "16000000-0000-0000-0000-0000000000b3",
    warehouseId: "16000000-0000-0000-0000-0000000000c3",
    warehouseLocationId: null,
    availableQuantityKg: 1000,
    reservedQuantityKg: 200,
  },
  {
    id: "16000000-0000-0000-0000-000000000006",
    lotId: "16000000-0000-0000-0000-0000000000a3",
    ownerOrganizationId: "16000000-0000-0000-0000-0000000000b3",
    warehouseId: "16000000-0000-0000-0000-0000000000c3",
    warehouseLocationId: "16000000-0000-0000-0000-0000000000d3", // distinct location!
    availableQuantityKg: 500,
    reservedQuantityKg: 0,
  },
  {
    id: "16000000-0000-0000-0000-000000000007",
    lotId: "16000000-0000-0000-0000-0000000000a4", // distinct lot!
    ownerOrganizationId: "16000000-0000-0000-0000-0000000000b3",
    warehouseId: "16000000-0000-0000-0000-0000000000c3",
    warehouseLocationId: null,
    availableQuantityKg: 400,
    reservedQuantityKg: 0,
  },
];

// ── T003 F016 Graph Builders ────────────────────────────────────────────────

export interface F016OrderGraph {
  order: {
    id: string;
    orderCode: string;
    buyerOrganizationId: string;
    commerceFlow: "BANK_TRANSFER_V1";
    status: "PAYMENT_PROOF_SUBMITTED" | "PAID" | "PAYMENT_REJECTED";
    currentProformaId: string;
    destinationSnapshot: Record<string, unknown>;
    paidAt?: string;
  };
  proforma: {
    id: string;
    orderId: string;
    status: "CONFIRMED";
    buyerTotal: number;
    currency: string;
    destinationSnapshot: Record<string, unknown>;
    confirmedAt: string;
    confirmedBy: string;
  };
  fulfillmentGroups: {
    id: string;
    proformaId: string;
    sellerOrganizationId: string;
    warehouseId: string;
    deliveryMethod: string;
    shippingAmount: number;
  }[];
  proformaItems: {
    id: string;
    proformaId: string;
    orderItemId: string;
    offerId: string;
    fulfillmentGroupId: string;
    quantityKg: number;
    sellerTypeSnapshot: string;
  }[];
  payment: {
    id: string;
    orderId: string;
    proformaId: string;
    status: "PROOF_SUBMITTED" | "CONFIRMED" | "REJECTED";
    amount: number;
    expectedAmount: number;
    currency: string;
    confirmedBy?: string;
    confirmedAt?: string;
    rejectedBy?: string;
    rejectedAt?: string;
    rejectedReason?: string;
  };
  uploadIntent: {
    id: string;
    orderId: string;
    buyerOrganizationId: string;
    bucketId: string;
    objectPath: string;
    status: "FINALIZED";
    finalizedProofId: string;
    finalizedAt: string;
  };
  paymentProof: {
    id: string;
    paymentId: string;
    fileAssetId: string;
    status: "SUBMITTED" | "ACCEPTED" | "REJECTED";
    claimedAmount: number;
    claimedCurrency: string;
    transferDate: string;
    bankReference: string;
    submittedAt: string;
  };
  reservation: {
    id: string;
    orderId: string;
    proformaId: string;
    status: "REVIEW_HOLD" | "CONSUMED" | "RELEASED";
    expiresAt: string;
    releaseReason?: string;
    releasedAt?: string;
    consumedAt?: string;
  };
  reservationItems: {
    reservationId: string;
    offerId: string;
    inventoryPositionId: string;
    quantityKg: number;
  }[];
  sellerPositions: InventoryPositionRecord[];
  buyerPositions: InventoryPositionRecord[];
  taxInvoice?: {
    id: string;
    orderId: string;
    proformaId: string;
    invoiceNumber: string;
    status: "ISSUED";
    snapshot: Record<string, unknown>;
  };
  ownershipEvents?: {
    lotId: string;
    fromOrganizationId: string;
    toOrganizationId: string;
    orderItemId: string;
    quantityKg: number;
    eventType: "SALE" | "RESALE";
  }[];
  shipments?: {
    id: string;
    orderId: string;
    shipmentKind: "FULFILLMENT";
    status: "REQUESTED";
    fulfillmentSellerOrganizationId: string;
    fulfillmentWarehouseId: string;
    proformaFulfillmentGroupId: string;
    deliveryMethod: string;
    addressLine: string;
    items: {
      orderItemId: string;
      plannedQuantityKg: number;
    }[];
  }[];
  review?: {
    id: string;
    paymentId: string;
    reviewerUserId: string;
    decision: "CONFIRMED" | "REJECTED";
    reason?: string;
    requestId: string;
    createdAt: string;
  };
}

export function buildF016OrderGraph(overrides: Partial<F016OrderGraph> = {}): F016OrderGraph {
  const orderId = "16100000-0000-0000-0000-000000000001";
  const proformaId = "16200000-0000-0000-0000-000000000001";
  const paymentId = "16300000-0000-0000-0000-000000000001";
  const proofId = "16400000-0000-0000-0000-000000000001";
  const reservationId = "16500000-0000-0000-0000-000000000001";
  const groupId = "16600000-0000-0000-0000-000000000001";
  const orderItemId = "16700000-0000-0000-0000-000000000001";
  const offerId = "16800000-0000-0000-0000-000000000001";
  const lotId = "16900000-0000-0000-0000-000000000001";
  const sellerOrgId = "16a00000-0000-0000-0000-000000000001";
  const buyerOrgId = "16b00000-0000-0000-0000-000000000001";
  const warehouseId = "16c00000-0000-0000-0000-000000000001";
  const sellerPositionId = "16d00000-0000-0000-0000-000000000001";

  const defaultDestination = {
    country_code: "AE",
    city: "Dubai",
    address_lines: ["Unit 101", "Al Quoz Industrial 3"],
    contact_name: "Ahmed Al-Maktoum",
    contact_phone: "+971500000000",
  };

  const graph: F016OrderGraph = {
    order: {
      id: orderId,
      orderCode: "HC-F016-0001",
      buyerOrganizationId: buyerOrgId,
      commerceFlow: "BANK_TRANSFER_V1",
      status: "PAYMENT_PROOF_SUBMITTED",
      currentProformaId: proformaId,
      destinationSnapshot: defaultDestination,
    },
    proforma: {
      id: proformaId,
      orderId,
      status: "CONFIRMED",
      buyerTotal: 5250.0,
      currency: "USD",
      destinationSnapshot: defaultDestination,
      confirmedAt: "2026-10-02T10:00:00Z",
      confirmedBy: "16e00000-0000-0000-0000-000000000001",
    },
    fulfillmentGroups: [
      {
        id: groupId,
        proformaId,
        sellerOrganizationId: sellerOrgId,
        warehouseId,
        deliveryMethod: "FMC_STANDARD_TRUCK",
        shippingAmount: 250.0,
      },
    ],
    proformaItems: [
      {
        id: "16f00000-0000-0000-0000-000000000001",
        proformaId,
        orderItemId,
        offerId,
        fulfillmentGroupId: groupId,
        quantityKg: 500,
        sellerTypeSnapshot: "PRODUCER",
      },
    ],
    payment: {
      id: paymentId,
      orderId,
      proformaId,
      status: "PROOF_SUBMITTED",
      amount: 5250.0,
      expectedAmount: 5250.0,
      currency: "USD",
    },
    uploadIntent: {
      id: "16010000-0000-0000-0000-000000000001",
      orderId,
      buyerOrganizationId: buyerOrgId,
      bucketId: "payment-proofs",
      objectPath: `proofs/${orderId}/${proofId}.pdf`,
      status: "FINALIZED",
      finalizedProofId: proofId,
      finalizedAt: "2026-10-02T10:30:00Z",
    },
    paymentProof: {
      id: proofId,
      paymentId,
      fileAssetId: "16020000-0000-0000-0000-000000000001",
      status: "SUBMITTED",
      claimedAmount: 5250.0,
      claimedCurrency: "USD",
      transferDate: "2026-10-02",
      bankReference: "TRX-F016-12345",
      submittedAt: "2026-10-02T10:30:00Z",
    },
    reservation: {
      id: reservationId,
      orderId,
      proformaId,
      status: "REVIEW_HOLD",
      expiresAt: "2026-10-02T11:00:00Z",
    },
    reservationItems: [
      {
        reservationId,
        offerId,
        inventoryPositionId: sellerPositionId,
        quantityKg: 500,
      },
    ],
    sellerPositions: [
      {
        id: sellerPositionId,
        lotId,
        ownerOrganizationId: sellerOrgId,
        warehouseId,
        warehouseLocationId: null,
        availableQuantityKg: 1000,
        reservedQuantityKg: 500,
      },
    ],
    buyerPositions: [],
  };

  return { ...graph, ...overrides };
}

export function buildF016MultiGroupGraph(): F016OrderGraph {
  const base = buildF016OrderGraph();
  const group2Id = "16600000-0000-0000-0000-000000000002";
  const orderItemId2 = "16700000-0000-0000-0000-000000000002";
  const offerId2 = "16800000-0000-0000-0000-000000000002";
  const lotId2 = "16900000-0000-0000-0000-000000000002";
  const sellerOrg2Id = "16a00000-0000-0000-0000-000000000002";
  const warehouse2Id = "16c00000-0000-0000-0000-000000000002";
  const sellerPosition2Id = "16d00000-0000-0000-0000-000000000002";

  base.fulfillmentGroups.push({
    id: group2Id,
    proformaId: base.proforma.id,
    sellerOrganizationId: sellerOrg2Id,
    warehouseId: warehouse2Id,
    deliveryMethod: "AIR_EXPRESS",
    shippingAmount: 400.0,
  });

  base.proformaItems.push({
    id: "16f00000-0000-0000-0000-000000000002",
    proformaId: base.proforma.id,
    orderItemId: orderItemId2,
    offerId: offerId2,
    fulfillmentGroupId: group2Id,
    quantityKg: 300,
    sellerTypeSnapshot: "TRADER",
  });

  base.reservationItems.push({
    reservationId: base.reservation.id,
    offerId: offerId2,
    inventoryPositionId: sellerPosition2Id,
    quantityKg: 300,
  });

  base.sellerPositions.push({
    id: sellerPosition2Id,
    lotId: lotId2,
    ownerOrganizationId: sellerOrg2Id,
    warehouseId: warehouse2Id,
    warehouseLocationId: "16e00000-0000-0000-0000-000000000099",
    availableQuantityKg: 600,
    reservedQuantityKg: 300,
  });

  return base;
}

export function buildF016ConfirmedGraph(requestId = "16030000-0000-0000-0000-000000000001"): F016OrderGraph {
  const base = buildF016OrderGraph();

  base.order.status = "PAID";
  base.order.paidAt = "2026-10-02T10:45:00Z";
  base.payment.status = "CONFIRMED";
  base.payment.confirmedBy = "16e00000-0000-0000-0000-000000000001";
  base.payment.confirmedAt = "2026-10-02T10:45:00Z";
  base.paymentProof.status = "ACCEPTED";
  base.reservation.status = "CONSUMED";
  base.reservation.consumedAt = "2026-10-02T10:45:00Z";

  // Seller positions decremented
  base.sellerPositions = base.sellerPositions.map((p) => ({
    ...p,
    availableQuantityKg: p.availableQuantityKg - 500,
    reservedQuantityKg: p.reservedQuantityKg - 500,
  }));

  // Buyer position credited
  base.buyerPositions = [
    {
      id: "16040000-0000-0000-0000-000000000001",
      lotId: base.sellerPositions[0]!.lotId,
      ownerOrganizationId: base.order.buyerOrganizationId,
      warehouseId: base.sellerPositions[0]!.warehouseId,
      warehouseLocationId: null,
      availableQuantityKg: 500,
      reservedQuantityKg: 0,
    },
  ];

  base.taxInvoice = {
    id: "16050000-0000-0000-0000-000000000001",
    orderId: base.order.id,
    proformaId: base.proforma.id,
    invoiceNumber: "INV-2026-0001",
    status: "ISSUED",
    snapshot: { total: base.proforma.buyerTotal },
  };

  base.ownershipEvents = [
    {
      lotId: base.sellerPositions[0]!.lotId,
      fromOrganizationId: base.sellerPositions[0]!.ownerOrganizationId,
      toOrganizationId: base.order.buyerOrganizationId,
      orderItemId: base.proformaItems[0]!.orderItemId,
      quantityKg: 500,
      eventType: "SALE",
    },
  ];

  base.shipments = [
    {
      id: "16060000-0000-0000-0000-000000000001",
      orderId: base.order.id,
      shipmentKind: "FULFILLMENT",
      status: "REQUESTED",
      fulfillmentSellerOrganizationId: base.fulfillmentGroups[0]!.sellerOrganizationId,
      fulfillmentWarehouseId: base.fulfillmentGroups[0]!.warehouseId,
      proformaFulfillmentGroupId: base.fulfillmentGroups[0]!.id,
      deliveryMethod: base.fulfillmentGroups[0]!.deliveryMethod,
      addressLine: "Unit 101, Al Quoz Industrial 3",
      items: [
        {
          orderItemId: base.proformaItems[0]!.orderItemId,
          plannedQuantityKg: 500,
        },
      ],
    },
  ];

  base.review = {
    id: "16070000-0000-0000-0000-000000000001",
    paymentId: base.payment.id,
    reviewerUserId: "16e00000-0000-0000-0000-000000000001",
    decision: "CONFIRMED",
    reason: "Wire transfer verified against DMCC bank statement",
    requestId,
    createdAt: "2026-10-02T10:45:00Z",
  };

  return base;
}

export function buildF016RejectedGraph(
  requestId = "16030000-0000-0000-0000-000000000002",
  reason = "Illegible bank receipt and mismatched reference"
): F016OrderGraph {
  const base = buildF016OrderGraph();

  base.order.status = "PAYMENT_REJECTED";
  base.payment.status = "REJECTED";
  base.payment.rejectedBy = "16e00000-0000-0000-0000-000000000001";
  base.payment.rejectedAt = "2026-10-02T10:45:00Z";
  base.payment.rejectedReason = reason;
  base.paymentProof.status = "REJECTED";
  base.reservation.status = "RELEASED";
  base.reservation.releaseReason = "REJECTED";
  base.reservation.releasedAt = "2026-10-02T10:45:00Z";

  // Seller positions reserved quantity released back, available untouched
  base.sellerPositions = base.sellerPositions.map((p) => ({
    ...p,
    reservedQuantityKg: p.reservedQuantityKg - 500,
  }));

  base.buyerPositions = [];
  delete base.taxInvoice;
  delete base.ownershipEvents;
  delete base.shipments;

  base.review = {
    id: "16070000-0000-0000-0000-000000000002",
    paymentId: base.payment.id,
    reviewerUserId: "16e00000-0000-0000-0000-000000000001",
    decision: "REJECTED",
    reason,
    requestId,
    createdAt: "2026-10-02T10:45:00Z",
  };

  return base;
}
