# Feature 005 — Inventory, Custody & Storage — Implementation Handoff

## RECONCILIATION (2026-09-12) — read this before the RUN A narrative below

Before Phase 1 was considered closed, the two material findings RUN A reported below were
re-audited to a higher, empirical standard on the user's explicit request. Both findings below are
now CORRECTED/CONFIRMED — the RUN A text underneath is left in place with the original wording, but
is superseded by this section wherever the two disagree:

1. **Owned quantity (was: "reserved_quantity_kg is written by no function")** — RETRACTED. Re-tracing
   the LIVE function bodies (`docs/database/database-schema-report.json`'s `functions[].definition`,
   not the static `supabase/trading_schema.sql` file RUN A cited) proves `reserved_quantity_kg` IS
   actively written: `checkout_order` increments it at reservation time (after validating
   `(available_quantity_kg - reserved_quantity_kg) < quantity_kg` — the database's own confirmation
   that `available_quantity_kg` is the position's TOTAL/gross owned quantity), `expire_order_hold`
   decrements it on hold expiry, and `admin_review_payment` debits both columns together on the
   seller's position at settlement while crediting the buyer's `available_quantity_kg`. "Every live
   position reads 0 today" remains true as a DATA fact only (the table is empty pre-007/008), not as
   a claim about the schema's capability. No DTO/code change was needed — both raw columns were
   already exposed verbatim with no synthesized "owned" figure — only the documentation was wrong.
   Corrected in `lib/inventory/types.ts`'s header comment and in `tasks.md`'s T001 closure note.
2. **`inventory_reservation_items` visibility (was: "theoretical, not live-provable")** — CONFIRMED
   LIVE, tracked as **DB-OPEN-12** in `docs/architecture/DATABASE-CAPABILITY-MAP.md`. Synthetic rows
   were seeded via the approved service-role setup/teardown pattern (service-role used only for
   setup/teardown, never as the reading identity) and read back through three real, authenticated,
   non-privileged fixture sessions. The order's buyer correctly read the parent `orders` row
   (`hold_expires_at` visible — `can_view_order`/`orders_view` work exactly as designed) but got ZERO
   rows from `inventory_reservation_items` for the matching reservation, despite a service-role sanity
   read confirming the row genuinely existed; an unrelated cross-org session and the offer's seller
   both got zero rows everywhere, as required. **Conclusion: `inventory_reservation_items` is
   confirmed unreadable for every non-admin member today.** T005 remains COMPLETE against the
   corrected, honest contract: the authoritative `reservedQuantityKg` stays visible (read directly off
   `inventory_positions`), and the reservation cause honestly and permanently degrades to
   `{ kind: "unknown" }` — this is not a rare edge case today, it is the only case. Corrected in
   `lib/inventory/availability.ts`'s header comment and in `tasks.md`'s T005 closure note.

**Regression re-run after these corrections**: focused inventory tests, typecheck, full suite,
production build, changed-code lint, and `git diff --check` were all re-run clean — see the
reconciliation's own final report for exact figures. No `lib/inventory/*` runtime code changed; only
documentation (this file, `types.ts`/`availability.ts` header comments, `tasks.md`,
`DATABASE-CAPABILITY-MAP.md`) was corrected.

## RUN A (2026-09-12) — Phase 1 (Inventory Domain Read Layer, T001–T006)

**Scope of this run**: T001–T006 only. No UI pages, no Feature 004 registry registration, no Phase
2–9 work. This feature ships **zero mutations** — confirmed: no `"use server"`, no `SERVICE_ROLE`,
no migration, no RLS change anywhere in this run's diff (`git status` shows only new files under
`lib/inventory/` and `tests/inventory/`; nothing existing was touched).

## DB / RLS preflight (required before any code was written)

