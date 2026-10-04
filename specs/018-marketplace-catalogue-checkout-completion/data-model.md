# Feature 018 Data Model

Design only. Existing column types, enum labels and constraints must be captured as described in [migrations-verification.md](contracts/migrations-verification.md) before writing SQL. New names below are proposed contracts, not installed objects.

## Existing Aggregate Boundaries

| Entity | Authority and relations | Feature 018 treatment |
| --- | --- | --- |
| `coffees` | Catalogue identity, origin/type/process/variety and publication state; translations/media separate | Add nullable `featured_at timestamptz`; no stock, price or seller-economics fields |
| Coffee translations/media | Existing language records, primary/gallery media and file assets | Independent step saves; Arabic required for new publication; public media remains separate from private offer media |
| Lots / `inventory_positions` | Owner, Coffee/lot, warehouse/location, available/reserved quantity, holds/variance/provenance | Read/select real eligible backing; never create stock in catalogue workflow; retain null-safe location identity |
| `coffee_offers` | Seller, Coffee/lot/backing, USD/kg, quantity, review/status/history | Explicit selected offer per editor/detail; retain review and provenance guards |
| `orders` / `order_items` | Organization-owned V1 DRAFT pending cart; item unique identity and merged offer intent | Retain same cart after consumption; dedicated checkout child contains exactly one item |
| Reservation/proforma/payment | Existing V1 atomic snapshots, ACTIVE/REVIEW_HOLD/terminal reservation lifecycle and private proof | Reuse established transaction and Finance rules; add only Arabic display snapshots |
| Invoice/title/storage/shipment | Feature 016 confirmation and Feature 009 FULFILLMENT handoff | Existing exact-once integrity; no alternative invoice/title/handoff model |
| `commerce_request_log` | Existing UUID request key, actor, operation, target and response | Proposed nullable canonical `bound_payload jsonb`; new controlled helper requires it for F018 operations; legacy rows remain unchanged |
| `support_tickets` / `support_messages` | Feature 014 organization-bound thread and append-only conversation | Extend category/reference/status operations, not a new ticket store |
| Notifications/audit | Existing transactional in-app rows and actor/correlation/history | Safe typed support events and metadata; preserve commerce bindings |

## Catalogue Editorial State

`coffees.featured_at`: null means not selected; non-null records the first enable moment. Re-enabling an already selected Coffee is a no-op for this timestamp. Explicit Unfeature sets null. Unpublish/archive preserves it privately. Public query requires PUBLISHED and existing public eligibility; Recent orders `created_at DESC, id DESC`, Featured `featured_at DESC, id DESC`, each limit six. No current commercial availability predicate is added to public catalogue publication.

Propose a partial Featured index using the actual Coffee status column/type after capture. Index ordering must match the public query. No historical Featured backfill or rewriting of `created_at`.

## Immutable Arabic Snapshots

Append nullable text columns to `proforma_invoice_items`:

- `product_name_ar_snapshot`
- `origin_name_ar_snapshot`

Populate only on new issuance, at the existing Feature 015 proforma-item INSERT inside the shared checkout kernel, from eligible Arabic catalogue/origin translations read in the issuance transaction. Preserve existing English `product_name_snapshot`, `origin_name_snapshot` and issued description/custom offer title exactly. The Arabic Coffee label is a distinct display value; it must not pretend to translate a custom offer title. Empty/missing translation normalizes to null. Currency, reference, bank values, codes and identifiers are never translated.

No UPDATE/backfill from current translations, including during reapply. `prevent_snapshot_mutation` already blocks mutation of V1 snapshot rows; postflight must verify its binding protects the added fields. Historical legacy exceptions must not permit new V1 values or rewrite historical Arabic nulls. Rendering selects frozen Arabic if present, otherwise frozen English with `lang="en" dir="ltr"`. No current Coffee read fills missing issued text.

## `cart_line_checkout_receipts`

One immutable committed source-intent → transaction result. Final row is inserted only after child checkout succeeds and before the source line is deleted; all are in one transaction.

