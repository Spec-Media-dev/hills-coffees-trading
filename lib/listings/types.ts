/**
 * Feature 006 T001 — the audited DTO boundary for the marketplace/listing domain. Every consumer
 * (this feature's own future pages/actions, and 007's checkout hand-off) imports these shapes rather
 * than querying `coffee_offers`/`listing_status_history`/`offer_documents`/`offer_sensory_notes`/
 * `offer_tags` directly, so the buyer/seller field boundary and the closed listing vocabulary live in
 * exactly one place (`lib/listings/*`).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * LISTING STATUS VOCABULARY — CONFIRMED AGAINST THE LIVE SCHEMA (2026-09-12 preflight)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `coffee_offers.status`'s own CHECK constraint (`coffee_offers_status_allowed`) is exactly the nine
 * values the spec names — no mismatch, no invented alias:
 */
export const LISTING_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
  "PARTIALLY_FILLED",
  "SUSPENDED",
  "SOLD_OUT",
  "ARCHIVED",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** `coffee_offers.seller_type`'s own CHECK constraint (`coffee_offers_seller_type_check`). */
export const SELLER_TYPES = ["HILLS", "MEMBER_SELLER"] as const;
export type SellerType = (typeof SELLER_TYPES)[number];

/**
 * `coffee_offers.is_visible` is DATABASE-COMPUTED (`coffee_offers_visibility_check`: `is_visible =
 * (status IN ('PUBLISHED','PARTIALLY_FILLED'))`, and `validate_offer_transition` sets it on every
 * write) — this file never derives it independently; every DTO below passes it through verbatim.
 */

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * BUYER / SELLER FIELD BOUNDARY
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `BuyerBrowseListing`/`BuyerListingDetail` carry ONLY fields a buyer is entitled to under
 * `member_read_published_offers` (a live, PUBLISHED/PARTIALLY_FILLED, visible, non-deleted row with
 * positive remaining quantity — see `browse.ts`'s own header for the exact RLS predicate, including
 * the confirmed schema-vs-spec finding that this same predicate makes a SOLD_OUT row unreadable by a
 * buyer even by direct id). They deliberately EXCLUDE: `reviewed_by`, `reviewed_at`,
 * `rejection_reason`, `source_purchase_order_item_id`, `created_by`, `deleted_at` — every one of
 * those is seller/compliance-internal provenance or review metadata, never a buyer's business.
 *
 * `ManagedListing` is the SELLER's own view of their OWN organization's listing (any status,
 * `offers_owner_or_admin`) — it MAY carry the seller-private fields the buyer DTO omits, because the
 * owning organization is entitled to its own provenance/review history.
 */

/** `coffee_lots`/`coffees` context, when readable (DB-OPEN-05 may make this null — see 005's own precedent). */
export type ListingLotContext = {
  lotId: string;
  lotCode: string;
  cropYear: string | null;
  qualityGrade: string | null;
  cupScore: number | null;
  coffeeId: string | null;
  coffeeName: string | null;
};

/** `null` under DB-OPEN-05 — the listing itself still renders; only lot detail degrades. */
export type ListingLotDetail = ListingLotContext | null;

/** Approved-for-member-display warehouse context — mirrors `lib/inventory/types.ts#InventoryWarehouseContext`'s own narrowing (no address). */
export type ListingWarehouseContext = {
  warehouseId: string;
  code: string;
  name: string;
  city: string | null;
  countryCode: string | null;
};

/**
 * The buyer's browse-list row. Every quantity field is a VERBATIM pass-through of the stored column
 * — `remaining` is NOT a field here (see `fills.ts`'s own `FillProjection`, computed at presentation
 * time from these same verbatim numbers, never persisted, never a second source of truth).
 */
export type BuyerBrowseListing = {
  id: string;
  title: string | null;
  coffeeId: string;
  coffeeName: string | null;
  lot: ListingLotDetail;
  warehouse: ListingWarehouseContext | null;
  sellerType: SellerType;
  /** `coffee_offers.quantity_kg` — the listed total, pass-through. */
  quantityKg: number;
  /** `coffee_offers.reserved_quantity_kg` — pass-through; excluded from what a NEW buyer may act on. */
  reservedQuantityKg: number;
  /** `coffee_offers.filled_quantity_kg` — pass-through. */
  filledQuantityKg: number;
  pricePerKg: number;
  currency: string;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
};