Read, in order: `docs/requirements/Hills-Coffee-SRS-v1.md` (§7 LOT-01..04), `docs/database/README.md`,
`docs/database/database-schema-report.json` (parsed directly via Node — it is a single ~663KB JSON
blob, not grep-friendly), `specs/005-inventory-custody-storage/{spec,plan,tasks}.md`,
`docs/architecture/DATABASE-CAPABILITY-MAP.md`, then `supabase/trading_schema.sql` for the real
write-side behavior of the tables this feature reads.

### Two material findings, neither hidden nor worked around

**1. `inventory_positions` has no `owned_quantity_kg` column.** Confirmed exhaustively — the table
has exactly 9 columns: `id`, `lot_id`, `owner_organization_id`, `warehouse_id`,
`warehouse_location_id`, `available_quantity_kg`, `reserved_quantity_kg`, `created_at`, `updated_at`.
Tracing the real writes in `trading_schema.sql`'s checkout/settlement functions shows
`available_quantity_kg` functions as the OWNER'S TOTAL quantity at that position (e.g. the
`coffee_offers` trigger validates `ip.available_quantity_kg >= new.quantity_kg` when checking "does
this seller own enough to list this quantity," and the settlement function debits the seller's
`available_quantity_kg` and credits the buyer's on transfer) — not "currently free to trade right
now" the way its name might suggest against `reserved_quantity_kg`. `reserved_quantity_kg` itself,
while real and CHECK-constrained (`reserved_quantity_kg <= available_quantity_kg`), is written by
**no function anywhere in the current approved schema** — every live position would read
`reservedQuantityKg: 0` today. `lib/inventory/types.ts` documents this in full; the read layer
exposes both columns verbatim, under names mirroring the database's own, and does not synthesize a
third "owned" or "truly free" figure.

**2. `inventory_reservation_items` may itself be structurally unreadable for ordinary members —
theoretical, not live-provable.** The plan expected `inventory_reservation_items` (via its
`reservation_items_view` policy, gated by `can_view_order`) to be the approved, member-readable
source for reservation cause. Tracing that policy's actual definition shows it is an `EXISTS` against
`inventory_reservations` — a table with no policy other than `is_platform_admin()` — and that `EXISTS`
is a plain subquery, not wrapped in a `SECURITY DEFINER` function, so it is evaluated under the
CALLING role's own row security. For an ordinary (non-admin) member, that `EXISTS` may never be
satisfiable, meaning `inventory_reservation_items` could be blocked in a structurally similar way to
DB-OPEN-05's `coffee_lots` predicate defect — for a different underlying reason. **This could not be
empirically proven live**: `inventory_positions`, `storage_allocations`, `inventory_ownership_events`,
`inventory_reservation_items`, `inventory_reservations`, and `coffee_lots` are ALL genuinely empty in
the live database right now (confirmed via a one-off, non-committed, service-role row-count check —
0 rows in every one), because the only functions that would ever populate them
(`checkout_order`, `admin_review_payment`, warehouse-operator writes) belong to Features 007/008/010,
none of which exist yet. `lib/inventory/availability.ts` does not assume either theory: it attempts
the approved chain exactly as planned, and degrades to `{ kind: "unknown" }` whenever it comes back
empty — correct regardless of which explanation turns out to be true, and forward-compatible with no
code changes needed once real data or a policy fix clarifies it.

### DB-OPEN-05 — reconfirmed, still OPEN, not resolved

