# Tasks: Orders, Checkout & Reservations (007)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §6/§8/§11 (BUY-02, MKT-03, MKT-04, TXN-01), AC-02/AC-03.

**Status**: DB blocker run complete (2026-09-13) — **T001–T025 implemented and verified (25/32)**.
Migration `20260913100000_feature_007_db_blockers.sql` (preflighted read-only, applied manually,
live-verified) resolved **DB-OPEN-13** (buyer DRAFT item edit/remove — T004 now `[x]`), **DB-OPEN-16**
(the final remaining kilograms of a listing can now be checked out, via a checkout-only marker) and
**DB-OPEN-17** (`expire_order_hold()` now authorizes its caller, non-enumerating). Phase 8 (T019–T025)
remains proven after the change. Phases 9–10 (T026–T032) remain untouched. The scheduler decision
remains OPEN (lazy expiry only). See `IMPLEMENTATION-HANDOFF.md` §17 (§16 RUN D, §15 RUN C, §14 RUN B,
§13 RUN A).
**Prerequisite**: 001, 003, 004, 005, plus the currently available 006 listing capabilities:
buyer-visible eligible listings, listing DTO/read contracts, advisory availability/fill projection,
listing references usable by `order_items`, and the database's reservation-mirror fields. Feature
006 need not be fully closed; deferred 006 tasks that depend on 007/008/009 do not block startup
unless a concrete runtime capability is missing.

> **Standing rule for every task in this feature**: the application never creates reservations,
> computes commercial totals, issues proformas, sets holds, or transfers title. `checkout_order()`
> and `expire_order_hold()` own those effects. Any task that appears to require otherwise is a
> BLOCKER to raise, not a workaround to build.

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Order domain layer & error mapping

- [x] T001 Create `lib/orders/validation.ts` + order DTO types (draft, item, financial summary,
  proforma, status history).
  - Req: FR-015, FR-018 | Depends: —
  - Verify: no DTO exposes a computed total; financial fields map 1:1 to `order_financials` columns
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical typing/schema work.
  - **Done (RUN A)**: five status vocabularies (`ORDER_STATUSES` 12, `PAYMENT_STATUSES` 7,
    `PROFORMA_STATUSES` 3, `ORDER_SHIPMENT_STATUSES` 13, `ORDER_ITEM_SELLER_TYPES` 2) read directly
    from the live `*_check`/`*_allowed` CHECK constraints (2026-09-13 preflight against
    `database-schema-report.json`, not the older `supabase/trading_schema.sql` baseline, which was
    found to be genuinely STALE for this domain — see the handoff §2). Every DTO
    (`OrderSummary`/`OrderItemDTO`/`OrderFinancialsDTO`/`ProformaDTO`+items/
    `OrderStatusHistoryEntry`/`OrderShipmentDTO`/`ShipmentItemDTO`) is a verbatim field-for-field
    mirror of its table — zero computed totals anywhere. `AddOrderItemInput`/`CreateShipmentInput`/
    `AddShipmentItemInput` (Zod) cover exactly RUN A's write surface; proven in
    `tests/orders/validation.test.ts` (10 tests) that a forged `unitPricePerKg`/
    `sellerOrganizationId`/`status`/`shippingFee`/`createdBy` field is silently stripped by Zod, never
    carried into the parsed result.

- [x] T002 Implement `lib/orders/errors.ts` — an explicit map from the database function's raised
  exceptions (`order_not_found`, `forbidden`, `buyer_not_authorized`, `active_reservation_missing`,
  `reservation_expired`, availability failures) to safe, specific application errors.
  - Req: FR-015, SEC-004, SC-007 | Depends: —
  - Verify: every known raised string has a mapping; an unmapped error falls back to a generic safe message and is logged without payload
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: the boundary that prevents internal database semantics leaking to buyers while keeping messages actionable.
  - **Done (RUN A)**: every RAISE EXCEPTION string read live from `validate_order_item_offer`,
    `validate_order_transition`, `validate_shipment_transition`, `validate_shipment_item` (all
    RUN-A-reachable), PLUS `checkout_order`/`assert_order_checkout_ready` (Phase 4/RUN B, not called
    this run but pre-populated so RUN B reuses this SAME table) maps to one of 9 new
    `ACTION_FEEDBACK` codes (`ORDER_NOT_FOUND`/`ORDER_NOT_ACCESSIBLE`/`BUYER_NOT_CAPABLE`/
    `ORDER_ITEM_NOT_AVAILABLE`/`ORDER_ITEM_QUANTITY_UNAVAILABLE`/`ORDER_NOT_EDITABLE`/
    `ORDER_TRANSITION_REFUSED`/`ORDER_SAVE_FAILED`/`SHIPMENT_NOT_FOUND`/`SHIPMENT_NOT_EDITABLE`/
    `SHIPMENT_ITEM_QUANTITY_INVALID`/`SHIPMENT_SAVE_FAILED`, 12 total). `tests/orders/errors.test.ts`
    (33 tests) proves all 29 known strings map correctly, an unrecognized message falls back safely
    and logs ONLY the SQLSTATE-shaped `code` (never the message text, never any payload), and a
    null/undefined error never throws.

