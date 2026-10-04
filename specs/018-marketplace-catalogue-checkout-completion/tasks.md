# Tasks: Marketplace, Catalogue & Checkout Completion

**Input**: Design documents in `specs/018-marketplace-catalogue-checkout-completion/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Required by the Feature 018 specification. Write focused tests before or alongside the implementation they protect. Mocks may validate presentation but never satisfy PostgreSQL atomicity, authorization, inventory or concurrency coverage.

**Safety**: No task authorizes a remote mutation. T011 is REMOTE READ-ONLY TEST/DEMO schema capture. Remote mutation/live work is explicitly gated at T129, requires future approval, only targets `mxejnutukgxyccnohglo`, and follows [migrations-verification.md](contracts/migrations-verification.md).

**Format**: `[P]` means different-file work with no incomplete prerequisite. `[US#]` identifies the story served.

## PHASE A: Foundation, Checkout, Admin & Bank — T001–T059

**Delivery pass**: Claude pass 1. Obey the internal gates below; this grouping does not make all Phase A tasks parallel.

### A1: Contract and Live-Schema Capture — T001–T012

**Goal**: Capture actual TEST/DEMO definitions read-only, reconcile drift, and freeze the reviewable M1–M4 SQL design before authoring any migration.

- [ ] T001 Create the Feature 018 capture manifest and expected-object inventory in `scripts/f018-capture-schema.ts`.
- [ ] T002 Implement read-only effective PostgreSQL/HTTP target identity pinning in `scripts/f018-capture-schema.ts`; refuse mixed/local targets and record no secret values.
- [ ] T003 [P] Capture cart resolver, Add, update/remove, request-log and destination RPC definitions/ACLs in `scripts/f018-capture-schema.ts`.
- [ ] T004 [P] Capture checkout, quote, order-item validator, order transition and reservation/reclamation definitions/ACLs in `scripts/f018-capture-schema.ts`.
- [ ] T005 [P] Capture offer/inventory/position constraints, indexes, policies, grants and trigger bindings in `scripts/f018-capture-schema.ts`.
- [ ] T006 [P] Capture Feature 014 ticket/message functions, policies, history/audit bindings and notifications in `scripts/f018-capture-schema.ts`.
- [ ] T007 [P] Capture payment-account/default, proforma snapshot/immutability, proof Storage and Feature 016 Finance/handoff definitions in `scripts/f018-capture-schema.ts`.
- [ ] T008 [P] Capture Feature 017 retired-function definitions, application-role ACL denials and provider runtime/secret presence metadata in `scripts/f018-capture-schema.ts`.
- [ ] T009 Implement catalog comparison and fail-closed drift report in `scripts/f018-capture-schema.ts` using valid `pg_proc`, `pg_trigger`, `pg_policy`, `pg_constraint` and `pg_index` expressions.
- [ ] T010 Add capture-script fixture/unit tests in `tests/finance/f018-schema-capture.test.ts`.
- [ ] T011 **REMOTE READ-ONLY** Run the capture script only against the explicitly approved TEST/DEMO target and save sanitized evidence in `specs/018-marketplace-catalogue-checkout-completion/evidence/schema-capture.md`; make no mutation.
- [ ] T012 Reconcile captured drift and record signed-off M1–M4 object signatures, lock graph, grants and rollback boundaries in `specs/018-marketplace-catalogue-checkout-completion/contracts/migrations-verification.md`.

**Critical gate**: T001–T010 are local capture tooling/tests. T011 is REMOTE READ-ONLY, not local/static and not a remote mutation. T012 must reconcile that evidence. No migration SQL authoring or Feature 018 database implementation may proceed to T013+ until T011 and T012 are complete with no unresolved drift.

### A2: Single-Line Checkout Foundation — US1 (P1, MVP) — T013–T038

**Goal**: One selected pending line creates one dedicated child transaction atomically; unrelated lines and the reusable source DRAFT remain intact.

**Independent test**: With A/B/C in one cart, reserve A only; retry/race/failure paths create no duplicate child or lost source line, and final-line checkout reuses the exact empty cart ID.

### M1 — Featured and Arabic snapshot schema prerequisite

- [ ] T013 [US1] Write M1 preflight checks for Coffee/publication and proforma snapshot shape in `scripts/f018-m1-preflight.ts`.
- [ ] T014 [US1] Write M1 forward migration for nullable `coffees.featured_at` and immutable nullable Arabic proforma-item snapshots in `supabase/migrations/<timestamp>_feature_018_featured_arabic_snapshots.sql`.
- [ ] T015 [US1] Write M1 rollback retaining populated history and snapshot protections in `supabase/migrations/<timestamp>_feature_018_featured_arabic_snapshots_rollback.sql`.
- [ ] T016 [US1] Write read-only M1 postflight for columns/index definitions, public boundaries and immutable bindings in `scripts/f018-m1-postflight.ts`.
- [ ] T017 [P] [US1] Add M1 schema/contract tests in `tests/commerce/f018-m1-schema.test.ts`.
- [ ] T018 [US1] Run local PostgreSQL syntax/dry-run verification for M1 in `tests/commerce/f018-m1-migration.test.ts`.
- [ ] T019 [US1] Reserve approved live M1 preflight/forward/postflight verification in `tests/commerce/f018-live-m1.test.ts` behind the explicit remote approval gate.

### M2 — selected checkout, receipt and legacy fence

- [ ] T020 [US1] Write M2 preflight for current lock graph, direct cart writers, receipt namespace and active V1/017 fences in `scripts/f018-m2-preflight.ts`.
- [ ] T021 [P] [US1] Add failing atomic split, payload-conflict and replay contract tests in `tests/commerce/f018-cart-line-checkout.test.ts`.
- [ ] T022 [P] [US1] Add real PostgreSQL A/B/C, final-empty reuse and injected-rollback tests in `tests/commerce/f018-cart-line-checkout.live.test.ts`.
- [ ] T023 [P] [US1] Add independent-session same-line/different-line/Add-update-remove/reclaim concurrency tests in `tests/commerce/f018-checkout-concurrency.live.test.ts`.
- [ ] T024 [P] [US1] Add selected-only quote/shipping/commission and inventory-conservation tests in `tests/commerce/f018-selected-quote.live.test.ts`.
- [ ] T025 [P] [US1] Add fresh legacy multi-line denial and historical committed multi-line replay tests in `tests/commerce/f018-legacy-checkout-compat.live.test.ts`.
- [ ] T026 [US1] Implement payload-aware protected request begin/complete helpers and receipt/permit tables, RLS, immutability and exact constraints in `supabase/migrations/<timestamp>_feature_018_checkout_foundation.sql`.
- [ ] T027 [US1] Implement canonical V1 cart mutation guards for Add/update/remove and read-only canonical-cart resolution in `supabase/migrations/<timestamp>_feature_018_checkout_foundation.sql`.
- [ ] T028 [US1] Implement staged expired-reservation discovery, complete offer/position union locking and reentrant release path in `supabase/migrations/<timestamp>_feature_018_checkout_foundation.sql`.
- [ ] T029 [US1] Implement the private shared Feature 015 checkout kernel and public `checkout_bank_transfer_v1` permit/history fence in `supabase/migrations/<timestamp>_feature_018_checkout_foundation.sql`.
- [ ] T030 [US1] Implement selected-line quote/estimate and the atomic child-item/receipt/source-delete sequence in `supabase/migrations/<timestamp>_feature_018_checkout_foundation.sql`.
- [ ] T031 [US1] Populate frozen nullable Arabic item/origin snapshots only in new kernel issuance in `supabase/migrations/<timestamp>_feature_018_checkout_foundation.sql`.
- [ ] T032 [US1] Implement receipt integrity/recovery functions with fresh authority and terminal-link validation in `supabase/migrations/<timestamp>_feature_018_checkout_foundation.sql`.
- [ ] T033 [US1] Implement typed checkout/recovery/summary DAL results in `lib/commerce/cart.ts` and `lib/commerce/checkout.ts`.
- [ ] T034 [US1] Add guarded selected-checkout Server Actions in `src/app/dashboard/cart/actions.ts`.
- [ ] T035 [US1] Write M2 rollback that preserves immutable receipts/snapshots and Feature017/V1 fences in `supabase/migrations/<timestamp>_feature_018_checkout_foundation_rollback.sql`.
- [ ] T036 [US1] Write M2 read-only function/ACL/RLS/lock/uniqueness/fence postflight in `scripts/f018-m2-postflight.ts`.
- [ ] T037 [US1] Add M2 migration/SQL parser and local dry-run tests in `tests/commerce/f018-m2-migration.test.ts`.
- [ ] T038 [US1] Reserve approved remote M2 preflight/forward/concurrency/rollback/reapply/postflight test harness in `tests/commerce/f018-live-m2.test.ts`.

**Checkpoint**: US1 is independently demonstrable locally against real PostgreSQL; no remote test is implied.

### A3: Unified Admin Coffee Experience — US3 (P1) — T039–T054

**Goal**: Authorized operators create and resume normalized bilingual Coffee/offer work in one role-safe workflow.

**Independent test**: Interrupt every step after identity save, resume same Coffee/selected offer, then test catalogue-only and coordinated publication without fabricated stock or role bypass.

### M3 — Admin orchestration

- [ ] T039 [US3] Write M3 preflight for Coffee/offer/media/translation/review policies, revisions and audit guards in `scripts/f018-m3-preflight.ts`.
- [ ] T040 [P] [US3] Add Admin intent/CAS/readiness/publication contract tests in `tests/admin/f018-catalogue-orchestration.test.ts`.
- [ ] T041 [P] [US3] Add interrupted media/translation/offer resume and authorization tests in `tests/admin/f018-catalogue-resume.test.tsx`.
- [ ] T042 [US3] Implement M3 protected creation/step-save payload binding, revision checks and controlled publication routines in `supabase/migrations/<timestamp>_feature_018_admin_orchestration.sql`.
- [ ] T043 [US3] Implement M3 rollback retaining created Coffee/offer/intents/history and safe publication guards in `supabase/migrations/<timestamp>_feature_018_admin_orchestration_rollback.sql`.
- [ ] T044 [US3] Implement M3 read-only role/MFA/revision/publication/ACL postflight in `scripts/f018-m3-postflight.ts`.
- [ ] T045 [US3] Add M3 local dry-run/migration contract verification in `tests/admin/f018-m3-migration.test.ts`.
- [ ] T046 [US3] Reserve approved live M3 preflight/forward/rollback/reapply/postflight scenarios in `tests/admin/f018-live-m3.test.ts`.
- [ ] T047 [US3] Implement Admin Coffee intent/CAS/readiness DAL in `lib/admin/catalogue.ts` and `lib/admin/catalogue-validation.ts`.
- [ ] T048 [P] [US3] Implement resumable identity/English, Arabic and taxonomy/origin step forms in `components/admin/catalogue/coffee-stepper.tsx` and `components/admin/catalogue/coffee-content-steps.tsx`.
- [ ] T049 [P] [US3] Implement media intent/recovery and verified-orphan compensation UI in `components/admin/catalogue/coffee-media-step.tsx`.
- [ ] T050 [P] [US3] Implement eligible inventory selection and Warehouse handoff state in `components/admin/catalogue/coffee-inventory-step.tsx`.
- [ ] T051 [P] [US3] Implement explicit offer/price/quantity/Featured step in `components/admin/catalogue/coffee-offer-step.tsx`.
- [ ] T052 [US3] Compose protected new/edit stepper routes in `src/app/dashboard-admin/(catalogue)/coffees/new/page.tsx` and `src/app/dashboard-admin/(catalogue)/coffees/[coffeeId]/page.tsx`.
- [ ] T053 [US3] Implement readiness, separated public/purchase previews and catalogue-only/coordinated publish controls in `components/admin/catalogue/coffee-readiness-panel.tsx`.
- [ ] T054 [US3] Wire Compliance approval handoff without role expansion in `src/app/dashboard-admin/(compliance)/listings/actions.ts` and `lib/admin/decisions.ts`.

### A4: Bank Configuration — US5 (P1) — T055–T059

**Goal**: Existing account management exposes a usable default USD path while preserving role/MFA and frozen history.

**Independent test**: Change default as authorized operator; old proforma remains frozen and next issuance uses only the valid new default.

- [ ] T055 [P] [US5] Add default selection/role/MFA/masking/snapshot tests in `tests/admin/f018-payment-accounts.test.ts`.
- [ ] T056 [US5] Extend safe payment-account projections and typed readiness errors in `lib/admin/payment-accounts.ts`.
- [ ] T057 [US5] Implement default USD control and active/default readiness in `src/app/dashboard-admin/(system)/payment-accounts/page.tsx` and `src/app/dashboard-admin/(system)/payment-accounts/actions.ts`.
- [ ] T058 [US5] Implement masked account list/detail/default affordances in `components/admin/payment-accounts/payment-account-list.tsx`.
- [ ] T059 [US5] Add existing-bank RPC integration and future-versus-frozen snapshot regression coverage in `tests/commerce/f018-bank-snapshot.test.ts`.

**Phase A exit gate**: T001–T059 are complete only when the live schema is captured/reconciled; M1/M2/M3 implementation is complete; selected checkout passes real PostgreSQL local/integration tests for exact-once/recovery/empty-DRAFT/historical multi-line compatibility; Admin and bank gates pass; required local postflights pass; and no BLOCKER/HIGH remains. Remote migration execution is not required.

## PHASE B: Marketplace & Member Experience — T060–T111

**Delivery pass**: Claude pass 2. Phase B consumes Phase A's captured M1/M2 security and operation-binding contracts; it cannot bypass selected checkout or private DTO boundaries.

### B1: Public Recently Added and Featured — US7 (P2) — T060–T066

**Goal**: Public discovery surfaces are dynamic, bounded and private-data-safe.

**Independent test**: Published featured/recent Coffee ordering and invalidation behave deterministically while anonymous delivered representations contain no commercial fields.

- [ ] T060 [P] [US7] Add public DTO/cache/HTML/RSC/metadata privacy tests in `tests/public/f018-public-discovery-security.test.ts`.
- [ ] T061 [P] [US7] Add Featured/Recent ordering, lifecycle, cap and fallback tests in `tests/public/f018-featured-coffees.test.ts`.
- [ ] T062 [US7] Implement public Featured/Recent/related allowlist reads and deterministic ordering in `lib/public/coffees.ts`.
- [ ] T063 [US7] Add public cache tags and committed invalidation helpers in `lib/public/cache.ts`.
- [ ] T064 [US7] Compose bounded Recent/Featured homepage sections in `src/app/page.tsx` and `components/marketplace/home-marketplace.tsx`.
- [ ] T065 [US7] Implement public Coffee card/gallery/detail and related-coffee composition in `components/coffee/public-coffee-card.tsx`, `components/coffee/coffee-gallery.tsx` and `src/app/(public)/coffee/[slug]/page.tsx`.
- [ ] T066 [US7] Implement allowlisted purchase sign-in return validation in `lib/auth/safe-return.ts` and `src/app/(public)/coffee/[slug]/page.tsx`.

### B2: Marketplace and Product Details — US7 (P2) — T067–T074

**Goal**: Authorized buyers can choose a legitimate offer explicitly without exposing private commercial data publicly.

**Independent test**: Buyer sees permitted fresh offer data and Add eligibility; seller/anonymous/own-offer/unavailable cases stay correctly bounded.

- [ ] T067 [P] [US7] Add member offer projection, private-media and unpublished-Coffee eligibility tests in `tests/listings/f018-marketplace-projection.test.ts`.
- [ ] T068 [P] [US7] Add localized bounded search, SOLD_OUT and buyer-capability state tests in `tests/listings/f018-marketplace-search.test.ts`.
- [ ] T069 [US7] Implement localized bounded marketplace search and safe failure states in `lib/listings/browse.ts`.
- [ ] T070 [US7] Implement fresh authorized offer detail projection and explicit selector contract in `lib/listings/offer-detail.ts`.
- [ ] T071 [US7] Implement responsive marketplace listing cards with visible actions in `components/listings/listing-card.tsx`.
- [ ] T072 [US7] Implement buyer offer selector, quantity control and safe eligibility presentation in `components/coffee/offer-selector.tsx` and `components/commerce/quantity-control.tsx`.
- [ ] T073 [US7] Compose protected marketplace/detail pages in `src/app/dashboard/coffee/page.tsx` and `src/app/dashboard/coffee/[offerId]/page.tsx`.
- [ ] T074 [US7] Wire stable Add intent and committed action outcome into `components/commerce/add-to-cart-form.tsx` and `src/app/dashboard/coffee/actions.ts`.

### B3: Cart, Navbar, Badge and Feedback — US4 (P1) — T075–T083

**Goal**: Every cart control shows authoritative, tenant-scoped distinct-line state and a selected checkout action.

**Independent test**: Add/merge/update/remove/partial checkout keep desktop/mobile/sidebar counts in sync across context switches and invalidations.

- [ ] T075 [P] [US4] Add CartSummary epoch, stale-response, auth/org, cross-tab/focus and distinct-count tests in `tests/commerce/f018-cart-summary.test.tsx`.
- [ ] T076 [P] [US4] Add cart UI line/update/remove/selected-checkout/no-Checkout-All tests in `tests/commerce/f018-cart-journey.test.tsx`.
- [ ] T077 [US4] Implement authoritative CartSummary server read and typed state in `lib/commerce/cart.ts`.
- [ ] T078 [US4] Implement context-epoch provider, invalidation-only BroadcastChannel and focus refresh in `components/commerce/cart-summary-provider.tsx`.
- [ ] T079 [US4] Implement cart line estimate/unavailable/update/remove/Checkout-this-item UI in `components/commerce/cart-line.tsx` and `src/app/dashboard/cart/page.tsx`.
- [ ] T080 [US4] Implement committed EN/AR toast and accessible inline Add confirmation in `components/commerce/add-to-cart-form.tsx`.
- [ ] T081 [US4] Implement shared capability-aware Cart badge in `components/public/site-header.tsx`, `components/dashboard/sidebar.tsx` and `components/dashboard/mobile-nav.tsx`.
- [ ] T082 [US4] Update member logo destination and retain contact/RFQ while excluding Admin cart in `components/dashboard/sidebar.tsx` and `components/public/site-header.tsx`.
- [ ] T083 [US4] Wire partial-checkout result/navigation and summary refresh in `src/app/dashboard/cart/actions.ts` and `components/commerce/cart-summary-provider.tsx`.

### B4: Compare — US8 (P2) — T084–T089

**Goal**: Public Coffee and member Offer Compare remain separately scoped, fresh and reference-only.

**Independent test**: Public URLs contain only bounded slugs; private comparison clears on context loss and never stores commercial values.

- [ ] T084 [P] [US8] Add public/member Compare privacy, limit, context and unavailable-ref tests in `tests/public/f018-compare.test.tsx` and `tests/commerce/f018-member-compare.test.tsx`.
- [ ] T085 [US8] Implement separate public/member reference-only Compare stores in `lib/compare/selection.ts`.
- [ ] T086 [US8] Implement bounded public slug resolver and compare page in `src/app/(public)/coffee/compare/page.tsx`.
- [ ] T087 [US8] Implement fresh authorized member offer resolver and page in `src/app/dashboard/compare/page.tsx`.
- [ ] T088 [US8] Implement accessible responsive Compare tray/remove/clear/limit controls in `components/coffee/compare-tray.tsx`.
- [ ] T089 [US8] Wire gallery/card selectors to public/member Compare namespaces in `components/coffee/public-coffee-card.tsx` and `components/coffee/offer-selector.tsx`.

### B5: Proforma and Checkout Recovery — US2 (P1) — T090–T097

**Goal**: Buyers read the exact document/state and safely recover known or uncertain checkout results without duplicate transactions.

**Independent test**: Pointer corruption/query errors, bank/Arabic drift, proof/reject/paid/terminal states and lost redirect all produce truthful next actions.

- [ ] T090 [P] [US2] Add exact-current-proforma, typed error and frozen bank/Arabic snapshot tests in `tests/commerce/f018-proforma-read.test.ts`.
- [ ] T091 [P] [US2] Add buyer state/recovery/no-duplicate proof-payment navigation tests in `tests/commerce/f018-checkout-recovery.test.tsx`.
- [ ] T092 [US2] Implement exact pointer/linkage and typed document read outcomes in `lib/commerce/read.ts` and `lib/orders/read.ts`.
- [ ] T093 [US2] Implement receipt-driven committed/unknown recovery DAL in `lib/commerce/checkout.ts`.
- [ ] T094 [US2] Implement frozen bank/Arabic/document rendering with honest fallback in `components/commerce/proforma-document.tsx`.
- [ ] T095 [US2] Implement actual order/proof/rejection/paid/fulfillment/terminal next-action timeline in `components/commerce/order-timeline.tsx`.
- [ ] T096 [US2] Update buyer proforma/order/payment routes for typed recovery/error states in `src/app/dashboard/orders/[orderId]/proforma/page.tsx` and `src/app/dashboard/payments/[orderId]/page.tsx`.
- [ ] T097 [US2] Add Feature015/016 exact invoice/title/storage-allocation/fulfillment and rejection-absence compatibility tests in `tests/finance/f018-terminal-compat.live.test.ts`.

### B6: Help Center — US9 (P2) — T098–T111

**Goal**: Extend Feature 014 with safe Help routes, HC references, controlled history and idempotent operations.

**Independent test**: HLP and HC references authorize correctly; create/reply/status races append once, obey graph/current-org scope and send safe non-self notifications.

### M4 — Help extension

- [ ] T098 [US9] Write M4 preflight for Feature014 refs/statuses/policies/triggers/order participants and notification bindings in `scripts/f018-m4-preflight.ts`.
- [ ] T099 [P] [US9] Add HC collision/category/history/graph/idempotency migration tests in `tests/messaging/f018-help-schema.test.ts`.
- [ ] T100 [P] [US9] Add Help RLS/current-org/multi-seller/order/privacy/notification tests in `tests/messaging/f018-help-security.test.ts`.
- [ ] T101 [US9] Implement M4 category, HC generator, append-only history, controlled operations and support notifications in `supabase/migrations/<timestamp>_feature_018_help_center.sql`.
- [ ] T102 [US9] Implement M4 rollback retaining HC/HLP/history/messages and safe direct-write fences in `supabase/migrations/<timestamp>_feature_018_help_center_rollback.sql`.
- [ ] T103 [US9] Implement M4 read-only graph/RLS/ACL/history/notification postflight in `scripts/f018-m4-postflight.ts`.
- [ ] T104 [US9] Add M4 local dry-run/migration verification in `tests/messaging/f018-m4-migration.test.ts`.
- [ ] T105 [US9] Reserve approved live M4 preflight/forward/rollback/reapply/postflight scenarios in `tests/messaging/f018-live-m4.test.ts`.
- [ ] T106 [US9] Implement typed current-org Help DAL and idempotent operation results in `lib/messaging/tickets.ts` and `lib/messaging/types.ts`.
- [ ] T107 [US9] Implement member Help list/new/detail routes in `src/app/dashboard/help/page.tsx`, `src/app/dashboard/help/new/page.tsx` and `src/app/dashboard/help/[ticketRef]/page.tsx`.
- [ ] T108 [US9] Implement member ticket form/conversation/history/reply controls in `components/messaging/help-ticket-form.tsx` and `components/messaging/help-conversation.tsx`.
- [ ] T109 [US9] Implement Admin Support inbox/detail routes in `src/app/dashboard-admin/support/page.tsx` and `src/app/dashboard-admin/support/[ticketRef]/page.tsx`.
- [ ] T110 [US9] Implement Admin filters/status graph/reply controls in `components/admin/support/support-inbox.tsx` and `components/admin/support/support-ticket-detail.tsx`.
- [ ] T111 [US9] Implement authorized old messages-route redirects in `src/app/dashboard/messages/page.tsx` and `src/app/dashboard-admin/(system)/messages/page.tsx`.

**Phase B exit gate**: T060–T111 are complete only when the local flow is demonstrable from anonymous discovery through sign-in, marketplace/product, Add, badge, cart, selected checkout, retained unrelated lines and order/proforma recovery; Help is locally validated; public/member privacy, cart, Compare, recovery and Help/RLS tests pass; and no BLOCKER/HIGH remains. Phase C work is not required for this basic functional claim.

## PHASE C: Polish, Regression, Live Verification & Closure — T112–T140

**Delivery pass**: Claude pass 3. Local/static closure work is separate from the explicit remote authorization and execution gate.

### C1: EN/AR, RTL, Accessibility and Motion Polish — US6 (P1) — T112–T119

**Goal**: Complete all changed journeys in both languages and directions with accessible, responsive, appropriate motion.

**Independent test**: Each changed public/member/Admin journey works at 360/768/1280px in EN/AR with keyboard and reduced motion.

- [ ] T112 [P] [US6] Add complete Feature018 EN/AR string inventory and RTL rendering tests in `tests/i18n/f018-localization.test.tsx`.
- [ ] T113 [P] [US6] Add axe/manual-keyboard regression harness for gallery, quantity, tray, dialog, forms and sticky actions in `tests/a11y/f018-journeys.test.tsx`.
- [ ] T114 [P] [US6] Add responsive/reduced-motion visual regression harness in `tests/browser/f018-responsive-motion.browser.mjs`.
- [ ] T115 [US6] Add EN/AR user-facing strings, safe frozen-English fallback and identifier direction isolation in `lib/i18n/locales/en.ts` and `lib/i18n/locales/ar.ts`.
- [ ] T116 [US6] Apply logical RTL layout, accessible labels/live errors/focus restoration and contained overflow across `components/coffee/`, `components/commerce/`, `components/messaging/` and `components/admin/`.
- [ ] T117 [US6] Use the installed `motion-design` skill during implementation to refine premium homepage/Featured/product/marketplace/cart/Compare motion through existing primitives documented in `components/motion/ANIMATION-OWNERSHIP.md`.
- [ ] T118 [US6] Apply restrained functional motion and reduced-motion equivalence to Admin/checkout/proforma/bank/Help in `components/motion/` and affected Feature018 components.
- [ ] T119 [US6] Measure and record LCP/interaction/CLS under documented representative conditions in `docs/validation/f018-performance.md`.

### C2: Regression, Approved Live Verification and Closure — T120–T140

**Goal**: Prove compatibility, migration recovery, target isolation and truthful closure only after all local gates pass.

- [ ] T120 [P] Add Feature018 scoped local/static regression command in `package.json` and `docs/validation/f018-local-regression.md`.
- [ ] T121 [P] Add Feature015 checkout/proof compatibility selection in `tests/commerce/f018-feature015-compat.test.ts`.
- [ ] T122 [P] Add Feature016-compatible scenario wrapper selecting scenarios1–27 and retired-aware ACL assertions in `tests/finance/f018-feature016-compat.ts`.
- [ ] T123 [P] Add Feature017 provider-retirement/ACL/Edge-secret absence checks in `tests/finance/f018-feature017-retirement.test.ts`.
- [ ] T124 Implement pinned effective HTTP/PostgreSQL/fixture target validation before any client/session creation in `scripts/f018-live-target.ts` and `tests/auth/fixture-session.ts`.
- [ ] T125 Implement exact run-manifest/provenance fixture ownership and non-destructive cleanup in `tests/finance/f018-live-fixtures.ts` and `tests/finance/f018-live-harness.test.ts`.
- [ ] T126 Implement gated real scenario orchestration and persisted assertions in `tests/finance/f018-live-db.test.ts` and `tests/finance/f018-live-scenarios.ts`.
- [ ] T127 Run scoped local/static Feature018 regressions and record actual outcomes in `specs/018-marketplace-catalogue-checkout-completion/evidence/local-regression.md`.
- [ ] T128 Run `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check`; record actual results in `specs/018-marketplace-catalogue-checkout-completion/evidence/local-regression.md`.
- [ ] T129 Record explicit authorization for any TEST/DEMO mutation/live verification in `specs/018-marketplace-catalogue-checkout-completion/evidence/live-verification.md`; otherwise leave T130–T140 unchecked.
- [ ] T130 Verify approved remote target identity and read-only preflight against `mxejnutukgxyccnohglo` using `scripts/f018-capture-schema.ts` and `scripts/f018-live-target.ts`.
- [ ] T131 Apply reviewed M1/M2/M3/M4 forward migrations and run each read-only postflight using `scripts/f018-m1-postflight.ts`, `scripts/f018-m2-postflight.ts`, `scripts/f018-m3-postflight.ts` and `scripts/f018-m4-postflight.ts`.
- [ ] T132 Execute all approved gated checkout, Admin, bank, discovery, Compare, document and Help live scenarios through `tests/finance/f018-live-db.test.ts`.
- [ ] T133 Execute Feature015, Feature016 scenarios1–27 and Feature017 retirement compatibility checks using `tests/commerce/f018-feature015-compat.test.ts`, `tests/finance/f018-feature016-compat.ts` and `tests/finance/f018-feature017-retirement.test.ts`.
- [ ] T134 Execute approved rollback verification and inspect actual migration/ACL state using `scripts/f018-m1-preflight.ts`, `scripts/f018-m2-preflight.ts`, `scripts/f018-m3-preflight.ts` and `scripts/f018-m4-preflight.ts`.
- [ ] T135 On every post-rollback later failure, conditionally reapply Feature018, rerun postflights and record original/recovery failure separately in `scripts/f018-operator-recovery.ts`.
- [ ] T136 Verify final Feature018 APPLIED state, active V1 health, Feature017 denied grants and no provider Edge/secrets in `scripts/f018-final-postflight.ts`.
- [ ] T137 Clean only manifest-owned fixture/request/session/Storage resources and report retained immutable residue in `tests/finance/f018-live-fixtures.ts`.
- [ ] T138 Record executed versus skipped live scenarios, exact target, migration/rollback/reapply/cleanup evidence in `specs/018-marketplace-catalogue-checkout-completion/evidence/live-verification.md`.
- [ ] T139 Perform final task truthfulness audit against `specs/018-marketplace-catalogue-checkout-completion/tasks.md`, `plan.md`, `spec.md` and captured evidence.
- [ ] T140 Perform final independent closure review against `specs/018-marketplace-catalogue-checkout-completion/contracts/migrations-verification.md` and record result in `specs/018-marketplace-catalogue-checkout-completion/evidence/closure-review.md`.

**Phase C remote gate**: T120–T128 are local/static. T129 records explicit authorization. T130–T138 are remote TEST/DEMO execution only and target `mxejnutukgxyccnohglo`; T131 is the first remote mutation. T139–T140 are final closure tasks and cannot mark unrun remote tasks complete.

## Dependencies and Execution Order

### Delivery Phase A — T001–T059

- **A1 capture hard gate**: T001–T010 are local tooling/tests. **T011 is REMOTE READ-ONLY** schema capture; T012 reconciles its evidence. T011/T012 block T013+ migration SQL authoring and all database implementation.
- **A2 / US1**: T013–T019 (M1) precede T020–T038 (M2). T021–T025 may proceed in parallel after T020. T026–T032 are sequential transaction work; T033–T038 follow the stabilized SQL contract.
- **A3 / US3**: T039–T046 establish M3 after M2 protected operation binding. T048–T051 may proceed in parallel after T047. T052–T054 integrate them.
- **A4 / US5**: T055 can start after T012; T056–T059 follow captured bank contracts and may overlap A3, but all remain inside delivery Phase A.

### Delivery Phase B — T060–T111

- **B1 public discovery**: T060–T061 may start after T017/M1; T062–T066 follow M1 and Admin publication contracts.
- **B2 marketplace**: T067–T068 may prepare after T012; T069–T074 require M2 and shared public component decisions.
- **B3 cart**: T075–T076 can prepare after M2 contract; T077–T083 require T033–T034 and marketplace Add.
- **B4 Compare**: T084 may prepare after public/member DTO contracts; T085–T089 require B1–B3.
- **B5 proforma/recovery**: T090–T091 may prepare after M1/M2; T092–T097 require M2, bank work and selected checkout result shape.
- **B6 Help/M4**: T098–T105 establish M4 after M2 operation binding; T106–T111 follow M4. No Phase C task is a prerequisite for Phase B's local exit gate.

### Delivery Phase C — T112–T140

- **C1 polish**: T112–T114 can run in parallel throughout implementation but T115–T119 close after all changed surfaces exist.
- **C2 local closure**: T120–T128 are local/static closure gates.
- **C2 remote authorization and execution**: T129 explicitly gates T130–T138. T130 is remote identity/preflight; T131 is the first remote mutation. T139–T140 require all applicable evidence and never mark unrun remote tasks complete.

### Story Completion Order

```text
Schema capture
  → US1 single-line checkout
    ├→ US3 Admin ─→ US7 discovery ─→ US7 marketplace ─→ US4 cart ─→ US8 Compare
    ├→ US5 bank ───────────────────────────────────────────┐
    └→ US9 Help                                              ├→ US6 EN/AR/a11y/motion → closure
                                                             └→ US2 proforma/recovery
```

### Parallel Opportunities

- **Capture**: T003–T008 after T001–T002.
- **M2 tests**: T021–T025 after T020.
- **M3 UI**: T048–T051 after T047; M3 test tasks T040–T041 after T039.
- **Public/marketplace tests**: T060–T061 and T067–T068.
- **Cart/Compare/document tests**: T075–T076, T084, T090–T091.
- **Help tests**: T099–T100 after T098.
- **Cross-cutting test harnesses**: T112–T114.
- **Closure compatibility checks**: T120–T123.

## Implementation Strategy

### MVP

1. Complete Delivery Phase A capture/reconciliation.
2. Complete M1/M2 and US1 through T038 within Delivery Phase A.
3. Run the real local PostgreSQL checkout suite and M2 postflight.
4. Stop for review before broader UI or any remote action.

### Incremental Delivery

Deliver each internal workstream only after its independent tests and documented local gate pass. Do not claim live verification from a gated skip. Delivery Phase C remote work is a separately authorized operational sequence, not ordinary implementation.

## Format Validation

Every task has one checkbox, sequential ID T001–T140, concrete paths, and story labels only in story phases. No task instructs a commit/push, historical migration edit, remote mutation without T129, provider restoration, new Compare database table or forbidden support expansion.

