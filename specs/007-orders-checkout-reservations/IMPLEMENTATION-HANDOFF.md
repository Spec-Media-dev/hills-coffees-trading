# Feature 007 — Orders, Checkout & Reservations — Implementation Handoff

**Scope delivered**: RUN A — Phase 1 (Order domain layer & error mapping, T001–T003), Phase 2 (Draft
orders, T004–T006), Phase 3 (Buyer shipment planning, narrow slice, T007). RUN B — Phase 4
(Transactional checkout core, T008–T011) + T006 re-verification against a genuine `HOLD`. See §14.
**Status** (RUN B, 2026-09-13): **T001, T002, T003, T005, T006, T007, T008, T009, T010, T011
implemented and verified (10/32)**. **T004 stays `[BLOCKED — DB-OPEN-13]`** — order creation and
item ADD are implemented and live-proven, but the task's own literal scope also requires item
remove/edit, which the live database does not permit for a buyer (unchanged this run, per
directive). Hold expiry (Phase 5), order views (Phase 6), module registration (Phase 7), the
release-blocking transactional tests (Phase 8) and closure (Phases 9–10) are untouched.
**Feature 007 is NOT complete.**

This document records the live-schema preflight evidence (including two newly-confirmed database
findings this run discovered empirically), the DTO/read/write contracts as actually built, every
honest gap found, the test evidence, and what a future run must know before building on this.

---

## 0. Authoritative-source reconciliation (2026-09-13, before any code was written)

Per the run directive's own instruction ("use the current capability map/report and verified live
function/policy definitions... do NOT infer runtime behavior from an older stale SQL snapshot"), this
run read, in order: the SRS, `docs/database/database-schema-report.json` (generated 2026-09-07),
`docs/architecture/DATABASE-CAPABILITY-MAP.md`, `specs/007-orders-checkout-reservations/{spec,plan,
tasks}.md`, and the LIVE trigger/function bodies (`validate_order_item_offer`, `checkout_order`,
`assert_order_checkout_ready`, `expire_order_hold`, `validate_order_transition`, `can_view_order`,
`organization_can_buy`, `validate_shipment_transition`, `validate_shipment_item`) extracted directly
from that same JSON report using a small Node script (never guessed from planning prose).

**A genuine documentation inconsistency was found and worked through empirically, not assumed away**:
`supabase/trading_schema.sql` (an older baseline dump) and `database-schema-report.json` (2026-09-07)
describe MUTUALLY DIFFERENT versions of `orders`' own INSERT policy and of the `order_shipments`/
`shipment_items` policy set — neither is simply "the current truth." Per the run directive's own
"STOP and report the conflict" instruction, this was resolved by direct LIVE empirical testing against
the real test database (not by picking whichever document was more convenient) — see §2's DB-OPEN-14
finding for the full account. The multi-seller order-item/function contract described in spec.md/
plan.md was independently re-confirmed consistent with the live `order_items.seller_organization_id`
column and `checkout_order()`'s per-item loop (no single-seller SRS conflict found — no STOP was
needed for that question).

---

## 1. What was built

| File | Purpose |
|---|---|
| `lib/orders/validation.ts` | T001 — closed status vocabularies (`ORDER_STATUSES` 12, `PAYMENT_STATUSES` 7, `PROFORMA_STATUSES` 3, `ORDER_SHIPMENT_STATUSES` 13, `ORDER_ITEM_SELLER_TYPES` 2), every DTO a verbatim field mirror, `AddOrderItemInput`/`CreateShipmentInput`/`AddShipmentItemInput` (Zod). |
| `lib/orders/errors.ts` | T002 — `mapOrderError`/`mapShipmentError`: every known raised exception string (RUN-A-reachable AND Phase 4/RUN-B-forward-compatible) mapped to one of 12 new `ACTION_FEEDBACK` codes; safe, redacted fallback logging. |
| `lib/orders/read.ts` | T003 — seven `can_view_order`-scoped read functions: `getOrdersForOrganization`, `getOrderById`, `getOrderItems`, `getOrderFinancials`, `getProforma`, `getOrderStatusHistory`, `getOrderShipments`, `getShipmentItems`. |
| `lib/orders/drafts.ts` | T004/T006 — `createDraftOrder`, `addOrderItem`. DB-OPEN-13/DB-OPEN-14 both documented in this file's own header (see §2). |
| `src/app/dashboard/orders/actions.ts` | T004 — `createOrder` (redirects to the new order on success), `addItemToOrder`. |
| `src/app/dashboard/orders/page.tsx` + `start-order-button.tsx` | T005 — the buyer's own orders list + "start new order" action. |
| `src/app/dashboard/orders/[orderId]/page.tsx` | T005/T006 — items list, `DraftEditor` (add-item form, shown only while DRAFT), `ShipmentPlanner`. |
| `src/app/dashboard/orders/[orderId]/shipment/actions.ts` | T007 — `createShipment`, `addShipmentItem`, `requestShipment` (DRAFT → REQUESTED only). |
| `components/orders/draft-editor.tsx` | T005 — the add-item form (RHF + Zod). |
| `components/orders/shipment-planner.tsx` | T007 — create-shipment form, add-shipment-item form, request-shipment button; three states (no shipment / DRAFT / REQUESTED). |
| `components/orders/order-status-badge.tsx` | T001/T005 — status badge for all 12 `OrderStatus` values, mirrors `components/listings/listing-status-badge.tsx`. |
| `lib/types/action-feedback.ts` (extended) | +12 order/shipment-domain codes. |
| `lib/app/copy/en.ts` / `ar.ts` (extended) | Full `orders.*` tree — EN/AR from day one. |
| `docs/architecture/DATABASE-CAPABILITY-MAP.md` (extended) | +DB-OPEN-13, +DB-OPEN-14 (see §2). |

