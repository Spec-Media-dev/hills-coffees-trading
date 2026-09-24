# Contract — Notification events, templates and provider boundary

## 1. Event catalogue (emitted inside the committing commerce transaction via `emit_notification_event`)

| event_type | Aggregate | Audience rule | Template key |
|---|---|---|---|
| `proforma.issued` | proforma | buyer org members | `proforma_issued` |
| `proforma.expiring_soon` | proforma | buyer org members (emitted by the sweeper 2 h before `valid_until`, dedupe per proforma) | `proforma_expiring` |
| `order.awaiting_transfer` | order | buyer org members | `awaiting_transfer` |
| `order.reservation_expiring` | order | buyer (sweeper, 5 min before `expires_at`, dedupe per reservation) | `reservation_expiring` |
| `payment.proof_submitted` | payment | buyer org members | `proof_submitted` |
| `finance.review_pending` | payment | finance operators | `finance_review_pending` |
| `payment.confirmed` | payment | buyer org; each member seller (own-lines template: order code only, no totals) | `payment_confirmed`, `seller_order_paid` |
| `payment.rejected` | payment | buyer org | `payment_rejected` |
| `order.expired` / `order.cancelled` | order | buyer org | `order_expired` / `order_cancelled` |
| `finance.reconciliation_opened` | case | finance operators; buyer (status only) | `reconciliation_opened` |
| `fulfillment.created` | shipment | warehouse operators; group seller | `fulfillment_created` |
| `fulfillment.progressed` | shipment | buyer; group seller | `fulfillment_status` |
| `order.completed` | order | buyer; member sellers | `order_completed` |
| `payout.eligible` / `payout.paid` | payout | seller org members | `payout_eligible` / `payout_paid` |
| `campaign.message` | campaign | resolved campaign audience | `campaign` (content from the campaign row) |

`params` allowlist per template: order/proforma/case/shipment code, localized status key, deadline timestamp, and
amount **only** where the recipient may see that amount (the buyer total to the buyer, a seller's own payout to that
seller). There are never bank identifiers, proof paths, other parties' economics or free-text finance notes. Unit
tests pin each template's param keys.

**Catalogue completeness (analysis M4)**: every `event_type` above must be emitted by the transaction named in
[database-rpc.md](./database-rpc.md); `tests/commerce/outbox.live.test.ts` (T163) drives a fixture lifecycle and asserts
each catalogue entry appears exactly once per aggregate.

## 2. Rendering
`lib/notifications/templates.ts` maps `template_key` → `{ en(params), ar(params) }` using the app copy dictionaries.
The render happens at read time, so a later copy fix improves old notifications without rewriting rows. Codes and
money use `dir="ltr"` spans.

## 3. Provider boundary (server-only; never imported by client code)

```ts
// lib/notifications/providers/types.ts
export type ExternalChannel = "EMAIL" | "SMS" | "WHATSAPP" | "PUSH";
export type DeliveryJob = { deliveryId: string; channel: ExternalChannel; recipientUserId: string; templateKey: string; params: Record<string, string>; locale: "en" | "ar" };
export type DeliveryOutcome = { status: "SENT" | "DELIVERED" | "FAILED" | "SKIPPED"; providerMessageId?: string; retryable: boolean; errorCode?: string };
export interface NotificationChannelAdapter {
  readonly channel: ExternalChannel;
  isConfigured(): boolean;            // reads env only; never throws
  send(job: DeliveryJob): Promise<DeliveryOutcome>;
}
```

- `providers/registry.ts` returns only the adapters whose `isConfigured()` is true. In Feature 013 the registry is
  **empty**, so `process_notification_events` creates no external delivery rows (channels are resolved against
  enabled channels passed as a parameter by the worker) and in-app notifications are the whole path (US6-AS4, FR-038).
- `worker.ts` is a server-only **pure function that receives an injected database client** (no service-role import in any runtime
  module; not invoked by any route or job in Feature 013; unit-tested with mocks — analysis M6). A future provider feature
  wires it to a scheduler-invoked entry point. It claims deliveries
  (`claim_notification_deliveries`, SKIP LOCKED), calls the adapter, and completes each one exactly once
  (`complete_notification_delivery`). Retries use exponential backoff (1, 2, 4 … min, cap 60) and at most 8 attempts.
  Errors are stored as codes, never provider payloads.
- A future Firebase adapter adds `providers/firebase-push.ts` (channel `PUSH`) plus device-token storage in its own
  reviewed migration. No commerce function changes (FR-038).

## 4. Idempotency guarantees (AC-013, SEC-008)
Uniqueness constraints, row claims and state checks together guarantee at most one logical delivery per recipient,
channel and event:
- event `UNIQUE(event_type, aggregate_id, dedupe_key)`;
- notification `UNIQUE(event_id, user_id)`;
- delivery `UNIQUE(notification_id, channel)`;
- claims via `FOR UPDATE SKIP LOCKED`;
- terminal status checks before any send.
