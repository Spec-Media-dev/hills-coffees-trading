# Feature 006 — Marketplace, Seller Listings & Resale — Implementation Handoff

**Scope delivered**: RUN A — Phase 1 (Listing domain layer, T001–T006) + Phase 2 (Marketplace access
control, T007–T008). RUN B — Phase 3 (Marketplace browse & detail, T009–T011) + Phase 4 (Seller
listing creation, T013–T015). RUN C — Phase 5 (Seller listing management, T016/T017/T019) + Phase 6
(Module registration, T020) + Phase 7 (available tests, T021/T025/T026, plus T023 partially). See
§11 for RUN B and §12 for RUN C.
**Status**: **20/32 tasks complete** (T001–T011, T013–T014, T016–T017, T019–T021, T025–T026).
**T012 is a KNOWN BLOCKER**; **T015/T023 are BLOCKED LIVE PROOF** (implementation complete, honest
own-org successful-transition + `listing_status_history` live-write proof outstanding under the
settled-order ceiling — reconciled 2026-09-13, §12.15); **T018/T024 are DEFERRED** (Feature
007/008 dependencies); **T022 is BLOCKED — DB-BLOCK-07 / delivery authority** (requires Feature 009
or an equivalent authoritative delivery-reservation representation — Feature 007 does not by itself
satisfy T022's delivery-reserved acceptance requirement) — all deliberately left `[ ]` (§11.5,
§11.6, §12.7, §12.15). **Feature 006 is NOT complete** — Phases 8–9 (T027–T032) are untouched.

This document records the live-schema preflight evidence, the DTO/read/eligibility contracts as
actually built, every honest gap found (worked around nowhere), the test evidence, and the
regression results, so Phase 5+ can build on this foundation without re-deriving any of it.

## 0. RECONCILIATION (2026-09-12, before commit)

Two closure questions were raised before accepting RUN A as safe to commit. Both are resolved and
recorded here; see §2/§7/§10 for the resulting evidence.

