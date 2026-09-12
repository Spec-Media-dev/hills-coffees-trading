# Feature 005 — Inventory, Custody & Storage — Implementation Handoff

## RUN D (2026-09-12) — Phase 6 (T020–T021) COMPLETE

**Approved scope:** responsive/accessibility closure only. No database, RLS, migration, Storage,
mutation, authorization, Feature 010, Phase 3 or Phase 7 work was started.

### Production fixes and evidence

- `components/locale/language-switcher.tsx` now selects the existing Hills semantic foreground token
  from the actual rendered theme: `--foreground` in Light and `--sidebar-foreground` in Dark. This
  fixes the real `.hc-language-switcher > span[dir="ltr"]` Dark/RTL contrast failure from **1.31:1**
  (`#173c32` on `#192420`) to **13.09:1** (`#eee8dc` on `#192420`).
- `src/app/globals.css` applies the existing `--sidebar-foreground` token to shared dark-shell
  breadcrumb links, preserving hierarchy with `opacity: .82` and returning to full opacity for
  hover/focus. Its prior Arabic Dark value was **2.45:1**; the composited link is now `#c8c5ba` on
  `#1a2420`, **9.23:1**. No Feature-005-specific colour override or new token was introduced.
- The mobile card helper wraps long secondary values and the real inventory position action is at
  least 44×44px. Focused unit tests cover both conditions.
- Real authenticated headless Chrome checked `/dashboard/inventory/`, its real position detail,
  `/dashboard/storage/`, and `/dashboard/inventory/history/` at EN/LTR 1440px Light/Dark and
  AR/RTL 390px Light/Dark. Every route: axe `violations: []`, no console/page/request errors,
  `scrollWidth === clientWidth`, correct theme/locale/direction, desktop tables or mobile cards as
  appropriate. Reduced-motion tokens all measured `1ms`; the mobile position action was keyboard
  focusable with its real route.
- Exact T021 logical-direction grep passed with zero `text-left`, `text-right`, non-negative `pl-`,
  or `pr-` matches under the specified inventory/storage/component paths.

### Validation note — pre-commit authentication reconciliation

The initial full sequential suite had **30 fixture-login failures** across eight files. This was
reproduced and isolated without changing application code: the helper had 80
`signInWithPassword` call sites, each making a fresh grant. A controlled, non-secret probe returned
32 successful grants followed by HTTP 429 `over_request_rate_limit` on grant 33. The exact fixed-id
fixture verifier passed, a direct buyer password grant returned HTTP 200 with a session, the prior
failing file passed alone (18/18), and a representative prior-failure group passed together (33/33).

`tests/auth/fixture-session.ts` now retains one AAL1 password-grant session per fixture in the
sequential test-worker process, while returning a fresh client with a unique storage key for every
test caller. If an intentional local sign-out invalidates the cached refresh token, it discards only
that fixture's cache and performs one genuine replacement grant; there is no service role, fake
identity, bypass, timeout increase, or production auth change. The final full suite is **60 files /
690 tests PASS**. `npm run typecheck`, production-path lint (`npx eslint src lib components tests
scripts`), `git diff --check`, focused Phase-6 tests (30/30), inventory tests (80/80),
dashboard/Feature-004 shell regression (77/77), and `npm run build` passed. Phase 7's separate
full-suite closure task (T022) remains unchecked.

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

## RUN B RECONCILIATION (2026-09-12) — read this before the RUN B narrative below

Before RUN B was considered closed, two of its own closure claims were re-audited on the user's
explicit request:

1. **T010 order linkage** — RUN B originally shipped with NO order reference on the storage page,
   reasoning `lib/inventory/allocations.ts` didn't join `order_items`/`orders`. Re-audited against the
   live schema/RLS: `storage_allocations.order_item_id` → `order_items` (`order_items_view`:
   `can_view_order(order_id)`) → `orders` (`orders_view`: `can_view_order(id)`) is a GENUINE,
   member-readable chain — both policies call `can_view_order()` directly at the top level, unlike
   DB-OPEN-12's nested, broken chain. **Empirically proven live** (service-role setup/teardown only;
   real authenticated read as the allocation owner and an unrelated cross-org member): the owner read
   through to the real `order_code`; the unrelated member got zero rows everywhere. Fixed:
   `getStorageAllocations` now resolves this chain (new `StorageAllocationOrderContext` type,
   `resolveOrderContext` helper); the storage page renders the order code as plain reference text
   (never a hyperlink — no order-detail route exists yet in this codebase).