---

## 2. Database facts inspected, and two NEW confirmed findings

### 2.1 Confirmed live (matches the schema-report.json snapshot)

- `orders.status` CHECK: 12 values, `orders_create_buyer` INSERT policy (`is_org_member AND
  organization_can_buy AND created_by = auth.uid() AND status = 'DRAFT' AND NOT is_blocked_user()`),
  `orders_update_buyer_or_admin` (buyer may UPDATE while DRAFT/CONFIRMED).
- `validate_order_item_offer` (`BEFORE INSERT OR UPDATE`, `SECURITY DEFINER`): requires the parent
  order `DRAFT`, `organization_can_buy`, the offer PUBLISHED/PARTIALLY_FILLED + visible, buyer ≠
  seller org, requested quantity within `quantity_kg - filled - reserved`, and a matching
  `inventory_positions` row with enough `available - reserved`. It DERIVES (never trusts client
  input for) `lot_id`, `seller_organization_id`, `unit_price_per_kg`, `seller_type_snapshot`, and
  (via a `SECURITY DEFINER` join to `coffee_lots`/`coffees`/`origins` that bypasses RLS, so
  DB-OPEN-05 does NOT block this write path) `product_name_snapshot`/`origin_name_snapshot`/
  `lot_code_snapshot`.
- `validate_order_transition`: only `DRAFT -> CONFIRMED` is permitted without `is_internal_transition()`/
  `is_platform_admin()` — every other transition (including anything reaching `HOLD`) requires
  `checkout_order()`'s own internal-transition attestation. `checkout_order()` itself requires the
  order already be `CONFIRMED` (`assert_order_checkout_ready`'s `order_must_be_confirmed_before_
  checkout`) before it will do anything — meaning "confirming" an order is an ordinary, RLS-permitted
  buyer write, conceptually the FIRST step of "checkout," not something `checkout_order()` performs
  itself. RUN A never performs this transition in application code (see §6 for what RUN B must know).
- `order_shipments`/`shipment_items` RLS (live) is genuinely DIFFERENT from `trading_schema.sql`'s own
  baseline shape — the live policies (`shipments_buyer_insert`/`shipments_buyer_draft_update`/
  `shipments_view`/`shipments_warehouse_manage`, `shipment_items_buyer_insert`/`shipment_items_buyer_
  update`/`shipment_items_view`/`shipment_items_warehouse_manage`) are narrower and buyer/warehouse-
  split, matching spec 007's own "buyer plans DRAFT→REQUESTED only" design exactly.
- `validate_shipment_transition`/`validate_shipment_item`: buyer may only move `DRAFT -> REQUESTED`
  (or `CANCELLED`, unused this run); shipment item edits are refused once the shipment leaves DRAFT
  (`shipment_plan_is_closed`); planned quantity may never exceed the order item's own quantity
  (`shipment_plan_exceeds_order_item`).

### 2.2 DB-OPEN-13 (NEW, confirmed live) — `order_items` has no buyer UPDATE/DELETE policy

The live RLS policy set on `order_items` is exactly three: `order_items_create_buyer` (INSERT),
`order_items_view` (SELECT), `order_items_admin` (ALL, admin only) — confirmed against both the
policy list and `trg_order_item_offer`'s own trigger definition (`BEFORE INSERT OR UPDATE` — no
`DELETE` trigger exists either). **A buyer can add an item to a DRAFT order but can never remove or
change its quantity, through any ordinary path, regardless of order status.** This is a genuine gap
against spec 007's own PS1 acceptance scenario 4. Not worked around — `lib/orders/drafts.ts` exports
only `addOrderItem`; the draft-editor UI offers no remove/edit-quantity control. Recorded in the
capability map (§9) for a future product/database decision.

### 2.3 DB-OPEN-14 (NEW, confirmed live, empirically diagnosed) — `orders` INSERT + RETURNING fails RLS

**The most significant discovery this run.** A plain, fully-qualified, buy-capable, non-blocked
buyer session's `INSERT INTO orders` (with every `orders_create_buyer` `WITH CHECK` clause
independently confirmed true via RPC in the SAME session) failed with `"new row violates row-level
security policy for table \"orders\""` — but ONLY when a PostgREST `.select()` was chained to the
insert (triggering `INSERT ... RETURNING`). A plain `.insert()` with no chained `.select()` succeeded
every time, and the row was genuinely, durably created (confirmed via an immediate, separate `SELECT`
in the same session, and independently via a service-role sanity check).

**Root cause, diagnosed empirically (not assumed)**: PostgreSQL applies BOTH a table's INSERT policy
`WITH CHECK` AND its own SELECT policy `USING` clause to a `RETURNING` projection. `orders_view`'s
`USING` is `can_view_order(id)`, and `can_view_order()`'s buyer branch runs a subquery `FROM
public.orders o WHERE o.id = p_order_id ...` — a SELF-reference back onto the SAME table being
inserted into, evaluated against the mid-statement, not-yet-committed new row. `order_items`/
`order_shipments` do NOT exhibit this — their own SELECT policies call `can_view_order(order_id)`
against the ALREADY-existing, already-committed PARENT `orders` row, never self-referencing their own
table — confirmed empirically in the same diagnostic session: `order_items`/`order_shipments`
INSERT+`.select()` both succeeded on the first try.

**Fix (safe, no RLS weakening, no service-role)**: `createDraftOrder` performs a plain `.insert()`
(no chained `.select()`), then a SEPARATE, subsequent read (the same `getOrderById`-shaped query,
already proven to work) to obtain the created row. Two ordinary RLS-respecting round-trips instead of
one — identical security boundary, no bypass of any kind. **This likely affects any FUTURE `orders`
UPDATE+RETURNING too** (e.g., a Phase 4 `DRAFT -> CONFIRMED` action) — flagged here explicitly for
RUN B, which should plan on the same two-step pattern for any `orders` table mutation that needs the
resulting row back. Recorded in the capability map (§9) as **DB-OPEN-14**.

---

## 3. DTO/status vocabulary (T001)

See `lib/orders/validation.ts`'s own header for the full preflight table. In summary: `orders.status`
(12), `payments.status` (7, unused this run), `proforma_invoices.status` (3, unused this run),
`order_shipments.status` (13), `order_items.seller_type_snapshot` (2). Every DTO field name maps
1:1 to its column; `OrderFinancialsDTO`/`ProformaDTO` are pure pass-throughs (`getOrderFinancials`/
`getProforma` both return `null` for every RUN A order, since `checkout_order()` — the only writer of
either table — has never run).

---

## 4. Error mapping (T002)

`lib/orders/errors.ts` carries two tables (`ORDER_ERROR_MAP`, `SHIPMENT_ERROR_MAP`) covering all 29
known raised strings from the six triggers/functions read this run — RUN-A-reachable ones
(`order_items_can_only_change_in_draft`, `buyer_not_authorized`, `listing_is_not_available`,
`cannot_buy_own_listing`, `requested_quantity_not_available`, `inventory_quantity_not_available`,
`order_status_can_only_change_through_workflow`, `invalid_order_transition`,
`terminal_order_cannot_change`, plus all seven shipment-domain strings) proven live in this run's own
tests; the remaining Phase-4/RUN-B-only strings (`order_not_found`, `forbidden`,
`order_must_be_confirmed_before_checkout`, `order_has_no_items`,
`shipment_must_be_ready_before_checkout`, `shipment_quantities_do_not_match_order`,
`listing_inventory_changed`, `seller_not_authorized`, `seller_inventory_changed`) are pre-populated,
documented as not-yet-exercised, so RUN B/C reuse this SAME table rather than inventing a second one.
An unrecognized message falls back to `ORDER_SAVE_FAILED`/`SHIPMENT_SAVE_FAILED` and logs only the
SQLSTATE-shaped `code` field server-side — never the message text, never any payload.

---

## 5. Read layer (T003)

`lib/orders/read.ts`'s seven functions are documented in full in §1's table. The
`organizationId`-scoped functions (`getOrderById`, `getOrdersForOrganization`) exist because RUN A's
own consumers (T004–T007) are all buyer-owned flows; `can_view_order()` itself ALSO grants visibility
to a seller organization with items in the order, but no seller-side order read is built this run (no
task requires it yet) — this is an honest absence, not a narrowing. No function in this file ever
reads `inventory_reservations`/`inventory_reservation_items` (source-verified) — hold state, once
Phase 4/5 exist, will be presented from `orders.status`/`orders.hold_expires_at` alone, already
selected by `getOrderById`.

---

## 6. Draft-order write path (T004) — sequence, allowlists, and what RUN B needs to know

**`createDraftOrder({ organizationId, userId })`**: two-field insert allowlist
(`buyer_organization_id`, `created_by`) — `status`/`currency`/`order_code` all rely on column
defaults. Uses the DB-OPEN-14 two-step pattern (§2.3).

**`addOrderItem({ organizationId, orderId, offerId, quantityKg })`**: re-reads the parent order
(org-scoped) BEFORE attempting the insert — a nonexistent/cross-org order id refuses `ORDER_NOT_FOUND`
identically (no existence leak); a real but non-DRAFT order refuses `ORDER_NOT_EDITABLE` without any
DB write attempted (T006's own defense-in-depth, mirrored by the trigger's own `status <> 'DRAFT'`
check regardless). The insert itself lists exactly THREE fields — `order_id`, `offer_id`,
`quantity_kg` — everything else is server/trigger-derived (§2.1).

**Direct-invocation security proofs (live, `tests/orders/drafts.test.ts`)**: a SUSPENDED-organization
fixture refused `BUYER_NOT_CAPABLE` before any write; a SOLD_OUT listing refused
`ORDER_ITEM_NOT_AVAILABLE`; a CONFIRMED order (constructed via an ordinary, RLS-permitted buyer
`DRAFT -> CONFIRMED` transition, used as TEST SETUP ONLY — never a RUN A application action) refused
`ORDER_NOT_EDITABLE`, proving T006 against the closest real reachable state to `HOLD` (the trigger's
own check is state-agnostic — `status <> 'DRAFT'`, not a `HOLD`-specific rule); forged
`sellerOrganizationId`/`unitPricePerKg`/`status` fields never changed the outcome; no reservation
(`coffee_offers.reserved_quantity_kg` unchanged) and no title transfer
(`inventory_ownership_events` count unchanged).

**What RUN B (Phase 4, checkout) needs to know**:
1. The buyer must reach `CONFIRMED` before `checkout_order()` will do anything
   (`order_must_be_confirmed_before_checkout`) — this transition is an ordinary `orders` UPDATE
   (`orders_update_buyer_or_admin`, `validate_order_transition`'s one non-admin-permitted case), NOT
   something `checkout_order()` performs. RUN A did not build a "confirm" action (it belongs
   conceptually to the checkout flow, out of RUN A's scope) — RUN B should build it as the first step
   of its own checkout Server Action, and should expect the SAME DB-OPEN-14 RETURNING behavior on any
   `orders` UPDATE it performs (plan on a plain `.update()` + separate read, or verify empirically for
   UPDATE specifically before assuming it).
2. `assert_order_checkout_ready` ALSO requires a shipment in `READY`/`RESERVED` status with `ready_at`
   set, and that planned shipment-item quantities exactly match order-item quantities
   (`shipment_quantities_do_not_match_order`) — RUN A's shipment slice only reaches `REQUESTED`
   (Feature 009/warehouse owns the `READY` transition), so a genuinely checkout-ready order cannot
   yet be constructed end-to-end without Feature 009 also existing. This is an honest forward
   dependency, not a RUN A defect.
3. DB-OPEN-13 (§2.2) means a buyer can never correct a wrongly-added item — RUN B/a future product
   decision may need to address this before draft-order UX is considered complete.

---

## 7. Buyer shipment planning (T007)

`createShipment`/`addShipmentItem`/`requestShipment`, each re-verifying order ownership before any
write. Live-proven (`tests/orders/shipment.test.ts`, 6 tests): DRAFT shipment creation; cross-org
order id refused `ORDER_NOT_FOUND`; a within-quantity shipment-item plan succeeds; an over-quantity
plan refuses `SHIPMENT_ITEM_QUANTITY_INVALID` (the trigger's own `shipment_plan_exceeds_order_item`);
`DRAFT -> REQUESTED` succeeds; a subsequent shipment-item attempt against the now-`REQUESTED` shipment
refuses `SHIPMENT_NOT_EDITABLE` (`shipment_plan_is_closed`). Source-level proof: no status beyond
`DRAFT`/`REQUESTED` is ever written or even referenced as a literal in this file.

---

## 8. Design system, i18n, RTL, theme, responsive, accessibility

Every new screen/component reuses existing primitives exclusively: `PageHeader`, `EmptyState`,
`StateScreen`, `TableCardList`, `Field`/`FieldGroup`/`FormActionBar`, `Button`, `Input`, `Separator`,
`InlineAlert`-adjacent inline copy, the `AppBilingual`/`useLocale().tApp` i18n convention, and the
same `--status-*` design tokens already established (`OrderStatusBadge` mirrors
`ListingStatusBadge`'s exact dot + text pattern; 12 statuses share 8 tones, disambiguated by label
text, never color alone). Every user-facing string added this run (order list/detail, add-item form,
shipment planning, all refusal-adjacent copy) has a reviewed EN and AR translation from the start.
Layout uses logical properties (`ps-`/`pe-`/`ms-`/`me-`, `dir="ltr"` scoped only to genuinely-LTR
numeric/currency/phone figures) — no unscoped physical directional class was introduced. The order
list collapses to `TableCardList`'s existing card mode below `lg:`; forms use `FieldGroup`'s existing
responsive grid. **Honest limitation**: no browser/axe accessibility harness was invoked this run —
component-level semantic proofs only (labels via `getByLabelText`, button/link semantics). No
independent browser/theme/breakpoint screenshot verification was performed — structural reuse of
already-verified components/tokens only, stated honestly rather than claimed as a completed T027/T028
pass (both explicitly out of RUN A's scope).

---

## 9. Sonner / cache / service-role audit

- **Sonner**: single existing `useActionToast` convention throughout — no second `Toaster`, no
  duplicate inline-plus-toast for the same field.
- **No shared cache**: no `unstable_cache`/`"use cache"`/`cacheTag`/`cacheLife`/`updateTag`/Redis/
  Upstash anywhere in this run's files (source-verified, `tests/orders/audits.test.ts`).
- **No service-role**: every read/write in this run's files runs through the request-scoped,
  RLS-respecting `createClient()`.
- **No checkout_order()/expire_order_hold() call site**: confirmed via both a source scan of every
  RUN A file and a repo-wide `git grep` scoped to `lib/orders`/`src/app/dashboard/orders` (zero
  matches) — matching T029's own future closure check, verified early.
- **No client-trusted organization/status authority**: every action re-resolves identity/organization
  fresh from `getRequestIdentity()`; insert allowlists are literal object shapes, never a spread of
  `formData`/`parsed.data`.
- **No application-side financial computation**: no file outside `read.ts` even mentions a financial
  column name; `read.ts` itself never combines two financial/quantity fields with arithmetic.

---

## 10. Test evidence

`tests/orders/` — **111 tests, 7 files, all passing**:

- `validation.test.ts` (10): status-vocabulary-matches-CHECK-constraint proofs; forged-field
  stripping; positive-quantity/valid-UUID rejection.
- `errors.test.ts` (33): all 29 known raised strings map correctly; unmapped fallback + redacted
  logging; null/undefined never throws.
- `read.test.ts` (5, live): own-org read, cross-org denial (by id and in list), financials/proforma
  honestly null, status history empty for a fresh order; source-level no-reservation-read proof.
- `drafts.test.ts` (10, live): DRAFT creation; SUSPENDED-org refusal; valid PUBLISHED-listing
  acceptance with no reservation/title-transfer side effect; SOLD_OUT refusal; cross-org/nonexistent
  order refusal (identical); forged-field immunity; CONFIRMED-order edit refusal (T006); DB-OPEN-13
  source proof; no-reservation-write source proof.
- `shipment.test.ts` (6, live): DRAFT shipment creation; cross-org refusal; within-quantity plan
  success; over-quantity refusal; DRAFT→REQUESTED success + post-REQUESTED refusal; no-later-status
  source proof.
- `pages.test.tsx` (6): list-page unauthorized/forbidden/empty states; detail-page `notFound()` for a
  nonexistent/cross-org id; DRAFT renders the add-item form; CONFIRMED renders the honest
  not-editable note instead.
- `audits.test.ts` (41): no checkout_order()/expire_order_hold() call site (file-by-file + repo-wide
  `git grep`), no service-role, no shared cache, no title-transfer reference, no warehouse-progression
  status literal, no financial-column mention outside `read.ts`, no client-trusted insert field.

---

## 11. Regression evidence

- `npm run typecheck` — clean (0 errors).
- Full `npm test` — see the final report's exact before/after counts.
- `npm run build` — clean; `/dashboard/orders`, `/dashboard/orders/[orderId]` register as dynamic
  routes.
- `npm run lint` — scoped re-lint of every RUN A file returns zero issues (full-repo baseline
  unchanged, all pre-existing in `docs/claude-design`).
- `git diff --check` — clean (only pre-existing LF/CRLF warnings).

---

## 12. Honest remaining blockers / forward notes

1. **DB-OPEN-13** — `order_items` has no buyer UPDATE/DELETE RLS policy; a buyer can never correct a
   wrongly-added item. Needs a product/database decision.
2. **DB-OPEN-14** — `orders` INSERT+RETURNING fails RLS (self-referential `can_view_order` SELECT
   policy); worked around with a two-step insert-then-read, safely. Likely affects a future `orders`
   UPDATE+RETURNING too (flagged for RUN B).
3. **T012/T018/T022/T024** (Feature 006) remain exactly as Feature 006 RUN C left them — untouched.
4. **Phase 4 (checkout)** requires: (a) the `DRAFT -> CONFIRMED` transition (an ordinary write, not
   built this run), (b) a shipment reaching `READY`/`RESERVED` with matching planned quantities
   (Feature 009/warehouse-owned, not reachable from RUN A's own `REQUESTED` ceiling) — a genuinely
   checkout-ready order cannot be constructed end-to-end until Feature 009 exists, which is an honest
   forward dependency, not a RUN A defect.
5. **DB-BLOCK-07** (Feature 009, delivery reservation) remains open, untouched, unrelated to this run.
6. No browser/axe accessibility harness was invoked this run (T027/T028 remain fully deferred).

**Recommended next step**: RUN B should implement Phase 4 (T008–T011, checkout execution), starting
with the `DRAFT -> CONFIRMED` transition and `lib/orders/checkout.ts#executeCheckout` as the sole
caller of `checkout_order()`, applying the DB-OPEN-14 two-step read pattern to any `orders` mutation
that needs its resulting row back.

---

## 13. RUN A acceptance reconciliation (2026-09-13)

RUN A's own final report initially left T004 and T006 marked `[x]`. Both were corrected on review,
with **no code or database change** — this section documents the reconciliation and its reasoning.

### 13.1 T004 — corrected `[x]` → `[ ]` `[BLOCKED — DB-OPEN-13]`

T004's own literal scope is "create a `DRAFT` order and add/remove items." Create and add are
implemented and live-proven (§6); remove/edit is not, and cannot be, through any RLS path available
to a buyer. This reconciliation re-inspected the question of whether an alternate buyer-safe
mechanism had been missed:

- `order_items` has exactly three live RLS policies: INSERT (buyer), SELECT (buyer/seller via
  `can_view_order`), and `ALL` (admin only). No buyer UPDATE, no buyer DELETE.
- `orders` itself has no buyer DELETE policy either (`orders_create_buyer` is INSERT-only,
  `orders_update_buyer_or_admin` is UPDATE-only) — so "discard the whole draft and start over" is
  ALSO not available as a workaround.
- No `SECURITY DEFINER` RPC exists that would let a buyer remove/adjust an item either (the function
  list contains no such capability).

**Conclusion: (B) — DB-OPEN-13 genuinely blocks remove/edit.** No alternate mechanism was missed. No
RLS bypass, no service-role, and no database migration were used or considered to close this, per the
reconciliation directive's own explicit instruction. T004 is corrected to `[ ]` `[BLOCKED —
DB-OPEN-13]`; `createDraftOrder`/`addOrderItem` remain implemented, unchanged, and correctly
described as proven for exactly what they do (create + add).

**T005/T006 UI check**: `components/orders/draft-editor.tsx` and `src/app/dashboard/orders/
[orderId]/page.tsx` were re-inspected for any remove/edit-quantity control that could never succeed
because of DB-OPEN-13 — none exists. The items list is read-only; the add-item form is the only
interactive control, and its write path genuinely works. T005 is therefore unaffected by T004's
correction (its own Verify line concerns display and the no-quantity/price-into-checkout constraint,
neither of which depends on remove/edit existing) and remains `[x]`.

### 13.2 T006 — corrected `[x]` → `[ ]` `[BLOCKED LIVE PROOF — requires real HOLD from Phase 4]`

T006's own literal Verify line names `HOLD` specifically: "editing an order in `HOLD` is refused
server-side even when invoked directly." RUN A's own live proof used `CONFIRMED`, not `HOLD`, because
`HOLD` can only be reached via `checkout_order()` (Phase 4, out of RUN A's scope). Implementing
`checkout_order()` early, purely to manufacture a genuine `HOLD` order and close this one checkbox,
would itself violate the run's own explicit "do not implement future-run behavior early" boundary —
this reconciliation does not do that.

**Conclusion**: T006 is corrected to `[ ]` `[BLOCKED LIVE PROOF — requires real HOLD from Phase 4]`.
The `CONFIRMED`-status proof is retained as supporting evidence (it exercises the identical
`status <> 'DRAFT'` trigger predicate `HOLD` would, and is itself genuine, live, unfabricated
evidence) — but it is recorded as supporting evidence for the underlying guard, not substituted as if
it satisfied the literal `HOLD` requirement. T006 closes alongside Phase 4, once a genuine `HOLD`
order exists to test against.

### 13.3 Corrected status count

**5/32** (T001, T002, T003, T005, T007 `[x]`; T004 and T006 `[ ]`, both explicitly blocked with
reasons recorded in `tasks.md`). Down from the previously reported 7/32 — the correction removes two
tasks that were checked before their own literal acceptance criteria were fully satisfied; no other
task's status changed.

### 13.4 Does DB-OPEN-13 need to be resolved before RUN B?

**No — RUN B can safely proceed while DB-OPEN-13 remains an explicit, documented blocker**, with an
important distinction:

- **Technically possible checkout from a correctly-created draft**: YES, unaffected. `checkout_order()`
  operates on whatever `order_items` rows already exist on a `CONFIRMED` order at the moment it is
  called — it has no dependency on a buyer's ability to have EDITED or REMOVED an item beforehand.
  DB-OPEN-13 blocks a buyer CORRECTING a mistake, not the checkout function's own atomic operation
  over the rows that exist. RUN B's Phase 4 (T008–T011) can be implemented and tested against
  correctly-created drafts today.
- **Complete Feature 007 draft-order UX acceptance**: NOT satisfied while DB-OPEN-13 stands — a buyer
  who adds a wrong listing/quantity currently has no in-product way to fix it (short of it being
  refused later by `checkout_order()`'s own availability re-check, or contacting Hills support out of
  band). This is a genuine UX completeness gap, not a transactional-safety one, and should be
  resolved (by an approved database change adding buyer-scoped UPDATE/DELETE policies on
  `order_items` while `DRAFT`, or a deliberate product decision that "start a new order" is the
  accepted correction path) before Feature 007 as a WHOLE is considered done — but it does not block
  RUN B's own transactional work from starting or being verified.

### 13.5 Reconciliation checks run

- `specs/007-orders-checkout-reservations/tasks.md` — T004/T006 checkboxes and status line corrected;
  checkbox count verified via `grep -oE "^\- \[[ x]\] T0[0-9]+"` — exactly 5 `[x]` (T001, T002, T003,
  T005, T007), 27 `[ ]`.
- `IMPLEMENTATION-HANDOFF.md` (this file) — header/status corrected; this §13 added.
- `docs/architecture/DATABASE-CAPABILITY-MAP.md` — DB-OPEN-13/DB-OPEN-14 left exactly as recorded;
  no edit made in this reconciliation (no new finding, no DB change).
- `git diff --check` — clean (only pre-existing LF/CRLF warnings).
- No file under `lib/`, `src/`, or `components/` was touched in this reconciliation — confirmed via
  `git status --short` showing only the two spec/doc files above as newly modified since the RUN A
  report.

---

## 14. RUN B (Phase 4 — transactional checkout core) — T008–T011, T006 re-verification

### 14.1 What was built

| File | Purpose |
|---|---|
| `lib/orders/checkout.ts` | T008 — `executeCheckout(orderId)`, the ONE application caller of `checkout_order()`. |
| `src/app/dashboard/orders/[orderId]/checkout/actions.ts` | T009 — `confirmCheckout` (thin: reads `orderId` only → `executeCheckout` once → redirect). |
| `src/app/dashboard/orders/[orderId]/checkout/page.tsx` | T009 — review page: item quantity/kg, unit-price snapshot/currency, delivery plan, readiness notice, NO computed total. |
| `components/orders/checkout-confirm-button.tsx` | T009/T011 — confirm control (pending/disabled/`aria-busy`), localized failure toasts, inline availability-failure recovery panel. |
| `components/orders/hold-countdown.tsx` | T010 — countdown fed ONLY `orders.hold_expires_at`; `role="timer"` + minute-granularity polite summary. |
| `src/app/dashboard/orders/[orderId]/page.tsx` (extended) | T010 — HOLD outcome panel (status, stored `hold_expires_at`, proforma code, buyer total) + `order_financials` pass-through section + "Proceed to checkout" entry. |
| `lib/orders/validation.ts` / `read.ts` (extended) | `OrderSummary.idempotencyKey` (selected, never rendered) + `CheckoutResult` (verbatim RPC shape). |
| `lib/types/action-feedback.ts` (extended) | +`ORDER_CHECKOUT_NOT_READY`. |
| `lib/app/copy/en.ts` / `ar.ts` (extended) | `orders.checkout.*`, `orders.hold.*`, `orders.financials.*`, `detail.checkoutAction`, shipment `READY`/`RESERVED` labels — EN/AR. |
| `scripts/seed-test-fixtures.ts` (extended) | Feature 007 checkout fixtures (`lotD`/`hillsPositionD`/`offerCheckout`), `--reset-checkout-fixtures`, `--inspect-checkout-order=<id>` (test-only privileged setup/read). |
| `tests/auth/fixture-session.ts` (extended) | `CHECKOUT_FIXTURES`, `resetCheckoutFixtures()`, `inspectCheckoutOrder()`. |
| `tests/orders/{checkout,checkout-action,checkout-page,audits,pages}.test.*` | RUN B tests + reconciled RUN A tests. |

### 14.2 Database functions inspected (live bodies) and the EXACT checkout-ready contract

`checkout_order`, `assert_order_checkout_ready`, `validate_order_transition`, `validate_shipment_
transition`, `sync_shipment_ready`, `is_internal_transition`, `is_warehouse_operator`, plus the
`function_grants` (`checkout_order`/`expire_order_hold` are EXECUTE-granted to `authenticated`).

**Before `checkout_order()` will do anything** (`assert_order_checkout_ready`, called by the function
and again by `validate_order_transition` on the move to `HOLD`):
1. `orders.status = 'CONFIRMED'` (`order_must_be_confirmed_before_checkout`);
2. `organization_can_buy(buyer org)` (`buyer_not_authorized`);
3. ≥ 1 `order_items` row (`order_has_no_items`);
4. an `order_shipments` row in `READY`/`RESERVED` with `ready_at IS NOT NULL`
   (`shipment_must_be_ready_before_checkout`);
5. per order item, planned `shipment_items` quantity over non-CANCELLED/FAILED shipments equals the
   item quantity (`shipment_quantities_do_not_match_order`).

Then, in ONE transaction (order locked `FOR UPDATE`): financial snapshot (base/shipping/VAT/
commission/buyer total with tier + tax-rule snapshots) → proforma + items → `inventory_reservations`
+ one `inventory_reservation_items` per item (inventory reserved FIRST, listing mirrored second) →
`payments` `PENDING` → order `HOLD`, `hold_expires_at = now() + 20 minutes`. Idempotent-retry branch:
`HOLD`/`PAYMENT_PROOF_SUBMITTED`/`PAYMENT_UNDER_REVIEW` with an ACTIVE reservation → returns the
existing ids/total with `idempotent_retry: true`.

### 14.3 `DRAFT -> CONFIRMED` — required, implemented through the buyer's own write path

(1) above is a genuine prerequisite the function does NOT perform itself. `validate_order_
transition` (live) permits exactly `DRAFT -> CONFIRMED` for a plain buyer session (everything else
needs `is_internal_transition()`/`is_platform_admin()`); `orders_update_buyer_or_admin` allows the
buyer to UPDATE while `DRAFT`/`CONFIRMED`. `executeCheckout` performs the transition via an ordinary
`.update({ status: "CONFIRMED", idempotency_key })` — ONLY after readiness checks (3)–(5) pass over
the buyer's own readable rows, because the transition is one-way for a buyer (`CONFIRMED` →
`HOLD`/`VOID` only, neither buyer-settable) and confirming an order the database would certainly
refuse would strand it. The database re-validates (1)–(5) itself regardless. Live-proven: the
order's status history reads exactly `DRAFT->CONFIRMED`, `CONFIRMED->HOLD`.

### 14.4 DB-OPEN-14 handling

Every `orders` UPDATE in `checkout.ts` is a plain `.update()` with no chained `.select()`; the row is
re-read separately via `getOrderById` and the write is verified from that read (status `CONFIRMED`,
key present) before the RPC is called. No policy was weakened; no service-role.

### 14.5 `executeCheckout` security sequence (as implemented, 12 steps)

validate UUID → `getRequestIdentity()` → acting org resolved server-side → `isAuthorizedMember` →
`organization.canBuy` → org-scoped `getOrderById` (cross-org/nonexistent → `ORDER_NOT_FOUND`, RPC
never reached) → retry short-circuit for post-checkout statuses → readiness (3)–(5) →
server-generated idempotency key + confirm write → separate re-read → ONE `rpc("checkout_order")` →
`mapOrderError` → verbatim `CheckoutResult`. Only input: `orderId`. No amount, price, quantity,
seller, hold duration, key or total exists anywhere in the request shape.

### 14.6 Idempotency lifecycle — and an honest note

`orders.idempotency_key` is generated once per checkout intent (`randomUUID()`, server-side), the
first time an order enters checkout, and persisted in the same write that confirms the order; a
retry finds it set and never rotates it; a client cannot supply one (no field exists). HONEST
CONTRACT NOTE: `checkout_order()` itself does not read `idempotency_key` — its retry safety is keyed
on status + ACTIVE reservation. The key is therefore the server-owned, non-forgeable per-intent
marker SEC-005 asks for; the no-duplicate guarantee is the function's own retry branch, observed
live: a second `executeCheckout` on the HOLD order returned `idempotent_retry: true`, the same
reservation/proforma ids and total, with the key unchanged and still exactly one reservation,
proforma and payment.

### 14.7 RPC result mapping (T008/T010)

`CheckoutResult` is a key-for-key mirror of the function's `jsonb` (`order_id`, `proforma_id`,
`reservation_id`, `buyer_total`, `hold_expires_at`, `correlation_id`, `idempotent_retry`). Nothing is
derived, rounded or recomputed. Live: `buyer_total` equals `order_financials.buyer_total_amount` AND
`payments.amount`; the order's `hold_expires_at` equals the RPC's.

### 14.8 Checkout page/action, HOLD presentation, countdown, financial/proforma pass-through

Described in §14.1. The review page shows only stored snapshots and an explicit note that shipping/
VAT/total are calculated by the platform at confirmation (no fake total). The detail page's HOLD
panel and financials section are pure pass-throughs. `HoldCountdown` derives only from the
`holdExpiresAt` prop (source-verified: no `+20`, no `holdStartedAt`/`createdAt`), `role="timer"`
(implicit `aria-live="off"`) plus a visually-hidden polite summary that changes only per minute.

### 14.9 Availability failure path (T011) and DB-OPEN-13 impact on recovery

Forced live: two ready orders for 30 kg each against the 50 kg checkout listing (5 kg already held)
— the first reserves, the second is refused by the function's own `listing_inventory_changed`
(the RPC IS exercised), mapped to `ORDER_ITEM_QUANTITY_UNAVAILABLE`, zero raw text, and ZERO partial
artefacts for the loser (no financials/proforma/payment/reservation; mirrors read 35, never 65).
Recovery is honestly constrained: the losing order is left `CONFIRMED` (the buyer-side confirm is a
separate statement; the RPC's effects roll back) and — because of DB-OPEN-13 — its items cannot be
edited or removed, nor can a buyer move it back to `DRAFT` or `VOID`. The UI therefore offers only
routes that genuinely work ("Start a new order", "Back to marketplace") and says so. No working
Remove/Edit control was added. T004/DB-OPEN-13 untouched.

### 14.10 Feature 009 forward dependency — confirmed, and how the tests handle it honestly

Requirement (4) is warehouse-owned: `validate_shipment_transition` lets a buyer reach only
`REQUESTED`; `READY` requires `is_warehouse_operator()` (then `sync_shipment_ready` sets `ready_at`).
A buyer-only flow cannot produce a checkout-ready order today. The tests establish the precondition
through the repository's EXISTING `warehouse-admin` fixture identity — a real
`platform_admins.role = 'WAREHOUSE'` session moving the shipment `REQUESTED -> READY` under ordinary
RLS (`shipments_warehouse_manage`) + trigger authority. This is NOT service-role and NOT a manual
flag; it is the database's own authoritative path exercised by a real operator session, used as
TEST-ONLY precondition setup. **Live-vs-structural boundary**: (A) `checkout_order()`'s behaviour
given an authoritative valid precondition is proven LIVE; (B) the buyer→warehouse readiness
workflow/UI is Feature 009's to build and prove — nothing here claims it. In production today, the
checkout page shows the honest "warehouse hasn't confirmed delivery readiness" notice and keeps
confirmation disabled until Feature 009 exists.

### 14.11 T006 re-verification

A genuine `HOLD` order (produced by the normal checkout) was directly edited: `addItemToOrder`
refuses `ORDER_NOT_EDITABLE`; a raw `order_items` insert bypassing the application is refused by the
database itself; the order still holds one item. T006 moved to `[x]`.

### 14.12 EN/AR, RTL, Light/Dark, responsive, accessibility — evidence

All new strings have EN + AR from day one; logical properties only; semantic tokens only
(`--status-review*` for the HOLD panel, `--danger*` for the recovery panel — both with text, never
color alone); the review/detail pages reuse RUN A's own list pattern and grid utilities, collapsing
to one column below `sm:`. **Honest limitation**: no browser/axe harness was invoked; no
screenshot/breakpoint/theme verification was performed — structural reuse of already-verified
primitives/tokens only. Component-level a11y proofs: labelled `role="timer"`, polite minute-only
summary, `aria-busy` on the pending confirm, `role="alert"` recovery panel, `<Link>` (not `<a>`) for
in-app routes, `nativeButton={false}` on the link-rendered Buttons this run added (avoids adding new
instances of the known Base UI dev warning). T027 is NOT claimed.

### 14.13 Audits (all source-verified in `tests/orders/audits.test.ts` / `checkout.test.ts`)

`checkout_order`: exactly one code reference repo-wide (`lib/orders/checkout.ts`, one `.rpc(` call
site); `expire_order_hold`: zero. No runtime service-role, no shared cache, no reservation-table
read/write, no financial computation, no proforma/payment/ownership-event write, no per-seller
loop, no payment/escrow/provider code (Feature 008 untouched), no title transfer (live:
`inventory_ownership_events` count unchanged across checkout).

### 14.14 Tests and regression

`tests/orders/` — **156 tests, 10 files** (RUN A 111 + `checkout.test.ts` 16 live +
`checkout-action.test.ts` 6 + `checkout-page.test.tsx` 8 + audits grew to 56 with the RUN B files
under every existing audit). Two genuine RUN A test reconciliations: `pages.test.tsx`'s read mock
gained `getOrderFinancials`/`getProforma` (the detail page now reads them); `createOrder` dropped its
two unused parameters (lint hygiene; `drafts.test.ts` call updated). Full-suite/typecheck/build/lint/
`git diff --check` results are in the final RUN B report.

### 14.15 Blockers remaining / recommended RUN C

1. **T004 / DB-OPEN-13** — unchanged; a buyer still cannot correct an added item, and after a failed
   checkout the order stays `CONFIRMED` with no buyer-side way back. Needs a product/database
   decision before Feature 007's draft UX is complete.
2. **Feature 009 forward dependency** — a checkout-ready order requires a warehouse `READY`
   shipment; buyer-only flows stop at `REQUESTED` today (§14.10).
3. **DB-OPEN-14** — unchanged; the two-step write-then-read pattern now covers `orders` UPDATE too.
4. **Lazy expiry** — nothing calls `expire_order_hold()` yet (Phase 5 is the next run); holds created
   by tests persist until then (the `--reset-checkout-fixtures` teardown removes test orders).
5. **Recommended RUN C**: Phase 5 (T012–T014, `lib/orders/expiry.ts#ensureHoldFresh` as the sole
   `expire_order_hold()` caller + expired-hold presentation + the documented lazy-expiry limitation)
   and Phase 6 (T015–T017, buyer order list/detail views + `financial-summary.tsx`/monospace code
   discipline), consuming the HOLD/financial/proforma reads already proven here.