- [x] T003 Implement `lib/orders/read.ts` — `can_view_order`-scoped reads for orders, items,
  financials, proforma (+items), status history and shipment plan.
  - Req: FR-010, FR-011 | Depends: T001
  - Verify: a cross-organization order id returns nothing; financial values are passed through unmodified
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: read scoping is security-relevant and the pass-through rule must hold.
  - **Done (RUN A)**: seven read functions, all narrow explicit selects (no `select("*")`).
    `getOrderById`/`getOrdersForOrganization` additionally scope by `buyer_organization_id` (defense
    in depth alongside RLS, mirroring `lib/listings/manage.ts`'s own convention) — RUN A's own
    consumers are all buyer-owned; a seller-side order read is a different, not-yet-built capability,
    honestly absent rather than narrowed to look complete. `tests/orders/read.test.ts` (5 tests,
    live): a real DRAFT order is readable by its own buyer org and invisible cross-org (both by id
    and in the list), `order_financials`/`proforma_invoices` are honestly `null` (checkout has never
    run), `order_status_history` is empty for a fresh order. Source-level proof: never queries
    `inventory_reservations`/`inventory_reservation_items`, no shared-cache directive.

---

## Phase 2 — Draft orders

- [x] T004 [PS1] [~~BLOCKED — DB-OPEN-13~~ **DB-OPEN-13 RESOLVED 2026-09-13**] Implement `lib/orders/drafts.ts` +
  `src/app/dashboard/orders/actions.ts` — create a `DRAFT` order and add/remove items, respecting the
  RLS policies and the `validate_order_item_offer` trigger.
  - Req: FR-004, FR-005, FR-016 | Depends: T001, T002
  - Verify: `organization_can_buy = false` fixture is refused; adding a non-published listing is refused by the trigger and surfaced as a safe error
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the first write path into the commercial ledger; capability and trigger cooperation must be exactly right.
  - **Done (DB blocker run, 2026-09-13) — literal acceptance now proven**: "create a DRAFT order and
    add/remove items". DB-OPEN-13 was resolved by migration
    `supabase/migrations/20260913100000_feature_007_db_blockers.sql` (read-only preflight
    `supabase/maintenance/20260913_feature_007_db_blockers_preflight.sql` passed, migration applied
    manually, live-verified): SECURITY DEFINER RPCs `update_order_item_quantity(uuid, numeric)` and
    `remove_order_item(uuid)` — non-enumerating membership-scoped lookup, parent-order lock, DRAFT +
    `organization_can_buy` + no closed shipment plan; quantity is the only writable field and
    `validate_order_item_offer` still fires. Application: `lib/orders/drafts.ts#updateOrderItemQuantity/
    removeOrderItem` (org-scoped order + item-membership pre-check before the RPC), Server Actions
    `updateItemQuantity`/`removeItemFromOrder`, `components/orders/draft-item-controls.tsx` (rendered only
    for DRAFT; EN+AR copy), error mappings for the three new database strings. Live proof
    (`tests/orders/draft-items.test.ts`, 8 tests): owner edits quantity (price/lot/seller/snapshots
    unchanged) and removes an item (its DRAFT plan row cascades); over-availability and below-plan
    edits refused; closed (REQUESTED) plan refuses both; cross-org actions refuse `ORDER_NOT_FOUND`
    before any RPC and the RPCs answer a foreign org's known id exactly like a nonexistent id; CONFIRMED
    and HOLD refuse at both layers (HOLD reservation untouched); suspended org refused
    (`BUYER_NOT_CAPABLE` / `buyer_not_authorized`); anon has no EXECUTE; raw REST UPDATE/DELETE and extra
    RPC parameters change nothing; zero reservation/financial/proforma/payment/ownership artefacts. The
    original Verify line (`organization_can_buy = false` refused; non-published listing refused by the
    trigger) remains proven in `tests/orders/drafts.test.ts`. The historical notes below record the
    earlier blocked state and are kept for traceability.
  - **RECONCILED (2026-09-13)**: this task's own literal scope is "create a DRAFT order AND
    add/remove items." Create + add are implemented and live-proven (below); **remove/edit is
    genuinely blocked** — the live database has NO buyer-facing UPDATE or DELETE policy on
    `order_items` (DB-OPEN-13, confirmed live), and no alternate buyer-safe mechanism exists: `orders`
    itself also has no buyer DELETE policy, so neither "edit the item" nor "delete the whole draft
    and start over" is possible through ordinary RLS. This was verified by direct inspection of the
    live policy list, not assumed. No RLS bypass, no service-role, and no database change were used
    or considered to close this — per the reconciliation directive's own instruction. **Corrected
    from `[x]` to `[ ]` `[BLOCKED — DB-OPEN-13]`.** The implementation itself is unchanged and
    correct for what it claims (create + add); only the acceptance status was overstated.
  - **Implemented and live-proven (unaffected by the correction above)**: `createDraftOrder`/
    `addOrderItem` (`tests/orders/
    drafts.test.ts`, 10 tests). Every server/trigger-derived `order_items` column
    (`lot_id`/`seller_organization_id`/`unit_price_per_kg`/all four snapshot fields) is OMITTED from
    the insert entirely — `validate_order_item_offer`'s own `SECURITY DEFINER` join derives them,
    bypassing DB-OPEN-05 for this write path (confirmed live: `product_name_snapshot`/
    `lot_code_snapshot` non-null on the created row). A SUSPENDED-organization fixture is refused
    `BUYER_NOT_CAPABLE` before any DB write; a SOLD_OUT listing is refused `ORDER_ITEM_NOT_AVAILABLE`
    (the trigger's own `listing_is_not_available`, mapped safely); a cross-org/nonexistent order id
    refuses identically (`ORDER_NOT_FOUND`, no existence leak); forged `sellerOrganizationId`/
    `unitPricePerKg`/`status` fields never change the outcome. Live-confirmed: no reservation
    (`coffee_offers.reserved_quantity_kg` unchanged before/after) and no title transfer
    (`inventory_ownership_events` count unchanged).
  - **DB-OPEN-13 (confirmed live, recorded in `docs/architecture/DATABASE-CAPABILITY-MAP.md` §9)**:
    `order_items` has NO buyer-facing UPDATE or DELETE RLS policy at all (exactly three policies
    exist: INSERT/SELECT/admin-ALL). A buyer can ADD an item but can never remove or edit its
    quantity, through any path, regardless of order status. This is a genuine gap against spec 007's
    own PS1 acceptance scenario 4 — NOT worked around with a service-role bypass or a shadow table.
    `lib/orders/drafts.ts` exports only `addOrderItem`; there is no `removeOrderItem`/
    `updateOrderItemQuantity`, and the draft-editor UI offers no control that could never succeed
    (source-verified, `tests/orders/drafts.test.ts`'s own DB-OPEN-13 describe block).
  - **DB-OPEN-14 (confirmed live, recorded in the same capability map section)**: `INSERT INTO
    orders ... RETURNING` (a chained PostgREST `.select()`) fails RLS on `orders` specifically —
    `orders_view`'s own SELECT policy self-references `orders` from inside `can_view_order`'s buyer
    branch, and Postgres applies that SELECT policy to the RETURNING projection in addition to the
    INSERT policy's `WITH CHECK`. `order_items`/`order_shipments` do NOT exhibit this (their SELECT
    policies reference the ALREADY-existing parent `orders` row, never their own table) — empirically
    verified, same session, in the same diagnostic pass. `createDraftOrder` performs a plain
    `.insert()` (no chained `.select()`) then a SEPARATE `getOrderById`-shaped read — two ordinary
    RLS-respecting round-trips, no service-role, no weakened policy.

- [x] T005 [PS1] Build the draft-order UI (`components/orders/draft-editor.tsx` + order pages)
  showing item snapshots, quantities and advisory availability from 006.
  - Req: FR-006, FR-018, PS1 | Depends: T004
  - Verify: quantities/prices display with unit and currency; the UI passes no quantity/price into the checkout action
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: standard UI work with one strict data-flow constraint.
  - **Done (RUN A)**: `src/app/dashboard/orders/page.tsx` (buyer's own orders list, any status —
    only `DRAFT` reachable this run since Phase 4 doesn't exist yet — + a "start new order" action)
    and `src/app/dashboard/orders/[orderId]/page.tsx` (items list + `DraftEditor`'s add-item form +
    `ShipmentPlanner`). Quantities/prices always render with unit (`kg`) and currency; the add-item
    form asks only for the listing's own id (pasted from its marketplace page — RUN A's own file
    scope names no marketplace-picker component, and `lib/listings/browse.ts` is untouched) and a
    quantity; no checkout action exists yet to smuggle anything into. There is no Phase 4 checkout
    outcome UI anywhere in this run.
  - **T004 reconciliation checked against this task, explicitly (2026-09-13)**: re-inspected both
    `components/orders/draft-editor.tsx` and this page for a remove/edit-quantity control that could
    never succeed because of DB-OPEN-13 — none exists. The items list is read-only; the ONLY
    interactive form is the add-item form, which calls a genuinely working write path. T005's own
    Verify line (display + no quantity/price smuggled into checkout) does not require remove/edit to
    exist, and no UI here claims a capability the write layer cannot deliver. T005 is unaffected by
    T004's correction and remains `[x]`.

- [x] T006 [PS1] Enforce edit-only-while-`DRAFT` in both UI and action paths.
  - **RE-VERIFIED (RUN B, 2026-09-13) — literal `HOLD` proof now live**: RUN B produced a genuine
    `HOLD` order through the normal authoritative checkout (`checkout_order()`, no substitution),
    then `tests/orders/checkout.test.ts`'s T006 test attempted a direct edit against it: the
    `addItemToOrder` action refuses `ORDER_NOT_EDITABLE`, AND a raw `order_items` insert bypassing
    the application entirely is refused by the database itself (`order_items_create_buyer` requires
    the parent order to be `DRAFT`); the order still holds exactly one item afterwards. The earlier
    `CONFIRMED` evidence below is retained as supporting evidence. Corrected `[ ]` → `[x]`.
  - *(earlier RUN A reconciliation record, kept verbatim)* [BLOCKED LIVE PROOF — requires real HOLD
    from Phase 4, reconciled 2026-09-13]
  - Req: FR-004 | Depends: T004
  - Verify: editing an order in `HOLD` is refused server-side even when invoked directly
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: a stale-tab edit after checkout would corrupt a live reservation's basis.
  - **RECONCILED (2026-09-13)**: this task's own literal Verify line names `HOLD` specifically.
    `HOLD` cannot be constructed without calling `checkout_order()` (Phase 4, explicitly out of RUN
    A's scope) — and implementing `checkout_order()` early merely to close this one checkbox would be
    implementing future-run behavior to manufacture a passing check, which this reconciliation
    declines to do (no such implementation was added). Per the same "no convenience-based
    checkboxing" standard applied elsewhere in this project, **T006 is corrected from `[x]` to `[ ]`
    `[BLOCKED LIVE PROOF — requires real HOLD from Phase 4]`.**
  - **Supporting evidence retained (implementation unchanged, still valid)**: live-proven against
    `CONFIRMED` — the only non-DRAFT status reachable via an ordinary, RLS-permitted buyer transition
    (`DRAFT -> CONFIRMED`, performed as TEST SETUP only, never a RUN A application action) — which
    exercises the IDENTICAL trigger predicate HOLD would (`validate_order_item_offer`'s own check is
    `status <> 'DRAFT'`, not status-name-specific). `tests/orders/drafts.test.ts`'s own T006 test
    confirms `addItemToOrder` against a CONFIRMED order refuses with `ORDER_NOT_EDITABLE` and zero
    items are created. This is genuine, real, live evidence of the same underlying guard — it is
    recorded as supporting evidence for the literal `HOLD` case, not substituted as if it were that
    case. UI-side: the order detail page shows the add-item form ONLY while `order.status ===
    "DRAFT"`, an honest "this order can no longer be edited" note otherwise (proven in
    `tests/orders/pages.test.tsx`) — this part of the guard is not in question and remains correct.
    Closes alongside Phase 4 once a genuine `HOLD` order exists.

---

## Phase 3 — Buyer shipment planning (narrow slice)

- [x] T007 [P] Implement buyer shipment planning (`orders/[orderId]/shipment/actions.ts`):
  `order_shipments` INSERT as `DRAFT`, UPDATE to `REQUESTED`, and `shipment_items` while `DRAFT`.
  - Req: FR-013 | Depends: T004
  - Verify: any attempt to set a state beyond `REQUESTED` is refused (RLS/trigger); `shipment_items` edits after DRAFT are refused
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: the buyer/warehouse boundary must not be crossed accidentally.
  - **Done (RUN A)**: `createShipment`/`addShipmentItem`/`requestShipment`, each re-verifying the
    parent order's ownership before any write. `tests/orders/shipment.test.ts` (6 tests, live): a
    DRAFT shipment is created successfully; a cross-org order id is refused `ORDER_NOT_FOUND`; a
    quantity within the ordered amount plans successfully; a quantity EXCEEDING the ordered amount is
    refused `SHIPMENT_ITEM_QUANTITY_INVALID` (the trigger's own `shipment_plan_exceeds_order_item`);
    `DRAFT -> REQUESTED` succeeds, and a subsequent `addShipmentItem` attempt against the now-
    `REQUESTED` shipment is refused `SHIPMENT_NOT_EDITABLE` (`shipment_plan_is_closed`). No status
    beyond `DRAFT`/`REQUESTED` is ever selectable or referenced anywhere in this file (source-level
    proof) — everything past `REQUESTED` remains Feature 009/warehouse-owned.

---

## Phase 4 — Checkout execution (the transactional core)

- [x] T008 [PS2] Implement `lib/orders/checkout.ts#executeCheckout(orderId)` — the **only** caller of
  `checkout_order()`. Verify identity/capability/order ownership first, generate and persist a
  server-side idempotency key, call the function, map errors via T002, return its values verbatim.
  - Req: FR-001, FR-002, FR-003, SEC-001, SEC-002, SEC-005, SC-001 | Depends: T002, T004
  - Verify: `grep -rn "checkout_order" src lib` matches only this file; the function's returned values are used unmodified; no total/reservation/proforma is created in application code; any multi-seller order remains one order-level function call with no application-side split processing
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the single highest-blast-radius function in the entire platform — overselling, duplicate reservations and financial divergence all live or die here.
  - **Done (RUN B)**: `executeCheckout` runs the 12-step sequence (validate UUID → `getRequestIdentity`
    → acting org + `isAuthorizedMember` + `canBuy` → org-scoped `getOrderById` → readiness
    pre-check → server `randomUUID()` idempotency key + `DRAFT -> CONFIRMED` via the buyer's own
    UPDATE path (plain update, separate re-read — DB-OPEN-14) → the ONE `rpc("checkout_order")` →
    `mapOrderError` → verbatim `CheckoutResult`). Live-proven in `tests/orders/checkout.test.ts`:
    anonymous / malformed id / SUSPENDED org / cross-org id / not-ready draft all refused BEFORE the
    RPC (a `vi.spyOn(client.rpc)` counts zero `checkout_order` calls in every case); a genuine
    checkout returns `idempotent_retry=false` with real reservation/proforma/correlation ids and the
    DB's own `hold_expires_at`; the persisted `idempotency_key` is a server UUID; forged inputs are
    impossible by construction (the function's only parameter is `orderId`). Repo-wide `git grep
    --untracked` (comments stripped) finds `checkout_order` in code in exactly `lib/orders/checkout.ts`;
    that file issues exactly one `.rpc(` call, never loops per seller, never touches reservation/
    financial/proforma/payment/ownership tables. Multi-seller stays one order-level call (the live
    function's own per-item loop handles sellers inside the transaction; no split-cart code exists).
  - **HONEST IDEMPOTENCY-KEY NOTE**: `checkout_order()` (read live) does NOT consume
    `orders.idempotency_key` — its retry safety is keyed on the order's own status + ACTIVE
    reservation. The key is the server-owned, non-forgeable per-intent marker SEC-005 asks for; the
    "no second reservation/proforma/payment" guarantee is the function's own retry branch, proven
    live (T009 below). Recorded in the handoff §14, not overstated here.

- [x] T009 [PS2] Implement the checkout Server Action + review page
  (`orders/[orderId]/checkout/`) calling `executeCheckout` exactly once per submission, with
  double-submit protection in the UI as a convenience (never as the guarantee).
  - Req: FR-001, FR-003, PS2 | Depends: T008
  - Verify: a double submit results in one reservation (function idempotent-retry path observed in the return value)
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the UI must not become the idempotency mechanism; the database's guarantee must be the one being exercised.
  - **Done (RUN B)**: `checkout/actions.ts#confirmCheckout` (thin: reads `orderId` only, calls
    `executeCheckout` exactly once, redirects on success) + `checkout/page.tsx` (review: item
    quantity/kg, unit-price snapshot/currency, delivery plan, readiness notice — NO computed total)
    + `components/orders/checkout-confirm-button.tsx` (pending/disabled/`aria-busy` as UX
    convenience). `tests/orders/checkout-action.test.ts` (6): exactly one `executeCheckout` call per
    invocation; forged `idempotencyKey`/`amount`/`quantityKg`/`sellerOrganizationId`/`holdMinutes`
    fields never read; success redirects. `tests/orders/checkout.test.ts`: a SECOND `executeCheckout`
    on the same HOLD order returns `idempotent_retry=true` with the SAME reservation/proforma ids and
    total, the key unchanged, and the privileged inspection still shows exactly one reservation, one
    proforma, one PENDING payment (the database's own guarantee, observed in the return value).

- [x] T010 [PS2] Present the checkout outcome: `HOLD` status, `hold_expires_at` countdown, proforma
  reference, buyer total — all read from the database, never recomputed.
  - Req: FR-002, FR-007, FR-010 | Depends: T008, T003
  - Verify: the countdown derives from `orders.hold_expires_at`; totals match `order_financials` exactly
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: presentation is where a "helpful" recomputation would silently diverge from the snapshot.
  - **Done (RUN B)**: the order detail page renders a HOLD outcome panel (status badge,
    `orders.hold_expires_at` verbatim, `components/orders/hold-countdown.tsx` fed ONLY that
    timestamp, proforma code from `proforma_invoices`, buyer total + subtotal/shipping/VAT from
    `order_financials` — all pass-through). Live: the RPC's `buyer_total` equals
    `order_financials.buyer_total_amount` and the `payments.amount` exactly; `hold_expires_at` on the
    order equals the RPC result. `tests/orders/checkout-page.test.tsx`: at a mocked "now" the
    countdown reads `19:00` from a stored `hold_expires_at` 19 minutes ahead (no +20-minute arithmetic
    — source-verified), the polite summary announces minutes only, `role="timer"` is used (no
    per-second `aria-live`). `hold-countdown.tsx` is a working component RUN B needed; T017's own
    acceptance (monospace code discipline + a `financial-summary.tsx`) is NOT claimed.

- [x] T011 [PS2] Map and present the availability-failure path with a specific, safe message and a
  route back to the listing.
  - Req: FR-006, FR-015 | Depends: T002, T008
  - Verify: forcing an availability failure yields a specific message with no raw database text
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: this is the most common real-world checkout failure; clarity here prevents duplicate attempts.
  - **Done (RUN B)**: forced LIVE in `tests/orders/checkout.test.ts` — two checkout-ready orders each
    for 30 kg of the dedicated 50 kg checkout listing (5 kg already reserved): the first reserves,
    the second is refused by `checkout_order()`'s own `listing_inventory_changed` (the RPC IS
    invoked — availability is never pre-checked), surfaced as `ORDER_ITEM_QUANTITY_UNAVAILABLE`
    with zero raw text in the result; the losing order has NO financials, proforma, payment or
    reservation row (whole transaction rolled back), and the listing/position mirrors read 35 kg,
    never 65. UI: a specific localized toast + an inline recovery panel ("Nothing was reserved")
    with "Start a new order" / "Back to marketplace" links — the only routes that genuinely work,
    because DB-OPEN-13 means items on the (now `CONFIRMED`) order cannot be edited or removed, and
    `CONFIRMED` is one-way for a buyer. Documented as a constrained recovery, not hidden.

---

## Phase 5 — Hold expiry

- [x] T012 [PS4] Implement `lib/orders/expiry.ts#ensureHoldFresh(orderId)` — the **only** caller of
  `expire_order_hold()`, invoked on order read paths and before any downstream payment/proof/escrow
  hand-off.
  - Req: FR-008, FR-009, PS4 | Depends: T003
  - Verify: `grep -rn "expire_order_hold" src lib` matches only this file; calling it twice releases quantity once
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: double-release would corrupt inventory; single-call discipline plus idempotence is the guard.
  - **Done (RUN C)**: `lib/orders/expiry.ts#ensureHoldFresh` — validate → identity → acting org →
    org-scoped read → inspect `orders.status`/`hold_expires_at` → not stale: no mutation, truthful
    state → stale: the ONE `rpc("expire_order_hold")` → separate re-read → controlled state. Live
    (`tests/orders/expiry.test.ts`): DRAFT and unexpired HOLD → zero RPC calls, nothing mutated;
    cross-org caller → `ORDER_NOT_FOUND` before the RPC (the other org's reservation stays ACTIVE);
    a genuinely stale hold (reservation `expires_at` backdated by the approved test-only fixture —
    `orders.hold_expires_at` itself cannot be backdated, DB-OPEN-15) → ONE RPC, order `EXPIRED`,
    reserved quantity down by exactly the held 4 kg on BOTH the listing and inventory mirrors (never
    negative), payment `EXPIRED`, one proforma/payment still, zero ownership events, history
    `HOLD->EXPIRED`; a second `ensureHoldFresh` and a direct second `expire_order_hold` release
    nothing further; the released quantity is genuinely purchasable again (a new 4 kg order checks
    out). Repo-wide: `expire_order_hold` appears in code only in `lib/orders/expiry.ts` (one
    `.rpc(` site); the file never reads reservation tables or writes any quantity/status/history.
    Formal Phase 8 T021 (concurrent double-run) is NOT claimed.

- [x] T013 [PS4] Present expired-hold state with the reason and a route to start again if still
  eligible; expose the server-side pre-payment boundary that refuses downstream payment/proof/
  escrow actions against an expired hold. Feature 007 MUST NOT implement payment-proof upload or
  escrow-provider integration.
  - Req: FR-017, PS4 | Depends: T012
  - Verify: an expired hold shows the explicit state; `ensureHoldFresh` plus authoritative order state refuses the downstream hand-off server-side; no Feature 007 code calls `submit_payment_proof` or implements provider/escrow behavior; the hand-off requirement to 008 is recorded
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the refusal must be server-side, not merely a hidden button.
  - **Done (RUN C)**: `EXPIRED` renders an explicit, localized panel (title, description, reason
    "Hold window ended") with only routes that genuinely work — "Start a new order" / "Back to
    marketplace" — no countdown, no checkout entry, no edit/remove control (DB-OPEN-13), no payment/
    escrow action (only the internal `payments.status` label is displayed). The server-side
    pre-payment boundary `lib/orders/expiry.ts#requireFreshHold` runs lazy expiry then refuses
    anything but a fresh `HOLD` with `ORDER_HOLD_EXPIRED` — live-proven for an expired order, a
    DRAFT, and (accepted) a fresh HOLD. **Feature 008's real payment/proof/escrow action MUST call
    `requireFreshHold` first** (recorded in the file header, the handoff §15 and here); Feature 007
    implements no payment proof, provider, escrow, webhook or fund-release logic (source-audited).

- [x] T014 [PS4] Document the lazy-expiry limitation in code and in the feature's Open items: an
  unvisited stale hold may persist until touched; no scheduler is approved.
  - Req: spec Open items | Depends: T012
  - Verify: a code comment and the spec both state the limitation; no scheduler/infrastructure was silently added
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: honestly recording a known gap rather than papering over it is a judgment call with continuity value.
  - **Done (RUN C)**: the lazy-expiry limitation is stated in `lib/orders/expiry.ts`'s header, in
    `IMPLEMENTATION-HANDOFF.md` §15, and in spec.md's Open Items (narrow status note appended:
    (a) implemented, (b) scheduler still OPEN — not closed). `tests/orders/expiry.test.ts` proves no
    cron/pg_cron/Edge-scheduler/worker/queue reference exists in application code, config or the
    live function list, and that the three documents carry the limitation.

---

## Phase 6 — Order views

- [x] T015 [PS6] Implement `src/app/dashboard/orders/page.tsx` — buyer order list with approved
  status labels and key figures.
  - Req: FR-011, FR-014, PS6 | Depends: T003
  - Verify: all twelve `orders.status` values render their exact labels; only own-organization orders appear
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: list page over a scoped read layer with a closed vocabulary.
  - **Done (RUN C)**: `src/app/dashboard/orders/page.tsx` — server-resolved acting org, one bounded
    deterministic page (`created_at DESC, id DESC`, `range`, `MAX_PAGE_SIZE` 100) through
    `lib/orders/read.ts` only, plus ONE page-keyed `order_financials` read (`.in("order_id", ids)`,
    never org-wide); columns: monospace order code, status badge (+ "Held until <hold_expires_at>"
    for HOLD), stored buyer total with currency ("—" when no snapshot — never fabricated), created,
    updated, view link; stale holds on the page pass through `ensureHoldFresh` then the page is
    re-read. All 12 `orders.status` values render their exact EN label with AR present
    (`tests/orders/views.test.tsx`, one test per status); own-org isolation and cross-org absence
    are live-proven in `read.test.ts`. Table→card responsive behaviour is `TableCardList`'s own.

- [x] T016 [PS6] Implement `src/app/dashboard/orders/[orderId]/page.tsx` — items, financial snapshot,
  proforma, shipment plan, status history, hold countdown where applicable.
  - Req: FR-010, FR-014, PS6 | Depends: T003, T010, T012
  - Verify: financials match snapshots; history renders transitions with reason/timestamp; `ensureHoldFresh` runs on load
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the buyer's single source of order truth; several data sources must agree.
  - **Done (RUN C)**: `ensureHoldFresh(orderId)` is the FIRST read on the detail page and the order it
    returns is the one rendered (position-proven in source and by call order in tests); then items
    (kg + unit-price snapshot + currency), `FinancialSummary` (pass-through), proforma code,
    internal payment status label (display only), shipment plan (`ShipmentPlanner`, read-only past
    DRAFT), status history (labelled old→new, timestamp, safe reason), HOLD countdown only while a
    fresh HOLD, expired panel only when `EXPIRED`, neither for other statuses. Cross-org/nonexistent
    id → `notFound()`. Live: a real HOLD expired through this exact path in `expiry.test.ts`.

- [x] T017 [P] Build `components/orders/hold-countdown.tsx` and `financial-summary.tsx` with
  unit/currency discipline and monospace order/proforma codes.
  - Req: FR-018 | Depends: T001
  - Verify: `HC-2026-0418`-style codes render monospaced; all money shows currency
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Low
  - Why: focused presentational components.
  - **Done (RUN C)**: `components/orders/hold-countdown.tsx` (RUN B's working component preserved —
    derives ONLY from `hold_expires_at`, `role="timer"` so ticks are never announced, a
    visually-hidden polite summary that changes only per minute and announces the expired state,
    nothing animates) and NEW `components/orders/financial-summary.tsx` (pure presentational: every
    money figure with currency, quantity with kg, monospace, no arithmetic — source-proven; commission/
    seller-net deliberately not shown to buyers). Order/proforma codes use the project monospace
    treatment with `break-all` wrapping on both pages. Proven in `tests/orders/views.test.tsx`.

---

## Phase 7 — Module registration

- [x] T018 Register the `orders` nav entry and the "what did I buy" / "what do I owe" overview cards
  with 004's contract.
  - Req: FR-016 | Depends: T015
  - Verify: entries appear for buy-capable organizations; summary queries are bounded
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: contract-conformant registration.
  - **Done (RUN C)**: a new `orders` module in `lib/dashboard/registry.tsx` (Feature 004's existing
    contract, no second nav system) — one `orders` entry at `requiredCapability: "buy"` merged into
    the existing "trading" group; visible to buyer-only AND seller+buyer organizations, hidden for a
    non-buy-capable one (`tests/dashboard/registry.test.tsx`, reconciled + a new T018 test). Nav
    hiding is presentational only — every `/dashboard/orders/*` page re-verifies server-side. Overview
    cards "What did I buy?" / "What do I owe?" come from `getOrderCountsForOrganization` — two
    bounded, org-scoped, COUNT-only reads of stored statuses (no financial aggregation); zero-count
    cards are omitted.

---

## Phase 8 — Release-blocking transactional tests

> **Runtime/test boundary:** member-facing order code reads hold truth from the permitted
> `orders.status` and `orders.hold_expires_at` fields. It MUST NOT directly read
> `inventory_reservations` or `inventory_reservation_items`, and it MUST NOT bypass RLS. Tests may
> inspect authoritative reservation rows through the repository's existing privileged fixture
> setup/read convention when proving transactional invariants; that test-only convention is not a
> production service-role path or a member-facing read capability.

- [x] T019 [PS3] Write `tests/orders/concurrency.test.ts` (AC-02): two simultaneous checkouts against
  insufficient quantity — exactly one succeeds; the loser leaves no reservation, proforma, payment or
  financial row; totals remain consistent.
  - Req: SC-002, PS3 | Depends: T008
  - Verify: `npm test -- orders/concurrency` passes repeatedly (run it multiple times to catch flakiness)
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the platform's release-blocking double-sell protection; concurrency tests demand careful construction to be meaningful rather than accidentally serialised.
  - **Done (RUN D)**: `tests/orders/concurrency.test.ts` (3 live tests, reset before each). Two
    checkout-ready orders (30 kg each) on the dedicated 50 kg listing are checked out by two DIFFERENT
    buyer orgs (and, separately, by two sessions of the same org) started in the same turn inside
    `liveClientScope().run`; an explicit RPC barrier (`installRpcBarrier`) releases both
    `checkout_order` calls together and the test asserts both requests were in flight before either
    response (`allInFlightTogether`). Result every run: exactly one HOLD (1 ACTIVE reservation with one
    30 kg item, 1 ISSUED proforma, 1 PENDING payment = buyer total, 1 financial snapshot, history
    DRAFT->CONFIRMED,CONFIRMED->HOLD) and one `ORDER_ITEM_QUANTITY_UNAVAILABLE` with no raw text; loser
    has 0 reservation/items/proforma/payment/financials, stays CONFIRMED with null hold columns and an
    unchanged correlation id; listing = position = ACTIVE items = 30; zero ownership events. A control
    race (20 + 20) proves two winners are observable and reserves exactly 40 (no lost update).
    Stability: 5 consecutive file runs, 15/15. Formal T031 closure NOT claimed. The control race
    exposed DB-OPEN-16 (final kilograms cannot be checked out) — see the handoff §16.

- [x] T020 [PS2] Write `tests/orders/idempotency.test.ts`: duplicate submission and post-failure retry
  produce exactly one reservation, proforma and payment.
  - Req: FR-003, SC-003 | Depends: T008, T009
  - Verify: `npm test -- orders/idempotency` passes; the second call reports the function's retry path
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: BUY-02 retry-safety is release-blocking and subtle.
  - **Done (RUN D)**: `tests/orders/idempotency.test.ts` (5 tests). Sequential retry:
    `idempotent_retry=true`, same reservation/proforma/total/correlation/hold window, still exactly 1
    reservation/proforma/PENDING payment/financial row (same `calculated_at`, same payment id). CONCURRENT
    double submit (two sessions, same order): both callers get the same reservation/proforma, one
    `idempotent_retry=false` + one `true`, single artefacts, and the `audit_logs` history shows exactly
    ONE persisted `idempotency_key`. This test found a real defect — one submission was falsely refused
    `ORDER_TRANSITION_REFUSED` (3/3 runs) — fixed minimally in `lib/orders/checkout.ts` (compare-and-set
    key write + accept a concurrently-confirmed/completed same intent). Post-failure retry: the real RPC
    commits, its response is discarded as a transport error → safe `ORDER_SAVE_FAILED`; the retry
    returns the committed reservation/proforma with `idempotent_retry=true` and creates nothing. Honesty:
    a direct RPC with no key is deduplicated identically, and the baseline `checkout_order()` body never
    reads `idempotency_key` — the function's retry branch dedupes; the key is the intent marker.
    Stability: 3 consecutive runs, 15/15.

- [x] T021 [PS4] Write `tests/orders/expiry.test.ts`: expiry releases exactly once even when invoked
  twice concurrently. Inspect reservation rows only through the test-only privileged fixture
  convention described above.
  - Req: FR-009, SC-004 | Depends: T012
  - Verify: `npm test -- orders/expiry` passes; reserved quantity decreases by exactly the reserved amount
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: double-release is a silent inventory corruption with no obvious symptom.
  - **Done (RUN D)**: `tests/orders/expiry.test.ts` T021 block (2 tests). An unexpired 12 kg
    companion hold stays on the listing so a double release could not hide behind the
    `greatest(…,0)` clamp. Application path: two sessions' `ensureHoldFresh` (test-only `now` seam,
    DB-OPEN-15) reach `expire_order_hold` together behind the barrier (both in flight); database path:
    two sessions' direct RPCs behind the barrier. Both: listing and position reserved drop by exactly
    the held 6 kg / 5 kg (never 2×, never below the companion's 12), reservation EXPIRED once, history
    has exactly one HOLD->EXPIRED, payment EXPIRED (1), proforma 1, financials 1, zero ownership events,
    companion still ACTIVE. Stability: 5 consecutive runs, 15/15.

- [x] T022 Write `tests/orders/mirror-consistency.test.ts`: after checkout,
  `coffee_offers.reserved_quantity_kg` mirrors `inventory_positions.reserved_quantity_kg` exactly;
  authoritative reservation inspection is test-only and never a member runtime read.
  - Req: SC-005 | Depends: T008
  - Verify: `npm test -- orders/mirror-consistency` passes with zero drift
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the offer/inventory mirror is an audited invariant; drift would break the marketplace's availability truth.
  - **Done (RUN D)**: `tests/orders/mirror-consistency.test.ts`. One lifecycle, zero drift at every
    step (listing = position = Σ ACTIVE reservation items for the offer and for the position): 0 → 12
    (partial 12 of 50) → 19 (second buyer 7 kg) → 49 (remaining availability usable: 30 kg) → 49 (a
    refused 2 kg checkout changes nothing) → 42 (expiry releases 7) → 44 (the refused order now checks
    out). Filled stays 0. A second test characterizes DB-OPEN-16 fail-closed (50 of 50 refused
    `cannot_publish_empty_listing`, zero artefacts, zero drift).

- [x] T023 Write `tests/orders/no-title-transfer.test.ts`: checkout produces zero
  `inventory_ownership_events` (MKT-04 / AC-03).
  - Req: SC-008 | Depends: T008
  - Verify: `npm test -- orders/no-title-transfer` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: guards the settlement-before-title rule at the code boundary, where a future "helpful" change could break it.
  - **Done (RUN D)**: `tests/orders/no-title-transfer.test.ts`. Global and checkout-lot
    `inventory_ownership_events` counts, the seller position's owner and available quantity, and
    `filled_quantity_kg` are unchanged after a real checkout, its idempotent retry, a refused checkout
    and a hold expiry; the buyer's own RLS view shows no event on the lot. Source audit over every
    Feature 007 production file and the baseline bodies of `checkout_order`/`expire_order_hold`/
    `assert_order_checkout_ready`: no ledger or owner write.

- [x] T024 [P] Write `tests/orders/authorization.test.ts`: another organization's order id is refused
  before and by the function; suspended organization refused; `can_view_order` scoping holds.
  - Req: SEC-001, SEC-002, SC-006 | Depends: T008, T003
  - Verify: `npm test -- orders/authorization` passes for all cases
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: cross-tenant commercial access is the most severe failure class here.
  - **Done (RUN D)**: `tests/orders/authorization.test.ts` (10 tests). Anonymous, unattached,
    PENDING-KYB, SUSPENDED (with its own ready order), cross-org and nonexistent callers are refused by
    `executeCheckout`/`ensureHoldFresh` with 0 RPC calls; cross-org results deep-equal nonexistent
    (`ORDER_NOT_FOUND`), even with a spoofed scope. Database layer under the same normal sessions:
    anonymous has no EXECUTE; unattached/pending/foreign → `forbidden` (also on a HOLD order — no retry
    disclosure); suspended own order → `buyer_not_authorized`; zero artefacts. `expire_order_hold()` has
    NO caller check (characterized: a foreign call on an unexpired hold is a void no-op, on an already
    expired hold it performs exactly the due release). Owner: 1 RPC, success. `can_view_order`: owner
    true / foreign false; foreign reads nothing by known id across orders, items, shipments, shipment
    items, financials, proforma, payments, history, reservation items; broad list contains only its own.

- [x] T025 [P] Write `tests/orders/error-mapping.test.ts`: each database exception maps to a safe,
  specific message; no raw text escapes.
  - Req: SEC-004, SC-007 | Depends: T002
  - Verify: `npm test -- orders/error-mapping` passes; no test observes `forbidden`/`reservation_expired` verbatim in client output
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: information-disclosure boundary with many cases.
  - **Done (RUN D)**: `tests/orders/error-mapping.test.ts` (12 tests). Completeness against the
    baseline: 18 order-domain + 11 shipment-domain RAISE strings == map keys, plus 5 listing
    re-validation strings reachable through checkout (34 total, each mapped without fallback). 19
    distinct exceptions provoked LIVE under member sessions and the real PostgREST error mapped (incl.
    `listing_inventory_changed`, `cannot_publish_empty_listing`, `buyer_not_authorized`, six shipment
    triggers); production actions return only `{ok:false, code}`. Unknown live RLS error → generic
    `ORDER_SAVE_FAILED`, log = fixed label + `{ sqlstate }` only. Audits: no code value is a sensitive
    token (only `order_not_found` coincides, by design), EN/AR copy holds no raised string, no
    production file forwards `error.message`/logs/renders a raw code. Gap fixed in `lib/orders/errors.ts`
    (5 listing re-validation strings previously fell back to the generic code).

---

## Phase 9 — States, accessibility, responsive, RTL

- [ ] T026 State coverage: loading, empty, error, unauthorized, suspended, reserved, expired,
  partial-fill, unavailable across order and checkout screens.
  - Req: FR-017 | Depends: Phases 4–6
  - Verify: each state renders for a seeded fixture; `partial-fill` covers partial reservation and remaining availability only, while settled filled/listing state is deferred to 008/006
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: broad but well-specified.

- [ ] T027 Accessibility, RTL and mobile pass (countdown announced accessibly, tables → cards,
  logical properties, externalised copy).
  - Req: FR-018 | Depends: Phases 4–6
  - Verify: a11y check clean; the countdown is exposed to assistive technology without spamming updates; grep for physical properties returns nothing
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: a live countdown is a known accessibility hazard (over-announcement) needing judgment.

---

## Phase 10 — Verification & closure

- [ ] T028 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [ ] T029 Confirm single-caller discipline for both database functions and zero application-side
  transactional logic.
  - Req: FR-001, FR-008, SC-001 | Depends: T028
  - Verify: `grep -rn "checkout_order\|expire_order_hold" src lib` matches only `lib/orders/checkout.ts` and `lib/orders/expiry.ts`; no reservation/proforma/total insert exists in application code
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: the structural guarantee behind this feature's entire integrity story.

- [ ] T030 Confirm no service-role usage, no caching of order data, and no order data on public routes.
  - Req: SEC-003, SEC-006, FR-012 | Depends: T028
  - Verify: `grep -rn "SERVICE_ROLE\|cacheTag\|unstable_cache" lib/orders src/app/dashboard/orders` returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical constitutional checks.

- [ ] T031 Re-run the concurrency and idempotency tests several times to confirm stability, and record
  the results in the handoff notes.
  - Req: SC-002, SC-003 | Depends: T019, T020
  - Verify: repeated runs pass consistently; any flake is investigated, not retried away
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: a flaky concurrency test is worse than none — it hides the very race it exists to catch.

- [ ] T032 Update the roadmap for 007 and confirm the expiry-scheduler decision remains open.
  - Req: spec Open items | Depends: T028
  - Verify: roadmap accurate; the lazy-expiry limitation is stated, not silently closed
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: honest continuity reporting on a known operational gap.

---

## Dependencies & parallelisation

- Phase 1 blocks everything.
- Phase 2 blocks Phases 3–5; Phase 4 (checkout) blocks Phases 5–6 in practice.
- T007 (shipment slice) is parallel to Phase 4.
- Phase 8's tests: T024/T025 parallel; T019–T023 should be run and reviewed individually because
  each targets a distinct integrity invariant.
- Phase 10 depends on everything.

**Cross-feature boundary**: 006 supplies the current buyer-visible listing/read, eligibility,
advisory availability/fill and listing-reference capabilities; its deferred 007/008/009-dependent
tasks do not create a blanket prerequisite. 008 receives the pending payment and owns payment
collection, the TBD escrow-provider integration, settlement, title transfer and payouts. T013's
expired-order hand-off must be enforced again by 008's real payment/proof/provider action.

**Parallel-safe tasks**: T007, T017, T024, T025 (4 of 32) — deliberately low, because most of this
feature converges on one transactional path.
