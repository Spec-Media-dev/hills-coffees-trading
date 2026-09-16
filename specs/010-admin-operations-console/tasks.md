# Tasks: Operations / Admin Console (010)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §14 (OPS-01, OPS-02), §3.1, §13.5.

**Status**: **RUN C evaluated (2026-09-16) — Phase 5 T013/T014/T015 BLOCKED BY FEATURE 008; still
11 / 48.** RUN C re-audited CURRENT Feature 008 (its `spec/plan/tasks.md`, `lib/finance/*`, Server
Actions, RPC contracts, `tests/finance/*`, DTOs): 008 is at 6/39 (Phase 1 only) and its application
layer is `lib/finance/read.ts` (per-order `getPayment/getOrderFinancials/getProforma/getTaxInvoice/
getPayoutsForOrder/getPayoutsForOrganization`), `types.ts` (snapshot DTOs), `validation.ts`
(vocabularies), `errors.ts` (`mapFinanceError`) and `funding.ts` (`requestFunding` → always
`FINANCE_FUNDING_UNAVAILABLE`). There is NO payment-review queue read, NO proof-reference DTO
(`payment_proofs` is not read anywhere), NO `decidePayment` (`grep -rn decidePayment lib src
components` → nothing; 008 T017–T020 unchecked and T017 itself needs an approved DB change — 008
plan decision 4 classifies `admin_review_payment()` as B), NO payout-status write and NO tax-invoice
recording write (008 T023/T025 unchecked; invoice recording also depends on the unresolved private
Storage design, DB-BLOCK-01). Everything Phase 5 needs exists only as database tables/RLS/one
SECURITY DEFINER primitive, which is not permission for this console to own the business layer.
RUN C therefore built NO finance screen, NO second payment read domain, NO `admin_review_payment`
wrapper and NO table CRUD; it added `tests/admin/finance-delegation.test.tsx` (14 tests: static
delegation proof over `src/app/dashboard-admin`, `lib/admin`, `components/admin` — no runtime
`admin_review_payment`/`submit_payment_proof`, no finance-table write, no RPC other than the six
role attests, no money column, no service role/cache, no `.delete(`; the three finance areas stay
`blocked` on `feature-008-finance-layer` with no duplicate destination; no member Finance route;
and live direct-URL proof with real sessions — FINANCE reaches payments/payouts/invoices (blocked
state, no amount), COMPLIANCE and WAREHOUSE get `forbidden`, a plain member `no-operational-role`,
anonymous is redirected to `/admin/sign-in/`). Exact minimum 008 contracts are recorded on T013–T015.
**RUN B complete (2026-09-16) — Phase 3 T007/T008/T009 RECORDED, Phase 4 T011
RECORDED; T010 implemented but NOT closable (organization read/update policy gap for COMPLIANCE —
recorded, needs a database decision); T012 BLOCKED (Feature 012 absent). 11 / 48.** RUN A
(2026-09-15): Phase 1 (T001–T005) + Phase 2 (T006) + T046 RECORDED; T047/T048 BLOCKED (original
planned count 45; authoritative count 48). RUN B evidence: `lib/admin/{compliance,decisions,
validation}.ts`, `components/admin/compliance/*`, the `(compliance)/kyb|organizations|listings`
routes; `tests/admin/compliance-decisions.test.ts` (13 live tests incl. a two-session race) +
`tests/admin/compliance-pages.test.tsx` (12 live page tests) + `tests/browser/feature010-runb.browser.mjs`
(25 surfaces × EN/AR × light/dark × 390/1366/1920, zero axe violations, inline validation,
confirmation dialog, keyboard focus ring, direct-URL refusal). One disposable COMPLIANCE fixture
(role exactly COMPLIANCE, no membership) was human-authorized, used, and de-privileged after every
run (`activeCapability: false`, blocked + Auth-banned; immutable audit references prevented deletion).
**RUN B live-DB findings (recorded, not fixed):** (1) `organizations` has NO SELECT policy for `is_compliance_operator()` (only `organizations_member_select`: `is_org_member(id) OR is_platform_admin()`), and because an UPDATE whose WHERE references existing columns is also subject to SELECT policies, the existing `organizations_compliance_update` policy affects ZERO rows for a pure COMPLIANCE operator (verified live 2026-09-15 with an affected-row count of 0 on a no-op status write; `kyb_applications` writes affect 1). The same shape blocks `file_assets` (`catalog_admin_files`) and `account_status_history` (`account_status_history_view`) for that role. (2) `validate_offer_transition`
gates every UPDATE into APPROVED/REJECTED/PUBLISHED/SUSPENDED on `is_compliance_operator()`
(`compliance_required_for_listing_state`) — so even the privileged seed script cannot restore a
suspended fixture to PUBLISHED; the compliance session does it. (3) The trigger has no branch for
`old.status = 'SUSPENDED'`/`'ARCHIVED'`, so a suspended listing has no DB-enforced forward limit —
a seller's own ARCHIVE from SUSPENDED is not refused by the database (code reading of the live
trigger text; not exercised live). (4) A shared-primitive accessibility defect surfaced by the real
Chrome focus check: `outline-none` + `focus-visible:outline-2` under Tailwind v4 leaves
`outline-style: none` (no visible ring) on `Button`/`Input`/`Textarea`/`Checkbox`/`RadioGroup`/
`Select`/`Switch`/`Tabs` — fixed by adding `focus-visible:outline-solid` (one utility, eight files;
computed ring now `solid 2px`). Phases 3–12 remain unstarted; their
blockers are unchanged (see the Run 0 reconciliation in plan.md). RUN A evidence: the single access
matrix (`lib/admin/areas.ts`) + live guards (`lib/admin/guards.ts`) + six guarded route groups
(`(compliance)`/`(warehouse)`/`(finance)`/`(catalogue)`/`(audit)`/`(system)` with a nested
`(super)` slice) + the role-shaped shell and account menu + the real-count overview + the operator
self-account page; `tests/admin/*` (37 tests, live WAREHOUSE/FINANCE/member/anonymous sessions) and a
real Chrome + axe pass (`tests/browser/feature010-runa.browser.mjs`: 20 surfaces × EN/AR × light/dark
× 390/1366/1920, zero violations, keyboard focus ring, mobile drawer, direct-URL refusals). No
database change, no service role, no fabricated figure. Two live-DB findings recorded (not fixed):
`organizations` has no SELECT policy for COMPLIANCE (Phase 3's KYB queue cannot show organization
names through RLS as-is — a candidate DB open item for T007), and the spec's "Trading oversight"
scope has no owning task (flagged for RUN B planning, not silently added).
**Prerequisite**: 001 plus the applicable current domain capability: 003 is closed; 005 is partial;
006 supplies listing states; 008 supplies only Phase-1 finance reads; 009 is closed; 012 is not started.