2. **T015 module contract** — RUN B originally composed the "what did I buy"/"where is it" overview
   cards directly in `src/app/dashboard/page.tsx`, bypassing the module contract because
   `composeOverview` was synchronous and `lib/inventory/*` reads are inherently async. Re-examined:
   this established exactly the second, page-specific integration path Feature 004's module contract
   was designed to prevent — the first real module should not be the one to break that discipline.
   Fixed with the smallest safe extension: `DashboardModule.overviewCards`/`actionItems` may now
   return a `Promise`, `composeOverview` is `async` (resolving every granted module concurrently,
   deterministic order preserved), and the "inventory" module's `overviewCards` performs its own
   bounded COUNT reads directly. `dashboard/page.tsx` is back to a plain `await composeOverview(...)`.
   No ambient state, no shared cache, no authorization change — a module still receives only
   `{ organization }`. All 5 pre-existing Feature 004 tests were mechanically updated to `await`, and
   the 3 that feed the real registry now mock `@/lib/supabase/server` (the same technique
   `tests/inventory/*` already uses) since the real registry now contains a module that performs a
   real (mocked) read — every original guarantee those tests proved still holds and still passes. 3
   new tests prove the positive contract path end-to-end.

Both fixes are reflected in `tasks.md`'s T010/T015 closure notes (as RECONCILIATION addenda) and in
the code below. Regression re-run after these fixes: focused inventory/dashboard tests, full suite,
typecheck, build, lint, `git diff --check` — see this reconciliation's own final report for exact
figures.

## RUN B (2026-09-12) — Phase 2 (Member inventory surfaces, T007–T012) + Phase 4 (T015)

**Scope of this run**: T007–T012, T015 only. No Phase 3 (T013/T014 — depends on 010's warehouse
model), no Phase 5 (T016–T019 — formal release-blocking isolation suite), no Phase 6 (T020/T021 —
formal a11y/RTL/mobile closure), no Phase 7. Zero mutations confirmed: no `"use server"`, no
`SERVICE_ROLE`, no cache directive, no schema/RLS change anywhere in this run's diff.

### Pages/routes created

- `src/app/dashboard/inventory/page.tsx` (T007) — positions list, bounded `?page=` pagination.
- `src/app/dashboard/inventory/[positionId]/page.tsx` (T008) — position detail + availability.
- `src/app/dashboard/storage/page.tsx` (T010) — custody allocations list.
- `src/app/dashboard/inventory/history/page.tsx` (T011) — ownership ledger, no top-level nav entry.
- `src/app/dashboard/not-found.tsx` (new, shared) — dashboard-scoped 404, renders inside `AppShell`
  rather than bouncing to the public site's `src/app/not-found.tsx` (which renders `PublicShell`).
- `components/inventory/availability-breakdown.tsx` (T009), `ledger-timeline.tsx` (T012),
  `storage-status-badge.tsx` (new, small — see "storage status" note below).
- `lib/inventory/positions.ts` gains `getInventoryPositionById` (org-scoped single lookup, `null` for
  both "not found" and "cross-org") and `getInventoryPositionsCount` (bounded count-only).
- `lib/inventory/allocations.ts` gains `getStoredAllocationsCount` (bounded count-only, `STORED` only).
- `lib/dashboard/registry.tsx` gains a real "inventory" module (nav-only — see T015's closure note in
  `tasks.md` for why overview cards are composed at the page level instead).
- `src/app/dashboard/page.tsx` merges two bounded COUNT-only overview cards into `bought`/`where`.
- `lib/app/copy/{en,ar}.ts` gain a full `inventory.*` section — every new string exists in both
  languages; no hardcoded English anywhere in the new pages/components.

### Exact quantity labels used (per the Phase 1 reconciliation)

