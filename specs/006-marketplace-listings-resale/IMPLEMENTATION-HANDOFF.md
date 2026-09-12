# Feature 006 — Marketplace, Seller Listings & Resale — Implementation Handoff

**Scope delivered**: RUN A — Phase 1 (Listing domain layer, T001–T006) + Phase 2 (Marketplace access
control, T007–T008). RUN B — Phase 3 (Marketplace browse & detail, T009–T011) + Phase 4 (Seller
listing creation, T013–T015). See §11 for the full RUN B account.
**Status**: T001–T011, T013–T015 implemented and verified. **T012 is a KNOWN BLOCKER, deliberately
left `[ ]`** (§11.5). T022 remains BLOCKED by DB-BLOCK-07 (untouched this run). **Feature 006 is NOT
complete** — Phases 5–9 (T016–T032) are untouched and out of scope for both runs so far.

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

### 11.6 T015 — DB-owned transition, and the status-history verification gap

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