`coffee_lots`'s `member_read_trade_lots` SELECT policy predicate is
`is_authorized_member() AND EXISTS (SELECT 1 FROM coffee_offers co WHERE co.lot_id = co.id AND ...)`
— a self-comparison on `coffee_offers`' OWN columns (never joining to the actual lot being looked up),
confirmed directly against the live schema report. Still recorded OPEN in
`docs/architecture/DATABASE-CAPABILITY-MAP.md` (line 253) — this run did not resolve it, did not
bypass it with a service-role read, and did not invent a migration to fix it (out of scope; a product/
database decision per spec.md's own Open Items). Current member-read behavior: `coffee_lots` SELECT
is effectively unreachable for a normal (non-admin, non-auditor, non-warehouse-operator) member
session — `lib/inventory/positions.ts` attempts the join anyway and returns `lot: null` when it comes
back empty, never failing the position list and never fabricating a value. `coffees` itself IS
publicly readable when `status = 'PUBLISHED'` (a separate, more permissive policy), but since the
FIRST hop (`coffee_lots` → `coffee_id`) is blocked, that more-open `coffees` policy is unreachable too
for now — there is currently no readable path from a position to ANY lot/coffee context at all,
coarse or otherwise.

## T001 — DTO types (`lib/inventory/types.ts`)

`InventoryPosition`, `InventoryLotContext`/`InventoryLotDetail` (nullable — DB-OPEN-05),
`InventoryWarehouseContext` (deliberately narrower than the full `warehouses` row — no `address`, even
though that column is technically public-readable; not required by spec.md, kept conservative),
`PaginatedResult<T>`, `StorageAllocationStatus` (closed union), `StorageAllocation`,
`OwnershipEventType` (closed union), `OwnershipEventRole`, `OwnershipCounterparty` (with `redacted`),
`OwnershipEvent`, `ReservationCause` (`"order" | "unknown"`), `AvailabilityBreakdown`,
`InventoryEligibilityFacts`. Every quantity field's doc comment states its exact source column and the
no-arithmetic rule; the file's own header comment carries the full LOT-02/schema-evidence reasoning
above so a future reader does not have to re-derive it.

## T002 — Positions (`lib/inventory/positions.ts`)

`getInventoryPositions({ organizationId, page?, pageSize? })`. Bounded via `.range()` (page size
clamped 1–100, default 25) with a deterministic `order by created_at desc, id desc` tie-break — the
codebase had no prior `.range()` pagination convention to reuse (checked: zero existing usages), so
this is the minimal, standard Supabase approach, not invented cursor infrastructure. `organizationId`
is explicit (never `organizations[0]`) and must be the caller's already-resolved
`identity.organization.organizationId`, exactly mirroring `lib/kyb/status.ts#getKybWorkspace`'s
established convention — RLS (`inventory_owner_read`) is the real security boundary regardless, but
explicit scoping is required for correctness with multi-org callers. Lot/coffee/warehouse context is
joined only through plain, RLS-respecting reads (never service-role); lot context degrades to `null`
per the DB-OPEN-05 finding above.

## T003 — Allocations (`lib/inventory/allocations.ts`)

`getStorageAllocations({ organizationId, page?, pageSize? })`. Same pagination/scoping discipline as
positions. `status` passed through as the table's own CHECK-constrained vocabulary
(`STORED`/`RELEASED`/`DELIVERED`) with no renaming; `quantityKg`/`releasedQuantityKg` read and
returned as two independent columns (proven with a genuine partial-release fixture in tests, not
merely two fields that happen to be equal).

## T004 — Ownership ledger (`lib/inventory/ownership.ts`)

`getOwnershipEvents({ organizationId, page?, pageSize? })`. Reads events where the acting org is
`from_organization_id` OR `to_organization_id` (`.or(...)`, matching the RLS policy's own OR
structure). **Counterparty redaction**: `organizations`' own RLS
(`organizations_member_select`: `is_org_member(id) OR is_platform_admin()`) only ever lets a member
read their OWN organization's row — a genuine counterparty's `display_name` is unreadable by direct
query, full stop. This function attempts the read anyway (same "attempt then degrade" discipline as
positions' lot lookup); when a counterparty's name does not resolve, `redacted: true` is set but the
event is never dropped and the counterparty's raw `organizationId` (not itself secret — already
readable directly off the event row) is preserved. No update/delete/reorder/correction helper exists
anywhere in this file, or anywhere in `lib/inventory/*` — the append-only guarantee is the database's
own `prevent_ownership_event_mutation` trigger; this module could not offer a mutation affordance even
if asked to, because it exports nothing that writes.

## T005 — Availability (`lib/inventory/availability.ts`)

`getAvailabilityBreakdown({ organizationId, positionIds? })`. **Zero arithmetic**: the exact
structural audit (`grep -nE "[-+*/]\s*(available|reserved)_quantity" lib/inventory/availability.ts`)
returns nothing, reconfirmed after implementation; a broader camelCase-field variant of the same grep
also returns nothing. `inventory_reservations` is read (only to resolve a reservation's `order_id`)
through the caller's own ordinary session — never a privileged path, never filtered/selected beyond
that one column — exactly matching the "attempt via approved sources, never fabricate" contract; see
the material RLS finding above for why this may come back empty for an ordinary member today. When no
cause resolves, the reserved quantity truth is still returned; only the cause degrades to
`{ kind: "unknown" }`.

## T006 — Feature 006 facts (`getInventoryEligibilityFacts`, in `availability.ts`)

Returns `positionId`/`lotId`/`ownerOrganizationId`/`warehouseId`/`availableQuantityKg`/
`reservedQuantityKg` only — no listing-eligibility decision. No `isEligibleToList`/`canList`/
`listingAllowed`/`canResell` symbol is declared anywhere in `lib/inventory/*` (verified by test,
checking actual declarations rather than merely scanning for the words, since this file's own doc
comments legitimately name them to explain the deliberate omission). A "Hills-approved custody"
boolean fact was considered and deliberately NOT included: the approved schema has no direct
representation of it — only `warehouses.is_active` (a narrower "is this warehouse operational" fact,
not "is this specific custody arrangement Hills-approved"). Approximating it via
`organizations.is_hills_internal` would have been exactly the kind of assumption-based join this
feature avoids elsewhere; documented in `types.ts` instead, left for Feature 006 to resolve explicitly
if and when it actually needs that fact.

## Cross-cutting closure items

- **No service-role**: `grep -rn "SERVICE_ROLE|service_role" src/ lib/ components/` returns nothing.
- **No cache**: `grep -rn "unstable_cache|cacheTag|cacheLife|updateTag|\"use cache\"" lib/inventory`
  returns nothing. Inventory is transactional truth; nothing here is memoized across requests.
- **Zero mutations**: `grep -rn "\"use server\"" lib/inventory` returns nothing.
- **Public/private boundary**: no public route imports anything from `lib/inventory/*` (verified by
  grep across `src/app/(public)` and the root public pages).
- **Acting-organization authority**: every function takes `organizationId` explicitly; never
  `organizations[0]`, never a raw client parameter with no server-side origin. RLS
  (`is_org_member(owner_organization_id)`, etc.) remains the real security boundary in every case —
  explicit scoping exists for multi-org correctness, not as the actual security control.
- **Error model**: matches the codebase's existing established convention for pure read-layer
  functions (`lib/kyb/status.ts`, `lib/agreements/acceptance-status.ts` — neither checks `error` on
  its Supabase calls; RLS denial and a genuine transient error both surface as "no data," and the
  caller shows an honest empty/loading state). This run follows the SAME convention for consistency
  with every other lib read module, rather than introducing a new, inconsistent throw-based style.

## Tests performed

- `tests/inventory/fake-supabase.ts` — a minimal, chain-agnostic fake Supabase query builder (every
  chain method returns the same thenable object). Used ONLY because every real inventory table is
  genuinely empty right now (service-role, unfiltered count = 0 for all six relevant tables) — there
  is no approved way to create realistic rows yet, since the functions that would write them belong to
  unbuilt Features 007/008/010. This lets exact-quantity/vocabulary/redaction assertions be made
  precisely without waiting for that infrastructure.
- `tests/inventory/quantity-fidelity.test.ts` (6 tests) — T002/T003: exact quantity pass-through, no
  fabricated lot values, DB-OPEN-05 degradation, forward-compatible lot resolution, bounded pagination,
  exact allocation vocabulary with independently-verified quantities (genuine partial-release fixture).
- `tests/inventory/availability.test.ts` (7 tests) — T005/T006: the exact structural no-arithmetic
  grep (plus a broader camelCase variant), no service-role reference, honest `"unknown"` degradation,
  a resolvable-cause path, no spurious cause for zero reserved quantity, and the facts-not-rules
  boundary (both by declaration-grep and by exact shape assertion).
- `tests/inventory/live-empty.test.ts` (7 tests) — REAL integration proof: the same
  mock-of-`createClient` technique `tests/auth/request-identity.test.ts` already established, injecting
  a REAL fixture-session client (not a fake) so these functions run against the ACTUAL live database
  through ACTUAL RLS. Proves: no error, an honest empty page for the caller's own organization, an
  honest empty page for an organization the caller does not belong to, and the same for a genuinely
  anonymous session — the strongest live proof available given zero seeded data exists.
- Also ran (regression, unmodified): `tests/auth/isolation.test.ts` (7), `tests/auth/
  acting-organization.test.ts` (5), and the full `tests/dashboard/*` suite (49) — all pass unchanged.

**LIVE / AUTHENTICATED DB PROOF — honest scope**: this run proves the read layer runs against the
real database, through real RLS, with a real session, and degrades honestly to empty with no error —
for BOTH the caller's own organization and an organization they do not belong to (both currently
empty, so both look identical; this is NOT yet a full positive-vs-negative cross-tenant isolation
proof with actually-differing seeded rows). That full proof — `tests/inventory/isolation.test.ts`
with real seeded positions/allocations/events in two distinct organizations — is explicitly Phase 5's
job (T016), not this run's, per the run directive's own instruction ("Phase 5 will own the full
release-blocking isolation suite").

## Regression run this run

- `npm run typecheck` — clean.
- `npm test` — **625/625 passing, 56 files** (up from Feature 004's 605/53 — 20 new tests, 3 new
  files, zero regressions).
- `npm run build` — clean (no new routes; this run adds no UI).
- `npm run lint` — 272 problems, all under the historical `docs/claude-design/` baseline; zero new
  findings in Feature 005 code.
- `git diff --check` — clean; `git status` shows only new files under `lib/inventory/` and
  `tests/inventory/` — nothing existing was modified.
- Mechanical audits (service-role, cache, mutation, public-import, structural no-arithmetic) — all
  return nothing, as required.

## Honest remaining gaps

- No genuine positive-vs-negative cross-tenant isolation proof exists yet (no seeded data) — Phase
  5's explicit job.
- The `inventory_reservation_items`/`inventory_reservations` RLS-chain concern (see the
  RECONCILIATION section above) is now a CONFIRMED LIVE FACT, tracked as `DB-OPEN-12` — reservation
  cause/expiry will read as `{ kind: "unknown" }` for every ordinary member until `reservation_items_view`
  is corrected (e.g. wrapping its `EXISTS` in a `SECURITY DEFINER` helper the way `can_view_order`
  itself already is). This is a database-owned fix, out of this feature's scope to apply.
- DB-OPEN-05 remains open; no lot/coffee context is currently reachable for an ordinary member behind
  a position, at all (not even coarse coffee name) — a real, live product gap, not merely a "detail
  missing" one, since the FIRST hop (`coffee_lots`) is fully blocked.
- Phase 2 (UI pages), Phase 3 (variance/hold surfacing — depends on 010's warehouse model, not yet
  built), Phase 4 (Feature 004 module registration), Phases 5–7 (formal isolation/a11y/closure) all
  remain entirely unstarted, as directed.

## Exact next run

Phase 2 (T007–T012 — member inventory/storage/ledger UI pages and presentational components) is the
next scoped unit of work, reading exclusively through this run's `lib/inventory/*` DTO layer per
FR-001. Before building it, read this handoff's two "material findings" sections above — they affect
what the UI can honestly claim to show (no "owned" figure without a product decision on what that
should mean; reservation-cause display should expect `"unknown"` to be the common case today, not the
exception).
