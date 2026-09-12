# Feature 006 — Marketplace, Seller Listings & Resale — RUN A Handoff

**Scope delivered**: Phase 1 (Listing domain layer, T001–T006) + Phase 2 (Marketplace access
control, T007–T008) ONLY.
**Status**: T001–T008 implemented and verified. **Feature 006 is NOT complete** — Phases 3–9
(T009–T032) are untouched and out of scope for this run.

This document records the live-schema preflight evidence, the DTO/read/eligibility contracts as
actually built, every honest gap found (worked around nowhere), the test evidence, and the
regression results, so Phase 3+ can build on this foundation without re-deriving any of it.

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