/** The buyer's listing-detail row — same field boundary as `BuyerBrowseListing`, plus sensory/tag context. */
export type BuyerListingDetail = BuyerBrowseListing & {
  sensoryNotes: ListingSensoryNotes | null;
  tags: readonly string[];
};

export type ListingSensoryNotes = {
  aroma: string | null;
  flavor: string | null;
  acidity: string | null;
  body: string | null;
  finish: string | null;
  notes: string | null;
};

/**
 * The seller's OWN managed listing — any status, own organization only (`manage.ts`). Carries the
 * seller-private provenance/review fields the buyer DTO never sees.
 */
export type ManagedListing = {
  id: string;
  title: string | null;
  coffeeId: string;
  coffeeName: string | null;
  lot: ListingLotDetail;
  warehouse: ListingWarehouseContext | null;
  sellerOrganizationId: string;
  sellerType: SellerType;
  /** `coffee_offers.source_purchase_order_item_id` — seller-private provenance, never shown to buyers. */
  sourcePurchaseOrderItemId: string | null;
  quantityKg: number;
  reservedQuantityKg: number;
  filledQuantityKg: number;
  pricePerKg: number;
  currency: string;
  status: ListingStatus;
  isVisible: boolean;
  /** Only populated when `status === "REJECTED"` — the compliance-recorded reason. */
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

/** One row of `listing_status_history` — read-only, seller-own-org or compliance/auditor only. */
export type ListingStatusHistoryEntry = {
  id: string;
  offerId: string;
  oldStatus: ListingStatus | null;
  newStatus: ListingStatus;
  changedBy: string | null;
  reason: string | null;
  createdAt: string;
};

export type PaginatedListings<T> = {
  rows: readonly T[];
  hasMore: boolean;
};

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * FILL PROJECTION (T005) — see `fills.ts` for the function; the shape lives here per T001's scope.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export type FillState = "AVAILABLE" | "PARTIALLY_FILLED" | "SOLD_OUT";

export type FillProjection =
  | {
      /** The three stored columns and the derived remaining figure were internally consistent. */
      ok: true;
      quantityKg: number;
      reservedQuantityKg: number;
      filledQuantityKg: number;
      remainingQuantityKg: number;
      state: FillState;
    }
  | {
      /**
       * The stored columns themselves violate the database's own invariant (e.g. `remaining < 0`,
       * which `coffee_offers_quantities_check` should make impossible) — a controlled, OBSERVABLE
       * integrity problem, never silently clamped via `Math.max(0, ...)`.
       */
      ok: false;
      problem: "NEGATIVE_REMAINING";
      quantityKg: number;
      reservedQuantityKg: number;
      filledQuantityKg: number;
    };

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ELIGIBILITY CONTRACT (T004) — see `eligibility.ts` for the function/full evidence.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Refusal reasons are the ones this run can PROVE with an authoritative fact — see `eligibility.ts`'s
 * own header for the delivery-reservation gap (DB-BLOCK-07: no representable fact; never claimed
 * enforced here).
 */
export type EligibilityRefusalReason =
  | "SELLER_NOT_CAPABLE"
  | "POSITION_NOT_OWNED"
  | "NOT_HILLS_SOURCED"
  | "CUSTODY_NOT_ELIGIBLE"
  | "RESERVED_QUANTITY"
  | "INSUFFICIENT_QUANTITY";

export type EligibilityResult =
  | {
      eligible: true;
      /** The position's authoritative tradable-now figure (`available - reserved`), verbatim from 005's facts. */
      eligibleQuantityKg: number;
      /** The `order_items.id` to use as `coffee_offers.source_purchase_order_item_id` on creation. */
      sourcePurchaseOrderItemId: string;
    }
  | {
      eligible: false;
      reason: EligibilityRefusalReason;
      /** The authoritative eligible quantity, when safe to disclose to the OWNING seller (never fabricated). */
      eligibleQuantityKg: number | null;
    };