Only TWO labels exist — "Owned quantity" (`availableQuantityKg`) and "Reserved quantity"
(`reservedQuantityKg`). There is deliberately no third "Available"/"Free to trade" label: the database
exposes no such distinct value, and computing one (`owned - reserved`) would violate LOT-02/FR-002.
This is the exact reconciled terminology `lib/app/copy/en.ts#inventory`'s header comment documents.

### DB-OPEN-05 UI degradation

`InventoryPosition.lot === null` renders a dedicated "Lot detail unavailable" panel (list: inline
text; detail: a bordered notice) — the position itself always still renders. No coffee/origin/grade
value is ever fabricated.

### DB-OPEN-12 reservation-cause behavior

`AvailabilityBreakdown` renders `{ kind: "unknown" }` as "Reservation details are unavailable right
now" — never "no reservation," never implying the reserved quantity can be released or the
reservation modified. A resolvable `{ kind: "order", ... }` cause (forward-compatible, currently
unreachable per DB-OPEN-12) renders the order code and, when present, `hold_expires_at`.

### Allocation status mapping

`StorageStatusBadge` (new; NOT `components/ui/status-badge.tsx`'s `StatusBadge`, whose closed
`STATUS_VALUES` union does not include `STORED`/`RELEASED`) maps the DB's exact three values to
localized dot+text labels. No fourth value invented.

### Ledger privacy/redaction behavior

`LedgerTimeline` shows the localized event type, quantity+unit, direction, and — when the
counterparty is unreadable (`redacted: true`) — the safe "Another organization" wording, never the
real name and never dropping the event. No edit/delete/reorder/correct control exists anywhere.

### Feature 004 registration / overview contribution

Superseded by the RECONCILIATION section above — the "inventory" module now contributes its bounded
overview cards THROUGH the module contract (`overviewCards`, now allowed to be async), not a
page-level merge step. See `tasks.md`'s T015 closure/reconciliation notes for the full reasoning.

### EN/AR, RTL, Light/Dark, mobile, accessibility

- EN/AR: every new string lives in `lib/app/copy/{en,ar}.ts`'s new `inventory` section; rendered via
  `<AppBilingual>` throughout (never a bare English string in JSX).
- RTL: `grep -rn "text-left\|text-right\|[^-]pl-\|[^-]pr-" src/app/dashboard/inventory
  src/app/dashboard/storage components/inventory` returns nothing — logical properties only.
- Light/Dark: only existing design-system tokens used (`text-foreground`, `text-muted-foreground`,
  `bg-card`, `--status-*-surface`/`--status-*` pairs already proven across both themes elsewhere).