> **Standing rules**: (1) every area authorizes independently server-side; (2) the console owns no
> transactional logic — settlement via 008's `decidePayment` only once 008 provides it, fulfilment
> via 009's warehouse layer;
> (3) no hard deletes of commercial/inventory/title/payment/audit records; (4) where a recorded
> blocker limits a capability, state it honestly rather than simulating it.

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Access matrix & guards

- [x] T001 [PS1] Create `lib/admin/areas.ts` — the single declarative access matrix mapping every
  console area to its required role check.
  - Req: FR-002, FR-003, SC-001 | Depends: —
  - Verify: every area appears exactly once with an explicit role; no "any staff" catch-all exists
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: this single file defines least privilege for the entire operations surface; an over-broad entry here silently grants cross-role power.
  - **Done (2026-09-15, RUN A)**: `ADMIN_AREAS` declares 21 areas across the six groups (compliance:
    kyb/organizations/listings/disputes; warehouse: shipments/inventory; finance: payments/payouts/
    invoices; catalogue: coffees/origins/regions/taxonomy/warehouses/media; audit: audit; system:
    roles/commission/tax/shipping/paymentAccounts), each with exactly ONE `roleFunction` drawn from
    the closed union `ADMIN_ROLE_FUNCTIONS` (the six approved SECURITY DEFINER functions) and an
    honest `availability` (`planned` phase N / `blocked` with the named dependency — none is `live`
    because RUN A built no workflow). `ROLE_FUNCTION_ATTESTS` mirrors `lib/auth/dal.ts` exactly (no
    invented hierarchy); `payment_accounts` is `is_platform_admin()` while roles/commission/tax/
    shipping are `is_super_admin()` — the RLS truth. Overview/Account are `ADMIN_SHELL_ROUTES`,
    kept OUT of the matrix. Proof: `tests/admin/access-matrix.test.tsx` "T001" (unique key/href,
    every function approved, no `isStaff`/`anyRole`/membership token in the file, DAL mapping
    cross-checked, visibility shaping from attested roles only).

- [x] T002 [PS1] Implement `lib/admin/guards.ts` — per-area server-side verification helpers reading
  the matrix and calling the approved role functions.
  - Req: FR-002, SEC-001 | Depends: T001
  - Verify: each guard calls the specific role function (not a generic staff check); a member with no operational role is refused everywhere
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the enforcement half of the least-privilege model; must not drift from the declaration.
  - **Done (2026-09-15, RUN A)**: `verifyRoleFunction(fn)` issues `supabase.rpc(fn)` for the named
    approved function under the operator's own session and fails closed; `checkConsoleShellAccess`
    (anonymous → MFA step-up → no operational role, Feature 001's predicate restated) runs BEFORE
    the function call; `checkGroupAccess(group)` / `checkAreaAccess(key)` /
    `checkRoleFunctionAccess(fn)` return a typed `AdminAccess` (`forbidden` for a staff member with
    the wrong role). Never reads a membership. LIVE proof (`tests/admin/access-matrix.test.tsx`):
    the WAREHOUSE fixture is permitted in the warehouse group only and `forbidden` in the other five
    and in every non-warehouse area; the FINANCE fixture mirrors that; the approved trading member
    (`buyer-only`) is `no-operational-role` at the shell, every group and every area; an anonymous
    session is `anonymous` before any function is consulted; the WAREHOUSE operator's identity has
    `organization === null`, `organizations === []`, `isAuthorizedMember === false` (operator ≠
    member). COMPLIANCE/AUDITOR/ADMIN/SUPER_ADMIN legs are proven structurally only — no such
    fixture exists (Phase 10 T030 owns the full six-role live matrix).

- [x] T003 [PS1] Extend `src/app/dashboard-admin/layout.tsx` into the console shell (dark sidebar,
  sticky topbar, role-shaped navigation) while preserving 001's guard exactly.
  - Req: FR-001, FR-015 | Depends: T002
  - Verify: 001's guard behaviour is unchanged; navigation shows only the areas the operator's roles permit
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: edits the file enforcing the console's security boundary; chrome must not weaken it.
  - **Done (2026-09-15, RUN A)**: the three guard statements are byte-identical (`git diff
    --unified=0` touches none of them; `tests/design/uif-g.test.tsx` and `tests/auth/admin-auth.test.ts`
    still assert this); only the markup past the guard changed. The shell reuses the SAME `AppShell`
    (dark forest sidebar, sticky topbar, `MobileAppNav` drawer) — no second design system — now fed
    `buildAdminNavGroups(identity.operationalRoles)` (rewritten to derive groups/areas from the
    matrix), role badges in the topbar (`components/admin/role-badges.tsx`, text + dot), and an
    account menu (`components/admin/topbar.tsx`: avatar, name, roles, "My account" →
    `/dashboard-admin/account`, sign-out via the existing `LogoutConfirmDialog`/`signOut` action).
    Breadcrumbs/page-title use the existing `PageHeader`; the toast host is already global. The
    layout still never reads a membership. EN/AR copy added together (`lib/app/copy/{en,ar}.ts`
    `admin.*`). Real-browser proof: `tests/browser/feature010-runa.browser.mjs` — WAREHOUSE operator
    sees Overview/Warehouse/Account only, drawer at 390 px lists shipments/inventory/account and no
    finance/compliance entry, zero axe violations on every surface, Tab reaches the Shipments link
    with a visible 2 px focus ring, no console/page/request errors.

- [x] T004 Add per-area route-group layouts, each invoking its own guard.
  - Req: FR-002, SC-001 | Depends: T002, T003
  - Verify: a direct URL into a forbidden area is refused by that area's own layout, not merely absent from navigation
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: defence in depth per area; the most likely place for a missing check to hide.
  - **Done (2026-09-15, RUN A)**: `src/app/dashboard-admin/(compliance|warehouse|finance|catalogue|
    audit|system)/layout.tsx` each call `checkGroupAccess("<group>")` (its own function, live) and
    render `AdminAccessDenied` (forbidden state naming the required role; anonymous →
    `/admin/sign-in/`; step-up → `/mfa/`) instead of `children`; `(system)/(super)/layout.tsx`
    additionally calls `is_super_admin()` for roles/commission/tax/shipping while
    `(system)/payment-accounts` stays `is_platform_admin()`. Every declared area has a page under
    its group rendering `AdminAreaPlaceholder`, which re-verifies the AREA's own function and states
    honestly "not available yet (phase N)" or "waiting on a dependency (Feature 008 / Feature 012 +
    DB-OPEN-09 / DB-OPEN-06)" with no controls. Proof: `tests/admin/access-matrix.test.tsx` "T004"
    (one guarded group per matrix group; every href → a page under its group; direct invocation of
    the `(finance)` layout with the live WAREHOUSE session renders the forbidden state and never
    its children, the `(warehouse)` layout admits them; the anonymous branch redirects to the
    operator sign-in) + browser proof (WAREHOUSE at `/dashboard-admin/payments/` → forbidden;
    FINANCE at `/dashboard-admin/shipments/` and `/roles/` → forbidden; member at
    `/dashboard-admin/shipments/` → operations-access-required). `npm run build` lists all 23 console
    routes as dynamic (`ƒ`).

