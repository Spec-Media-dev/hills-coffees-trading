# Hills Coffee — Implementation Roadmap

**Last updated**: 2026-09-15
**Governing documents**: `.specify/memory/constitution.md` (v2.0.0) →
`docs/requirements/Hills-Coffee-SRS-v1.md` → `docs/database/` →
`docs/design-guidance/Hills-Coffee-Website-Recommendations.md` → `docs/claude-design/` → code.

> **Feature 001 (Platform Foundation) is IMPLEMENTED and VERIFIED** — all 50 of its tasks are
> checked, and every phase carries a COMPLETE — VERIFIED status recorded against executed
> verification (including live-browser and real-Supabase proofs). **Feature 002 (Public Website)
> is IMPLEMENTED and VERIFIED through Phase 13 closure (59/59 current tasks, including its
> separate Phase 5.5 foundation block)**. Features 003–012 have mixed completion states; the feature
> index below is authoritative and must be read instead of treating them as uniformly planned.

This document is the index a new agent reads first. For *what the database can already do*, read
`docs/architecture/DATABASE-CAPABILITY-MAP.md` — including its list of recorded blockers and the
commission capability (§8), which is already implemented in the database.

---

## 1. Feature index

| # | Feature | Surface | Status | Artefacts |
|---|---|---|---|---|
| 001 | Platform Foundation | All three (foundation) | Constitution ✅ · Specify ✅ · Clarify ✅ · Plan ✅ · Tasks ✅ · Analyze ✅ · **Implement ✅ — IMPLEMENTED / VERIFIED (50/50 tasks)** | [spec](../../specs/001-platform-foundation/spec.md) · [plan](../../specs/001-platform-foundation/plan.md) · [tasks](../../specs/001-platform-foundation/tasks.md) · research · data-model · contracts · quickstart · AGENT-HANDOFF |
| 002 | Public Website | Public `/`, Member `/dashboard` shell, Admin `/dashboard-admin` shell | **IMPLEMENTED / VERIFIED / CLOSED — 59 / 59 current tasks through Phase 13 (2026-09-10)** · **Phase 5.5 Full Product UI Foundation — IMPLEMENTED / VERIFIED — 58 / 58 UIF tasks, all 9 blocks (A–I) closed 2026-09-10** · reference-pack + GSAP amendment reconciled 2026-09-09 (ASSET-REF-01, MOTION-GSAP-01, both still true and unresolved) · Member/Admin application shell (`components/app/*`) and its own copy root (`lib/app/copy`, `CONTENT-AR-01` scope) remain reusable inventory for Features 003–012 · business blockers remain recorded in the canonical handoff · [spec](../../specs/002-public-website/spec.md) · [plan](../../specs/002-public-website/plan.md) · [tasks](../../specs/002-public-website/tasks.md) · [canonical handoff](../../specs/002-public-website/IMPLEMENTATION-HANDOFF.md) · [Phase 5.5 plan](../../specs/002-public-website/PHASE-5.5-UI-FOUNDATION-PLAN.md) · [Phase 5.5 tasks](../../specs/002-public-website/PHASE-5.5-TASKS.md) · [Phase 5.5 handoff](../../specs/002-public-website/PHASE-5.5-IMPLEMENTATION-HANDOFF.md) |
| 003 | Auth, Membership & KYB | Public auth routes + `/dashboard` | **IMPLEMENTED / VERIFIED / CLOSED — 47 / 47 tasks (T001–T040 + T010a–T010g), 2026-09-11.** Phase 1 + Phase 2 (T001–T010) COMPLETE / VERIFIED · RUN DB (T010b–T010g) COMPLETE — applied + live-verified 2026-09-10, DB-BLOCK-01/03 RESOLVED · RUN A (T010a, T011–T013) COMPLETE · RUN A Full Name Persistence fix COMPLETE · RUN B (T014–T022, PART 0/1) COMPLETE — applied + live-verified 2026-09-11, DB-BLOCK-11 RESOLVED · Phase 6 (T023–T025) + Phase 7 (T026–T028) COMPLETE — live-verified 2026-09-11 · Phase 8 (T029) COMPLETE · Phase 9 (T030–T034) COMPLETE AND LIVE-VERIFIED 2026-09-11, including **T033's applied MFA data gate** (`supabase/migrations/20260913000000_feature_003_t033_mfa_data_gate.sql` — applied, live-proven: no-factor stays aal1-allowed, a verified-factor aal1 session is denied at table+RPC level across 10 protected surfaces, the same session after real aal2 succeeds) · **Phase 10 (T035–T036) + Phase 11 (T037–T040) COMPLETE 2026-09-11** — real-browser (Chrome/CDP + axe-core) accessibility pass found and fixed 8 genuine defects (duplicate/missing `<main>` landmarks, a breadcrumb ARIA gap, 2 light-mode opacity-contrast defects, a missing file-input label, and 2 dark-mode color-contrast token failures); RTL/logical-CSS grep clean; 553/553 tests passing; lint has zero new findings outside the historical `docs/claude-design/` baseline; build clean; `git diff --check` clean; no service-role/secret leakage; authorization truth (`organization_can_buy`/`organization_can_sell`/`is_authorized_member`) unmodified. **This verdict covers Feature 003 only** — it does not imply marketplace/payments/Admin Operations Console/whole-platform readiness. | [spec](../../specs/003-auth-membership-kyb/spec.md) · [plan](../../specs/003-auth-membership-kyb/plan.md) · [tasks](../../specs/003-auth-membership-kyb/tasks.md) · [handoff](../../specs/003-auth-membership-kyb/PHASE-1-2-IMPLEMENTATION-HANDOFF.md) |
| 004 | Member Dashboard | `/dashboard` | **COMPLETE / VERIFIED / CLOSED — 29/29 tasks (T001–T029, 2026-09-12).** RUN A/B/C delivered and verified the module contract, capability-driven shell, live composed overview, acting-organization context, truthful ineligible states, account-area registration, tenant isolation, accessibility, EN/AR/RTL, light/dark, 390px mobile, and no-JS server content. Phase 9 final closure reproduced 605/605 tests across 53 files, clean typecheck/build, clean product/application lint (`npx eslint src lib components tests`), no buyer/seller parallel routes, and no shared private cache, service-role, or ambient acting-organization state in Feature 004 paths. One-hop contract for Features 005–012 authors: [modules contract](../../lib/dashboard/modules.ts) → [implemented registry](../../lib/dashboard/registry.tsx) → [overview composer](../../lib/dashboard/overview.tsx); declarations are presentational and never authorization, and each future route must enforce its own Feature 003 eligibility truth. DB-BLOCK-04 remains owned by Feature 012; this feature does not claim whole-platform readiness. Full evidence: [handoff](../../specs/004-member-dashboard/IMPLEMENTATION-HANDOFF.md). | [spec](../../specs/004-member-dashboard/spec.md) · [plan](../../specs/004-member-dashboard/plan.md) · [tasks](../../specs/004-member-dashboard/tasks.md) · [handoff](../../specs/004-member-dashboard/IMPLEMENTATION-HANDOFF.md) |
| 005 | Inventory, Custody & Storage | `/dashboard` + shared layer | **19/25 tasks complete — not closed.** Phase 1 (T001–T006), Phase 2 (T007–T012), Phase 4 (T015), Phase 5 (T016–T019), and Phase 6 (T020–T021) are complete. T013–T014 remain an intentionally unmodelled HOLD/variance/QUARANTINE question; T022–T025 await final closure. Member inventory/storage/history UI now live under `/dashboard/inventory`, `/dashboard/storage`, `/dashboard/inventory/history`, reading exclusively through `lib/inventory/*`; registered with Feature 004's module contract — both nav entries AND the bounded "what did I buy"/"where is it" overview cards now enter through the SAME `overviewCards` contract. Only two quantity labels exist anywhere in the UI — "Owned quantity"/"Reserved quantity" — no fabricated third "available" figure. DB-OPEN-05 and DB-OPEN-12 both degrade honestly. 690 tests passing, clean build/typecheck/lint. Full evidence: [IMPLEMENTATION-HANDOFF.md](../../specs/005-inventory-custody-storage/IMPLEMENTATION-HANDOFF.md)'s RUN B/RUN D + reconciliation sections.
  Prior: **RUN A (2026-09-12) — Phase 1 domain read layer ONLY (T001–T006), 6/25 tasks, RECONCILED.** `lib/inventory/{types,positions,allocations,ownership,availability}.ts` — read-only, zero mutations, zero service-role, zero cache, org-scoped via explicit acting-organization threading (never `organizations[0]`). Two findings from live DB/RLS preflight, both since verified empirically against the LIVE function/policy definitions (not the static SQL file): (1) `inventory_positions` has no `owned_quantity_kg` column, and no view/function exposes one — only `available_quantity_kg` (confirmed by the live `checkout_order`/`admin_review_payment` functions to be the position's TOTAL/gross owned quantity) and `reserved_quantity_kg` (confirmed ACTIVELY WRITTEN by `checkout_order`/`expire_order_hold`/`admin_review_payment` — currently 0 only because the tables are empty pre-007/008); both passed through verbatim, no third figure synthesized. (2) `inventory_reservation_items`'s own read policy is CONFIRMED (via seeded synthetic rows + three real authenticated fixture sessions, service-role used only for setup/teardown) structurally unsatisfiable for every non-admin member — tracked as **DB-OPEN-12**. Reservation cause/expiry honestly degrades to `unknown`; the authoritative reserved quantity itself is unaffected. DB-OPEN-05 reconfirmed still OPEN, not resolved, not bypassed. No UI pages yet. Full evidence: [IMPLEMENTATION-HANDOFF.md](../../specs/005-inventory-custody-storage/IMPLEMENTATION-HANDOFF.md) (see its RECONCILIATION section). | [spec](../../specs/005-inventory-custody-storage/spec.md) · [plan](../../specs/005-inventory-custody-storage/plan.md) · [tasks](../../specs/005-inventory-custody-storage/tasks.md) · [handoff](../../specs/005-inventory-custody-storage/IMPLEMENTATION-HANDOFF.md) |
| 006 | Marketplace, Listings & Resale | `/dashboard` | **27/32 tasks complete — CLOSURE RUN 2026-09-21 (accounting & verify corrected).** T018 [ ] re-opened: fill-progression render UI added to seller listing detail (`AvailabilityBar` + `projectFillState` over live ManagedListing DTO, no extra DB read, TypeCheck + build exit 0), but literal Verify line requires live reservation via Feature 007 reducing actionable quantity and settlement via Feature 008 increasing filled quantity and flipping state, which remains unexecuted live. T022 ✅ closed: DB-BLOCK-07 RESOLVED by Feature 009 (2026-09-14) — `apply_delivery_reservation()` writes to `inventory_positions.reserved_quantity_kg`; delivery-reserved positions already return `RESERVED_QUANTITY` through `checkListingEligibility`'s existing arithmetic; stale gap comment in `lib/listings/eligibility.ts` updated. T027–T032 ✅ Phase 8–9 closed (state coverage, RTL/a11y grep clean, lint/typecheck/tests/build all exit 0, security grep clean, MVP boundary confirmed, roadmap updated). **5 open/unverified tasks**: T012 (KNOWN BLOCKER — product decision required on SOLD_OUT buyer-visibility: RLS predicate excludes remaining=0 from member reads, which is spec-compliant per FR-002 but conflicts with PS2 scenario 3; resolve before implementing the buyer SOLD_OUT state page), T015 and T023 (BLOCKED LIVE PROOF — implementation correct, successful-transition + `listing_status_history` write unverifiable until a genuinely-submittable own-org listing exists; no settled order can be constructed by fixture tooling), T018 (RE-OPENED — awaiting live 007 reservation and 008 settlement proof), T024 (DEFERRED — awaiting live expired-reservation + settled-fill fixture; pure-arithmetic coverage complete in T005). **No DB/RLS/trigger/grant change made; no service-role in product runtime; no hard deletes.** DB-OPEN-05 and DB-OPEN-12 remain open and unbypassed. Negotiation gap remains in spec.md §Open items. Full history: [tasks.md](../../specs/006-marketplace-listings-resale/tasks.md) · [IMPLEMENTATION-HANDOFF.md](../../specs/006-marketplace-listings-resale/IMPLEMENTATION-HANDOFF.md). Prior: RUN A 2026-09-12 Phase 1 (T001–T008); RUN B 2026-09-12 Phase 2–4 (T009–T015); RUN C 2026-09-13 Phase 5–7 (T016–T026). | [spec](../../specs/006-marketplace-listings-resale/spec.md) · [plan](../../specs/006-marketplace-listings-resale/plan.md) · [tasks](../../specs/006-marketplace-listings-resale/tasks.md) |
| 007 | Orders, Checkout & Reservations | `/dashboard` | Planning prepared · Implement NOT STARTED | [spec](../../specs/007-orders-checkout-reservations/spec.md) · [plan](../../specs/007-orders-checkout-reservations/plan.md) · [tasks](../../specs/007-orders-checkout-reservations/tasks.md) |
| 008 | Payments, Settlement, Invoices & Payouts | `/dashboard` + finance layer | **Phase 1 complete — 6/39 tasks; not closed.** Provider-neutral status/DTO validation, RLS-scoped finance reads and an honest unavailable funding seam exist. No provider has been selected and no `decidePayment`, payment-review queue, payout management, tax-invoice recording, payment-account UI, or provider/webhook path exists. | [spec](../../specs/008-payments-settlement-invoices-payouts/spec.md) · [plan](../../specs/008-payments-settlement-invoices-payouts/plan.md) · [tasks](../../specs/008-payments-settlement-invoices-payouts/tasks.md) · [handoff](../../specs/008-payments-settlement-invoices-payouts/IMPLEMENTATION-HANDOFF.md) |
| 009 | Delivery & Shipments | `/dashboard` + warehouse layer | **IMPLEMENTED / VERIFIED / CLOSED — 39/39 tasks (T001–T039), 2026-09-15.** Phase 1 (read layer, transitions, error mapping) · Phase 2 (**DB-BLOCK-07 RESOLVED, both halves** — human-approved T010, migration `supabase/migrations/20260914120000_feature_009_db_block_07.sql` manually applied + postflight-verified 22/22 on 2026-09-14, live-proven by the 18/18 seeded T013 proof under real authenticated sessions and real concurrency; DB-OPEN-18 resolved by the same migration) · Phase 3 (`lib/delivery/{buyer,warehouse,custody}.ts` — buyer DRAFT-only writes, eight named warehouse operations behind `is_warehouse_operator()`, `recordDelivery`, no generic status setter, zero application-side inventory arithmetic) · Phase 4 (`/dashboard/deliveries`, `/dashboard/deliveries/[shipmentId]`, `/dashboard/deliveries/new`, registered as the `delivery` module in Feature 004's contract; a real `.in()` query-string scalability bug found and fixed live) · Phase 5 (transactional/security suites, T017/T024 settlement-gated legs live-proven under explicit human authorization with a disposable ADMIN fixture that is removed/blocked/banned afterwards) · Phase 6 (real Chrome + axe: zero violations across EN/AR × light/dark × 1366/390, keyboard reachability) · Phase 7 (full suite 127 files / 1425 tests passed, 0 failed, 6 gated-skipped, exit 0; typecheck/build/diff-check clean; repo-wide lint exactly at the 273/124/149 `docs/claude-design` baseline; delivery suite ×3, gated proofs ×2 each, T013 concurrency ×3 = 30 real concurrent attempts with zero drift and no 40P01 observed; real-browser proof that anonymous and cross-organization visitors obtain nothing). **Delivery reservation semantics now live**: pre-payment READY allowed; reservation taken at settlement (`reserve_ready_deliveries_for_settlement` from `admin_review_payment`) or on first gated progression; exact-once reserve/release; physical progression refused until the order is genuinely `PAID` (`delivery_reservation_requires_settled_order`); delivery decrements BOTH available and reserved by the newly-delivered amount; cancellation never manufactures stock; DISPUTED = FREEZE; FAILED/DISPUTED fail-closed at the database pending Feature 012. **Deferred / owned elsewhere**: real-payment/trusted-funding readiness (008); warehouse/admin console screens and warehouse process configuration (010); FAILED/DISPUTED recovery, disputes, notifications, audit expansion, compliance freeze on shipments (012, DB-OPEN-09); delivery-proof document bytes (no approved bucket — DB-BLOCK-01 scope, not created); suspended-organization mid-shipment policy (010/compliance). **This verdict covers Feature 009 only** — it does not authorize production trading for the platform. Evidence of record: [tasks.md](../../specs/009-delivery-shipments/tasks.md) status block + Phase 7, [DB-BLOCK-07-DESIGN.md](../../specs/009-delivery-shipments/DB-BLOCK-07-DESIGN.md) §20/§21. | [spec](../../specs/009-delivery-shipments/spec.md) · [plan](../../specs/009-delivery-shipments/plan.md) · [tasks](../../specs/009-delivery-shipments/tasks.md) · [DB-BLOCK-07 design](../../specs/009-delivery-shipments/DB-BLOCK-07-DESIGN.md) |
| 010 | Operations / Admin Console | `/dashboard-admin` | **IN PROGRESS — 37 / 49 tasks (Price-administration run 2026-09-21: T049 ADDED (no task owned price administration) and COMPLETE — `/dashboard-admin/prices`, platform-ADMIN reference-price administration that revalidates Feature 011's `reference-prices` tag after every successful mutation, proven against a running production server, no migration; Database hygiene M1 2026-09-20: T027 + T029 COMPLETE over the DB-OPEN-21 audit/`updated_at` migration; RUN J 2026-09-19: T010 COMPLETE over the DB-OPEN-22 organizations read path + compliance guard; dispute-unblock run 2026-09-19; RUN H Phases 11–12 readiness 2026-09-17). NOT closed.** T012 COMPLETE 2026-09-19: the Compliance dispute review surface composes Feature 012's closed dispute layer (`transition_dispute()` + `dispute_status_history`), live + Chrome/axe proven; T032's dispute half proven, T032 still blocked on T014 (Feature 008). Built and live-verified: RUN A shell/guards/overview/account (T001–T006, T046), RUN B compliance KYB/listing decisions (T007–T009, T011), RUN D warehouse oversight over Feature 009's named operations (T016–T020), RUN E catalogue + auditor read-only (T021–T026), RUN F system configuration (T028, T042–T045), RUN G automated suites (T030, T034, T035), RUN H state coverage + console-wide a11y/RTL/responsive (T036, T037 — real Chrome + axe, EN/AR × light/dark × 390/1366/1920). **Open, by cause**: Feature 008 finance layer absent → T013–T015, T031, T032 (payment half) BLOCKED (payments/payouts/invoices areas render the honest `blocked` placeholder); DB-OPEN-09 (no approved dispute freeze mechanism) → stated in the dispute console as record-label-only, never simulated; DB-OPEN-06 → auditor audit-log read is a stated capability gap; DB-OPEN-22 organizations half resolved (T010 complete); its `file_assets` half keeps KYB evidence bytes unlocatable for COMPLIANCE; DB-OPEN-21 resolved (config changes audited) → T027/T029 COMPLETE; T033 PARTIAL (Phases 3–9 not all closed); Phase 12 T038–T041 verification/proof recorded but **not closable** while "Depends: all" is unmet; Phase 13 T047/T048 (branding storage, email-change flow) need approved capabilities that do not exist. OPS-01 (no dual control), SHIP-OPEN-01 (`shipping_rules` unconsumed), COMMISSION-OPEN-01 (0% fallback undecided), DB-OPEN-19 (no variance/reconciliation model), SUSPEND-OPEN-01 (suspended-organization mid-operation policy), DB-BLOCK-01 (bytes outside KYB scope) all remain OPEN and are stated in-product where the operator would otherwise assume the capability exists. DB-BLOCK-07 remains RESOLVED by Feature 009 (unchanged). **No DB/RLS/grant/trigger change was made by Feature 010; no service role in product runtime; no hard deletes.** | [spec](../../specs/010-admin-operations-console/spec.md) · [plan](../../specs/010-admin-operations-console/plan.md) · [tasks](../../specs/010-admin-operations-console/tasks.md) |
| 011 | Pricing & Reference Data | Public + member + admin | **IMPLEMENTED / VERIFIED / CLOSED — 22 / 22 tasks (T001–T022), 2026-09-21.** The four branded price types, the licence-gated cached read layer (`lib/pricing/*`, tag `reference-prices`), the disclosure-complete presentation contract and components, and the homepage integration are complete; raw values only — no conversion (DB-OPEN-08); real Chrome + axe clean. **DB-BLOCK-10 remainder RESOLVED**: migration `20260920160000_feature_011_db_block_10_price_policy_scope.sql` applied and live-proven. T013 complete via Feature 010 T049 price administration (`lib/admin/prices.ts` + `revalidateReferencePrices()`). T020 exit-0 gate passed (`npx tsc --noEmit`, `npm run lint`, `npm run build`, and batched regression suite 139 files / 1621 tests all green). T021 grep verified clean (no conversion/FX helper). T022 recorded: DB-OPEN-08 and QUOTE-OPEN-01 recorded in capability map. | [spec](../../specs/011-pricing-reference-data/spec.md) · [plan](../../specs/011-pricing-reference-data/plan.md) · [tasks](../../specs/011-pricing-reference-data/tasks.md) |
| 012 | Disputes, Notifications & Audit | `/dashboard` + `/dashboard-admin` | **COMPLETE — 28 / 28 tasks (RUN E closure, 2026-09-19).** Member dispute raise/track + text evidence (T001–T003, T005–T008); compliance review domain (T004 — COMPLETE: every transition goes through the database function `transition_dispute()` and appends an attributed row to append-only `dispute_status_history`, migration `20260919120000_feature_012_dispute_status_history.sql`, DB-OPEN-23 RESOLVED); honest notification read surface + own-user preferences + topbar entry (T009–T012); shared read-only history/audit layer integrated into 005/006/007 (T013–T016); nav registration (T017); isolation / role / immutability / honest-limitation / escaping / state-coverage / transition-history tests (T018–T023); a11y/RTL pass (T024); lint · typecheck · full test suite (161 files, batched) · build all green (T025); honest-capability, security/cache and documentation checks (T026–T028). Still open and stated in-product, never simulated: DB-BLOCK-01 (dispute evidence bytes), DB-BLOCK-04 (notification generation/read state), DB-OPEN-06 (AUDITOR audit-log read), DB-OPEN-09 (no automatic dispute freeze — **MKT-07 not fully satisfiable**). | [spec](../../specs/012-disputes-notifications-audit/spec.md) · [plan](../../specs/012-disputes-notifications-audit/plan.md) · [tasks](../../specs/012-disputes-notifications-audit/tasks.md) |

**Lifecycle legend**: Specify → Clarify → Plan → Tasks → **Analyze** (per-feature preflight before
implementation) → Implement → Converge. Feature 003's preflight and planning alignment are complete
on 2026-09-10; its DB foundation must be implemented and verified before Phase 3/4. For 004–012,
Analyze remains pending and should run immediately before each feature's implementation. Feature
002's Analyze and implementation closure are recorded in its canonical handoff.

**Feature 002 status note**: 002's planning artefacts were re-synchronised on 2026-09-08, then
implemented and independently closed through Phase 13 on 2026-09-10. The delivered boundary uses
`unstable_cache` + `revalidateTag`, a shared `PublicShell` for the locked root homepage, an explicit
public DTO allowlist, honest RFQ/price/lifecycle/media boundaries, real-browser verification,
trailing-slash canonicalisation, and the corrected task dependencies. Remaining business and
database blockers are recorded without workaround in `specs/002-public-website/IMPLEMENTATION-HANDOFF.md`.

---

## 1.1 Phase 5.5 — frozen visual system and component inventory (UIF-051)

Closed 2026-09-10. All 58 UIF tasks (`UIF-001`–`UIF-058`, blocks A–I) are `[x]` in
`specs/002-public-website/PHASE-5.5-TASKS.md`, each after its exact Verify condition passed. This is
a **presentational foundation freeze**, not a business-feature completion — see §5 below for what
remains genuinely open.

**Tokens and primitives** (`src/app/globals.css`, `components/ui/*`): the complete Hills type,
colour, radius, elevation, motion and layout contract from UIF-001–UIF-014, plus the Member/Admin
application-shell tokens added in UIF-035 (`--sidebar-w` 264px / `--sidebar-w-collapsed` 76px /
`--topbar-h` 64px). One design system across all three surfaces (contract §1) — Public "editorial",
Member "application", Admin "operational" density, never a second token set.

**Public feature components** future features may reuse as-is: the whole `components/public/*` tree
(header/footer/hero/mega-menus/catalogue filter/origins showcase/interactive story/traceability/
process journey/final CTA), `components/motion/*` (Reveal, Presence, HoverLift, `useGsapTimeline`,
`GsapScrollReveal`), and the bilingual chrome pattern (`components/locale/bilingual.tsx`).

**Member/Admin application shell** (new in UIF-035–041, the component inventory Features 003–012
build on): `components/app/{app-shell,sidebar,topbar,page-header,mobile-app-nav,module-page,
detail-page,filter-bar,action-bar,member-navigation,admin-navigation,foundation-overview}.tsx`, fed
by its own copy root `lib/app/copy/*` (a second CONTENT module on the SAME i18next instance — see
that module's header comment for why it is not `lib/public/copy`). `AppShell` is the one shell both
`/dashboard` and `/dashboard-admin` mount; there is no second design system and no
`/buyer-dashboard`/`/seller-dashboard`. The seller-additive navigation path and the full role-scalable
admin module catalogue are real, tested code paths (`buildMemberNavGroups({canSell:true})`,
`buildAdminNavGroups(roles)`) that are **not** wired to any live route — Feature 004 and Feature 010
own turning them on with real capability/role data.

**Client-island set** (contract §16, amended by UIF-047): 12 documented islands total — the original
9 Public (theme, locale, mobile nav, search, motion wrappers, form controls, `AnimatedHero`,
`InteractiveStorySection`, `OriginsShowcase`) plus `CatalogueFilter` (UIF-030, previously
undocumented) plus `MobileAppNav` (UIF-035, Member/Admin's one new island) — plus the still-absent
conditional `ProcessJourneySection` (UIF-056 shipped static; that island does not exist in the
current build). No page tree (`page.tsx`/`layout.tsx`) is a Client Component anywhere in the product.

**Blockers reconciled unchanged** — none resolved or hidden by Phase 5.5: `MEDIA-01`, `CONTENT-01`,
`PRICE-011`, `DB-BLOCK-02`, `CRM-DEST-01`, `LIFE-01`, `ABUSE-01` all retain their true severity.
`CONTENT-AR-01`: the public design convergence pass (2026-09-10) supplied faithful Arabic renderings
for every `lib/public/copy` and `lib/app/copy` key — Content/Legal sign-off of the wording is the one
remaining step, recorded in each module's own header comment. `I18N-ROUTE-01` unchanged (no locale
routing; preference lives in `localStorage`, applied pre-paint). `ASSET-REF-01` and `MOTION-GSAP-01`
remain true and in force exactly as recorded 2026-09-09 — no reference-board asset is rendered, GSAP
is approved and Lenis stays uninitialised (`grep -rn "lenis" src components` — empty).
The full Feature 002 task closure, including those formerly open verification tasks, is recorded
in the canonical handoff; this Phase 5.5 evidence remains a historical record of the foundation
block only.

**Verification evidence**: `npm run typecheck` / `npm test` (**122/122**) / `npm run build` all pass
on final source; product lint (`src components tests scripts lib`) zero findings; the historical
`docs/claude-design`-only baseline unchanged at **124 errors / 148 warnings**. Real-browser evidence
on one clean production server: `verify-uif-b.mjs` **508/508**, `verify-uif-c.mjs` **117/117**,
`verify-uif-d.mjs` **408/408** (Public, all themes/directions/breakpoints, long-Arabic injection,
GSAP 20-cycle leak check), `ui-foundation.browser.mjs` (token/contrast-AA/RTL/responsive/GSAP
lifecycle fixtures), `tests/design/uif-fg.browser.mjs` (24 authenticated Member/Admin scenarios + 8
anonymous/cross-surface denial cases against REAL Supabase sessions), `tests/design/
uif-h-closure.browser.mjs` (keyboard-only drawer open/focus-trap/close/focus-restore, heading order).

**Exact next task**: Feature 003 is **COMPLETE, VERIFIED, AND CLOSED (2026-09-11)** — GO. Every task
(T001–T040, T010a–T010g — 47/47) is done and live-verified. Phase 1 + Phase 2, RUN DB (T010b–T010g,
applied + live-verified 2026-09-10, closing DB-BLOCK-01/03), RUN A (T010a, T011–T013 — Sign-Up,
onboarding, controlled organization creation, live-verified 2026-09-10), the RUN A Full Name
Persistence fix, RUN B (T014–T022, Phase 4 + Phase 5 — KYB draft/document upload/submission/status
experience, live-verified 2026-09-11) including its two additive migrations
(`20260912000000_feature_003_profile_bootstrap.sql`, closing DB-BLOCK-11;
`20260912010000_feature_003_kyb_draft_fields.sql`), Phase 6 (Agreements, T023–T025) + Phase 7
(Organization & Profile Self-Service, T026–T028), Phase 8 (Test fixtures, T029), and Phase 9
(Authorization & isolation tests, T030–T034) are all COMPLETE and LIVE-VERIFIED. **T033's MFA data
gate is APPLIED** (`supabase/migrations/20260913000000_feature_003_t033_mfa_data_gate.sql` — a fresh
verified-factor aal1 session is denied at table+RPC level across 10 protected surfaces, SQLSTATE
42501; the same session after a real aal2 challenge succeeds; a no-factor session correctly stays
aal1-allowed) — live-proven, not merely prepared. **Phase 10 (T035–T036) + Phase 11 (T037–T040) closed
2026-09-11** — see `specs/003-auth-membership-kyb/tasks.md`'s per-task "CLOSURE (2026-09-11)" notes and
the handoff doc's "Feature 003 Final Closure" section for full evidence (real-browser axe pass, 8
genuine accessibility/contrast defects found and fixed, 553/553 tests, clean lint/typecheck/build/diff
check). The T028 co-member-names gap (RLS/schema boundary, not a bug) remains, documented, and does not
block closure. Feature 002 is closed. **Next feature: 004.**

---

## 2. Purpose and ownership at a glance

| # | Owns | Explicitly does **not** own |
|---|---|---|
| 001 | Route/layout foundation, identity & authorization resolution, Supabase client boundary, Server Action contract, cache policy, state components, i18n/RTL base, test tooling & fixtures | Any business feature |
| 002 | Public discovery, SEO, public shell, RFQ entry (to the validation boundary), membership entry points, reference-price presentation *shell* | Any private data; price semantics (011); catalogue authoring (010); **commission of any kind** (database + 008 + 010); knowledge/legal content (CONTENT-01) |
| 003 | Authentication, membership application, organization context, KYB submission/status, agreements | Compliance review decisions (010); trading (005–009) |
| 004 | Member portal shell, navigation, overview, module registration contract (**consumes** the Phase-5.5 visual shell; supplies the real capability-driven navigation) | Any module's business logic |
| 005 | Inventory positions, custody, storage allocations, ownership ledger, availability facts | Any inventory mutation (007/008/010) |
| 006 | Private marketplace, listing lifecycle, seller eligibility, fill presentation | Reservations (007); settlement (008); review decisions (010) |
| 007 | Draft orders, checkout via `checkout_order()`, 20-minute hold, expiry, buyer shipment request | Title transfer (008); fulfilment states (009) |
| 008 | Payment instructions/proof, finance decision layer, settlement outcomes, invoices, payouts, **commission snapshot presentation + immutability verification**, and the COMMISSION-OPEN-01 decision | Settlement logic itself (database); commission *calculation* (database); commission *configuration UI* (010); console screens (010) |
| 009 | Delivery request, warehouse fulfilment layer (named operations only), delivered quantity, tracking, and the approved DB-BLOCK-07 delivery-reservation + settlement-gate capability (applied, live-proven) | Console screens (010); inventory reservation *arithmetic* itself (database — `apply_delivery_reservation`); FAILED/DISPUTED recovery workflow (012); delivery-proof bytes (no approved bucket) |
| 010 | Role-separated operations console composing 003/005/006/008/009/012 layers; catalogue; system config (**consumes** the Phase-5.5 admin visual shell; supplies real role gating) | Transactional logic (delegated); schema changes |
| 011 | The four price types, reference data, disclosure/staleness/licence rules | Executable pricing (006/007); ingestion; FX (blocked) |
| 012 | Disputes, notifications surface, audit/history visibility | Notification generation (blocked); dispute freeze (blocked) |

---

## 3. Dependency graph

```text
                          ┌─────────────────────────┐
                          │ 001 Platform Foundation │  (blocks everything)
                          └────────────┬────────────┘
                 ┌─────────────────────┼─────────────────────┐
                 │                     │                     │
        ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
        │ 002 Public Site │   │ 003 Auth/KYB    │   │ 011 Pricing     │
        └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
                 │                     │                     │
                 │            ┌────────▼────────┐            │
                 │            │ 004 Member Dash │            │
                 │            └────────┬────────┘            │
                 │                     │                     │
                 │            ┌────────▼────────┐            │
                 │            │ 005 Inventory   │            │
                 │            └────────┬────────┘            │
                 │                     │                     │
                 │            ┌────────▼────────┐            │
                 │            │ 006 Marketplace │◄───────────┘ (price-type separation)
                 │            └────────┬────────┘
                 │                     │
                 │            ┌────────▼────────┐
                 │            │ 007 Orders/     │
                 │            │     Checkout    │
                 │            └────────┬────────┘
                 │                     │
                 │            ┌────────▼────────┐
                 │            │ 008 Payments/   │
                 │            │     Settlement  │
                 │            └────────┬────────┘
                 │                     │
                 │            ┌────────▼────────┐
                 │            │ 009 Delivery    │
                 │            └────────┬────────┘
                 │                     │
                 │            ┌────────▼────────┐
                 │            │ 012 Disputes/   │
                 │            │  Notif/Audit    │
                 │            └────────┬────────┘
                 │                     │
                 └──────────┬──────────┘
                            │
                   ┌────────▼─────────────────────┐
                   │ 010 Operations/Admin Console │  (composes 003/005/006/008/009/012)
                   └──────────────────────────────┘
```

**Independent work streams** (safe to run concurrently after 001):

- **Stream A — Public**: 002 (+ 011's presentation contract). Needs nothing from 005–009. This is the
  natural parallel track: public-site work can proceed while the transactional spine is built.
- **Stream B — Member spine**: 003 → 004 → 005 → 006 → 007 → 008 → 009. Largely sequential because
  each stage produces the records the next consumes.
- **Stream C — Pricing**: 011's domain layer can be built early; its consumers (002, 006/007) plug in
  when ready.
- **Stream D — Console**: 010 is *composed* from other features' layers, so each of its areas becomes
  buildable as its dependency lands (Compliance after 003/006; Finance after 008; Warehouse after
  009; Catalogue after 002's cache tags exist).
- **Stream E — Accountability**: 012's history/audit surfaces depend only on the records existing;
  its notification surface is limited by DB-BLOCK-04 regardless of sequencing.

**Not artificially sequential**: 002, 011 and 012's audit surfaces do **not** need the trading spine
complete. 010's areas do not need each other.

---

## 4. End-to-end journey ownership

### Buyer journey

| Stage | Owning feature |
|---|---|
| Public discovery | 002 |
| RFQ / commercial inquiry | 002 *(persistence blocked — DB-BLOCK-02)* |
| Authentication / membership entry | 003 |
| KYB / approval | 003 (member side) + 010 (compliance decision) |
| Member dashboard | 004 |
| Private marketplace browse | 006 |
| Select permitted listing | 006 |
| Order creation | 007 |
| Checkout + atomic reservation + 20-min hold | 007 (via `checkout_order()`) |
| Manual bank-transfer payment | 008 |
| Payment proof | 008 (via `submit_payment_proof()`) |
| Finance review | 008 layer + 010 console |
| Settlement | 008 (via `admin_review_payment()`) |
| Title transfer | 008 (inside the same function) |
| Buyer inventory | 005 |
| Custody / storage | 005 |
| Delivery (if requested) | 009 *(DB-BLOCK-07 RESOLVED 2026-09-14 — settlement-time reservation + settlement-gated physical release, live-proven; Feature 009 CLOSED 2026-09-15)* |
| Dispute flow | 012 *(freeze blocked — DB-OPEN-09)* |

**Coverage: complete** — every stage has exactly one owning feature; blocked steps are named.

### Seller journey

| Stage | Owning feature |
|---|---|
| Approved seller-capable organization (`can_sell`) | 003 (surfacing) + 010 (compliance grant) |
| Hills-origin owned inventory in approved custody | 005 |
| Eligible quantity determination | 005 (facts) + 006 (rule) |
| Create resale listing | 006 |
| Compliance / listing review | 010 (decision) + 006 (states) |
| Publish | 006 |
| Buyer partial/full order | 007 |
| Reservation | 007 (via `checkout_order()`) |
| Payment | 008 |
| Settlement + title transfer | 008 |
| Seller payout | 008 |
| Remaining quantity / partial fill / sold out | 006 |
| Audit trail | 012 |

**Coverage: complete.** Seller remains a buyer-capable member inside `/dashboard` — no separate app.

### Admin / operations journey

| Role | Stages | Owning feature |
|---|---|---|
| COMPLIANCE | KYB review, organization suspension, listing review, dispute review | 010 (screens) over 003/006/012 layers |
| WAREHOUSE | Custody oversight, shipment progression, delivery recording, reconciliation* | 010 over 005/009 layers |
| FINANCE | Payment review, settlement decision, payouts, invoices | 010 over 008's layer |
| AUDITOR | Read-only evidence* | 010 over 012's layer |
| ADMIN | Catalogue, broader administration | 010 |
| SUPER_ADMIN | Platform admins, commission/tax/shipping configuration | 010 |

\* limited by DB-OPEN-06 (auditor `audit_logs` access) and the unmodelled reconciliation/variance
entity.

**Coverage: complete**, with least privilege preserved — no universal admin role.

---

## 5. Open blockers and decisions (consolidated)

All are recorded in `docs/architecture/DATABASE-CAPABILITY-MAP.md` §8 with SRS citations. None may be
resolved by an improvised workaround; each requires the Constitution's database-change process or a
business decision.

| ID | Summary | Blocks | Release impact |
|---|---|---|---|
| DB-BLOCK-01 | **Resolved only for 003's KYB-document scope** — private `kyb-evidence` bucket + object policies are applied and live-verified. Payment, delivery, dispute and public-media bytes still need their own approved capability; they may not reuse KYB storage by convenience. | 008, 009, 012, public media | Scoped evidence/document flows outside KYB |
| DB-BLOCK-02 | No destination for an anonymous RFQ | 002 | Public conversion path |
| DB-BLOCK-03 | Organizations/members are admin-insert only — no self-service onboarding — **RESOLVED 2026-09-10, applied + live-verified** (controlled onboarding capability, 003 RUN DB) | 003 | Membership funnel |
| DB-BLOCK-04 | Notifications can be neither created nor marked read — Feature 012 ships an honest read surface only (2026-09-19); still OPEN | 004, 012 | Notification system entirely |
| DB-BLOCK-07 | Delivery request does not reserve inventory, and physical fulfilment was not settlement-gated — **RESOLVED 2026-09-14, both halves, applied + live-verified** (`20260914120000_feature_009_db_block_07.sql`; Feature 009 T010–T013) | 005, 006, 009 | **AC-04** (now passes live) |
| DB-BLOCK-11 | No mechanism created a `profiles` row for a fresh Auth signup — RESOLVED 2026-09-11, applied + live-verified | 003 | Fresh-signup onboarding path |
| DB-OPEN-05 | `coffee_lots` member-read policy appears unsatisfiable | 005, 006 | Lot detail visibility |
| DB-OPEN-06 | Auditors cannot read `audit_logs` — Feature 012 states the limitation (T015, no fallback); still OPEN | 010, 012 | Auditor evidence access |
| DB-OPEN-08 | No FX/conversion storage | 011, 002 | **AC-06** conversions |
| DB-OPEN-09 | Dispute freeze has no mechanism; compliance cannot set an order `DISPUTED` — reconfirmed by Feature 012 (2026-09-19); no application-side freeze exists | 010, 012 | **MKT-07 NOT fully satisfiable** |
| DB-OPEN-12 | `inventory_reservation_items` member-read policy confirmed (live-proven) unsatisfiable for non-admins | 005, 006, 009 | Reservation cause/expiry visibility (quantity truth unaffected) |
| DB-OPEN-19 | No variance / reconciliation / quarantine model for warehouse custody (Feature 010 RUN D, 2026-09-16) | 010 (warehouse reconciliation), 012 | Reconciliation workflow |
| DB-OPEN-21 | Configuration UPDATEs (`platform_admins`, commission, tax, shipping, `payment_accounts`) persisted no actor (Feature 010 RUN F, 2026-09-17) — **RESOLVED 2026-09-20 (Database hygiene M1)**: migration `20260920120000_feature_010_db_open_21_config_attribution.sql` — DB-owned `updated_at` + audit triggers on all six tables, redacted `payment_accounts` audit, `user_id`-keyed `platform_admins` audit; applied, postflight 15/15, live-proven | 010 T027/T029 (COMPLETE) | Attributable privileged changes |
| DB-OPEN-22 | COMPLIANCE could not read what it must decide on — **organizations half RESOLVED 2026-09-19 (Feature 010 RUN J)**: migration `20260919130000_feature_010_db_open_22_compliance_organization_read.sql` (`organizations_member_select` + `OR is_compliance_operator()`, plus `trg_organizations_compliance_guard` narrowing the now-effective compliance UPDATE to status-only approved transitions); applied, postflight 12/12, live-proven. **Still open**: `file_assets` (KYB evidence bytes unlocatable for COMPLIANCE) and `account_status_history` (not readable by COMPLIANCE) | 010 T010 (COMPLETE); KYB evidence review by COMPLIANCE | Compliance evidence review; status-history visibility for COMPLIANCE |
| DB-OPEN-23 | Dispute status transitions were neither attributable nor DB-guarded (Feature 012 RUN A) — **RESOLVED 2026-09-19 (Feature 012 RUN E)**: migration `20260919120000_feature_012_dispute_status_history.sql` — append-only `dispute_status_history`, `transition_dispute()` (compliance + MFA, reason required, compare-and-set, approved graph, write-once resolution), `trg_disputes_transition_guard`; applied, postflight 12/12, live-proven | 012 T004 (COMPLETE) | MKT-07 attributable resolution (freeze still DB-OPEN-09) |
| SHIP-OPEN-01 | `shipping_rules` has no database or application consumer; no fee is derived from it (Feature 010 RUN F) | 007/009 adoption | Shipping fee configuration is inert |
| SUSPEND-OPEN-01 | No policy for a suspended organization's in-flight shipments / custody / listings (business decision; recorded Feature 010 RUN D) | 010, 012 | Suspension consequences |

### Feature-level blockers recorded during 002's planning sync

These are surfaced in `specs/002-public-website/spec.md` and constrain sub-flows only — none blocks
Feature 002 as a whole.

| ID | Summary | Severity | Blocks | Owner |
|---|---|---|---|---|
| CRM-DEST-01 | No approved CRM/email destination for RFQ hand-off | PRE-PRODUCTION BLOCKER | RFQ delivery to the business | Business (SRS §18 register) |
| CONTENT-01 | No approved content source for knowledge/editorial/legal (no CMS/article/legal table exists; SRS assigns authoring to the Catalogue/CMS admin area) | BLOCKS SUB-FLOW | `/knowledge/*`, `/legal/*` | 010 / Content-Legal |
| LIFE-01 | No alias/redirect/tombstone capability — renamed, withdrawn and never-existed are indistinguishable | BLOCKS SUB-FLOW | 301/308/410 lifecycle (200/404 is implementable) | DB capability decision |
| ABUSE-01 | No durable multi-instance abuse protection (no Redis/Upstash approved) | PRE-PRODUCTION BLOCKER | production-grade abuse defence | Infrastructure decision |
| MEDIA-01 | No Storage bucket / public file-delivery path (extends DB-BLOCK-01) | BLOCKS SUB-FLOW | real public imagery/documents | DB capability decision |
| PRICE-011 | Feature 011 unimplemented; conversions also blocked by DB-OPEN-08 | BLOCKS SUB-FLOW | numeric reference pricing | 011 |

**Business decisions still outstanding** (SRS §18 Sprint 0 register): RFQ/CRM destination; refund and
chargeback model; OPS-01 dual control for high-risk actions; member MFA enforcement policy; KYB
screening provider/policy; market-data licensing; hold-expiry and price-ingestion scheduling
infrastructure; Hills commercial quote entity; **COMMISSION-OPEN-01** — whether a MEMBER_SELLER
checkout with no matching commission tier should explicitly allow 0% commission or fail closed
(owned by Feature 008 / Business-Finance; see `docs/database/commission-capability.md` §8).

---

## 6. Production readiness

**Not production-ready.** Code completion never authorizes production trading (Constitution
"Production Readiness"; SRS Appendix F). **AC-04 is now live-proven** by Feature 009's resolved
delivery reservation and settlement gate. Remaining gates include AC-06 price conversion/disclosure,
approved trusted-funding/provider readiness (008), unresolved evidence scopes outside KYB,
DB-OPEN-06/09, OPS-01 dual control, the variance model, and the usual legal/tax/security/backup/UAT
release approvals, independent of implementation quality.

---

## 7. How to continue (for an agent with no prior context)

1. Read `.specify/memory/constitution.md` (v2.0.0) — the locked rules.
2. Read this roadmap and `docs/architecture/DATABASE-CAPABILITY-MAP.md` (including §8 commission and
   §9 blockers).
3. Read `specs/001-platform-foundation/AGENT-HANDOFF.md` — 001 is **built**, so its patterns
   (route guards, DAL, Server Action contract, `unstable_cache` + `revalidateTag`, `StateScreen`,
   test fixtures) are working code to copy, not proposals.
4. Pick the next feature per §3's dependency graph.
5. Read that feature's `spec.md` → `plan.md` → `tasks.md` → `contracts/`.
6. Run `/speckit-analyze` for that feature (its preflight is pending; **002 requires a re-run**
   after its 2026-09-08 planning sync).
7. Implement tasks in phase order, honouring every "standing rule" in its tasks.md.
8. Never resolve a recorded blocker with a workaround; escalate it instead.
