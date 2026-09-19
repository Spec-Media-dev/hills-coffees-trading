/**
 * Feature 012 RUN A (T001) — the dispute domain's closed vocabulary and DTO shapes.
 *
 * CLIENT-SAFE BY CONSTRUCTION: no `lib/supabase/server` import, no `react` import — Client
 * Components (the raise form, the status badge) may import this file directly.
 *
 * THE STATUS VOCABULARY IS NOT INVENTED HERE: `DISPUTE_STATUSES` is copied verbatim, in order, from
 * the live `disputes_status_check` CHECK constraint
 * (`status = ANY (ARRAY['OPEN','UNDER_REVIEW','FROZEN','RESOLVED','REJECTED','CLOSED'])`,
 * `docs/database/database-schema-report.json`, also recorded in
 * `docs/architecture/DATABASE-CAPABILITY-MAP.md`). The column default is `'OPEN'`. No synonym, no
 * extra value, no "generic" status is ever represented.
 *
 * `FROZEN` IS A LABEL ON THE DISPUTE RECORD ONLY (DB-OPEN-09): no trigger exists on `disputes`, so a
 * dispute in any status — including `FROZEN` — has no effect on the affected order, shipment,
 * payment, settlement, inventory or trading. Nothing typed here implies otherwise.
 */
export const DISPUTE_STATUSES = ["OPEN", "UNDER_REVIEW", "FROZEN", "RESOLVED", "REJECTED", "CLOSED"] as const;

export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** The column default (`disputes.status DEFAULT 'OPEN'`) — every newly raised dispute starts here. */
export const DISPUTE_INITIAL_STATUS: DisputeStatus = "OPEN";

export function isDisputeStatus(value: unknown): value is DisputeStatus {
  return typeof value === "string" && (DISPUTE_STATUSES as readonly string[]).includes(value);
}

/**
 * The three read audiences the live `disputes_view` policy grants
 * (`can_view_order(order_id) OR is_compliance_operator() OR is_auditor()`). `participant` is the
 * member side, scoped further by the application to the ACTING organization's own orders.
 */
export type DisputeAudience = "participant" | "compliance" | "auditor";

/**
 * What a MEMBER (participant) may see. Deliberately omits every internal identifier a member has no
 * need for: `opened_by_user_id` becomes the boolean `raisedByYou`, and `resolved_by` (an operator's
 * profile id) is never exposed on the member side at all.
 */
export type MemberDisputeSummaryDTO = {
  id: string;
  orderId: string;
  orderCode: string;
  status: DisputeStatus;
  openedAt: string;
  resolvedAt: string | null;
  updatedAt: string;
  correlationId: string;
  raisedByYou: boolean;
};

export type MemberDisputeDetailDTO = MemberDisputeSummaryDTO & {
  /** Untrusted free text — rendered only as a React text node, never as HTML. */
  reason: string;
  /** Untrusted operator free text, `null` until a resolution/rejection is recorded. */
  resolution: string | null;
};

/**
 * What an OPERATOR audience (compliance or auditor) may see. `orderCode` is `null` whenever the
 * operator's own role has no `orders` read path: `orders_view` is `can_view_order(id)`, which is true
 * for `is_platform_admin()` but NOT for a pure COMPLIANCE or AUDITOR role — the value is reported as
 * unreadable (`orderContextReadable: false`), never guessed.
 */
export type OperatorDisputeDTO = {
  id: string;
  orderId: string;
  orderCode: string | null;
  orderContextReadable: boolean;
  status: DisputeStatus;
  reason: string;
  resolution: string | null;
  openedByUserId: string;
  openedByOrganizationId: string | null;
  openedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * `dispute_evidence`, represented ONLY to the extent the current database supports it: the text
 * `note`, the uploader, the timestamp, and whether a `file_asset_id` reference exists. No file
 * metadata, bytes or storage path is read or represented — dispute evidence files cannot be stored
 * (DB-BLOCK-01) and the file seam is Feature 012 T005, not RUN A.
 */
export type DisputeEvidenceDTO = {
  id: string;
  disputeId: string;
  /** Untrusted free text — rendered only as a React text node, never as HTML. */
  note: string | null;
  hasFileReference: boolean;
  uploadedBy: string;
  createdAt: string;
};

/** A paginated member list, same shape convention as `lib/orders/validation.ts#PaginatedOrders`. */
export type PaginatedDisputes<T> = { rows: readonly T[]; hasMore: boolean; page: number; pageSize: number };