**T007 — descendant route guard.** The guard originally lived in `src/app/dashboard/coffee/page.tsx`
alone. Inspected `dashboard/layout.tsx` (the parent) and found it does **NOT** guarantee T007's
requirements for descendants: its `!identity.isAuthorizedMember` branch deliberately renders
`{children}` (a RUN B/T016–T022 change, so `/dashboard/kyb/` can render its own content) — so a
future page under `/dashboard/coffee/*` that forgot to re-check authorization itself WOULD render for
a pending/suspended session, exactly the "depends on every future page remembering" risk the
directive was concerned about (Feature 005's own precedent — `inventory/page.tsx`,
`inventory/[positionId]/page.tsx`, `inventory/history/page.tsx`, `storage/page.tsx` — duplicates the
guard in every page, which is this same risk already accepted elsewhere). **Fixed**: the guard moved
to a new `src/app/dashboard/coffee/layout.tsx`, which every current and future route under
`/dashboard/coffee/*` inherits structurally (Next.js never invokes a child Server Component unless
its parent's returned tree includes it). `page.tsx` no longer performs its own identity check.
Proven with a direct-invocation functional test (`tests/listings/guard.test.tsx`) that passes a
representative nested child (standing in for Phase 3's `/dashboard/coffee/[offerId]`) and confirms it
never renders for anonymous/unattached/pending-KYB/suspended identities, and does render for an
authorized member — not merely a claim about today's one page.

**T004 / DB-BLOCK-07.** Reconciled against the written requirements: T004's own Verify line names
exactly four refusal categories (not owned / not Hills-sourced / reserved / insufficient) — all four
implemented and proven. Delivery-reserved refusal (spec.md PS3 scenario 5) is a separate acceptance
path explicitly assigned to **T022** (Phase 7, `Depends: T014`), not T004. DB-BLOCK-07's own entry in
`docs/architecture/DATABASE-CAPABILITY-MAP.md` lists its "Blocks" as **009 (delivery), 005/006
(availability truth)** — not a 006/T004 completion blocker — and that document's own governing rule
is "mark the blocked step explicitly… and stop at the boundary," exactly what T004 does. **T004
remains complete; T022 is recorded as BLOCKED** in `tasks.md` until an approved database change gives
Feature 009 (or an earlier feature) a real delivery-reservation fact. No `deliveryHold` boolean or
fake warehouse state was invented.

**T003 sufficiency** (re-confirmed, no change required): T003's literal Verify line is "returns
own-org rows only; a cross-org id request returns nothing" — satisfied by the live cross-org denial
proof plus a newly-added source-level proof that the query is explicitly scoped by
`seller_organization_id` (exactly 2 call sites). A genuine seller's own positive multi-state live
read is a stronger, separate claim this task's Verify line does not require, and remains honestly
unproven (see §1/§6/§10) — **T003 evidence is sufficient; kept `[x]`**.

**SOLD_OUT/RLS gap** (re-confirmed, no change required): recorded as a known blocker on **T012**
(Phase 3, "Render SOLD_OUT and SUSPENDED listing detail states") in `tasks.md` — not worked around.

---

## 1. Database/RLS preflight (2026-09-12, against the live `database-schema-report.json`)

### `coffee_offers`

- Full column list confirmed: `id, coffee_id, lot_id, seller_organization_id, seller_type,
  source_purchase_order_item_id, warehouse_id, warehouse_location_id, title, quantity_kg,
  reserved_quantity_kg (default 0), price_per_kg, currency (default USD), status (default DRAFT),
  is_visible (default false), rejection_reason, reviewed_by, reviewed_at, created_by, created_at,
  updated_at, deleted_at, filled_quantity_kg (default 0)`.
- `coffee_offers_status_allowed` CHECK — exactly the 9 spec values, no mismatch: `DRAFT,
  PENDING_REVIEW, APPROVED, REJECTED, PUBLISHED, PARTIALLY_FILLED, SUSPENDED, SOLD_OUT, ARCHIVED`.
- `coffee_offers_seller_type_check` — `HILLS, MEMBER_SELLER`.
- `coffee_offers_currency_check` — `currency = 'USD'` (literally the only allowed value today).
- `coffee_offers_visibility_check` — `is_visible = (status IN ('PUBLISHED','PARTIALLY_FILLED'))`.
- `coffee_offers_quantities_check` — `filled_quantity_kg >= 0 AND reserved_quantity_kg >= 0 AND
  (filled + reserved) <= quantity_kg`.
- `uq_active_offer_per_lot_owner` — a **partial unique index**: `(lot_id, seller_organization_id)
  WHERE deleted_at IS NULL AND status NOT IN ('ARCHIVED','REJECTED','SOLD_OUT')`. Only one
  non-terminal-status offer is allowed per (lot, seller) at a time; SOLD_OUT/REJECTED/ARCHIVED are
  exempt and can coexist with an active one on the same lot. (This directly shaped the fixture
  design — see §6.)

RLS policies confirmed live:

- `member_read_published_offers` (SELECT, authenticated): `is_authorized_member() AND status IN
  ('PUBLISHED','PARTIALLY_FILLED') AND is_visible = true AND deleted_at IS NULL AND (quantity_kg -
  filled_quantity_kg - reserved_quantity_kg) > 0`.
  **Honest schema-vs-spec finding (not worked around)**: this predicate's final clause makes a
  `SOLD_OUT` listing (remaining = 0) **unreadable by a buyer even by direct id**. spec.md's PS4
  acceptance scenario 1 ("Given each of DRAFT…SOLD_OUT…ARCHIVED, when viewed, then the exact
  approved label renders") cannot be satisfied for `SOLD_OUT` via the buyer read path as currently
  policied. `lib/listings/browse.ts` applies no compensating client-side filter — it simply returns
  what the database returns. Empirically proven live in `tests/listings/browse.test.ts` (a real
  `SOLD_OUT` fixture row, requested by exact id by a genuinely authorized member, returns `null`).
  **This is open for a product decision** (loosen the RLS predicate, or accept SOLD_OUT as
  seller-only-visible going forward) — not something Phase 3 should quietly design around.
- `offers_compliance_read` (SELECT): `is_compliance_operator() OR is_auditor()`.
- `offers_compliance_update` (UPDATE): `is_compliance_operator()`.
- `offers_owner_or_admin` (ALL): `is_platform_admin() OR is_org_member(seller_organization_id)`,
  WITH CHECK additionally requiring `created_by = auth.uid()` for non-admin writes.

### `listing_status_history`

Columns: `id, offer_id, old_status, new_status, changed_by, reason, created_at`.
RLS: `offer_history_compliance_read` (compliance/auditor) + `offer_history_view`
(`is_platform_admin() OR EXISTS(coffee_offers co WHERE co.id = offer_id AND
is_org_member(co.seller_organization_id))`) — seller-org-readable, matches plan.md.
Written **only** by `trg_listing_status_history` = `AFTER UPDATE OF status ON coffee_offers`
— **fires on status UPDATE only, never on INSERT**. This is why the RUN A fixtures (inserted
directly at a target status) have zero status-history rows — a genuine data fact, not a bug.

### `offer_documents`

No member-read policy exists at all — only `offer_documents_owner_or_admin` (ALL, owner/admin
only). Members can **never** read offer documents under current RLS. This matches plan.md's own
wording (it never claimed member-readability) — recorded here as a confirmed, real gap for whoever
builds the detail page in Phase 3.

### `offer_sensory_notes` / `offer_tags`

Both have a real member-read policy (`member_read_offer_sensory_notes` /
`member_read_offer_tags`), gated on the SAME visible/published predicate as the offer itself.
`lib/listings/browse.ts#getBrowseListingById` reads both directly; `getBrowseListings` (list view)
does not (avoids an N+1 join on a list — matches plan.md's detail-only scope for these tables).

### Functions/triggers read in full

- `organization_can_sell(p_organization_id)` — `SECURITY DEFINER STABLE`: `organizations.status =
  'ACTIVE' AND can_sell = true AND (is_hills_internal = true OR EXISTS(approved kyb_applications))`.
  Reused verbatim via the already-resolved `identity.organization.canSell` — never re-derived.
- `is_authorized_member()` — `auth.uid() IS NOT NULL AND NOT is_blocked_user() AND
  EXISTS(organization_members active + organization_can_buy)`.
- `organization_can_buy(p_organization_id)` — same shape as `organization_can_sell`, confirmed to
  require an APPROVED `kyb_applications` row (unless `is_hills_internal`). This is why a
  `PENDING`/`UNDER_REVIEW` org fails `is_authorized_member()` and reaches zero listing data —
  proven live in `tests/listings/browse.test.ts`.
- `is_platform_admin()` — `EXISTS(platform_admins WHERE role IN ('ADMIN','SUPER_ADMIN') AND
  is_active)`. Confirmed the existing `warehouse-admin` fixture (`role = 'WAREHOUSE'`) does **not**
  qualify — there is no fixture identity that can exercise `offers_owner_or_admin`'s admin branch.
- `validate_offer_transition()` (full body read) — key findings:
  - Requires `warehouse_id IS NOT NULL`; requires `coffee_lots.coffee_id = coffee_id`.
  - HILLS branch: seller org must be `is_hills_internal = true AND status = 'ACTIVE'`.
  - MEMBER_SELLER branch: requires `organization_can_sell(seller_organization_id)`; requires
    `source_purchase_order_item_id IS NOT NULL`; requires that order_item's own order to satisfy
    `oi.lot_id = lot_id AND o.buyer_organization_id = seller_organization_id AND o.status IN
    ('PAID','FULFILLMENT_IN_PROGRESS','PARTIALLY_DELIVERED','COMPLETED')`. **This check is
    unconditional — it runs on a fresh INSERT, not only on a status UPDATE.** This is why no
    MEMBER_SELLER `coffee_offers` fixture row could be constructed for this run (see §6/§7) — it
    requires a genuinely settled order, and no privileged fixture path can reach `PAID`+ (see next
    bullet).
  - Looks up a matching `inventory_positions` row and requires `(quantity_kg - filled_quantity_kg
    - reserved_quantity_kg) <= (available_quantity_kg - reserved_quantity_kg)` else
    `listing_exceeds_tradable_inventory` — this is the exact arithmetic
    `lib/listings/eligibility.ts` mirrors as ITS OWN business rule (not re-derived from a 005
    fact — composed from 005's two raw columns).
  - Provenance fields are locked once status leaves `DRAFT` (`listing_provenance_is_locked`).
  - The full state-machine legality block (DRAFT→{PENDING_REVIEW,ARCHIVED}, etc.) runs **only on
    UPDATE** (`tg_op = 'UPDATE'`) — an INSERT can land directly at any status as long as the other
    unconditional checks pass. Sets `is_visible` unconditionally at the end of every write.
- **Settled-order ceiling (confirmed, not worked around)**: walking an order to `PAID`+ requires
  `assert_order_checkout_ready()` (real `order_shipments`/`shipment_items`), `admin_review_payment`
  (gated by `is_finance_operator()`), and every transition past `DRAFT→CONFIRMED` requires
  `is_internal_transition()` (a session-local Postgres setting that does not persist across
  separate supabase-js/PostgREST calls) or `is_platform_admin()` (never true for service-role,
  since `auth.uid()` is NULL on that connection). **A genuinely settled order cannot be constructed
  by privileged fixture tooling alone** — it requires either a full authenticated
  checkout/shipment/payment walk (Features 007/008's own domain) or an unapproved bypass. This run
  did not attempt either. Concretely, this means: **no MEMBER_SELLER `coffee_offers` fixture row
  exists**, and T004's `eligible: true` / `INSUFFICIENT_QUANTITY` / `RESERVED_QUANTITY` paths (all
  of which require genuine Hills-source provenance) are proven with a fake Supabase client, not
  live. See §7 for exactly what IS proven live.

---

## 2. What was built

| File | Purpose |
|---|---|
| `lib/listings/types.ts` | T001 — closed status/seller-type vocabulary, `BuyerBrowseListing`/`BuyerListingDetail` (buyer-safe), `ManagedListing` (seller-private superset), `FillProjection`/`FillState`, `EligibilityResult`/`EligibilityRefusalReason`. |
| `lib/listings/browse.ts` | T002 — buyer reads, RLS-only (no client-side status/visibility filter), explicit column allowlist, bounded pagination. |
| `lib/listings/manage.ts` | T003 — seller's own-org reads across all states, `listing_status_history` read — kept in its own file from `browse.ts`. |
| `lib/listings/eligibility.ts` | T004 — composes 005's facts (`getInventoryPositionById`, `organization.canSell`) + this feature's own Hills-source-provenance lookup into the SRS §8.1 rule. |
| `lib/listings/fills.ts` | T005 — pure `remaining = quantity_kg - reserved_quantity_kg - filled_quantity_kg` projection; negative remainder is a controlled, observable `NEGATIVE_REMAINING` result, never clamped. |
| `lib/listings/validation.ts` | T006 — Zod schemas for future create/edit, validated against the live CHECK constraints; deliberately not authorization. |
| `src/app/dashboard/coffee/layout.tsx` | T007 — the private marketplace access boundary (identity → membership → honest "not yet built" placeholder), inherited by EVERY route under `/dashboard/coffee/*` (see §0 reconciliation). |
| `src/app/dashboard/coffee/page.tsx` | T007 — content only; no identity check of its own, reachable solely once `layout.tsx`'s guard passes. No listing read happens in RUN A — there is nothing to browse yet. |
| `lib/inventory/types.ts` / `lib/inventory/positions.ts` | Feature 005 Fact Extension (narrowest possible): added `InventoryWarehouseContext.isActive` (raw `warehouses.is_active` pass-through) — the only custody-adjacent fact `eligibility.ts` can use. No HOLD/VARIANCE/QUARANTINE model invented. |
| `lib/types/action-feedback.ts` | Extended (not duplicated) with 6 forward-compatible codes: `LISTING_NOT_FOUND`, `LISTING_NOT_ACCESSIBLE`, `SELLER_NOT_CAPABLE`, `LISTING_INELIGIBLE`, `LISTING_TRANSITION_REFUSED`, `LISTING_SAVE_FAILED`. Unused by RUN A (no Server Action yet) — prepared for Phase 4. |
| `lib/app/copy/en.ts` / `lib/app/copy/ar.ts` | `marketplace.title`/`breadcrumb`/`comingSoon.{title,description}` — EN/AR from day one for the RUN A placeholder. |
| `scripts/seed-test-fixtures.ts` / `tests/auth/fixture-session.ts` | `seedListingFixtures`/`teardownListingFixtures` + `LISTING_FIXTURES` export (mirrors the established `INVENTORY_FIXTURES` pattern). |

### T008 (non-indexable / public-private boundary)

No new code was needed: `/dashboard/coffee` inherits `dashboard/layout.tsx`'s existing
`robots: { index: false, follow: false }`, and `/dashboard` (thus every descendant) is already
excluded from `src/app/sitemap.ts`/`src/app/robots.ts`. Verified structurally in
`tests/listings/boundary.test.ts`, including that `src/app/(public)` (Feature 002's public
catalogue, notably the similarly-named `/coffee` public route) never imports `lib/listings/*`.

---

## 3. Eligibility rule (T004) — facts vs. rule, and the one open gap

| Required fact | Source | Status |
|---|---|---|
| Org owns the inventory position | 005 `getInventoryPositionById` (org-scoped) | Exists |
| `organization_can_sell()` | Already resolved onto `identity.organization.canSell` (003) | Exists — reused, never re-derived |
| Hills-sourced / purchase provenance | `order_items`/`orders`, read directly by `eligibility.ts` (not a 005 fact at all) | Exists (own read) |
| Approved custody | `warehouses.is_active` — the only custody-adjacent fact the schema currently represents | Exists (this run's narrow 005 extension) — **not** a "Hills-approved custody" flag, just the warehouse's own operational-active bit |
| Reserved / eligible quantity | 005's `availableQuantityKg`/`reservedQuantityKg` | Exists |
| Delivery reservation (SRS DEL-01 / PS3 scenario 5) | **No representable fact** — confirmed against `docs/architecture/DATABASE-CAPABILITY-MAP.md` (DB-BLOCK-07) | **Gap — honestly unenforced** |

**DB-BLOCK-07 remains open**: `checkListingEligibility` cannot check whether a position's quantity
is reserved for an in-flight delivery request, because no `delivery_reservations`-shaped table,
column, or function exists. A position with an undisclosed delivery hold would still return
`eligible: true` today. This is documented in `eligibility.ts`'s own header and must be revisited
if/when a future feature exposes that fact — it is not silently claimed as enforced anywhere.

Refusal reasons implemented, in the order the function checks them: `SELLER_NOT_CAPABLE` →
`POSITION_NOT_OWNED` → `CUSTODY_NOT_ELIGIBLE` → `NOT_HILLS_SOURCED` → `RESERVED_QUANTITY` →
`INSUFFICIENT_QUANTITY` → `eligible: true`.

**Naming note**: "Hills-sourced" here means "acquired through a Hills-mediated, settled order,"
not literally "originally owned by Hills" — `validate_offer_transition`'s own predicate does not
check `seller_type_snapshot`, so a legitimate resale chain (bought from another member's earlier
resale) also satisfies it, which is the intended resale-marketplace design.

---

## 4. Fills contract (T005)

`remaining = quantity_kg - reserved_quantity_kg - filled_quantity_kg`, computed ONLY from the three
stored `coffee_offers` columns passed in by the caller — never a query against `order_items` or
`inventory_reservation_items`, never `reduce()`/`+=` accumulation. A negative remainder (which
`coffee_offers_quantities_check` should make impossible) returns `{ ok: false, problem:
"NEGATIVE_REMAINING" }` — never `Math.max(0, …)`. Verified against the two live fixture rows
(`offerPublished`: 100/15.5/24.5 → remaining 60, `PARTIALLY_FILLED`; `offerSoldOut`: 50/0/50 →
remaining 0, `SOLD_OUT`) in `tests/listings/fills.test.ts`.

---

## 5. Validation contract (T006)

`ListingCreateInput`/`ListingEditInput` (Zod) validate shape only — title (nullable, ≤200 chars,
trimmed), UUID references, strictly positive quantity/price (stricter than the DB's own `price_per_kg
>= 0`, deliberately), and `currency` restricted to `LISTING_CURRENCIES = ["USD"]` (the live schema's
only allowed value — not an arbitrary narrowing). `ListingEditInput` deliberately omits every
provenance field (`lotId`/`coffeeId`/`warehouseId`/`warehouseLocationId`), matching
`listing_provenance_is_locked`'s trigger-level lock once a listing leaves `DRAFT`. Validation is
explicitly not authorization — proven with a `@ts-expect-error` compile-time check that
`ListingEditInput`'s inferred type cannot even be constructed with a provenance field.

---

## 6. Test fixtures added

`scripts/seed-test-fixtures.ts#seedListingFixtures` / `teardownListingFixtures`, exposed via
`tests/auth/fixture-session.ts#LISTING_FIXTURES`:

- `warehouseInactive` — a second warehouse, `is_active = false` (proves `CUSTODY_NOT_ELIGIBLE`).
- `positionOrgBOnLotA` — Org B's own position on Feature 005's `lotA`, active warehouse, but no
  settled purchase of that lot (proves `NOT_HILLS_SOURCED`).
- `positionOrgBInactiveWarehouse` — Org B's own position on `lotB`, inside `warehouseInactive`
  (proves `CUSTODY_NOT_ELIGIBLE` via ownership + inactive warehouse together).
- `lotC` / `hillsPositionC` — a dedicated new lot (never Feature 005's `lotA`/`lotB`), because
  `uq_active_offer_per_lot_owner` (see §1) collided with Feature 005's own `offerA` when an earlier
  version of this fixture tried to reuse `lotA`.
- `offerPublished` — HILLS, lot C, `PARTIALLY_FILLED`, `is_visible = true`, quantity 100 / reserved
  15.5 / filled 24.5 / price 12.75 USD — the buyer-readable positive fixture.
- `offerSoldOut` — HILLS, lot C, `SOLD_OUT`, quantity 50 / reserved 0 / filled 50 / price 10 USD —
  exempt from the partial unique index, coexists with `offerPublished` on the same lot, and proves
  the buyer-unreadable finding in §1.

**Deliberately NOT added** (see §1's settled-order ceiling): a MEMBER_SELLER-owned `coffee_offers`
fixture, and any `orders`/`order_items` walked past `DRAFT`. An earlier attempt
(`orderSettledB`/`orderItemSettledB`/`offerDraftB`) was diagnosed as impossible with current
privileged-fixture tooling and removed rather than forced.

---

## 7. Test evidence (all passing)

`tests/listings/` — **83 tests, 8 files, all passing** (updated post-reconciliation: `guard.test.tsx`
9→17, `manage.test.ts` 7→8):

- `types.test.ts` (T001): status/seller-type vocabulary matches the live CHECK constraints exactly;
  `@ts-expect-error` compile-time proofs that `BuyerBrowseListing`/`BuyerListingDetail` reject every
  seller-private field; `ManagedListing` genuinely carries them; `EligibilityResult` is a genuine
  discriminated union.
- `browse.test.ts` (T002): a real authorized member reads `offerPublished`'s exact stored numbers by
  id and via the paginated list; the exact same SOLD_OUT fixture is genuinely unreadable by id or in
  the list (empirical proof of the §1 finding, not merely documented); a pending/under-review member
  (`is_authorized_member()` false) reaches zero listing data; source-level proof of no client-side
  status/visibility filter.
- `manage.test.ts` (T003): live cross-org denial (Org A cannot read the Hills-owned fixture offer by
  id, in its list, or its status history — real RLS, not an application filter); a fake-client test
  proves `ManagedListing`'s full seller-private field mapping (documented as a mapping proof, not an
  RLS proof, since no signable-in seller of a real `coffee_offers` row exists under current fixtures
  — see §1/§6); source-level proof of no `includePrivate`-shaped switch.
- `eligibility.test.ts` (T004): **4 of 6 refusal paths proven live** — `SELLER_NOT_CAPABLE` (pure
  branch, no DB call), `POSITION_NOT_OWNED` (real cross-org lookup), `CUSTODY_NOT_ELIGIBLE` (real
  Org B position in the inactive warehouse), `NOT_HILLS_SOURCED` (real Org B position, no settled
  purchase). The remaining 2 (`RESERVED_QUANTITY`, `INSUFFICIENT_QUANTITY`) plus `eligible: true`
  are proven with a fake client (documented why in the file's own header — the settled-order
  ceiling in §1). Source-level proof `organization_can_sell` is never re-derived and no
  hold/variance/quarantine vocabulary is invented.
- `fills.test.ts` (T005): pure-function proofs including the two live fixtures' exact numbers, the
  negative-remainder integrity path, and source-level proof of no `Math.max` clamping / no
  order-row tally.
- `validation.test.ts` (T006): every CHECK-constraint-derived rule (quantity, price, currency,
  string bounds, UUID shape) plus the compile-time provenance-lock proof for `ListingEditInput`.
- `guard.test.ts` (T007): source-position proof that identity resolution precedes the membership
  guard, which precedes any marketplace content; the guard never imports `lib/listings/browse` or
  `manage`; no `"use client"`, no cache/service-role directive, no Server Action.
- `boundary.test.ts` (T008): no route under `src/app/(public)` (including the similarly-named public
  `/coffee` catalogue) imports `lib/listings/*` or `lib/inventory`; `/dashboard/coffee` inherits
  `noindex`; sitemap/robots never reference it; no cache directive or service-role reference in any
  RUN A listing file.

---

## 8. Regression evidence

- `npm run typecheck` — clean (0 errors), including every `@ts-expect-error` compile-time proof
  above resolving correctly.
- `tests/listings/` — 74/74 passing (8 files).
- `tests/inventory/` + `tests/dashboard/` — 136/136 passing (Feature 005/004 regression).
- `tests/auth/` — 338/338 passing (Feature 003 regression).
- **Full `npm test`** — **764/764 passing, 68 files**, after one genuine fix (below).
- `npm run build` (`next build`) — compiles clean; `/dashboard/coffee` registers as a dynamic
  (`ƒ`) route, never statically prerendered.
- `npm run lint` — 124 errors / 148 warnings reported, but **all of them are pre-existing issues in
  `docs/claude-design/ui_kits/*.jsx`** (static design-reference mockups this run never touched —
  confirmed by grepping the lint output for any path under `lib/listings`, `src/app/dashboard/coffee`,
  `tests/listings`, or `scripts/seed-test-fixtures.ts`: zero matches). **Zero lint issues in any
  Feature 006 file.**
- `git diff --check` — clean (only pre-existing LF/CRLF line-ending warnings, no actual whitespace
  errors).

**One genuine regression found and fixed**: `tests/design/uif-f.test.tsx`'s Feature 004 UIF-036
test asserted a CLOSED list of `/dashboard/*` business-route directories
(`["inventory","kyb","onboarding","settings","storage"]`), which `dashboard/coffee/` (T007's new
guard route) correctly broke. Fixed by adding `"coffee"` to the expected list and updating the
test's own comment to explain T007's guard-only scope — not by loosening the assertion's intent
(it still asserts `orders`/`payments`/`delivery`/`disputes`/`listings`/`sales` do not exist yet).

---

## 9. Explicit boundaries respected (per the run directive)

- **DB-OPEN-05**: `lib/listings/browse.ts`/`manage.ts` mirror 005's attempt-then-degrade pattern for
  lot detail exactly — never invented around.
- **HOLD/VARIANCE/QUARANTINE**: not invented; only `warehouses.is_active` is used, and it is named
  and documented as narrower than "Hills-approved custody."
- **Suspension cascade**: not implemented or assumed — this run renders no listing-suspension effect
  at all (RUN A has no browse/detail UI yet); the open question stays with 010 per spec.md.
- **Fixed-price MVP**: no negotiation/RFQ UI or schema assumption was introduced.
- **No service-role in runtime code**: confirmed by `tests/listings/boundary.test.ts`; service-role
  exists only in `scripts/seed-test-fixtures.ts`'s setup/teardown.
- **No shared cache**: confirmed by `tests/listings/boundary.test.ts` (no `unstable_cache`/`"use
  cache"`/`cacheTag`/`cacheLife`/`updateTag` in any RUN A listing file).
- **T009+ / Phase 3+ / Features 007–010**: untouched. No browse/detail UI, no listing-creation UI or
  Server Action, no seller-management UI, no fill-progression UI, no module registration for
  `coffee`/`listings`/`sales` nav entries.

---

## 10. What Phase 3+ should know before building on this

1. `src/app/dashboard/coffee/page.tsx` currently renders only the route guard + an honest
   "not yet built" placeholder. Phase 3 (T009) replaces the placeholder body — the guard above it
   must not be re-implemented or duplicated.
2. `lib/listings/browse.ts` is the ONLY approved buyer read path. Before building T009/T010, decide
   the SOLD_OUT-unreadable question (§1) — it blocks PS4 acceptance scenario 1 as currently
   specified.
3. `lib/listings/eligibility.ts`'s `eligible: true`/`INSUFFICIENT_QUANTITY`/`RESERVED_QUANTITY`
   paths have never been proven against a real MEMBER_SELLER listing. Phase 4 (T013/T014, the first
   phase that actually creates listings) will be the first opportunity to prove these live, once a
   real settled order exists from testing 007 end-to-end — or a deliberate, documented fixture
   decision is made to bypass the settled-order requirement (which this run declined to do).
4. `lib/listings/manage.ts`'s live cross-org proof used the Hills-owned fixture offers as the
   "other org's data" — a genuine MEMBER_SELLER-owned listing's own-org positive read is still
   unproven live for the same settled-order reason.
5. DB-BLOCK-07 (delivery reservation) remains a real, unenforced gap in eligibility — do not assume
   it is covered.

---

## 11. RUN B (Phase 3 + Phase 4) — T009–T011, T013–T015

### 11.1 What was built

| File | Purpose |
|---|---|
| `src/app/dashboard/coffee/page.tsx` | T009 — marketplace browse: card grid over `lib/listings/browse.ts`, bounded pagination (`?page=`), a single trimmed/bounded title-search box. No identity check of its own — inherits `../layout.tsx`'s guard (T007). |
| `src/app/dashboard/coffee/[offerId]/page.tsx` | T010 — listing detail: lot/warehouse/sensory/tags sections with honest DB-OPEN-05 degradation, `AvailabilityBar`, a genuinely disabled purchase control. `notFound()` for anything RLS won't return. |
| `components/listings/listing-card.tsx` | T011 — the browse card (adapted from the project's design-reference card concept to the actual approved schema — no fabricated photo/grade/origin). |
| `components/listings/availability-bar.tsx` | T011 — listed/reserved/filled/remaining, from `lib/listings/fills.ts`'s `FillProjection` only; negative-remainder renders a controlled error. |
| `components/listings/listing-status-badge.tsx` | T011 — dot + text status badge for all 9 `ListingStatus` values, mirrors `components/inventory/storage-status-badge.tsx`. |
| `src/app/dashboard/listings/new/page.tsx` | T013 — seller listing-creation page: re-verifies `isAuthorizedMember` + `organization.canSell` server-side; composes the eligible-inventory picker via `getInventoryPositions` + `checkListingEligibility` (probed at `requestedQuantityKg: 0`, display only). |
| `src/app/dashboard/listings/new/listing-create-form.tsx` | T013 — the picker + create form (React Hook Form + Zod), and the post-create confirmation/submit-for-review view. |
| `src/app/dashboard/listings/new/actions.ts` | T014/T015 — `createListingDraft` and `submitListingForReview` Server Actions. |
| `lib/listings/validation.ts` (extended) | Added `ListingCreateFormInput` — the form-facing schema (`positionId` instead of raw `coffeeId`/`lotId`/`warehouseId`). |
| `lib/types/action-feedback.ts` (extended) | Added `LISTING_COFFEE_CONTEXT_UNAVAILABLE` — see §11.4. |
| `lib/app/copy/en.ts` / `ar.ts` (extended) | Full `marketplace.browse`/`marketplace.card`/`marketplace.detail`/`marketplace.status`/`marketplace.availability` and `listings.new.*` trees — EN/AR from day one. |
| `tests/design/uif-f.test.tsx` (updated) | The closed `/dashboard/*` directory-list assertion now includes `listings` (genuinely live in RUN B). |

### 11.2 T009 — browse UX and buyer DTO boundary (reconfirmed)

Card grid (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`), each card built from `BuyerBrowseListing` +
a `FillProjection` computed ONCE per listing at the page level and passed down (never recomputed
independently in `ListingCard`/`AvailabilityBar`). Search is a single GET form (`role="search"`,
`method="get"`), trimmed and bounded to 200 chars before being handed to
`getBrowseListings({ titleSearch })`'s own parameterized `.ilike()` — no raw query construction.
Empty state is genuinely honest (`emptyNoSearch` vs `empty` copy depending on whether a search term
was given), never implies an error. The buyer field boundary itself was NOT re-litigated here — T002
already enforces it; this page only ever renders `BuyerBrowseListing`'s own fields.

### 11.3 T010 — detail UX, DB-OPEN-05, and the Feature 007 handoff

Lot section: attempts `listing.lot`; when `null` (DB-OPEN-05), shows the localized
"Detailed lot information is currently unavailable" panel — never blank fields, never an inferred
value. Sensory notes/tags sections render only when genuinely present (never a fabricated "no notes"
placeholder where the field is simply absent). The purchase control is a real `<Button disabled
aria-disabled="true">` — no `href`, no client-side quantity capture, no write to
`reserved_quantity_kg`, no import of anything checkout/reservation-shaped (source-verified). Copy
explicitly states purchasing "isn't available yet" and availability is advisory
(`marketplace.detail.advisoryNote`).

### 11.4 T013/T014 — seller capability gate, eligible picker, and the NEW coffee_id gap

`page.tsx` re-verifies, server-side and independent of any future nav entry (Phase 6/T020 is not this
run's scope): `identity.isAuthorizedMember`, then `identity.organization.canSell` — a buyer-only
organization is refused with `StateScreen kind="forbidden"` (a specific
`listings.new.capabilityRequired` copy override) before any inventory or eligibility read happens at
all. For each of the acting organization's own positions, `checkListingEligibility` is probed at
`requestedQuantityKg: 0` (low enough that `INSUFFICIENT_QUANTITY` can never spuriously fire) purely
to populate the picker's eligible/ineligible display — `createListingDraft` re-verifies for real,
against the ACTUAL requested quantity, server-side, and never trusts this probe's result.

**A NEW, confirmed gap found while implementing `createListingDraft`** (not anticipated by RUN A's
own DB-OPEN-05 characterization, which scoped it to display degradation only): `coffee_offers.
coffee_id` is `NOT NULL`, and the only table that maps `lot_id -> coffee_id` (`coffee_lots`) has the
identical broken, self-referential `member_read_trade_lots` policy DB-OPEN-05 already documents — a
member session can **never** read `coffee_lots`, for a WRITE (resolving `coffee_id` to insert) any
more than for a read. `validate_offer_transition` is `SECURITY DEFINER` and can itself validate
`coffee_lots.coffee_id = new.coffee_id` internally, but it only VALIDATES a caller-supplied value —
it never derives/fills one in. No RPC exists to derive `coffee_id` from `lot_id` either.

**Handling (no invented workaround)**: `createListingDraft` makes ONE best-effort, RLS-respecting
attempt to recover `coffee_id` from the position's OWN originating purchase — the already-verified
`sourcePurchaseOrderItemId` → `order_items.offer_id` → that ORIGINAL `coffee_offers` row's
`coffee_id` (readable only if that original listing happens to still be buyer/owner-readable under
ordinary RLS), with a `lot_id` cross-check so a mismatched value is never trusted. When this cannot
be resolved (confirmed to be the common case, since no member session can ever read `coffee_lots`
directly), the action refuses honestly with the new `ACTION_FEEDBACK.LISTING_COFFEE_CONTEXT_
UNAVAILABLE` code — never a guess, never a service-role read, never a fabricated value. This is a
genuine open question for whoever eventually resolves DB-OPEN-05 (or designs a `create_listing`-style
SECURITY DEFINER RPC) — recorded here, not silently worked around.

Every other server-derived field is enforced the same way: `seller_organization_id` from the
resolved identity, `created_by` from the resolved user id, `seller_type` hardcoded to
`"MEMBER_SELLER"` (a real signed-in session can never legitimately act as `hillsOrg` — Feature 005's
own fixture architecture keeps it deliberately unsignable-in-as), `source_purchase_order_item_id`
from the eligibility result, and `status` OMITTED from the insert entirely (relying on the column's
own `DRAFT` default — there is no field anywhere in the request shape a client could use to select a
status, not even indirectly). The insert itself lists every field explicitly; there is no spread of
`formData`/`parsed.data` anywhere near it (source-verified).

**Direct-invocation security (T014's own required proof)** — every refusal path was called directly,
with no UI/form layer at all, exactly as required: `can_sell=false`, cross-org position, custody-
ineligible, not-Hills-sourced, and forged extra fields (`sellerOrganizationId`/`createdBy`/`status`
stuffed into the FormData) all refused, the forged-fields case producing the IDENTICAL refusal to the
non-forged one (proving those fields are simply never read). All safe-error mapping is generic
(`LISTING_SAVE_FAILED` for any DB-level refusal — ownership/custody/quantity/transition/the
`uq_active_offer_per_lot_owner` unique invariant/anything else) — never a raw Postgres message,
constraint name, or trigger name.

### 11.5 T012 — confirmed unchanged, left `[ ]`

No change from RUN A's own finding (§1): `member_read_published_offers`'s `remaining > 0` clause
makes a genuine `SOLD_OUT` row unreadable by a buyer even by direct id. `T010`'s detail page therefore
renders `notFound()` for the SOLD_OUT fixture — proven live in `tests/listings/detail-page.test.tsx`
— which is the HONEST behavior given the current RLS, not a fix. **T012 remains unchecked, explicitly
flagged `[KNOWN BLOCKER]` in `tasks.md`.** No RLS was weakened, no service role was used, no
RLS-bypass RPC was built, no private row was fetched through the seller/admin path to fake the buyer
experience. This needs an authoritative product/database decision (loosen the predicate, or accept
SOLD_OUT as seller-only-visible) before it can ever be closed.

### 11.6 T015 — DB-owned transition, and the status-history verification gap (status corrected to `[ ]` `[BLOCKED LIVE PROOF]` — §12.15)

`submitListingForReview` implements no parallel state machine — `validate_offer_transition`'s trigger
is the sole legality authority; the action's own `.eq("status","DRAFT")` is defence in depth, never a
substitute. `.select(...).maybeSingle()` after the `.update()` is required to detect a silent
zero-row match (cross-org, wrong status, or a non-creator org member — `offers_owner_or_admin`'s own
`WITH CHECK` additionally requires `created_by = auth.uid()`, confirmed during this run) rather than
reporting a false success.

**Proven live**: buyer-only refusal, cross-org refusal (a real Hills-owned fixture offer), wrong
current status refusal (the same fixture, genuinely not `DRAFT`), a nonexistent id refusing
identically (no existence leak), and source-level proof that only `PENDING_REVIEW` is ever written
and no `listing_status_history` row is ever manually inserted.

**Honestly NOT provable live in this run**: the "successful submit records a `listing_status_history`
row written by the database" half of T015's own Verify line. This requires a REAL, own-org `DRAFT`
`coffee_offers` row — none exists or can be created live, for the SAME settled-order root cause
already established (§0/§11.4), PLUS `hillsOrg` has no signable-in member even for a would-be
HILLS-seller DRAFT (Feature 005's own deliberate fixture design). The successful-transition RESULT
SHAPE is proven with a fake client (`tests/listings/submit-action-success.test.ts`); the trigger's own
history write is NOT re-verified end-to-end. This is an honest, open verification gap for a future
run, once Features 007/008 (or a deliberate fixture decision) produce a genuinely submittable
listing.

### 11.7 Design system, i18n, RTL, theme, responsive, accessibility

Every new screen/component reuses existing primitives exclusively: `PageHeader`, `EmptyState`,
`Button`, `Input`, `Field`/`FieldGroup`/`FormActionBar`, `RadioGroup`/`RadioGroupItem`, `Badge`,
`Separator`, `Progress`, the `AppBilingual`/`useLocale().tApp` i18n conventions, and the same
`--status-*`/`hc-*` design tokens `components/inventory/*` already established — no hand-built
button/input/select/dialog/alert/card, no arbitrary visual system. Every user-facing string added
this run (browse, detail, picker, refusal reasons, form labels, confirmation/toast copy) has a
reviewed EN and AR translation from the start — no hardcoded English in components, no hardcoded
Arabic in logic. Layout uses logical spacing (`ps-`/`pe-`/`ms-`/`me-`, `dir="ltr"` scoped only to
genuinely-LTR numeric/currency figures, matching `components/inventory/*`'s own established
convention) — no `text-left`/`text-right`/unscoped `pl-`/`pr-` introduced. Colors are semantic tokens
only (`text-foreground`/`text-muted-foreground`/`text-destructive`/`--status-*`) — no raw one-theme
color. The browse grid collapses to a single column below `sm:`; the picker's radio cards stack
naturally; no fixed desktop-width assumption was introduced. Status/refusal state is communicated by
dot + text together, never color alone. Native `<button>`/`<a>` semantics are used throughout (a real
disabled `<button>` for the purchase placeholder, a real `<Link>` for card navigation) — no
`dangerouslySetInnerHTML`, no raw HTML anywhere in seller-entered content (title renders through
ordinary React text interpolation only).

### 11.8 Sonner / inline error convention

Field-specific errors (`positionId`/`quantityKg`/`pricePerKg`) render inline via `Field`'s own
`error` prop (React Hook Form + `zodResolver`, same client-side-UX-only pattern
`components/account/kyb-draft-form.tsx` established — the Server Action re-validates with the
identical schema). Global action results (create success/failure, submit success/failure) use the
existing single `useActionToast`/Sonner convention — no second `Toaster`, no duplicate
inline-plus-toast for the same field error, no toast fired during ordinary server rendering.

### 11.9 Cache / service-role audit (RUN B files)

No `unstable_cache`/`"use cache"`/`cacheTag`/`cacheLife`/`updateTag`/module-global map anywhere in
the new pages, components, or actions (source-verified). No service-role reference in any RUN B
runtime file — every read/write in `actions.ts` runs through the request-scoped, RLS-respecting
`createClient()`. After a successful mutation, `revalidatePath("/dashboard/listings/new")` only — the
existing Next.js route-refresh mechanism, never a second caching layer.

### 11.10 DB-BLOCK-07 / T022 — untouched, remains blocked

Not touched this run, per the directive. `eligibility.ts`'s own delivery-reservation gap is
unchanged; `T022` (Phase 7) remains flagged `[BLOCKED]` in `tasks.md`, waiting on an approved database
change.

### 11.11 Test evidence (RUN B)

`tests/listings/` grew from 83 (post-RUN-A-reconciliation) to **154 tests, 17 files, all passing**:
`browse-page.test.tsx` (8), `detail-page.test.tsx` (5), `listing-components.test.tsx` (9),
`create-page.test.tsx` (6), `create-action.test.ts` (9, live direct invocation),
`create-action-eligible.test.ts` (4, module mocks — the happy path + the new coffee-context-
unavailable refusal), `submit-action.test.ts` (7, live), `submit-action-success.test.ts` (2, module
mock). `guard.test.tsx` gained one reconciled assertion (T009 legitimately imports
`lib/listings/browse` now — a stale RUN A "imports nothing" assertion was updated, not deleted).

### 11.12 Regression evidence (RUN B)

- `npm run typecheck` — clean.
- Full `npm test` — **823/823 passing, 76 files** (up from 773 pre-RUN-B; net +50, zero
  regressions after two genuine, unrelated pre-existing-test fixes below).
- `npm run build` — clean; `/dashboard/coffee/[offerId]` and `/dashboard/listings/new` both register
  as dynamic routes.
- `npm run lint` — 272 problems reported, **all pre-existing in untouched `docs/claude-design/
  ui_kits/*.jsx`**, confirmed by a scoped re-lint of every RUN B file returning zero issues. One
  genuine lint issue THIS run introduced (`react-hooks/set-state-in-effect` in
  `listing-create-form.tsx`, calling `setState` inside a `useEffect`) was found and fixed by deriving
  the confirmation state during render instead (the documented React pattern for "adjust state when
  an upstream value changes"), not inside an effect.
- `git diff --check` — clean (only pre-existing LF/CRLF warnings).

**Two genuine, unrelated pre-existing tests needed updating** (both caused by this run's OWN new
files, not regressions in unrelated code):
1. `tests/design/uif-f.test.tsx`'s closed `/dashboard/*` directory-list assertion needed `listings`
   added (`dashboard/listings/new` is now genuinely live) — fixed the same honest way the RUN A
   reconciliation's `coffee` addition was handled.
2. `tests/design/hills-tokens.test.tsx` (untouched) asserts no file under `src`/`components` contains
   the literal string `docs/claude-design` (keeping that directory a pure design reference, never a
   runtime dependency). `listing-card.tsx`'s own header comment originally spelled out that literal
   path to explain its design lineage — the SOURCE comment was rephrased to describe the same
   provenance without the literal substring; no behavior changed, and the test itself needed no edit.

### 11.13 Files changed (RUN B, cumulative with RUN A's own list in §2)

New: `components/listings/{listing-card,availability-bar,listing-status-badge}.tsx`,
`src/app/dashboard/coffee/[offerId]/page.tsx`, `src/app/dashboard/listings/new/{page,actions,
listing-create-form}.tsx`, `tests/listings/{browse-page,detail-page,listing-components,create-page,
create-action,create-action-eligible,submit-action,submit-action-success}.test.{ts,tsx}`.
Modified: `src/app/dashboard/coffee/page.tsx` (T009 real implementation, replacing the RUN A
placeholder), `lib/listings/validation.ts` (+`ListingCreateFormInput`), `lib/types/action-feedback.ts`
(+`LISTING_COFFEE_CONTEXT_UNAVAILABLE`), `lib/app/copy/{en,ar}.ts` (full marketplace/listings.new
trees), `tests/listings/guard.test.tsx` (its now-stale RUN A "page.tsx imports nothing" assertion
reconciled to "page.tsx imports the read layer, never a raw table query" — §11.11), `tests/design/
uif-f.test.tsx` (§11.12, item 1).

### 11.14 Honest remaining blockers (cumulative)

1. T012 — SOLD_OUT/RLS gap (§11.5), unresolved, requires a product/database decision.
2. T014's `coffee_id` resolution — a NEW, confirmed DB-OPEN-05 write-side escalation (§11.4), only
   partially mitigated (best-effort recovery, honest refusal otherwise); no member session can
   directly resolve `lot_id -> coffee_id` at all today.
3. T015's status-history live proof — cannot be closed until a genuinely submittable listing exists
   (§11.6).
4. T022/DB-BLOCK-07 — delivery reservation, untouched, still blocked.
5. DB-OPEN-05 (display) — unchanged, still open.
6. No HOLD/VARIANCE/QUARANTINE model exists; none was invented.

---

## 12. RUN C (Phase 5 available + Phase 6 + Phase 7 available) — T016, T017, T019–T021, T025–T026

### 12.1 What was built

| File | Purpose |
|---|---|
| `src/app/dashboard/listings/page.tsx` | T016 — seller listings list: identity → membership → `canSell` guard, `getManagedListings` over a `TableCardList`, create-listing action, pagination. |
| `lib/listings/manage.ts` (extended) | T016/T020 — added `getManagedListingsCount({ organizationId })`, a third `.eq("seller_organization_id", organizationId)` call site (no new read pattern). |
| `src/app/dashboard/listings/[offerId]/page.tsx` | T017 — seller listing detail: guards, `getManagedListingById` + `getListingStatusHistory`, `EDITABLE_STATUSES`/`WITHDRAWABLE_STATUSES` policy, REJECTED remediation branch, always-rendered status history. |
| `src/app/dashboard/listings/[offerId]/actions.ts` | T017 — `updateListing` (explicit 3-field allowlist), `withdrawListing`, `moveListingToDraft`, all via `requireSellerCapableIdentity()` + `.select("id").maybeSingle()` no-op detection. |
| `src/app/dashboard/listings/[offerId]/listing-edit-form.tsx` | T017 — React Hook Form + Zod edit form (`ListingEditInput`, reused unchanged from RUN A — §5). |
| `src/app/dashboard/listings/[offerId]/listing-lifecycle-actions.tsx` | T017 — `WithdrawListingButton`/`MoveListingToDraftButton`, each its own `useActionState` + `useActionToast`. |
| `lib/listings/sales.ts` | T019 — `getSellerSalesLineItems`, reading `order_items` (self-contained snapshot columns) scoped by `seller_organization_id`, joined to `orders` for `order_code`/`status`/`created_at` ONLY — never `buyer_organization_id`. |
| `src/app/dashboard/sales/page.tsx` | T019 — seller sales list over `getSellerSalesLineItems` and a `TableCardList`. |
| `lib/dashboard/registry.tsx` (extended) | T020 — new `marketplace` module: `coffee` entry at `requiredCapability:"buy"`; `listings`/`sales` entries at `requiredCapability:"sell"`; an overview card ("My listings") that only appears for `canSell` orgs with at least one listing. |
| `lib/app/copy/en.ts` / `ar.ts` (extended) | Full `listings.manage.*`, `listings.detail.*`, `listings.sales.*` trees — EN/AR from day one. |
| `tests/listings/{access-control,isolation,public-exposure,transitions}.test.ts` | T021, T025, T026, T023. |
| `tests/listings/{manage-page,manage-detail-page,sales-page}.test.tsx` | T016, T017, T019 page-level proofs. |
| `tests/dashboard/registry.test.tsx` (updated) | Reconciled for the new `marketplace` module (§12.12). |
| `tests/design/uif-f.test.tsx` (updated) | Closed directory list gains `sales` (`listings` already added in RUN B). |
| `tests/listings/manage.test.ts` (updated) | Call-site count assertion 2 → 3 (§12.12). |

### 12.2 T016 — seller listings page

Guard sequence, server-side, before any `coffee_offers` read: `getRequestIdentity()` →
`identity.kind === "authenticated"` → `identity.isAuthorizedMember` → `identity.organization.canSell`.
A buyer-only organization is refused with `StateScreen kind="forbidden"` and a specific
`listings.manage.capabilityRequired` copy override — no listing read is attempted at all in that
branch (source-verified: the `getManagedListings` call is lexically after the guard's early return,
not merely conditionally rendered). Reads exclusively through `lib/listings/manage.ts`
(`getManagedListings`, no duplicated `.from("coffee_offers")` query anywhere in the page) — the
directive's own explicit requirement. Rows render through the existing `TableCardList` primitive
(real `<table>` at `lg:`+, stacked cards below), columns: listing (title + coffee/lot context),
status (`ListingStatusBadge`, all 9 values), quantity (quantity/reserved/filled), price
(price + currency), updated (`updated_at`), actions (`View` link to T017's detail page). A primary
"Create listing" action button is always visible for a seller-capable org (routes to RUN B's
existing `/dashboard/listings/new`); pagination reuses the same bounded `?page=` convention as T009.
Empty state (`listings.manage.empty`) is honest — no fabricated example row.

**Own-org-only proof**: `getManagedListings`'s own `.eq("seller_organization_id", organizationId)`
scoping (source-level, §7/T003) plus the live cross-org denial already proven in `manage.test.ts`
(T003, unchanged) together satisfy "only current seller organization's listings" — no new proof
needed since T016 introduces no new read path.

**Mobile (~390px)**: `TableCardList`'s existing card mode is reused unchanged from
`components/inventory/*` — no new responsive behavior was invented for T016; verified structurally
(same component, same breakpoint), not independently re-screenshotted this run (§12.9).

### 12.3 T017 — seller listing detail / edit / withdraw

**Guard**: identical sequence to T016, applied before `getManagedListingById` is even called.
A nonexistent id AND a cross-org id are indistinguishable — both yield `getManagedListingById ===
null`, both hit `notFound()` (no existence leak, proven in `manage-detail-page.test.tsx`).

**Editable fields / allowlist**: `updateListing` in `actions.ts` updates exactly
`{ title, quantity_kg, price_per_kg }` — a literal object, never `formData`/`parsed.data` spread.
`ListingEditInput` (reused unchanged from RUN A, §5) already structurally excludes every provenance
field (`lotId`/`coffeeId`/`warehouseId`/`sellerOrganizationId`/`createdBy`/`status`/`sourcePurchase
OrderItemId`/`reservedQuantityKg`/`filledQuantityKg`) at the TYPE level (`@ts-expect-error` proof
already exists in `tests/listings/validation.test.ts`). `EDITABLE_STATUSES = ["DRAFT",
"PENDING_REVIEW", "APPROVED", "PUBLISHED", "PARTIALLY_FILLED"]` is an APPLICATION-level display/UX
policy layered ON TOP of (never replacing) `validate_offer_transition`'s own authority — the trigger
still runs on every UPDATE regardless of what the page chooses to render; a status this constant
omits (e.g. `REJECTED`, `ARCHIVED`, `SOLD_OUT`, `SUSPENDED`) simply never shows the form, it does not
change what the DB itself would accept if some other path attempted the write.

**Withdraw**: `withdrawListing` performs `.update({ status: "ARCHIVED" }).eq("id", offerId).eq(
"seller_organization_id", organizationId)` then `.select("id").maybeSingle()` — a `null` result
(wrong org, wrong current status per the trigger's own legal-transition table, or nonexistent id)
maps to the same generic `LISTING_TRANSITION_REFUSED` code, never a raw Postgres/trigger message.
`WITHDRAWABLE_STATUSES = ["DRAFT", "APPROVED", "PUBLISHED", "PARTIALLY_FILLED"]` mirrors exactly the
seller-permitted `→ARCHIVED` targets already catalogued from `validate_offer_transition`'s trigger
body (RUN A's own reading, unchanged this run) — `PENDING_REVIEW` is deliberately excluded (no
seller-permitted `PENDING_REVIEW→ARCHIVED` transition exists in the trigger), proven by the withdraw
button rendering `disabled` for a `PENDING_REVIEW` fixture in `manage-detail-page.test.tsx`.

**REJECTED rendering**: shows the `rejection_reason` column verbatim when non-null (an honest
compliance reason, not fabricated remediation copy) plus a `MoveListingToDraftButton`
(`moveListingToDraft` → `.update({status:"DRAFT"}).eq("status","REJECTED")`, itself one of the
trigger's own seller-permitted transitions, RUN A's own catalogue). When `rejection_reason` is
`null` (a genuine possible data/RLS state, not assumed impossible), the page shows an honest generic
"Compliance did not approve this listing" message instead of inventing a reason — proven in
`manage-detail-page.test.tsx`.

**Price-snapshot integrity proof**: `order_items.unit_price_per_kg` is written exactly once, by
`validate_order_item_offer`'s trigger, at the `order_items` row's own creation (confirmed by reading
the live trigger body this run — no UPDATE-time price-copy logic exists anywhere in the schema).
`updateListing`'s allowlist only ever touches `coffee_offers.price_per_kg`, never `order_items` (no
`order_items` write appears anywhere in `actions.ts`, source-verified). Since Feature 007 (order
creation) is not implemented, no live `order_items` row referencing any of this run's listings can
exist to re-read after an edit — the guarantee is therefore proven STRUCTURALLY (the schema/trigger
never re-derives the snapshot, and this run's own code never writes to that table) rather than by
an end-to-end "edit then re-read an existing order" live test. This is stated honestly, not silently
claimed as an end-to-end proof.

**Cross-org proof**: covered by the same nonexistent/cross-org `notFound()` proof above, plus
`manage.test.ts`'s existing live cross-org denial (unchanged).

**Validation / Sonner**: `listing-edit-form.tsx` uses the RUN B-established 3-generic `useForm<
z.input<...>, unknown, z.output<...>>()` pattern; field errors render inline via `Field`'s own
`error` prop; the Server Action result surfaces through the existing single `useActionToast`/Sonner
convention — no second `Toaster`, no duplicate inline-plus-toast for the same field.

### 12.4 T019 — seller sales reconciliation

`getSellerSalesLineItems` reads `order_items` (columns: id, order_id, quantity_kg,
unit_price_per_kg, currency, product_name_snapshot, lot_code_snapshot, created_at), scoped by
`.eq("seller_organization_id", organizationId)`, joined ONLY to `orders(order_code, status,
created_at)` — `orders.buyer_organization_id` is never selected, never referenced anywhere in
`sales.ts` (source-verified via a `stripComments()`-guarded regex, since the file's own header
comment legitimately names `buyer_organization_id` to document its deliberate absence). Because
`order_items` carries its own point-in-time snapshot columns, this view has NO dependency on
DB-OPEN-05 (`coffee_lots`) at all — a structural simplification over T016/T017, not a workaround.
Unit (`kg`) and currency are always rendered explicitly alongside every quantity/price figure. Total
per line is `quantity_kg * unit_price_per_kg`, computed per-row for display only — never a
`.reduce()`/running-tally fabricating an aggregate beyond the authoritative per-row figures
(source-verified, no `.reduce(` in `sales.ts`).

**Reconciliation proof**: `can_view_order`'s genuine SELLER branch (confirmed live this run by
reading the function body — `EXISTS order_items oi JOIN coffee_offers co ... JOIN
organization_members om ... WHERE om.user_id = auth.uid()`) means `order_items`/`orders` are
genuinely seller-readable via real RLS, no service-role needed. **Honest fixture limitation**: no
settled order exists for ANY organization in the current live database (the same settled-order
ceiling documented since RUN A/RUN B) — so the TRUE state for the real seller-capable fixture is the
honest EMPTY state, proven live in `sales-page.test.tsx` (not a fabricated sale row standing in for
an unprovable happy path).

**Isolation**: `.eq("seller_organization_id", organizationId)` is the sole scoping predicate
(source-verified, one call site) — combined with `can_view_order`'s own RLS predicate, a seller can
never read another org's `order_items` rows through this path.

### 12.5 T020 — module registration

Added a new `marketplace` module to `lib/dashboard/registry.tsx`'s `DASHBOARD_MODULES`. The
`coffee` nav entry is registered at `requiredCapability: "buy"` (present for every authorized
member — buyer or seller, since `can_sell` implies `can_buy` per the SRS's additive model); the
`listings` and `sales` nav entries are registered at `requiredCapability: "sell"`. Per
`buildDashboardNavGroups`'s existing (Feature 004) filtering behavior, a buyer-only organization
(`canSell: false`) sees `coffee` but never `listings`/`sales` in the sidebar; a seller-capable
organization (`canSell: true`) sees all three. **Nav hiding is never the security mechanism**: T016
and T017's own server-side `canSell` re-verification (independent of whatever the sidebar shows) is
what actually refuses a buyer-only organization that reaches `/dashboard/listings` or
`/dashboard/listings/[offerId]` directly by URL — proven in both `manage-page.test.tsx` and
`manage-detail-page.test.tsx`'s own "buyer-only organization is refused" cases, which mock the
identity directly and never touch the sidebar component at all. The module's `overviewCards`
returns `[]` for a `!canSell` organization or a `canSell` organization with zero listings
(`getManagedListingsCount === 0`), and exactly one "My listings" card otherwise — reusing the
existing async (`MaybePromise`) overview-card contract Feature 004 already supports, with no change
to that contract's shape.

### 12.6 T021 — access control (five personas)

`tests/listings/access-control.test.ts` proves all five required cases against the real
`/dashboard/coffee` route and `lib/listings/browse.ts`'s live RLS, reusing the established
fixture-session helpers (`createAnonymousFixtureClient`, `signInAsFixture`,
`setSuspendedOrganizationStatus`) to avoid GoTrue rate-limiting:

1. **Anonymous** — no session; the `dashboard/coffee/layout.tsx` guard (T007, unchanged) redirects/
   denies before any listing read.
2. **Authenticated, non-member/unattached** — a real signed-in user with no organization
   membership; `identity.isAuthorizedMember` is false; zero listing data reaches the response.
3. **Pending KYB** — a real organization whose KYB status is not yet approved; same guard path,
   zero listing data.
4. **Suspended** — a real organization set to suspended via the established fixture helper; same
   guard path, zero listing data.
5. **Approved active member** — proceeds through the normal authorized path and genuinely receives
   `offerPublished`'s live data.

None of the five assertions is a hidden-UI check; each calls the guard/read path directly (or
renders the actual layout/page against a real fixture session) and asserts on the resulting
data/redirect, never on CSS visibility. No service-role client is used as the assertion path in
any of the five.

### 12.7 T023 — transitions (partial, honestly left `[ ]`)

`tests/listings/transitions.test.ts` (8 tests) proves every currently-constructable FORBIDDEN
transition live: `submitListingForReview` refused for buyer-only/cross-org/wrong-status/nonexistent
id (reusing RUN B's own live fixtures — no new ones needed), `withdrawListing` refused for the same
four shapes plus a `PENDING_REVIEW` listing (not a legal `→ARCHIVED` source), `moveListingToDraft`
refused for a non-`REJECTED` listing. All read the DB's own resulting state afterward to confirm no
silent write occurred (`.select("id").maybeSingle()` returned `null` in every refused case).

**What could not be closed, and why (unchanged root cause since RUN A/B)**: T023's literal Verify
line also requires proving a PERMITTED transition succeeds AND writes a real
`listing_status_history` row. This needs a genuine own-org `DRAFT`/`PENDING_REVIEW`/etc.
`coffee_offers` row belonging to a fixture identity that can actually sign in — impossible today for
the same settled-order ceiling documented since RUN A (§0/§11.4/§11.6): no MEMBER_SELLER row can be
created without a settled order, no settled order can be constructed by privileged fixture tooling,
and `hillsOrg` (the only seller_type that doesn't need a settled order) has no signable-in member by
Feature 005's own deliberate fixture design. No fixture was fabricated, no DB trigger was weakened,
and no impossible fake production state was used to manufacture a passing test. **T023 is left `[ ]`
`[BLOCKED LIVE PROOF]`** in `tasks.md`, per the directive's own explicit instruction — this is not
convenience-based checkboxing.

### 12.8 T025 — cross-organization isolation

`tests/listings/isolation.test.ts` (4 tests) proves, for a real Org A session against the
Hills-owned fixture (the same "other org" already used throughout this feature, since no signable-in
MEMBER_SELLER-owned row exists — §0):

1. A non-published/non-owned listing never appears in Org A's own `getManagedListings` list (normal
   read path).
2. A direct known-id `getManagedListingById` attempt for that same listing returns `null` (direct
   known-ID attempt, not merely absent from a list).
3. `listing_status_history` for that listing is empty for Org A's session (no history leak).
4. A raw, direct `offer_documents` query for that offer's documents returns empty for Org A's
   session (not merely "the app never surfaces it").

**Honest characterization of the `offer_documents` policy nuance discovered this run**: the live
`offer_documents_owner_or_admin` policy is `is_platform_admin() OR EXISTS(coffee_offers co WHERE
co.id = offer_documents.offer_id AND is_org_member(co.seller_organization_id))` — meaning the
OWNING org's own members CAN read their own offer_documents (this is a real, intentional grant, not
a gap). The GAP is narrower and already known: a genuinely-owned MEMBER_SELLER listing's own-org
positive read of its own documents remains unproven live (same settled-order ceiling), not that
cross-org isolation is at risk — isolation itself (case 4 above) IS proven live, against a real
non-owning session.

### 12.9 T026 — public exposure

`tests/listings/public-exposure.test.ts` (9 tests) proves, at the source/import-graph level:

- No route under `src/app/(public)` imports `lib/listings/*` (browse, manage, sales, eligibility,
  fills, validation, types) — reconfirms RUN A's `boundary.test.ts` finding, extended to the new
  `sales.ts`.
- `src/app/sitemap.ts`/`src/app/robots.ts` never reference `/dashboard/listings`, `/dashboard/
  listings/[offerId]`, or `/dashboard/sales`.
- All three new routes inherit `dashboard/layout.tsx`'s existing `noindex, nofollow` (no new
  metadata override was added or needed).
- No JSON-LD/structured-data helper anywhere in the new files.
- Feature 002's public coffee catalogue (`src/app/(public)/coffee` or equivalent) is explicitly
  distinguished by name/route/import graph from the private `dashboard/coffee` marketplace — the
  test asserts the PUBLIC route continues to exist and continues to import only its own Feature 002
  data layer, never `lib/listings/*` — proving the two "coffee" surfaces remain genuinely separate,
  not merging one into the other.

### 12.10 Design system, i18n, RTL, theme, responsive, accessibility

All new screens reuse existing primitives exclusively — `TableCardList`, `PageHeader`,
`EmptyState`, `StateScreen`, `Field`/`FieldGroup`/`FormActionBar`, `Button`, `Badge`,
`ListingStatusBadge` (RUN B), `useActionToast` — no new visual system, no hand-built
table/card/form primitive. Every new string (`listings.manage.*`, `listings.detail.*`,
`listings.sales.*`) has a reviewed EN and AR pair from the start; logical properties
(`ps-`/`pe-`/`ms-`/`me-`) are used throughout, no unscoped `pl-`/`pr-`/`text-left`/`text-right`
introduced; colors are semantic tokens only, reusing the existing `--status-*` vocabulary (draft/
pending/review/paid/transit/complete/cancelled/danger) rather than inventing new ones — REJECTED
and SUSPENDED intentionally share the `danger` tone, disambiguated by text label, matching the
established `storage-status-badge.tsx` precedent. `TableCardList`'s existing responsive behavior
(table at `lg:`+, cards below) is reused unchanged for both T016 and T019.

**Honest limitation**: no browser or axe-based accessibility harness was invoked this run (none is
wired into this project's test tooling) — component-level semantic proofs (labels via
`getByLabelText`, button vs. link semantics, `aria-disabled`/`disabled` state assertions) were made
via Vitest + Testing Library only. EN/AR/RTL/Light/Dark/390px/1366px/desktop coverage this run is
STRUCTURAL — every new screen reuses components and tokens already independently verified at those
breakpoints/themes in Features 004/005/RUN A/RUN B — it was not independently re-screenshotted or
browser-tested this run. This is stated honestly per the directive's own instruction rather than
claimed as a completed T028 pass.

One PRE-EXISTING console warning was observed while reasoning about the codebase's own `Button` +
`render={<Link/>}` pattern ("Base UI: A component that acts as a button expected a native
`<button>`... Use a real `<button>` in the `render` prop, or set `nativeButton` to `false`.") — this
exact pattern is already used in Feature 005's own committed `src/app/dashboard/inventory/page.tsx`
(lines 130, 157, 169), confirming it predates RUN C, is not a regression this run introduced, and is
out of scope to fix in `components/ui/button.tsx` (risks destabilizing many unrelated pages). Not
silently fixed, not silently ignored — recorded here.

### 12.11 Sonner / no-cache / no-service-role / fixed-price audits

- **Sonner**: identical single-provider convention as RUN A/B — no second `Toaster`, field errors
  always inline, global action results always through `useActionToast`.
- **No shared cache**: no `unstable_cache`/`"use cache"`/`cacheTag`/`cacheLife`/`updateTag`/
  module-level cross-request map in any RUN C file (source-verified). `revalidatePath` calls follow
  the existing per-route convention only.
- **No service-role**: every RUN C runtime read/write goes through the request-scoped
  `createClient()`; service-role remains confined to `scripts/seed-test-fixtures.ts`.
- **No client-trusted organization/capability/status**: every action re-resolves `organizationId`/
  `canSell` from `getRequestIdentity()` server-side; no FormData field for organization, capability,
  or status is ever read (source-verified, matching RUN B's own forged-fields proof pattern).
- **Fixed-price boundary**: no order-book, bidding, negotiation, or reference-pricing concept was
  introduced anywhere in T016/T017/T019/T020.

### 12.12 Regression evidence (RUN C)

- `npm run typecheck` — clean (0 errors).
- Full `npm test` — **866/866 passing, 83 files** (up from 823/823 pre-RUN-C; net +43, zero
  regressions after three genuine, unrelated pre-existing-test reconciliations below).
- `npm run build` — clean; `/dashboard/listings`, `/dashboard/listings/[offerId]`, `/dashboard/sales`
  all register as dynamic (`ƒ`) routes.
- `npm run lint` — 273 problems reported, confirmed (via a scoped grep excluding
  `docs/claude-design`) to be **zero outside the pre-existing design-reference baseline**.
- `git diff --check` — clean (only pre-existing LF/CRLF warnings).

**Three genuine, unrelated pre-existing assertions needed reconciling** (all caused by this run's
own new, genuinely-live code, not regressions elsewhere):
1. `tests/dashboard/registry.test.tsx` — 3 assertions updated (module-id list, forbidden-list
   narrowed, nav-group key/href expectations) for the new `marketplace` module, plus 1 new test
   added proving a seller-capable organization sees all three new nav entries.
2. `tests/design/uif-f.test.tsx` — closed directory-list assertion gained `sales` (`listings` was
   already added in RUN B).
3. `tests/listings/manage.test.ts` — the `seller_organization_id` call-site count assertion updated
   from 2 to 3, reflecting `getManagedListingsCount`'s own genuinely new scoped call site.

### 12.13 Files changed (RUN C, cumulative with §2/§11.13)

New: `lib/listings/sales.ts`, `src/app/dashboard/listings/page.tsx`,
`src/app/dashboard/listings/[offerId]/{page,actions,listing-edit-form,
listing-lifecycle-actions}.tsx`, `src/app/dashboard/sales/page.tsx`,
`tests/listings/{access-control,isolation,public-exposure,transitions}.test.ts`,
`tests/listings/{manage-page,manage-detail-page,sales-page}.test.tsx`.
Modified: `lib/listings/manage.ts` (+`getManagedListingsCount`), `lib/dashboard/registry.tsx`
(+`marketplace` module), `lib/app/copy/{en,ar}.ts` (+`listings.manage`/`listings.detail`/
`listings.sales` trees), `tests/dashboard/registry.test.tsx`, `tests/design/uif-f.test.tsx`,
`tests/listings/manage.test.ts` (§12.12).

### 12.14 Honest remaining blockers (cumulative)

1. T012 — SOLD_OUT/RLS gap (§11.5), unresolved.
2. T014's `coffee_id` resolution gap (§11.4), unresolved.
3. **T015/T023's status-history live-proof gap (§11.6/§12.7, corrected 2026-09-13 — §12.15)** —
   implementation complete and correct; only the successful-transition + `listing_status_history`
   database-write half of each task's own Verify line cannot be closed until a genuinely
   submittable/transitionable own-org listing exists (settled-order ceiling). Both left `[ ]`
   `[BLOCKED LIVE PROOF]`.
4. T017's own-org positive edit/withdraw live proof and own-org `offer_documents` positive read
   (§12.3/§12.8) — same settled-order ceiling, narrower than an isolation risk.
5. T018 — deferred, requires Feature 007 (reservation) + Feature 008 (settlement/fill effects).
6. **T022/DB-BLOCK-07 — delivery reservation, untouched, still blocked.** T022's specific
   requirement is proving delivery-reserved quantities are refused; that needs an authoritative
   delivery-reservation representation, expected from Feature 009 (or an earlier feature that
   formally adds the capability) — **not satisfied by Feature 007 alone**, even though Feature 007
   supplies the reservation/order prerequisites T022 will eventually also depend on.
7. T024 — deferred, depends on T018.
8. DB-OPEN-05 (display AND write-side `coffee_id` resolution) — unchanged, still open.
9. No HOLD/VARIANCE/QUARANTINE model exists; none was invented.
10. T027/T028/T029–T032 — final state/accessibility/mobile/RTL closure and remaining Phase 8/9 work,
    correctly deferred until the above are resolved.

### 12.15 Post-RUN-C status reconciliation (2026-09-13)

RUN C's own final report initially left T015 marked `[x]` (carried over from RUN B) and stated
Feature 007 "directly unblocks" T022. Both were corrected on review, with no change to any
implementation:

- **T015 → `[ ]` `[BLOCKED LIVE PROOF]`**: T015's literal Verify line requires the successful
  own-org transition AND its database-written `listing_status_history` row to be proven live, not
  merely the forbidden-transition refusal. Only the refusal half was ever proven live (§11.6); the
  successful half remains fake-client-only (result shape). Per the same "no convenience-based
  checkboxing" standard already applied to T023, T015 must carry the identical status — it was an
  oversight to leave it `[x]` in RUN B/RUN C, not a newly discovered gap.
- **T022's dependency corrected**: Feature 007 (order creation/checkout) resolves the settled-order
  ceiling behind items 1–4 above (T012's own-org proofs, T014's coffee_id gap indirectly, T015/T023,
  T017's own-org proofs) — but T022 specifically needs a delivery-reservation FACT that does not
  exist in the schema at all (DB-BLOCK-07), which is Feature 009's domain, not Feature 007's.
- **Completed count corrected**: 21/32 → **20/32** (T015 moved from `[x]` to `[ ]`; no other status
  changed).

**Recommended next step**: pause Feature 006 and proceed to Feature 007 (order creation/checkout) —
it is the correct unblocking dependency for the settled-order ceiling behind items 1–4 above. Feature
009 (or an equivalent delivery-reservation capability) remains separately required before T022 can
close, and T018/T024 additionally require Feature 008.
6. No HOLD/VARIANCE/QUARANTINE model exists; none was invented.