- [x] T005 Add non-indexable metadata for all `/dashboard-admin` routes and confirm exclusion from
  002's sitemap.
  - Req: FR-012 | Depends: T003
  - Verify: console routes are non-indexable; 002's sitemap contains none of them
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small, mechanical.
  - **Done (2026-09-15, RUN A)**: the root console layout's `robots: { index: false, follow: false }`
    is inherited by every nested segment — no nested layout/page exports metadata or overrides
    robots; `robots.ts` disallows `/dashboard-admin`; `sitemap.ts` contains no console route; no
    public copy or public component links an operational route (only the authenticated account
    menus link the console root); every console page/layout reads the request identity (dynamic,
    never prerendered) and uses no cache API. Proof: `tests/admin/noindex.test.ts` (5 tests) plus
    the existing `tests/public/seo-boundary.test.ts` (still green).

---

## Phase 2 — Console overview

- [x] T006 Implement `src/app/dashboard-admin/page.tsx` — a role-shaped operations overview built from
  real queries only (no sample or estimated figures).
  - Req: FR-016, SC-008 | Depends: T004
  - Verify: every figure traces to a real query; an empty system renders empty states, not zeros presented as data
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the design system's explicit "no seeded or sample figures" rule requires judgment about what to show when there is nothing.
  - **Done (2026-09-15, RUN A)**: `lib/admin/read.ts#getAdminOverview(roles)` — each figure is one
    `select("id", { count: "exact", head: true })` under the operator's own session against a table
    whose RLS grants the SECTION's role a read (compliance: kyb_applications/coffee_offers/disputes;
    warehouse: order_shipments/inventory_positions; finance: payments/payouts; catalogue: coffees/
    origins/warehouses; audit: audit_logs — ADMIN only, DB-OPEN-06 stated for a pure AUDITOR;
    system: platform_admins — SUPER_ADMIN). Sections the roles do not unlock are absent (RLS filters
    silently, so a role without a policy would otherwise read a misleading 0). `0` renders as an
    explicit "None" tile + section empty message (`data-metric-state="empty"`), a failed read as
    "Unavailable", and money is NOT summed: Feature 008's contract defines per-order snapshots, not
    platform aggregates, so the Finance section shows counts and states that monetary totals arrive
    with Feature 008. Proof: `tests/admin/overview.test.tsx` — every metric's table/policy
    cross-checked against `database-schema-report.json`; counts only, no cache/service role; no
    sample/hardcoded figure in page or tiles; render states; LIVE: WAREHOUSE identity → warehouse
    section only with real numbers, one tile equal to a direct count under the same session;
    FINANCE → finance section only + deferred-money note; member → no section. Browser: five
    warehouse tiles (3 real values, 2 honest empties) across the appearance matrix, no money figure,
    no foreign section.

---

## Phase 3 — Compliance: KYB

- [x] T007 [PS2] Implement the KYB queue (`(compliance)/kyb/page.tsx`) with status, organization,
  submission time and outstanding items.
  - Req: FR-002, PS2 | Depends: T004
  - Verify: only compliance-permitted roles reach it; queue reflects real application states
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: queue list over an existing domain layer.
  - **Done (2026-09-16, RUN B)**: `lib/admin/compliance.ts#listKybApplications` (real
    `kyb_applications` rows under the operator's session; "awaiting action" = SUBMITTED /
    UNDER_REVIEW / RESUBMISSION_REQUIRED, or all statuses via `?view=all`; oldest submission first;
    outstanding items from Feature 003's own `checkKybCompleteness` over the readable
    `kyb_documents`; expired-document count) rendered by `(compliance)/kyb/page.tsx` through the
    server-safe `TableCardList` (desktop table + 390 px cards). **Organization column**: the
    organization id always, the display name only when the operator's role can read `organizations`
    — for a pure COMPLIANCE operator it is stated as unavailable with the recorded gap note, never
    fabricated (see the RUN B findings above; this is the DB decision the queue needs before names
    can appear for that role). Live proof (`tests/admin/compliance-pages.test.tsx`): the COMPLIANCE
    fixture sees the real UNDER_REVIEW fixture row, real status badges, the gap note and no invented
    name; the actionable view contains only actionable statuses; WAREHOUSE by direct URL → forbidden
    naming `Required role: Compliance`; anonymous → `/admin/sign-in/`; FINANCE/member refused at
    the guard (`access-matrix` + `compliance-decisions`). Browser: zero axe violations across the
    five appearances, loading/empty/error states wired (`AdminStateCard`).

