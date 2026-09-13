# Feature 007 — Orders, Checkout & Reservations — Implementation Handoff

**Scope delivered**: RUN A — Phase 1 (Order domain layer & error mapping, T001–T003), Phase 2 (Draft
orders, T004–T006), Phase 3 (Buyer shipment planning, narrow slice, T007). RUN B — Phase 4
(Transactional checkout core, T008–T011) + T006 re-verification against a genuine `HOLD` (§14).
RUN C — Phase 5 (Lazy hold expiry, T012–T014), Phase 6 (Order views, T015–T017), Phase 7 (Module
registration, T018) (§15). RUN D — Phase 8 (Release-blocking transactional tests, T019–T025) (§16).
**Status** (RUN D, 2026-09-13): **T001–T003, T005–T025 implemented and verified (24/32)**. **T004
stays `[BLOCKED — DB-OPEN-13]`** (unchanged). Phase 9 (states/a11y/RTL/mobile closure, T026–T027) and
Phase 10 (verification/closure, T028–T032) are untouched. New database finding **DB-OPEN-16** (final
remaining kilograms of a listing cannot be checked out; fails closed). The hold-expiry scheduler
decision remains OPEN (lazy expiry only). **Feature 007 is NOT complete.**

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

---

## 15. RUN C (Phase 5 hold expiry, Phase 6 order views, Phase 7 module registration) — T012–T018

### 15.1 What was built