| Proposed column | Type/nullability | Meaning / constraint |
| --- | --- | --- |
| `id` | uuid PK, server-generated | Receipt identity, never authority |
| `request_id` | uuid NOT NULL UNIQUE | Original selected-line intent, globally bound to actor/operation/payload |
| `actor_user_id` | uuid NOT NULL | Derived from authenticated user; replay must match |
| `buyer_organization_id` | uuid NOT NULL | Freshly authorized organization; never browser-trusted |
| `source_cart_id` | uuid NOT NULL | Source order identity; retained restrictive relation where existing retention allows |
| `source_order_item_id` | uuid NOT NULL UNIQUE | Consumed item identity; deliberately no FK to deleted source item |
| `offer_id` | uuid NOT NULL | Exact selected offer; restrictive relation, never cascade history away |
| `quantity_kg` | numeric matching order item, NOT NULL CHECK >0 | Exact requested/validated quantity, no floating-point normalization |
| `destination_id` | uuid NOT NULL | Selected authorized destination identity; historical retention/no cascade |
| `bound_payload` | jsonb NOT NULL, object | Versioned canonical operation/cart/line/org/offer/quantity/destination payload; exact equality is authority for replay conflicts, not a hash alone |
| `source_line_snapshot` | jsonb NOT NULL, object | Server-built source item/cart linkage, quantity, permitted snapshot fields, seller and existing source record values; no private media URL/proof/bank secrets |
| `destination_snapshot` | jsonb NOT NULL, object | Frozen destination/contact/method context as issued, or exact protected link to immutable destination snapshot |
| `transaction_order_id` | uuid NOT NULL UNIQUE | Dedicated child, different from source cart |
| `transaction_order_item_id` | uuid NOT NULL UNIQUE | Exactly one child item; offer/quantity match source binding |
| `child_request_id` | uuid NOT NULL UNIQUE | Internally generated Feature 015 request key, distinct from root request key |
| `proforma_id`, `payment_id`, `reservation_id` | uuid NOT NULL, restrictive links | Exact committed artifacts; linkage verified against child |
| `committed_result` | jsonb NOT NULL, object | Versioned safe F015 result: IDs/codes, expires_at, buyer_total and currency; no mutable status or proof/storage secrets |
| `committed_at` | timestamptz NOT NULL, server clock | Immutable commit operation timestamp |

Use NOT NULL/positive/object/type checks and exact unique definitions, not partial uniqueness on terminal status. Request binding also names operation/version to reject cross-operation key reuse. Persist server numeric values and compare numeric quantities canonically; JSON order/whitespace is irrelevant, semantic fields are not. Source/dedicated order, buyer and line relationships are validated before insert; deferred integrity checks may verify final state, not excuse an incomplete committed row. Foreign-key deletion behavior must preserve evidence; source line deletion is the only intentional broken live relation.

**Lifecycle**: absent → committed immutable. No durable PREPARING/FAILED row and no mutable status-driven authorization. Failures before commit leave no row. Order/reservation states may later evolve normally; receipt links/results stay frozen. Terminal replay delegates the exact existing Finance integrity checks and verifies receipt-to-child linkage; never require the child still be HOLD or reservation still ACTIVE.

**Access**: RLS enabled; no direct application INSERT/UPDATE/DELETE, including anon/authenticated/service_role. Owner-controlled routines only. Prefer no direct application SELECT and a narrow SECDEF recovery RPC that freshly verifies actor plus current buyer-org membership/status/capability/MFA before emitting a safe DTO. Table ownership, default function PUBLIC execution and service-role privileges must be explicitly reviewed. IDs/references are not access tokens.

**Retention**: immutable commerce history, not disposable fixture rows. No cascade from request-log cleanup, cart-item deletion or destination maintenance. Rollback retains rows and lookup safety. Any compliance-driven future erasure is outside this feature and must not destroy purchase integrity silently.

## Internal Checkout Permits

Proposed protected `f018_checkout_permits` exists solely for transaction-local coordination because the public legacy entry point must accept the newly provisioned one-line child without allowing an arbitrary source cart to be checked out directly.

Fields: child-order PK, actor, buyer org, source cart/item, root request, child request, selected offer/quantity/destination, and staged-reclamation marker bound to the complete locked offer/position set. Every value is written by the controlled split function. No application table CRUD/SELECT or grant on permit-management helpers; SECDEF fixed path/qualified names. A client GUC/header/JSON flag cannot create a permit. Delete it before commit; a deferred constraint/check ensures no permit can survive a successful transaction. Any rollback removes it automatically.

The public legacy wrapper freshly authorizes, checks child permit and exactly one item before a fresh DRAFT path, then invokes the owner-only shared kernel. Historical committed replay requires no permit. Permits carry no reusable user credential and cannot replace receipt authorization. See [checkout.md](contracts/checkout.md).

## Idempotent Operation Binding and Edit Conflict