- [x] T008 [PS2] Implement the application detail view: evidence list, document expiry and history,
  using 003's live KYB-document seam for Compliance reads. State honestly that non-KYB evidence bytes
  remain outside that seam.
  - Req: FR-006, FR-017, PS2 | Depends: T007
  - Verify: an authorized Compliance reviewer can use the approved KYB-document path; a non-KYB
    evidence limitation is explained rather than silently broken
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: reviewer-facing accuracy plus honest handling of a blocked capability.
  - **Done (2026-09-16, RUN B)**: `(compliance)/kyb/[applicationId]/page.tsx` over
    `getKybApplicationDetail`: application identity/status/timestamps/fields, documents through
    003's approved seam (`kyb_documents_member_select` includes `is_compliance_operator()`) with
    type, status, version, expiry (expired ones flagged `data-document-expired="true"` + a text
    badge via the shared `isDocumentExpired` rule), outstanding items, application-level decisions
    (`kyb_reviews`), document-level decisions (`kyb_review_items`, 003's append-only ledger),
    organization status history, and the decision panel. **Honest limits stated in-product**: file
    name/MIME/size are unavailable to a pure COMPLIANCE role (`file_assets` has no compliance read
    path), so document bytes are NOT openable from this console and NO download control is rendered
    (`data-document-bytes-note`); payment/delivery/dispute evidence is stated to be outside the KYB
    seam (Features 008/009/012); the organization row and its status history are stated
    unavailable for that role (`data-organization-gap`, `data-history-unavailable`). Live proof:
    the COMPLIANCE fixture renders the seeded APPROVED application with its real document row and
    every section; no `a[download]`/storage link exists; unknown id → not-found state. Browser: zero
    axe violations, EN/AR/RTL, 390/1366/1920.

- [x] T009 [PS2] Implement KYB decision actions (`APPROVED`, `REJECTED`, `RESUBMISSION_REQUIRED`,
  `SUSPENDED`) recording `kyb_reviews` (reviewer, decision, reason) and the application status change.
  - Req: FR-006, SEC-003, SC-003 | Depends: T008
  - Verify: each decision records a review row and changes status once; a decision requiring a reason is refused without one; non-compliance roles refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the decision that unlocks trading for an organization — attribution and correctness are compliance-critical.
  - **Done (2026-09-16, RUN B)**: `lib/admin/decisions.ts#decideKybApplication` (+ `startKybReview`
    for SUBMITTED → UNDER_REVIEW, no review row) behind the live `is_compliance_operator()` guard:
    zod-validated input (reason mandatory for REJECTED / RESUBMISSION_REQUIRED / SUSPENDED, 5–2000
    chars, inline `fieldErrors.reason`), a compare-and-set UPDATE on `kyb_applications`
    (`status IN <permitted sources>`, stamping `decided_by`/`decided_at`/`rejection_reason`), then
    the `kyb_reviews` row with the server-derived reviewer id, then the organization follow-through
    reported honestly as `applied | unavailable | not-required`. Server Actions
    (`(compliance)/kyb/actions.ts`) + `KybDecisionPanel` (radio options shaped by current status,
    reason field beside the action, `AlertDialog` confirmation for REJECTED/SUSPENDED, Sonner
    outcome, no raw DB text). LIVE proof with the COMPLIANCE fixture
    (`tests/admin/compliance-decisions.test.ts`): RESUBMISSION_REQUIRED, REJECTED (after
    startReview) and APPROVED each change status exactly once with a `kyb_reviews` row carrying the
    reviewer, decision and reason; a repeat is `kyb_decision_stale` with no second row; every
    reason-required decision without a reason is refused before any write; a TWO-SESSION race on the
    same SUBMITTED application yields exactly one effect, exactly one review row and one STALE loser;
    prior history rows are untouched. WAREHOUSE / FINANCE / member → `compliance_not_capable` and, at
    the database layer, their direct writes affect 0 rows / are refused; anonymous → unauthenticated.
    **Recorded**: for a pure COMPLIANCE operator the APPROVED decision's organization activation is
    `unavailable` (the organizations policy gap), so `organization_can_buy()` stays false until a
    platform admin activates the organization — stated in-product, never bypassed. Concurrency
    beyond the two-session race remains T032's.

- [ ] T010 [PS2] Implement organization status/suspension actions with reason capture.
  - Req: FR-006, PS2 | Depends: T009
  - Verify: suspension is reflected for the member on their next request (003/004); reason recorded
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: immediate suspension (AUTH-02) must take effect platform-wide without destroying history.
  - **Implemented but NOT closable (2026-09-16, RUN B) — BLOCKED on a database decision.**
    `lib/admin/decisions.ts#setOrganizationStatus` (suspend ACTIVE→SUSPENDED / reinstate
    SUSPENDED→ACTIVE through the approved `organizations_compliance_update` policy, mandatory reason
    recorded as a `kyb_reviews` row against the current application — the only reason-bearing
    compliance record the schema offers; `account_status_history` is written by the trigger with no
    reason), `(compliance)/organizations/{page,[organizationId]/page}.tsx` + `OrganizationStatusPanel`
    (confirmation always, the undecided in-flight-operations policy stated, never simulated).
    **Why unchecked**: the literal Verify needs a real suspension to land and be felt by the member
    on their next request. `organizations` has NO SELECT policy for `is_compliance_operator()` (only `organizations_member_select`: `is_org_member(id) OR is_platform_admin()`), and because an UPDATE whose WHERE references existing columns is also subject to SELECT policies, the existing `organizations_compliance_update` policy affects ZERO rows for a pure COMPLIANCE operator (verified live 2026-09-15 with an affected-row count of 0 on a no-op status write; `kyb_applications` writes affect 1). The same shape blocks `file_assets` (`catalog_admin_files`) and `account_status_history` (`account_status_history_view`) for that role. The only role that can drive this path today is
    ADMIN/SUPER_ADMIN, for which no fixture is authorized in RUN B; the pure COMPLIANCE fixture is
    refused up front with `organization_access_unavailable` and NOTHING is written (live-proven,
    including that the member's `organization_can_buy` is unchanged). **Exact DB decision needed**:
    grant `is_compliance_operator()` a SELECT path on `organizations` (e.g. extend
    `organizations_member_select`'s USING with `OR is_compliance_operator()`), which also makes the
    existing UPDATE policy effective; optionally the same for KYB-linked `file_assets` and
    `account_status_history`. Security effect: COMPLIANCE would read every organization row
    (legal/tax/contact fields) — consistent with the SRS compliance role; no write widening beyond
    the UPDATE policy that already exists. Until then this surface renders the recorded gap for
    COMPLIANCE (`data-admin-state="capability-gap"`) and is expected to work for a platform admin.

---

## Phase 4 — Compliance: listings & disputes

- [x] T011 [PS5] Implement the listing review queue and decision actions (`APPROVED`, `REJECTED`,
  `SUSPENDED`) recording `listing_reviews` and the status change.
  - Req: FR-006, PS5, SC-003 | Depends: T004, 006's layer
  - Verify: decisions record reviewer/decision/reason; suspension stops member actionability (006); non-compliance roles refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: controls what is tradable in the marketplace; must cooperate with the offer-transition trigger.
  - **Done (2026-09-16, RUN B)**: `listListingsForReview` / `getListingReviewDetail` (PENDING_REVIEW +
    live + suspended `coffee_offers` under `offers_compliance_read`, the persisted `listing_reviews`
    and trigger-written `listing_status_history`), `(compliance)/listings/{page,[offerId]/page}.tsx`
    (Feature 006's `ListingStatusBadge`, quantities always in kg, prices always with currency) and
    `decideListing` (compare-and-set on `coffee_offers` — APPROVED/REJECTED from PENDING_REVIEW,
    SUSPENDED from PUBLISHED/PARTIALLY_FILLED; `rejection_reason` set so the DB trigger copies the
    reason into `listing_status_history`; then the `listing_reviews` row). The database's own
    `validate_offer_transition` remains the authority (it independently requires
    `is_compliance_operator()` for these targets — live-confirmed). Two HILLS listing fixtures were
    added to the seed script for this (`offerPendingReview`, `offerReviewLive`, each on its own lot)
    with a restore command. LIVE proof: APPROVED changes status once + review row (repeat →
    `listing_decision_stale`); REJECTED without a reason is refused, with one the reason lands on
    the listing AND in `listing_status_history` with `changed_by` = the reviewer; SUSPENDED from
    PUBLISHED sets `is_visible=false`, the listing disappears from a real buyer's RLS read, and a
    real buyer's `addOrderItem` against it is refused by Feature 007's own path — member
    non-actionability proven at the domain/DB layer, not by hiding a button. WAREHOUSE/FINANCE/member
    → `compliance_not_capable`; WAREHOUSE's direct status write affects 0 rows. **Recorded**: no
    approved compliance vocabulary lifts a suspension (`listing_reviews.decision` has no
    "reinstated"), so a suspended listing stays suspended — stated in-product; and the trigger's
    missing SUSPENDED branch (findings above) means the DB does not refuse a seller ARCHIVE from
    SUSPENDED (code reading, not exercised).

- [ ] T012 [P] **BLOCKED — 012 domain layer absent.** Implement the dispute review surface (queue +
  status transitions) only by composing 012's domain layer.
  - Req: FR-006 | Depends: T004, 012's layer
  - Verify: dispute status changes record reason and actor; only compliance-permitted roles may act;
    no parallel 010 dispute engine or freeze path exists
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: composition over 012's layer with an authorization constraint.
  - **Re-checked 2026-09-16 (RUN B): still BLOCKED.** Feature 012 is 0/28 with no `lib/disputes`
    domain layer, no dispute status-transition function and no compliance freeze path (DB-OPEN-09).
    The console keeps the honest blocked placeholder at `/dashboard-admin/disputes` (guarded by the
    compliance group + area guard) and contains no dispute mutation (`tests/admin/compliance-pages
    .test.tsx` asserts no `from("disputes")` write exists in `lib/admin`). **Feature 012 must supply**
    a dispute read DTO + a reviewed transition function that records actor and reason, and the
    approved freeze mechanism, before T012 can be composed.

---

## Phase 5 — Finance

- [ ] T013 [PS3] **BLOCKED — 008 Phase 1 has no queue read (re-checked RUN C, 2026-09-16).** Implement the payment review queue with
  order, amount, currency, proof reference and hold status through 008's finance layer.
  - Req: FR-002, PS3 | Depends: T004, 008's layer
  - Verify: only finance-permitted roles reach it; amounts match `order_financials` exactly
  - RUN C audit: `lib/finance/read.ts` reads ONE order at a time by `orderId` (`getPayment`,
    `getOrderFinancials`); nothing lists payments awaiting review across orders, nothing reads
    `payment_proofs`, and no DTO carries a proof reference or the order's hold status. Building
    that list in `lib/admin` would be a second payment read domain, which this task forbids, so
    the `payments` route keeps the honest `blocked` placeholder (`AdminAreaPlaceholder`) and the
    overview keeps RUN A's count-only figures. **Minimum 008 contract to unblock**:
    `listPaymentsForReview({ statusIn?, page? })` (FINANCE-scoped, `payments_finance_read` +
    `payment_proofs_finance_read` via RLS, no service role) returning
    `{ paymentId, orderId, orderCode, amount, currency, paymentStatus, orderStatus (hold status),
    proof: { reference, submittedAt, fileAssetId } | null, buyerTotalAmount (from
    `order_financials.buyer_total_amount`, currency) }`, plus `getPaymentReviewContext({ paymentId })`
    for the detail. Values must be the stored snapshots — 008 must not compute them.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: money-facing queue where display fidelity matters.

- [ ] T014 [PS3] **BLOCKED — 008 has not supplied `decidePayment`.** Implement the settlement decision UI calling **008's `decidePayment`** — never
  `admin_review_payment` directly — with confirmation and reason capture.
  - Req: FR-004, SC-002, PS3 | Depends: T013
  - Verify: `grep -rn "admin_review_payment" src/app/dashboard-admin lib/admin` returns nothing; approval completes settlement exactly once; expired-reservation approval fails clearly
  - RUN C audit (2026-09-16): **FEATURE 008 BLOCKER — `decidePayment()` missing.** `grep -rn
    decidePayment lib src components` returns nothing; 008 T017 (approved post-funding settlement DB
    contract — requires a DB change, 008 plan decision 4), T018 (`lib/finance/settlement.ts` as the
    only caller), T019 (error mapping) and T020 (typed guarded interface for 010) are all unchecked.
    The first Verify clause is satisfied and pinned by `tests/admin/finance-delegation.test.tsx`
    (runtime grep over `src/app/dashboard-admin`, `lib/admin`, `components/admin`, comments
    stripped), but the task is NOT closable from that alone: no decision UI was built, no
    `admin_review_payment` wrapper, compatibility shim or copied settlement logic exists in 010.
    **Minimum 008 contract to unblock**: `decidePayment({ paymentId, decision: "APPROVED" |
    "REJECTED", reason, expectedStatus })` in `lib/finance/settlement.ts` (server-only, session
    identity, `is_finance_operator()` re-verified in the DB), returning `ActionFeedbackResult` with
    controlled codes for `FINANCE_NOT_CAPABLE`, `PAYMENT_STALE` (compare-and-set on the current
    payment status), `PAYMENT_ALREADY_DECIDED` (idempotent, exactly-once effects),
    `RESERVATION_EXPIRED` (approval refused clearly), `FUNDING_NOT_TRUSTED` (the DB-enforced
    precondition from T017), `VALIDATION_ERROR` (reason required on rejection); never a raw
    Postgres/RLS/provider message; audit attribution recorded by 008.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the console's most consequential action; routing around 008's guards would defeat AC-03 protections.

- [ ] T015 [P] **BLOCKED — 008 has not supplied payout management or invoice recording.** Implement
  payout management and tax invoice recording surfaces (finance-only).
  - Req: FR-002, FR-006 | Depends: T004, 008's layer
  - Verify: payout status changes and invoice records are finance-only; no member path exists
  - RUN C audit (2026-09-16), reported separately:
    **PAYOUT GAP** — 008 exposes only `getPayoutsForOrder`/`getPayoutsForOrganization` (per
    order/organization reads); there is no finance-wide payout list and no status-transition
    write (`PENDING_PAYOUT → PROCESSING → PAID`, `VOID`) — 008 T023/T025 unchecked, and plan
    decision 7 says a payout record must never claim money movement without provider evidence
    (provider-dependent). Minimum contract: `listPayouts({ statusIn?, page? })` (FINANCE) and
    `transitionPayout({ payoutId, to, paymentReference?, expectedStatus })` with the approved
    vocabulary, compare-and-set, attribution and controlled codes; no amount edit, no delete.
    **TAX INVOICE GAP** — 008 exposes only `getTaxInvoice({ orderId })`; there is no
    `recordTaxInvoice` write, and `tax_invoices.file_asset_id` requires a private document that the
    unresolved Storage design (DB-BLOCK-01) does not yet provide, so a reference-only record would
    be a fake. Minimum contract: `recordTaxInvoice({ orderId, invoiceNumber, fileAssetId, issuedAt })`
    (FINANCE, one per order, immutable once recorded, attribution) after the Storage decision.
    Neither portion was implemented as raw table CRUD in 010; `payouts` and `invoices` keep the
    `blocked` placeholder. The "no member path" clause is pinned now (`finance-delegation` test:
    no `src/app/dashboard/{payments,payouts,invoices,settlement,finance}` segment and no member-side
    finance-table write), but the task stays open until the write surfaces exist.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: finance-only write surfaces with clear scoping.

---

## Phase 6 — Warehouse

- [ ] T016 [PS4] Implement shipment queues (requested / in-progress / dispatched) for warehouse roles.
  - Req: FR-002, PS4 | Depends: T004, 009's layer
  - Verify: only warehouse-permitted roles reach it; queues reflect real shipment states
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: operational queue over an existing layer.

- [ ] T017 [PS4] Implement operational transition controls calling **009's warehouse layer** — never
  raw shipment updates — with the affordances driven by the documented transition map.
  - Req: FR-005, SC-002, PS4 | Depends: T016
  - Verify: `grep -rn "order_shipments" src/app/dashboard-admin lib/admin` shows reads only; each transition succeeds/refuses per the database's map
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: physical-goods authority; a raw update path would bypass the role split and state machine.

- [ ] T018 [PS4] Implement delivered-quantity recording through 009's layer (warehouse-only,
  monotonic).
  - Req: FR-005, PS4 | Depends: T017
  - Verify: recording works for warehouse; decrease attempts and non-warehouse attempts are refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: irreversible custody reduction.

- [ ] T019 [PS4] Implement custody/inventory oversight views (cross-organization, warehouse-only),
  rendering the live, database-owned delivery-reservation facts without recomputation.
  - Req: FR-017, PS4 | Depends: T004, 005's layer
  - Verify: positions render for warehouse roles only; delivery-reserved quantity comes from the
    approved 009/database contract; no substitute figure or arithmetic is computed
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the honest-capability judgment plus a cross-tenant read surface that only warehouse may have.

- [ ] T020 Confirm the variance/reconciliation model before building any reconciliation screen; the
  current authoritative finding is that no variance/reconciliation/HOLD/QUARANTINE representation
  exists, so retain an honest capability-gap record rather than inventing one.
  - Req: FR-017, spec Open items | Depends: T019
  - Verify: either screens are built on real fields, or the gap is recorded in the capability map and spec
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: AC-05 reconciliation is release-blocking; pretending to support it would be worse than recording the gap.

---

## Phase 7 — Catalogue management

- [ ] T021 [PS6] Implement coffee management (create/edit/publish/unpublish) with
  `is_platform_admin()` enforcement.
  - Req: FR-002, PS6 | Depends: T004
  - Verify: non-admin roles refused; status transitions respect `coffees_status_check`
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: CRUD over an admin-scoped table.

- [ ] T022 [P] [PS6] Implement origin, region, taxonomy and warehouse management surfaces.
  - Req: FR-002, PS6 | Depends: T004
  - Verify: each respects its status vocabulary; non-admin refused
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: repetitive CRUD across several small tables.

- [ ] T023 [PS6] Implement `lib/admin/catalogue.ts` — every catalogue mutation revalidates the
  corresponding 002 public cache tag.
  - Req: FR-007, SC-005 | Depends: T021, T022
  - Verify: publishing a coffee makes it publicly visible after revalidation; unpublishing 404s it
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: the one place the console touches the public surface; a missed tag leaves the public site stale.

- [ ] T024 [P] Implement media management for published content (subject to DB-BLOCK-01 for uploads).
  - Req: FR-017 | Depends: T021
  - Verify: media records manageable; upload path remains inert with an honest explanation
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: bounded surface with a known blocked seam.

---

## Phase 8 — Audit area

- [ ] T025 [PS7] **BLOCKED — 012 audit/history domain layer absent.** Implement read-only auditor views
  by composing that layer with dedicated read-only components (no disabled buttons — the affordance
  never exists).
  - Req: FR-009, SC-007, PS7 | Depends: T004
  - Verify: auditor fixture sees data with zero mutation controls; every mutation attempt is refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: "read-only by construction" is a stronger guarantee than "disabled in the UI" and must be built that way.

- [ ] T026 [PS7] Handle `audit_logs` access honestly per DB-OPEN-06 (auditors may be unable to read
  it) — explain rather than error.
  - Req: FR-017, spec Open items | Depends: T025
  - Verify: with an auditor fixture, the audit-log area explains the limitation and cites the open item
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: honest capability reporting on a policy gap the SRS expects to be closed.

---

## Phase 9 — System configuration (SUPER_ADMIN)

- [ ] T027 [PS8] Implement platform-admin role management (SUPER_ADMIN only).
  - Req: FR-002, PS8, SEC-003 | Depends: T004
  - Verify: ADMIN is refused; SUPER_ADMIN succeeds; changes are attributable
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this surface grants operational power to people — the highest-privilege action in the system.

- [ ] T028 [P] [PS8] Implement tax rule and shipping rule configuration (SUPER_ADMIN only), with
  clear indication that changes affect future snapshots only. *(Commission configuration is T042 —
  split out because it carries its own immutability and coverage semantics.)*
  - Req: FR-002, PS8 | Depends: T004
  - Verify: ADMIN refused; existing order snapshots are unaffected by later configuration changes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: misunderstanding snapshot semantics here could retroactively distort commercial records.

- [ ] T042 [PS8] Implement **commission configuration** inside the existing `/dashboard-admin`
  surface, managing the existing `commission_policies` and `commission_tiers` tables — no parallel
  or shadow commission tables, no schema change. Behavioural reference:
  `docs/database/commission-capability.md`.
  **Scope**: list policies with `name`, `status` (`DRAFT`/`ACTIVE`/`ARCHIVED`), `effective_from`,
  `effective_until`; create and manage policies within the approved schema; add/edit a policy's
  tiers (`min_quantity_kg`, `max_quantity_kg`, `percentage`); activate/deactivate by moving `status`
  between the CHECK-approved values only.
  **Semantics the UI must convey**: tier selection is by **total order quantity**, minimum
  inclusive, maximum exclusive, and `max_quantity_kg = NULL` means an open-ended top band; the
  selected percentage applies to the whole applicable base (not progressive banding); overlapping
  ACTIVE policies resolve to the latest `effective_from`.
  - Req: FR-002, PS8 | Depends: T004
  - Verify: `ADMIN` (non-super) is refused in the application **and** by RLS; `SUPER_ADMIN` succeeds; the screens read/write only `commission_policies`/`commission_tiers`; `grep -rn "commission" src/app/dashboard src/app/\(public\)` shows no member or public commission surface
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: a configuration screen that silently mis-states tier semantics would cause every future order to be priced on a rate the operator did not intend.

- [ ] T043 [PS8] Enforce the commission authorization boundary in the application layer as well as
  RLS: every commission read/mutation path verifies `is_super_admin()` server-side before calling
  the database, and the existing `commission_admin` / `tiers_admin` RLS policies are left unchanged.
  - Req: FR-001, FR-002, SEC-003 | Depends: T042
  - Verify: an `ADMIN`, `COMPLIANCE`, `WAREHOUSE`, `FINANCE`, `AUDITOR` and plain member fixture are each refused — by direct URL and by direct action invocation; no migration or policy edit appears in the diff
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: defence in depth on the highest-privilege commercial configuration in the platform; RLS alone is the backstop, not the only gate.

- [ ] T044 [PS8] Make historical immutability explicit in the commission UI: state that **"Changes
  apply to eligible future checkouts only"** at the point of change, and provide **no** normal
  action — button, bulk operation, or menu item — that recalculates, restates or re-snapshots
  historical orders, commission amounts, seller net amounts or payouts.
  - Req: FR-002, PS8 | Depends: T042
  - Verify: the copy is present on both policy and tier mutations; `grep -rniE "recalculat|re-?snapshot|restate|backfill" src/app/dashboard-admin` returns nothing that acts on historical financial records. The current 008 Phase-1 foundation has no T032 evidence, so historical-snapshot integration verification remains an explicit 008 dependency rather than an unsatisfied claim in 010; 010 verifies its own UI has no restatement action.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the one place a well-meaning "fix historical commissions" feature would plausibly be added — its absence must be deliberate and visible.

- [ ] T045 [PS8] Surface tier **coverage gaps** to the operator: show, for a policy, which quantity
  ranges have no covering band, because an uncovered total quantity currently yields a **0%**
  commission at checkout rather than an error (`COMMISSION-OPEN-01`). Present this as an
  operational warning; do **not** implement either resolution option — the fallback decision is
  Business/Finance's, owned by Feature 008.
  - Req: FR-002, PS8, spec Open items | Depends: T042
  - Verify: a policy with bands `0–100` and `250–NULL` visibly warns about the uncovered `100–250` range; the UI neither blocks checkout nor silently "fixes" the gap; `COMMISSION-OPEN-01` is cited in the surface or its handoff notes
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: makes a silent revenue-affecting misconfiguration visible without pre-empting an open business decision.

- [ ] T029 [P] [PS8] Implement payment-account configuration (`is_platform_admin()`), flagged as a
  high-risk action pending the OPS-01 dual-control decision.
  - Req: FR-002, SEC-003, spec Open items | Depends: T004
  - Verify: member paths remain absent; changes are attributable; the dual-control gap is noted in-product
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: bank-detail changes are explicitly called out as high-risk in the SRS; the missing maker-checker must be visible.

---

## Phase 10 — Automated tests

- [ ] T030 Write `tests/admin/access-matrix.test.ts` — iterate `lib/admin/areas.ts` × all six role
  fixtures + a member-without-role, asserting allowed areas render and forbidden areas are refused by
  direct URL and direct action invocation.
  - Req: FR-002, SEC-001, SC-001, SC-004 | Depends: T001, T004
  - Verify: `npm test -- admin/access-matrix` passes for every combination; adding an area without a role entry fails the test
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the definitive proof of least privilege across the whole console, and the guard against future drift.

- [ ] T031 [P] Write `tests/admin/delegation.test.ts` — the console contains no direct
  `admin_review_payment` call and no raw shipment/inventory write.
  - Req: FR-004, FR-005, SC-002 | Depends: T014, T017
  - Verify: `npm test -- admin/delegation` passes; greps are part of the assertion
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: structural guarantee that the console never becomes a second transactional engine.

- [ ] T032 [P] Write `tests/admin/decisions.test.ts` — every KYB/listing/payment/dispute decision
  records reviewer, decision and reason and changes status exactly once, including under concurrent
  operators.
  - Req: FR-006, SC-003 | Depends: T009, T011, T014
  - Verify: `npm test -- admin/decisions` passes, including the concurrency cases
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: attribution and single-effect semantics for irreversible operational decisions.

- [ ] T033 [P] Write `tests/admin/no-hard-delete.test.ts` — no console path deletes commercial,
  inventory, title, payment or audit rows.
  - Req: FR-008, SC-006 | Depends: Phases 3–9
  - Verify: `npm test -- admin/no-hard-delete` passes; grep for `.delete(` across console code returns only non-commercial cases
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: OPS-02 compliance across a broad surface.

- [ ] T034 [P] Write `tests/admin/catalogue-revalidation.test.ts` — publish/unpublish reflects on the
  public site after revalidation.
  - Req: FR-007, SC-005 | Depends: T023
  - Verify: `npm test -- admin/catalogue-revalidation` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: cross-feature cache correctness with a clear assertion.

- [ ] T035 Write `tests/admin/auditor-readonly.test.ts` — auditor surfaces expose zero mutation
  affordances and refuse all mutations.
  - Req: FR-009, SC-007 | Depends: T025
  - Verify: `npm test -- admin/auditor-readonly` passes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: read-only-by-construction must be proven, not assumed.

---

## Phase 11 — States, accessibility, RTL

- [ ] T036 State coverage across all console areas (loading, empty, error, unauthorized, forbidden,
  not-found, plus domain states).
  - Req: FR-014 | Depends: Phases 3–9
  - Verify: each state renders; empty queues show honest empty states
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: broad but well-specified.

- [ ] T037 Accessibility, RTL and responsive pass for the console (dense tables, keyboard traversal,
  drawer behaviour, dot+label badges, monospace codes).
  - Req: FR-015 | Depends: Phases 3–9
  - Verify: a11y check clean; grep for physical CSS properties returns nothing; tables usable by keyboard
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: dense operational tables are the hardest accessibility surface in the product.

---

## Phase 12 — Verification & closure

- [ ] T038 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [ ] T039 Confirm `/dashboard-admin` authorizes independently of `/dashboard` and that neither
  implies the other.
  - Req: FR-001, SC-004 | Depends: T038
  - Verify: an approved trading member with no operational role is refused everywhere in the console; an operator with no organization is refused member trading routes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the Constitution-locked surface-separation guarantee, checked from both directions.

- [ ] T040 Confirm no service-role usage and no public/shared caching of operational data.
  - Req: SEC-002, SEC-005, FR-011 | Depends: T038
  - Verify: `grep -rn "SERVICE_ROLE" src/app/dashboard-admin lib/admin` returns nothing; operational reads are uncached
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical constitutional checks.

- [ ] T041 Update the roadmap for 010 and confirm OPS-01 dual control, DB-OPEN-06, DB-OPEN-09,
  evidence-byte scope, the suspended-operation policy, and the variance-model question all remain
  accurately classified. Confirm DB-BLOCK-07 remains recorded as resolved by 009.
  - Req: spec Open items | Depends: T038
  - Verify: roadmap accurate; every unresolved item is visible both in the capability map and to operators where relevant
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the console is where operators would otherwise assume capabilities exist; honest representation is a governance requirement.

---

## Phase 13 — Admin-global account & platform identity (ADDED in RUN A, 2026-09-15)

> Added because the product owner's admin-global requirements (operator self-account, avatar,
> email/password change, platform branding) were not covered by T001–T045. Scope is appended,
> never hidden inside T001–T006. Original planned count 45 → authoritative count 48.

- [x] T046 Operator self-account page (`/dashboard-admin/account`) composed ONLY from existing
  Feature 003 authority: profile name/phone/company via the SAME `ProfileSettingsForm` +
  `updateMyProfile` (`update_my_profile()` RPC, which needs no organization); sign-in email
  DISPLAYED from the server-verified user; password change LINKED to the existing reset flow
  (`/reset-password/` → emailed link); two-factor status from `auth.mfa.listFactors()` linking the
  existing `/mfa/` enrol/verify page; profile image = initials (no approved upload path); sign-out
  via the shared confirm dialog + real `signOut` action. Reachable from the shell's account menu.
  - Req: FR-001, FR-010, FR-015 | Depends: T003
  - Verify: an operator with no organization can read/save their own profile and see their real
    email + MFA status; no password value is accepted on the page; no new table, bucket, RPC or
    auth flow exists; the page never reads `identity.organization`
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: operators without a member organization had NO self-account surface (`/dashboard/settings`
    is membership-gated); composing the existing authority closes that without inventing any.
  - **Done (2026-09-15, RUN A)**: `src/app/dashboard-admin/account/page.tsx` +
    `components/admin/sign-out-button.tsx`; browser proof (WAREHOUSE operator, no organization):
    real email rendered, `data-totp-enrolled="false"` read live, zero `input[type=password]`, zero
    axe violations across EN/AR × light/dark × 390/1366/1920; `tests/admin/noindex.test.ts` covers
    the route's dynamic/non-indexable status.

- [ ] T047 **BLOCKED — NO AUTHORITATIVE MODEL.** Platform identity / branding management (logo,
  favicon, platform display name, admin branding assets, platform contact/settings values). The
  approved schema has NO settings/branding table and no approved bucket for brand assets; the
  current logo/favicon/name are static build assets (`components/app/sidebar.tsx` wordmark,
  `src/app/favicon.ico`, `lib/public/copy`). RUN A renders those static assets and does not imply
  they are configurable. Requires a human decision (approved schema/config source + bucket policy)
  before any screen is built.
  - Req: spec Open items (new) | Depends: human decision
  - Verify: no settings table, branding table, bucket or hardcoded workaround exists in the diff;
    the gap is recorded in spec.md Open items and the capability map
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: a fake branding manager would be worse than an honest gap.

- [ ] T048 **BLOCKED — requires an approved auth flow decision.** Operator sign-in email change.
  No approved path exists today (Supabase Auth's `updateUser({ email })` double-confirmation flow
  is not part of the approved auth surface; Feature 003 implemented sign-up/sign-in/reset/MFA
  only). RUN A displays the current email and states the gap on the account page.
  - Req: spec Open items (new) | Depends: human decision on the auth flow
  - Verify: once approved, the change uses the authentication provider's own flow, never a profile
    table; until then no email mutation control exists in the console
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: "Do NOT invent new auth flows" — the owner's request is recorded, not improvised.

---

## Dependencies & parallelisation

- Phase 1 blocks everything.
- Phases 3–9 are largely parallel by area once Phase 1 lands (different route groups, different
  domain layers) — the natural multi-agent split for this feature.
- Phase 9's commission set (T042 → T043/T044/T045) is sequential within itself: T043–T045 all extend
  the surface T042 creates, so none is `[P]`.
- Phase 10's tests: T031–T035 parallel; T030 must follow the areas it iterates.
- Phase 12 depends on everything.

**Structurally parallel-safe tasks once their prerequisites exist**: T012, T015, T022, T024, T028,
T029, T031, T032, T033, T034 (10 of 45). **Current availability supersedes this marker**: T012 and
T015 are blocked by 012 and 008 respectively, and downstream test tasks remain blocked until their
surfaces exist.

**Commission ownership note**: this feature owns the **Admin management UI** for the existing
`commission_policies`/`commission_tiers` tables inside the existing `/dashboard-admin` surface
(Phase 9, SUPER_ADMIN only). It does **not** own commission calculation — that is implemented in the
database (`docs/database/commission-capability.md`) — and it does **not** own the financial workflow
or payout presentation, which is Feature 008. The `COMMISSION-OPEN-01` fallback decision belongs to
Business/Finance via Feature 008 and must not be pre-empted by a UI behaviour here.