- Mobile: `TableCardList` (Feature 004's existing responsive primitive) used for both list pages —
  zero new responsive logic invented.
- Accessibility: real `<table>`/`<th scope="col">` on desktop (via `TableCardList`), heading hierarchy
  (`<h1>` via `PageHeader`, `<h2>` per section), breadcrumbs via the existing `PageHeader`/`Breadcrumb`
  primitives, an sr-only header for the list's action column, accessible link names throughout.

### Browser/console evidence — honest scope

**Not performed.** No real Chrome/CDP pass was run this run: every inventory-adjacent table remains
genuinely empty in the live database (confirmed in the RUN A/reconciliation work — Features 007/008
do not exist yet, so no real position/allocation/ownership row can exist), so a live browser session
would show only empty states, and this run's constraints (no schema/mutation work, no new fixture
infrastructure beyond what Issue 2's reconciliation already used and tore down) did not extend to
building the multi-table synthetic-position fixture a meaningful positive-content browser pass would
require. Verification for this run rests on: `npm run build` (clean, all three routes compile and
render as dynamic Server Components), `npm run typecheck` (clean), the full test suite (643/643), and
targeted component/unit tests (`tests/inventory/run-b-ui.test.tsx`) proving the presentation contracts
(labels, redaction, no-arithmetic, no-mutation-affordance, notFound() privacy) directly. This is
reported honestly rather than claiming an unrun browser verification.

### Tests

`tests/inventory/run-b-ui.test.tsx` (21 tests): `getInventoryPositionById`/count-query correctness,
`AvailabilityBreakdown` (verbatim quantities, unknown-cause copy, negative-value integrity guard —
never `Math.max(0, ...)`), `LedgerTimeline` (no mutation control, redaction, plain-text
reason/correlation), `StorageStatusBadge` (all three statuses), the T010 order-context resolution (4
tests, added in the reconciliation), and a structural audit (no Client Components, no
mutation/cache/service-role, `notFound()` privacy, no public-route import of `lib/inventory`).
`tests/dashboard/registry.test.tsx` (19 tests) covers both the genuinely-new "inventory"/"storage"
routes AND (added in the reconciliation) the T015 module-contract overview contribution end-to-end:
real counts surface through `overviewCards`, zero counts contribute nothing, and a `canBuy: false`
organization gets no inventory overview contribution. `tests/design/uif-f.test.tsx`,
`tests/dashboard/org-switcher.test.tsx` and `tests/dashboard/states.test.tsx` were mechanically
updated (the reconciliation's `composeOverview` → `async` change) with no guarantee they prove
weakened.

### Regression run (post-reconciliation)

- `npm run typecheck` — clean.
- `npm test` — **650/650 passing, 57 files** (up from RUN B's original 643/57 — net +7 across the two
  reconciliation fixes: +4 T010 order-context tests, +3 T015 module-contract positive-path tests;
  zero regressions across Feature 003/004's existing suites).
- `npm run build` — clean; the same four dynamic routes appear (`/dashboard/inventory`,
  `/dashboard/inventory/[positionId]`, `/dashboard/inventory/history`, `/dashboard/storage`).
- `npx eslint lib/inventory lib/dashboard lib/app/copy components/inventory src/app/dashboard
  tests/inventory tests/dashboard` — zero findings.
- `git diff --check` — clean (only benign LF/CRLF warnings).

### Honest remaining gaps

- No real Chrome/CDP browser pass — every inventory table remains genuinely empty; formal a11y/RTL/
  mobile closure is explicitly Phase 6's job (T020/T021), not this run's.
- Phase 3 (T013/T014, custody trust/variance) remains unstartable until 010's warehouse model exists.
- Phase 5's formal release-blocking cross-tenant isolation suite (T016–T019, real seeded positive vs.
  negative data across two organizations) still does not exist — this run's tests prove the
  presentation/read-layer contracts (including, now, the T010 order-linkage and T015 module-contract
  paths, each with a real empirical live proof performed during reconciliation), not a full formal
  isolation suite.
- No order-detail route exists yet (Features 007/008's scope) — the storage page's order reference
  renders as plain text, never a hyperlink, for exactly that reason.

## Exact next run

Phase 3 (T013/T014) is blocked on Feature 010's warehouse model and should not be attempted next.
Phase 5 (T016–T019 — the formal release-blocking isolation suite, following the same seeded-fixture
pattern the reconciliation's DB-OPEN-12 proof already established) is the next scoped, unblocked unit
of work, followed by Phase 6 (a11y/RTL/mobile closure, including the still-missing real browser pass)
and Phase 7 (final closure).

---

## RUN C (2026-09-12) — Phase 5 closure (T016–T019) — supersedes the next-run note above

**Scope completed:** T016, T017, T018 and T019 only. No Phase 3, 6, 7, Feature 006+, Feature 010
implementation, database migration, RLS/policy alteration, Storage change, commit or push occurred.

### Real fixture lifecycle and idempotency

- Extended the existing `scripts/seed-test-fixtures.ts` boundary — the only repository location that
  constructs a service-role client — rather than introducing a new fixture framework or exposing a
  privileged client to runtime/tests.
- The exact fixed-id inventory graph is now seeded twice successfully, then fully torn down, then
  seeded twice again successfully. Exact-ID assertions prove the seeded graph contains 1 internal
  organization, 1 dedicated DRAFT coffee, 2 lots, 2 invisible offers, 1 warehouse, 6 positions,
  2 orders, 2 order items, 2 allocations and 3 ledger events, with no Hills-internal membership.
- The teardown deletes the removable graph in FK order. It proves the remaining immutable chain is
  exactly 3 `inventory_ownership_events`, 2 referenced lots, the dedicated DRAFT coffee and the
  internal organization. The ledger trigger blocks deleting the events. Events also reference the
  pre-existing Org A/B/C fixtures; the shared fixture teardown removes their memberships/KYB/admin
  capability rows before tolerating any protected evidence FK. No retained row is an active acting
  organization for a real user.
- A historical Hills-internal membership residue was found by the first exact verifier and removed
  safely by a fixed-id membership delete on every seed. The verifier now fails closed if that system
  org ever has a membership again.
- The dedicated coffee remains `DRAFT`; offers remain `PUBLISHED` only because their DB transition
  trigger legally rejects a backward `PUBLISHED → DRAFT` update, but are `is_visible = false`.
  Anonymous coffee read returns no row and anonymous offer access is denied at PostgreSQL privilege
  level (`42501`), rather than fabricated as a misleading empty SELECT success.

### T016 — real RLS and acting-organization isolation

`npm test -- inventory/isolation` passes **12/12** against real authenticated sessions and live RLS:
own and cross-org position reads, exact-id detail privacy, allocations/order context, ownership events
as both source and destination, unrelated event denial, and counterparty redaction. A genuine
multi-org fixture user has two differentiated positions and, in the same authenticated session, sees
only the explicit acting-org's row on each call — no `organizations[0]` or stale-context leak.

### T017 — exact quantity fidelity

`npm test -- quantity-fidelity` passes **18/18**. Live non-round stored values are compared exactly
for Org A/B positions, availability, and allocation quantities. UI presentation preserves the decimal
value and unit without rounding. Field-targeted source scans reject quantity arithmetic, have an
intentional forbidden-shape positive control, and assert no third derived quantity was added.

### T018 — append-only ledger at the database boundary

`npm test -- ledger-immutability` passes **5/5**. An authenticated member UPDATE matches zero rows
under RLS; DELETE is privilege-denied; an unrelated member cannot alter a hidden event. The isolated
fixture-only privileged probe then attempts an exact-id update and requires the live
`inventory_ownership_events_is_append_only` exception from
`trg_ownership_events_append_only`, followed by an unchanged reason read. This is not UI-only proof;
no service-role credential is imported by runtime or Vitest.

### T019 — DB-OPEN-05 degradation

`npm test -- degradation` passes **6/6**. The real Org A position remains readable with both
authoritative quantities while `coffee_lots` stays unreadable; it returns `lot: null`, list/detail
reads remain usable, and no lot/coffee/origin/grade/process/crop/quality field is fabricated.
DB-OPEN-05 remains OPEN. DB-OPEN-12 remains an honest unknown reservation cause, with no privileged
runtime workaround.

### Regression and security evidence

- `npm run typecheck` — pass.
- `npm test` — **60 files, 687/687 tests pass**. A first full run exposed obsolete RUN-A empty-table
  assumptions and repeated test-client storage keys; both were corrected rather than suppressed.
  `live-empty.test.ts` now tests a documented real empty organization, and each test-only GoTrue
  client gets a UUID storage key. The final full run emitted no GoTrue multiple-client warning.
- `npm run build` — pass; inventory, detail, history and storage remain dynamic routes.
- `npx eslint src lib components tests scripts` — pass, zero findings. `npm run lint` remains a
  pre-existing non-product baseline failure from `docs/claude-design` (124 errors, 148 warnings);
  none is in Phase 5's changed product/test/script paths.
- `git diff --check` — pass (only Git's existing LF→CRLF warnings, no whitespace error).
- Static scope audits found no `SERVICE_ROLE`/`service_role` in `src`, `lib` or `components`; no
  inventory cache APIs; no signed/public Storage URL creation; and no dynamic clock/random source in
  inventory runtime/UI paths. No secret or `.env` file is tracked or changed by this run.

### Browser evidence

No authenticated real-browser run was performed. The available Windows browser automation policy
prohibits automating authentication dialogs/fixture-password entry; this run did not bypass that
boundary. This is explicitly a **Phase 6 gap**, not a claimed visual PASS. The real DB/RLS proof and
component/browser-like DOM coverage above remain valid, but desktop/mobile/RTL live-browser evidence
is still required by T020/T021.

### Exact next run

Do **not** begin Feature 010 implementation from this repository state. The dependency-safe next
unit is **Phase 6 T020–T021** (responsive, accessibility, RTL and authenticated browser evidence),
then Phase 7 T022–T025 closure. Phase 3 T013–T014 remains blocked until Feature 010's warehouse model
is actually implemented and verified.