Reuse `commerce_request_log` instead of a second general-purpose ledger. A new owner-only payload-aware begin/complete helper binds actor, operation/version, stable target/intent and canonical payload. Existing helper semantics remain for historical non-F018 operations; new Add/cart/Admin/support paths must use the payload-aware contract. Replay authorizes first and checks the payload before returning a result. An uncommitted request claim rolls back with domain writes. Do not use a receipt from another operation just because the UUID matches.

Admin/support operations return existing domain IDs and safe outcome/revision. A creation request uses its stable intent as target before the new ID exists. Later save binds Coffee/offer/ticket, expected revision and step data. Lock the record, compare the expected revision, then mutate. Reuse proven installed revision/timestamp fields only if collision-safe; otherwise add a monotonic version counter to the affected mutable records. No timestamp-only optimistic overwrite without a verified invariant. A no-op matching replay returns the original revision; a new stale edit returns conflict.

## Help Center Extensions

### Ticket/category/reference

Add `support_tickets.category` with database check of stable values: `GENERAL`, `CATALOGUE`, `CART_CHECKOUT`, `PAYMENT`, `ORDER_FULFILLMENT`, `ACCOUNT_MEMBERSHIP`. Default/fallback GENERAL for historical rows. Labels are localized in application dictionaries; category does not grant order/proof access. Keep existing priority and statuses unchanged.

Keep existing `ticket_code` and unique index; new server-generated codes are `HC-` plus 16 uppercase hexadecimal characters from database cryptographic randomness. Retry only unique-code collision, with a bounded attempt count (five); exhaustion aborts ticket/message/request/notification transaction. Existing HLP codes remain untouched and resolvable. Immutability trigger refuses reference/org/requester/order identity rewrites.

### `support_ticket_status_history`

Proposed fields: uuid PK; ticket ID restrictive FK; nullable `from_status` for initial creation; `to_status`; server actor; staff flag derived server-side; root request ID; cause (`CREATED`, `ADMIN_TRANSITION`, `MEMBER_REPLY`, `STAFF_REPLY`); optional triggering message ID; server timestamp. Persist a unique event binding per request/cause/ticket; one operation cannot append duplicate history on replay. History is append-only, with no application writes except controlled routines. SELECT follows ticket membership and current application org scope, or Platform Admin + MFA. Audit stores safe entity/change metadata, not duplicate message bodies.

### Status graph

| From | Explicit Admin transitions |
| --- | --- |
| OPEN | IN_PROGRESS, WAITING_FOR_CUSTOMER, RESOLVED, CLOSED |
| IN_PROGRESS | WAITING_FOR_CUSTOMER, RESOLVED, CLOSED |
| WAITING_FOR_CUSTOMER | IN_PROGRESS, RESOLVED, CLOSED |
| RESOLVED | IN_PROGRESS, CLOSED |
| CLOSED | IN_PROGRESS through explicit Admin reopen |

Existing reply transitions remain: member WAITING_FOR_CUSTOMER/RESOLVED → IN_PROGRESS; staff OPEN → IN_PROGRESS. Member CLOSED replies denied; new follow-up ticket allowed. Same-state intent replay emits no new event. Invalid/null status rejected at DB boundary. A new explicit same-state command may return no-op, but cannot invent activity.

Ticket + initial message + initial history + notification effects commit together. Replies and status edits lock the ticket, reauthorize, derive author/staff and time, then append activity. Category/priority filtering is bounded; reference/search cannot bypass RLS. Order linking verifies acting organization is buyer or an actual item seller (`order_items`/`coffee_offers`), not only nullable header seller, and never exposes buyer proof/financial payload to sellers.

### Notification recipients

Reuse existing in-app notifications directly in the domain transaction. Creation receipt confirmation is returned to the creator; a `SUPPORT_TICKET_RECEIVED` event may notify other currently authorized organization recipients, excluding actor. If none exist, no self-notification row is created. Staff reply/status events notify authorized affected members excluding actor; links are resolved under current ticket authorization. Safe localized event types/references carry no subject/message body, bank data or proof path. Request replay and history/message event identity deduplicate delivery. No unimplemented outbox fanout is represented as working delivery.

## Ephemeral View Models

`CartSummary`: context key/epoch, canonical cart ID or null, distinct pending-line count (including unavailable lines), verified-at/version and typed state. Never compute badge from reservation totals or local Add attempts. Source lines may be unavailable but still count. Reads do not create a cart.

Compare: separate namespace of at most three public Coffee slugs versus member offer UUIDs with session/org/capability scope. Session storage holds references only; every comparison resolves fresh eligible projection. There is no database Compare entity. Clear private refs/results on context loss and reject late responses.