| File | Purpose |
|---|---|
| `lib/orders/expiry.ts` | T012/T013 — `ensureHoldFresh(orderId)` (the ONE `expire_order_hold()` caller) + `requireFreshHold(orderId)` (the pre-payment boundary). |
| `lib/orders/read.ts` (extended) | `getOrderFinancialsForOrders` (page-keyed, bounded), `getPaymentStatus` (display-only), `getOrderCountsForOrganization` (two org-scoped COUNT reads), `mapFinancialsRow` shared. |
| `src/app/dashboard/orders/page.tsx` (rewritten) | T015 — list: monospace code, status + "Held until", stored buyer total with currency, created/updated, lazy expiry for stale holds on the page. |
| `src/app/dashboard/orders/[orderId]/page.tsx` (rewritten) | T016 — `ensureHoldFresh` first, then items / `FinancialSummary` / proforma / payment status / shipment plan / status history / HOLD countdown / expired panel. |
| `components/orders/financial-summary.tsx` | T017 — pure presentational financial snapshot. |
| `components/orders/hold-countdown.tsx` | T017 — RUN B's component preserved unchanged (already met the acceptance). |
| `lib/dashboard/registry.tsx` (extended) | T018 — `orders` module (`trading` group, `requiredCapability: "buy"`) + "What did I buy?" / "What do I owe?" cards. |
| `lib/types/action-feedback.ts` (extended) | +`ORDER_HOLD_EXPIRED`. |
| `lib/app/copy/en.ts` / `ar.ts` (extended) | `orders.expired.*`, `orders.payment.*`, `orders.history.*`, `orders.listExtra.*`, `orders.nav.*`, `orders.overview.*` — EN/AR. |
| `scripts/seed-test-fixtures.ts` / `tests/auth/fixture-session.ts` (extended) | `--age-checkout-hold=<id>` / `ageCheckoutHold()` — test-only "force expiry" (backdates the reservation's `expires_at` only). |
| `docs/architecture/DATABASE-CAPABILITY-MAP.md` (extended) | +DB-OPEN-15 (§15.4). |
| `specs/.../spec.md` (narrow reconciliation) | Open Items: (a) lazy expiry implemented, (b) scheduler still OPEN. |
| `tests/orders/{expiry,views}.test.*`, `tests/orders/live-helpers.ts`, reconciled `audits`/`pages`/`checkout-page`/`tests/dashboard/registry` tests | RUN C tests. |

### 15.2 Expiry flow and function authority (T012)

`expire_order_hold(p_order_id)` (live body): locks the order's ACTIVE `inventory_reservations` row
with `expires_at <= now()` (silent no-op otherwise); per reservation item releases
`inventory_positions.reserved_quantity_kg` first, then the `coffee_offers` mirror (both
`greatest(… − qty, 0)`); reservation → `EXPIRED`; `payments` → `EXPIRED`; order (`HOLD`/
`PAYMENT_PROOF_SUBMITTED`/`PAYMENT_UNDER_REVIEW`) → `EXPIRED` under its own internal-transition
attestation. Idempotent by construction. The function carries NO caller check — which is exactly why
the application boundary must: `ensureHoldFresh` validates the id, resolves identity + acting org,
reads the order org-scoped (cross-org/nonexistent → `ORDER_NOT_FOUND`, RPC never reached), inspects
`orders.status` + `orders.hold_expires_at`, mutates nothing when not stale, and otherwise makes the
ONE `rpc("expire_order_hold")` call followed by a separate authorized re-read (DB-OPEN-14 pattern).
It never reads `inventory_reservations`/`inventory_reservation_items`, never writes a reserved
quantity, status or history row.

**Sole-caller evidence**: repo-wide `git grep --untracked` (comments stripped) finds
`expire_order_hold` in code only in `lib/orders/expiry.ts` (one `.rpc(` site) and `checkout_order`
only in `lib/orders/checkout.ts` — both asserted in `tests/orders/audits.test.ts` and
`tests/orders/expiry.test.ts`.

**Double-release proof (live, `tests/orders/expiry.test.ts`)**: a genuine 4 kg HOLD (real checkout)
→ reservation backdated (test-only) → first `ensureHoldFresh`: exactly one RPC, order `EXPIRED`,
listing AND inventory reserved down by exactly 4 (never negative), payment `EXPIRED`, still one
proforma and one payment, zero ownership events, history `DRAFT->CONFIRMED, CONFIRMED->HOLD,
HOLD->EXPIRED` → second `ensureHoldFresh`: zero RPC, mirrors unchanged → a direct second
`expire_order_hold` call: nothing further released → the released 4 kg is purchasable again (a new
4 kg order checks out). Unexpired HOLD and DRAFT: zero RPC, nothing mutated. A cross-org caller
cannot trigger another organization's expiry (refused before the RPC; the reservation stays ACTIVE).
Formal Phase 8 T021 (concurrent double-run) is NOT claimed by this.

**Deterministic forced expiry, honestly**: a 20-minute hold cannot be waited out; the approved
test-only fixture backdates ONLY `inventory_reservations.expires_at` (no triggers on that table; the
one column the function consults). `orders.hold_expires_at` cannot be backdated at all (DB-OPEN-15,
§15.4), so `ensureHoldFresh` takes an optional reference instant (`{ now }`) — a test seam with a
server-clock default, never passed by production code (source-asserted), and never able to release
anything early since the database alone decides the real release.

### 15.3 Lazy expiry — the operational limitation (T014), pre-payment contract (T013)

No scheduler is approved and none was added (asserted: no cron/pg_cron/Edge scheduler/worker/queue
reference in application code, config or the live function list). A stale hold is processed ONLY
when an approved read/action touches it: the order detail page (always, first), the orders list
(for stale holds on the page being shown), and `requireFreshHold`. An order nobody revisits keeps its
reserved quantity withheld until touched. Stated in `expiry.ts`'s header, here, and in spec.md's
Open Items (narrow status note; the scheduler decision is deliberately NOT closed).

`requireFreshHold(orderId)` runs lazy expiry, then refuses with `ORDER_HOLD_EXPIRED` unless the order
is a fresh `HOLD` (live-proven: expired → refused; DRAFT → refused; fresh HOLD → accepted). **Feature
008's real payment / payment-proof / escrow Server Action MUST call it first.** Feature 007 implements
no payment proof, provider, escrow, webhook, settlement or fund-release logic (source-audited).

### 15.4 DB-OPEN-15 (NEW, empirically confirmed)

`validate_order_transition` runs `assert_order_checkout_ready(new.id)` unconditionally whenever
`new.status = 'HOLD'`, so ANY UPDATE that leaves an order in `HOLD` — even a service-role update of a
single unrelated column — is refused with `order_must_be_confirmed_before_checkout` (confirmed live
this run with a service-role `hold_expires_at` UPDATE attempt). Consequences: `hold_expires_at` is
effectively immutable after checkout; `idempotency_key` cannot be written once on HOLD (RUN B
already writes it in the confirming UPDATE); a future feature writing to a HOLD order must do so via
a status change. Recorded in the capability map §9; not worked around.

### 15.5 Order views (T015/T016/T017)

**List**: server-resolved acting org; one bounded, deterministic page (`created_at DESC, id DESC`,
`range`, `MAX_PAGE_SIZE` 100) via `lib/orders/read.ts` only; one page-keyed `order_financials` read
(`.in("order_id", ids)`); stored buyer total with currency ("—" when no snapshot — never fabricated);
"Held until <hold_expires_at>" for HOLD; all 12 `orders.status` labels EN+AR, 1:1 (one test per
status); own-org isolation and cross-org absence live-proven (`read.test.ts`); `TableCardList`'s
own table→card behaviour. Stale rows on the page are picked by `lib/orders/expiry.ts#selectStaleHolds`
(pure selection, server clock read outside React render — the `react-hooks/purity` rule rejects
`Date.now()` inside a server component), each passed through `ensureHoldFresh`, then the page is
re-read so the rendered rows are the database's post-expiry truth.

**Detail**: `ensureHoldFresh` FIRST (position-proven in source and by call order), rendering the
order it returned; then items (kg, unit-price snapshot, currency), `FinancialSummary` (verbatim
pass-through — subtotal/shipping/VAT/quantity/total; commission and seller-net deliberately NOT
shown to buyers), proforma code, internal `payments.status` label (display only — no action),
shipment plan (read-only past DRAFT; no warehouse controls), status history (labelled old→new,
timestamp, safe reason), HOLD countdown only for a fresh HOLD, expired panel only for `EXPIRED`,
neither for any other status. Cross-org/nonexistent id → `notFound()`.

**Components**: `hold-countdown.tsx` unchanged from RUN B — derives only from `hold_expires_at`,
`role="timer"` (implicit `aria-live="off"`, ticks never announced), visually-hidden polite summary
changing once per minute and announcing the expired state, no animation (reduced-motion safe).
`financial-summary.tsx` — pure presentational, no arithmetic (source-asserted), money always with
currency, quantity always with kg, monospace. Order/proforma codes: monospace + `break-all` wrapping.

### 15.6 Module registration (T018)

`orders` module in `lib/dashboard/registry.tsx` — one `orders` entry, `requiredCapability: "buy"`,
merged into the existing `trading` nav group (no second nav system). Visible to buyer-only AND
seller+buyer organizations (never hidden because `canSell` is true), hidden for a non-buy-capable
organization — proven in `tests/dashboard/registry.test.tsx` (reconciled + new T018 test). Nav
hiding is presentational only: every `/dashboard/orders/*` page re-verifies server-side. Overview
cards "What did I buy?" (PAID/FULFILLMENT_IN_PROGRESS/PARTIALLY_DELIVERED/COMPLETED count) and "What
do I owe?" (HOLD/PAYMENT_PROOF_SUBMITTED/PAYMENT_UNDER_REVIEW count) come from
`getOrderCountsForOrganization` — two bounded, org-scoped, COUNT-only reads of stored statuses; no
financial aggregation; zero-count cards omitted.

### 15.7 DB-OPEN-13 / DB-OPEN-14 / Feature 009 boundary

DB-OPEN-13 unchanged: no remove/edit control anywhere (the expired panel offers only "Start a new
order"/"Back to marketplace"). DB-OPEN-14 unchanged: no `orders` write in RUN C at all (expiry is the
function's own write). Feature 009: RUN C writes no shipment state; the READY precondition used by
tests is established by the real `warehouse-admin` fixture session (RUN B's convention).

### 15.8 EN/AR, RTL, Light/Dark, responsive, browser/axe — evidence

All new strings EN+AR; logical properties; semantic tokens (`--status-review*` HOLD panel,
`--danger*` expired panel, text always present, never color-only); `TableCardList` card mode below
`lg:`; financial grid collapses 5→2→1 columns. **Honest limitation**: no browser/axe harness was
invoked; no screenshot, breakpoint or theme verification was performed this run — structural reuse
of already-verified primitives/tokens only. T026/T027 NOT claimed.

### 15.9 Audits

`checkout_order` sole caller `lib/orders/checkout.ts`; `expire_order_hold` sole caller
`lib/orders/expiry.ts`; no runtime service-role; no shared cache; no direct reservation write; no
member reservation-table read; no financial recomputation; no manual payment write; no
escrow/provider code; no title transfer (live: ownership-event count unchanged across expiry); no
warehouse-progression write; no DB-OPEN-13 workaround.

### 15.10 Tests, task map, next run

`tests/orders/` — **199 tests, 12 files** (RUN B 156 + `expiry.test.ts` 13 + `views.test.tsx` 24 +
audits extended; `live-helpers.ts` shared). Reconciled: `pages.test.tsx`/`checkout-page.test.tsx`
mock the new expiry/read functions; `tests/dashboard/registry.test.tsx` expects the `orders`
module. Task map: T001–T003 `[x]`, T004 `[ ]` [BLOCKED — DB-OPEN-13], T005–T018 `[x]`, T019–T032
`[ ]` — **17/32**. Recommended next: **Phase 8 (T019–T025)** — the release-blocking transactional
tests (concurrency, idempotency, expiry idempotence under concurrent invocation, mirror consistency,
no-title-transfer, authorization, error mapping), using `tests/orders/live-helpers.ts` +
`inspectCheckoutOrder`/`ageCheckoutHold`; a high-reasoning model (Opus-class) per tasks.md's own
Codex/Claude column, because T019/T021's concurrency tests must be genuinely concurrent, not
accidentally serialised.

---

## 16. RUN D (Phase 8 — release-blocking transactional tests) — T019–T025

Run on 2026-09-13 against the live test database. Everything below was proven through ordinary member
sessions under RLS; privileged access was used only through the approved test-only fixture script
(`--reset-checkout-fixtures`, `--inspect-checkout-order`, NEW `--inspect-checkout-mirrors`,
`--age-checkout-hold`, `--set-suspended-organization-status`), never as the behaviour under test.

### 16.1 What was built

| File | Purpose |
|---|---|
| `tests/orders/concurrency.test.ts` (NEW, 3) | T019 — genuine concurrent checkout race + control race. |
| `tests/orders/idempotency.test.ts` (NEW, 5) | T020 — sequential duplicate, concurrent double submit, post-failure retry, DB-layer dedupe honesty. |
| `tests/orders/expiry.test.ts` (+2 → 15) | T021 — two concurrent expiry attempts (application path and database path). |
| `tests/orders/mirror-consistency.test.ts` (NEW, 2) | T022 — zero-drift lifecycle incl. partial quantity; DB-OPEN-16 characterization. |
| `tests/orders/no-title-transfer.test.ts` (NEW, 3) | T023 — ledger/owner unchanged across checkout, retry, refusal, expiry; source + baseline audits. |
| `tests/orders/authorization.test.ts` (NEW, 10) | T024 — two-layer authorization, tenant isolation, `can_view_order` scoping. |
| `tests/orders/error-mapping.test.ts` (NEW, 12) | T025 — completeness vs baseline, live errors, fallback/logging, leakage audits. |
| `tests/orders/audits.test.ts` (+4) | Repo-wide audits over every file under the three Feature 007 production roots. |
| `tests/orders/live-helpers.ts` (extended) | `liveClientScope()` (AsyncLocalStorage per-flow client), `installRpcBarrier()` (explicit concurrency barrier with in-flight proof), `buildRequestedOrder(…, plannedKg)`. TEST-ONLY; audited never imported by production. |
| `scripts/seed-test-fixtures.ts`, `tests/auth/fixture-session.ts` (extended) | Inspection now also returns `financials`, `statusHistory`, `lotOwnershipEventCount`, the order's hold/intent columns and `idempotencyKeyHistory` (distinct keys across `audit_logs` versions of the row); new `inspectCheckoutMirrors()`. Read-only, test-only. |
| `lib/orders/checkout.ts` (production fix) | §16.9. |
| `lib/orders/errors.ts` (production fix) | §16.9. |
| `docs/architecture/DATABASE-CAPABILITY-MAP.md` | +DB-OPEN-16. |

### 16.2 T019 — double-sell protection under genuine concurrency

- **Fixture**: dedicated 50 kg PUBLISHED HILLS listing (`offerCheckout`) on its own 1000 kg position;
  reset before every test. Available = 50; each contender wants 30; 30 + 30 > 50, 30 ≤ 50.
- **Parallelism guarantee**: both `executeCheckout` flows start in the same synchronous turn
  (`Promise.allSettled`), each inside `liveClientScope().run(client, …)`; `installRpcBarrier` holds each
  `checkout_order` call until both arrive and releases them in the same microtask turn; every run
  asserts `allInFlightTogether()` (last dispatch ≤ first response). A flow that never reaches its RPC
  makes the barrier reject after 20 s instead of degrading into a sequential test.
- **Database mechanism observed**: `checkout_order()` locks the listing row `FOR UPDATE` before its
  remaining-quantity check.
- **Result (every run)**: exactly one `ok` (idempotent_retry=false) and one
  `ORDER_ITEM_QUANTITY_UNAVAILABLE` (no raw text). Winner: 1 ACTIVE reservation (id = result), 1 item
  of 30 kg, 1 ISSUED proforma (id = result), 1 PENDING payment (= buyer total), 1 financial snapshot,
  history DRAFT->CONFIRMED, CONFIRMED->HOLD. Loser: 0 reservations/items/proformas/payments/financials,
  status CONFIRMED (its own earlier confirm write), hold columns null, correlation id unchanged, history
  DRAFT->CONFIRMED only. Listing reserved = position reserved = Σ ACTIVE items = **30**, 1 active
  reservation, filled 0, zero ownership events (global and lot).
- Cases: two different buyer orgs; the same org from two independent sessions; CONTROL 20 + 20 → both
  succeed, reserved exactly **40** (no lost update — and the harness can observe two winners).
- **Stability**: 5 consecutive file runs → 15/15 passed. (T031's formal repeated-run closure is NOT
  claimed.)
- The first CONTROL design (25 + 25 of 50) failed 2/2 — diagnosed, not rerun: the second checkout was
  refused by `cannot_publish_empty_listing` → **DB-OPEN-16** (§16.8).

### 16.3 T020 — idempotency

- **Sequential duplicate**: 1st call idempotent_retry=false; 2nd call reaches the RPC (spy count 1)
  and returns idempotent_retry=true with identical reservation/proforma/buyer total/correlation id/hold
  window. After both: 1 reservation, 1 proforma, 1 PENDING payment (same id), 1 financial row (same
  `calculated_at` — nothing recomputed), `idempotencyKeyHistory` length 1, key unchanged, mirrors 5 kg,
  no ownership event.
- **Concurrent double submit** (two sessions, same order, same turn): both callers `ok` with the same
  reservation/proforma/total; idempotent_retry values exactly `[false, true]`; single artefacts; ONE
  key ever persisted (audit history). **Before the fix** one of the two submissions was refused
  `ORDER_TRANSITION_REFUSED` in 3/3 runs although the order was successfully held (§16.9). Key rotation
  was not measured pre-fix; the compare-and-set now makes it impossible and the audit history proves it.
- **Post-failure retry**: the real `checkout_order` RPC is executed and awaited (commit happens), its
  response is replaced by a transport error → caller gets generic `ORDER_SAVE_FAILED` with no raw text;
  database already holds exactly one of each artefact; the retry returns idempotent_retry=true with the
  committed reservation/proforma/total and creates nothing (same `calculated_at`, same key).
- **What deduplicates (honest)**: a direct owner RPC with no key involved returns idempotent_retry=true
  twice with the existing ids; the baseline `checkout_order()` body never references
  `idempotency_key`. The function's own order lock + status/ACTIVE-reservation retry branch is the
  transactional dedupe; `orders.idempotency_key` is the server-generated, never-client-supplied,
  never-rotated intent marker (SEC-005).
- **Stability**: 3 consecutive runs → 15/15.

### 16.4 T021 — expiry exactly once under concurrency

- **Clock/fixture (DB-OPEN-15 honest)**: `ageCheckoutHold` backdates only the reservation's
  `expires_at`; the application path passes the documented test-only `now` seam; production call sites
  still pass none (existing audit).
- **Anti-clamp design**: an unexpired **12 kg** companion hold stays on the listing, so a second release
  would drop the mirrors below 12 instead of being clamped at 0 by `greatest(…, 0)`.
- **Synchronization**: barrier on `expire_order_hold`, 2 parties, `allInFlightTogether()` asserted.
- **Application path** (two sessions' `ensureHoldFresh`): held **6 kg**; both callers see EXPIRED;
  listing and position reserved each drop by exactly 6 (from the pre-race snapshot, companion 12 still
  reserved).
- **Database path** (two sessions' direct RPCs): held **5 kg**; both `error = null`; drop by exactly 5.
- Both: reservation EXPIRED (1 row), exactly one HOLD->EXPIRED history row, payment EXPIRED (1),
  proforma 1, financials 1, zero ownership events, companion still ACTIVE/HOLD, mirrors equal and ≥ 0.
  `afterAll` expires the companion through the same function.
- **Stability**: 5 consecutive runs of `expiry.test.ts` → 15/15 each.

### 16.5 T022 — mirror consistency

Zero drift (listing = position = Σ ACTIVE reservation items for the offer = Σ for the position) at
every step: **0 → 12** (partial 12 of 50 — only the requested quantity) **→ 19** (second buyer 7 kg)
**→ 49** (remaining 31 genuinely usable: 30 kg checks out) **→ 49** (a refused 2 kg checkout moves
nothing, leaves no artefact) **→ 42** (expiry releases exactly 7) **→ 44** (the previously refused order
checks out from released quantity). Filled stays 0; reserved ≤ quantity; position reserved ≤ available.
Settlement/fill is not exercised (Feature 008/006).

### 16.6 T023 — no title transfer

Baseline → after checkout → after idempotent retry → after refused checkout → after expiry: global
`inventory_ownership_events` count, lot-scoped count, seller position owner (Hills org, never either
buyer) and available quantity (1000), and `filled_quantity_kg` (0) are all unchanged; the buyer's RLS
view shows no event on the lot. Source audit over every file in the three production roots and the
baseline bodies of `checkout_order`/`expire_order_hold`/`assert_order_checkout_ready`: no ledger write,
no owner change.

### 16.7 T024 — authorization and tenant isolation

| Caller | Application (`executeCheckout` / `ensureHoldFresh`) | RPC calls | Database layer (same normal session) |
|---|---|---|---|
| Anonymous | `BUYER_NOT_CAPABLE` / `ORDER_NOT_ACCESSIBLE` | 0 | no EXECUTE on either function; no order/child row readable |
| Authenticated, unattached | same | 0 | `checkout_order` → `forbidden` |
| PENDING-KYB org | same | 0 | `forbidden` |
| SUSPENDED org, its OWN ready order | same | 0 | `checkout_order` → `buyer_not_authorized`; zero artefacts; restored ACTIVE in `finally` |
| Foreign org, known ready/HOLD id | `ORDER_NOT_FOUND`, deep-equal to nonexistent; `getOrderById` null even with a spoofed scope | 0 | `forbidden` on both (HOLD order's existing ids NOT returned); zero effect |
| Nonexistent id | `ORDER_NOT_FOUND` | 0 | `order_not_found` |
| Owning buyer | success | 1 checkout, 0 expiry | — |

Honest DB-layer notes: (a) for a caller who already holds an exact UUID, `checkout_order()` itself
distinguishes `forbidden` from `order_not_found`; the application never exposes that distinction.
(b) `expire_order_hold()` has **no caller check**: a foreign session's direct call on an unexpired hold
is a void no-op (indistinguishable from a nonexistent id), and on an already-expired hold it performs
exactly the release that is due — the application boundary is what stops cross-org expiry. Neither is
worked around (no schema/RLS change).
`can_view_order`: owner true / foreign false; owner reads its order, items, shipments, financials,
proforma, payment, history; the foreign org reads none of them nor shipment items or reservation items
by known id, and its broad order list contains only its own orders. Reservations are admin-only (even
the owner reads none).

### 16.8 DB-OPEN-16 (NEW, confirmed live) — final kilograms cannot be checked out

`checkout_order()` increments `coffee_offers.reserved_quantity_kg` without changing status;
`validate_offer_transition` re-validates the whole row on every update and raises
`cannot_publish_empty_listing` when a PUBLISHED/PARTIALLY_FILLED listing would have remaining ≤ 0. Any
checkout reserving a listing's last kilograms rolls back. Fails CLOSED (no over-reservation, no
artefact, zero drift; mapped to `ORDER_ITEM_QUANTITY_UNAVAILABLE`), but the final quantity of a listing
is unsellable through checkout. Requires a database change; recorded in the capability map; not worked
around. It does not break a Phase 8 invariant (double-sell protection, idempotency, exactly-once expiry,
mirror consistency, title, authorization, error safety all hold), but it is a **release blocker for the
buying journey** alongside DB-OPEN-13.

### 16.9 Production-code changes in RUN D (both minimal, both test-discovered)

1. **`lib/orders/checkout.ts` — concurrent duplicate submission (FR-003, T009/T020).** Defect: two
   submissions of the same order both read `DRAFT`/key null, both wrote `{status: CONFIRMED,
   idempotency_key: <own uuid>}`; the later write could overwrite the first key (CONFIRMED→CONFIRMED is
   not a status change, so the trigger allows it), and a flow whose re-read saw the other flow's key (or
   an already-HOLD order) returned `ORDER_TRANSITION_REFUSED` although checkout succeeded. Fix: (a) the
   key write is a compare-and-set (`.is("idempotency_key", null)`), so a persisted key can never be
   rotated; (b) after the separate re-read the call proceeds when the order is `CONFIRMED` with a
   persisted key or already in a retry status — the same intent — and `checkout_order()`'s own lock +
   retry branch returns the single checkout. No schema/RLS change, no transactional logic moved into
   TypeScript, still the sole `checkout_order()` caller, still no RETURNING (DB-OPEN-14).
2. **`lib/orders/errors.ts` — safe-error gap (SEC-004).** `validate_offer_transition` runs inside
   `checkout_order()`'s reserved-mirror update; `cannot_publish_empty_listing` reached the caller live
   and fell back to the generic `ORDER_SAVE_FAILED` (logged as unmapped). Added the five whole-row
   re-validation strings reachable from that update: `cannot_publish_empty_listing`,
   `listing_exceeds_tradable_inventory` → `ORDER_ITEM_QUANTITY_UNAVAILABLE`;
   `hills_listing_requires_active_hills_owner`, `member_listing_requires_authorized_seller`,
   `invalid_member_listing_purchase_source` → `ORDER_ITEM_NOT_AVAILABLE`. The other
   `validate_offer_transition` strings concern columns/statuses the reserved-mirror update never
   changes and stay unmapped (generic safe fallback).

### 16.10 T025 — error mapping

- Completeness vs the baseline: 18 distinct order-domain + 11 shipment-domain RAISE strings equal the
  map keys, plus the 5 listing re-validation keys (34); every key resolves without the fallback log.
- 19 distinct exceptions provoked LIVE under member sessions, the real PostgREST error mapped:
  `order_not_found`, `forbidden`, `order_must_be_confirmed_before_checkout`, `order_has_no_items`,
  `shipment_must_be_ready_before_checkout`, `shipment_quantities_do_not_match_order`,
  `listing_inventory_changed`, `cannot_publish_empty_listing`, `requested_quantity_not_available`,
  `listing_is_not_available`, `order_status_can_only_change_through_workflow`,
  `order_items_can_only_change_in_draft`, `buyer_not_authorized`,
  `warehouse_required_for_operational_shipment_status`, `only_warehouse_can_record_delivery`,
  `shipment_or_order_item_missing`, `shipment_order_item_mismatch`, `shipment_plan_exceeds_order_item`,
  `shipment_plan_is_closed`. Not member-reachable (platform/internal/warehouse authority or states a
  member cannot create): `cannot_buy_own_listing`, `inventory_quantity_not_available`,
  `seller_not_authorized`, `seller_inventory_changed`, `invalid_order_transition`,
  `terminal_order_cannot_change`, `invalid_shipment_transition`, `terminal_shipment_cannot_change`,
  `shipment_details_are_locked`, `delivered_quantity_cannot_decrease`,
  `delivered_quantity_exceeds_plan`, and 4 of the 5 listing re-validation strings — covered string-level.
- Production actions return exactly `{ ok: false, code }`.
- Fallback: a live RLS violation → `ORDER_SAVE_FAILED`; one log line = fixed label + `{ sqlstate }`.
- Leakage audits: no `ACTION_FEEDBACK` value is `forbidden`/`reservation_expired`/
  `listing_inventory_changed`/… (only `order_not_found` coincides with a raised string — it IS the
  stable code); EN/AR copy contains no raised string; no production file forwards
  `error.message/details/hint`, logs, or renders a raw code; `errors.ts` is the only logger.

### 16.11 Audits (final tree)

`checkout_order` code references: only `lib/orders/checkout.ts`; `expire_order_hold`: only
`lib/orders/expiry.ts` (comment-stripped repo-wide grep, untracked included). Across every file under
`lib/orders`, `src/app/dashboard/orders`, `components/orders`: no service role, no shared cache or
module-level Map/Set, no reservation-table reference, no reserved/filled mirror write, no
payment/proforma/financial write, no HOLD/EXPIRED/PAID status write, no hold/total column write, no
ownership ledger/owner change, no provider/escrow/webhook/settlement/payout code or dependency, no
import of test/fixture utilities.

### 16.12 Boundaries unchanged

DB-OPEN-13 unchanged (T004 `[ ] [BLOCKED — DB-OPEN-13]`). DB-OPEN-14 write-then-re-read preserved
(the CAS update has no RETURNING). DB-OPEN-15 preserved (test-only aging + `now` seam). Feature 009:
READY established only by the real warehouse fixture session — proves checkout given a valid
precondition, not the warehouse workflow. No Feature 008 payment/escrow/settlement/title/payout.
Scheduler decision OPEN (lazy expiry).

### 16.13 Test counts, task map, next run

Regression and counts are recorded in §16.14. Task map: T001–T003 [x], **T004 [ ] BLOCKED —
DB-OPEN-13**, T005–T025 [x], T026–T032 [ ] → **24/32**.

**Remaining blockers**: DB-OPEN-13 (buyer cannot edit/remove draft items), **DB-OPEN-16** (final
kilograms cannot be checked out), Feature 009 READY dependency, scheduler decision (lazy expiry),
DB-OPEN-14/15 constraints for Feature 008, `expire_order_hold()` without caller check (application
boundary enforced).

**Recommended RUN E (Phases 9 + 10, T026–T032)**: T026/T027 states, accessibility, RTL and mobile with a
real browser/axe pass (Sonnet-class, High); T028–T030 mechanical verification and audits (Sonnet, Low);
T031 formal repeated concurrency/idempotency stability record (Opus-class, High — reuse the RUN D
barrier files, ≥ 5 runs each); T032 roadmap update keeping the scheduler decision open and listing
DB-OPEN-13/16 as database-owned blockers.

### 16.14 Regression evidence (final working tree, 2026-09-13)

| Check | Result |
|---|---|
| `tests/orders/concurrency.test.ts` × 5 consecutive runs | 5/5 green — 3/3 each (15/15) |
| `tests/orders/idempotency.test.ts` × 3 consecutive runs | 3/3 green — 5/5 each (15/15) |
| `tests/orders/expiry.test.ts` (incl. T021) × 5 consecutive runs | 5/5 green — 15/15 each (75/75) |
| `mirror-consistency` / `no-title-transfer` / `authorization` / `error-mapping` | 2/2, 3/3, 10/10, 12/12 |
| `tests/orders/` (in the full run) | 240 tests, 18 files |
| auth / inventory (005) / listings (006) / dashboard / public / design (in the full run) | 338 / 80 / 175 / 58 / 151 / 65 |
| Full `vitest run` | **1107/1107, 101 files** (was 1066/95) |
| `npm run typecheck` | clean |
| `npm run build` | exit 0 |
| Feature 007 scoped eslint | 0 problems |
| `git diff --check` | exit 0 (autocrlf notices only) |

No flake occurred in any repeated run. The only failures seen during RUN D were design-time and were
diagnosed rather than rerun: the 25 + 25 control race (DB-OPEN-16), the concurrent double submit (the
checkout.ts defect, §16.9), and four T025 assertions of my own that were miscounted or over-broad
(order-domain RAISE count is 18, not 17; the log-label check and the copy check wrongly included the
fixed label and source comments) — corrected without loosening any database or leakage invariant.
