# Tasks: Disputes, Notifications & Audit (012)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §8 (MKT-07), §13.5, §14 (OPS-02), §46.

**Status**: RUN D (2026-09-19) — 23/28 complete (RUN A–C + T023, T024). T004 PARTIAL (DB-OPEN-23, human decision required). T025–T028: work done and verification GREEN for Feature 012, but NOT checked — `Depends: all` / `Depends: T025` unmet while T004 is PARTIAL (T025 also has pre-existing non-012 lint/test failures).
reconciliation only, no code**: the "008 implemented" clause below is CLARIFIED, not removed — see the
note immediately after this block. RUN A (T001–T004, T006, T018, T019) is GO while Feature 008 remains
7/39 (see clarification).
**Prerequisite**: 001, 003, 004, 007, 008, 009 implemented; 010 consumes this feature's compliance
layer.

> **RUN 0 clarification (2026-09-17)**: "008 implemented" above is broader than what this feature's
> actual tasks require, and — re-checked against the live `disputes` schema (`order_id` only; no
> `payment_id`, no `payment_events` reference, no `payments`/`order_financials`/`payouts` table in any
> policy this feature reads or writes) — no task in this file calls `lib/finance/*` or reads a
> Feature-008-owned table. `disputes_create`/`disputes_ops_update`/`disputes_view`/`dispute_evidence_*`
> depend only on `can_view_order()` (Feature 007, CLOSED 32/32), `is_compliance_operator()`/
> `is_auditor()`/`is_blocked_user()` (Feature 001/003/010 role functions), and `orders` existing
> (Feature 007). **T001–T004, T006 and T019 do not require Feature 008 beyond the Phase 1 read
> foundation it already shipped (7/39)** — none of them import, call or read anything Feature 008 adds
> from Phase 2 onward (provider selection, the trusted-funding DB gate, funding/event boundary,
> settlement, `decidePayment`, payout/document UI). The one place Feature 008 appears in this task
> list (T007's Verify: "no copy... implies... freezes... settlement") is a NEGATIVE constraint —
> disputes must not pretend to affect a Feature 008 concept — not a positive dependency on it. This
> does not weaken the prerequisite for tasks that genuinely would need more of Feature 008 (none exist
> today; if one is added later, it must restate its own literal `Depends:` line, not rely on this
> blanket clause). DB-BLOCK-01, DB-BLOCK-04, DB-OPEN-06 and DB-OPEN-09 are unaffected and remain fully
> open, exactly as recorded in `docs/architecture/DATABASE-CAPABILITY-MAP.md` — this clarification adds
> no new capability and closes no gap.

> **Standing rules**: nothing is ever deleted or edited (append-only corrections only); no capability
> may be simulated where a recorded blocker prevents it (notifications, freezes, evidence files,
> auditor audit-log access); all free text is untrusted.

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Dispute domain layer

- [X] T001 Create `lib/disputes/errors.ts` and dispute/evidence DTO types.
  - Req: FR-006, FR-015 | Depends: —
  - Verify: dispute status type matches the six approved values exactly
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical typing against a closed vocabulary.

- [X] T002 Implement `lib/disputes/read.ts` — scoped dispute and evidence reads (participants,
  compliance, auditor).
  - Req: FR-004, SEC-001 | Depends: T001
  - Verify: an unrelated organization's dispute id returns nothing for all three audiences' queries
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: three-audience scoping where one over-broad predicate leaks commercially sensitive conflict data.

- [X] T003 [PS1] Implement `lib/disputes/member.ts` — raise a dispute (`can_view_order`, own user, not
  blocked) and attach evidence records. Exposes no status-change path.
  - Req: FR-001, FR-004, SEC-001 | Depends: T001, T002
  - Verify: the module exports no status mutation; an unrelated organization and a blocked user are both refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: defines the member's entire write surface into the accountability system; over-exposure would let members alter dispute outcomes.

- [ ] T004 [PS3] Implement `lib/disputes/compliance.ts` — status transitions and resolution recording
  (`is_compliance_operator()` only), consumed by 010, with no bypass export.
  - Req: FR-002, FR-012, SEC-002 | Depends: T001, T002
  - Verify: non-compliance roles refused in the app and by RLS; every transition records actor, reason and timestamp
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the authority boundary for resolving commercial conflicts, and the seam 010 depends on.
  - **RUN A (2026-09-19) — IMPLEMENTED, PARTIAL (left unchecked).** `lib/disputes/compliance.ts` ships six
    named operations (`beginReview`, `markFrozen`, `resumeReview`, `resolveDispute`, `rejectDispute`,
    `closeDispute`), no generic status setter, live `is_compliance_operator()` gate, compare-and-set on the
    status the operator saw, a column allowlist, and write-once resolution. Verify half 1 is MET live
    (`tests/disputes/role-restriction.test.ts`: member/unrelated member/blocked/WAREHOUSE/FINANCE/AUDITOR/
    anonymous refused in the app AND zero rows changed through RLS). Verify half 2 ("every transition records
    actor, reason and timestamp") is NOT literally satisfiable on the current schema: `disputes` has no
    trigger, no audit trigger and no per-transition history table, and its only attribution columns are
    `resolution`/`resolved_by`/`resolved_at` (+ `updated_at`). RESOLVED and REJECTED record actor + reason +
    timestamp; OPEN→UNDER_REVIEW, →FROZEN, FROZEN→UNDER_REVIEW and →CLOSED can record `updated_at` only (each
    result reports `attribution: "timestamp-only"`; no reason is collected and discarded). Closing this needs
    an approved database change (a dispute status-history table or equivalent) — not made here.
    Also recorded: the database enforces NO dispute transition rule (compliance may write any status/column
    under `disputes_ops_update`); `DISPUTE_TRANSITIONS` is application-owned policy.

- [X] T005 [PS2] Implement the evidence file seam — private `file_assets` metadata only, inert until a
  Storage bucket is approved (DB-BLOCK-01).
  - Req: FR-005, SEC-003 | Depends: T003
  - Verify: no bytes are written anywhere; the seam is one marked function citing DB-BLOCK-01; text notes still work
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: same blocked-capability discipline as 003/008, applied to evidence that may later be legally significant.
  - **RUN B (2026-09-19) — COMPLETE.** `lib/disputes/evidence-files.ts#attachDisputeEvidenceFile` is the one marked
    DB-BLOCK-01 seam: it always returns `DISPUTE_EVIDENCE_FILE_UNAVAILABLE`, imports no Supabase client, creates no
    `file_assets` row (its NOT NULL `bucket_name`/`object_path` would describe bytes that don't exist), issues no signed
    URL and touches no bucket. Live: `file_assets` count and bucket set unchanged, no evidence row has a
    `file_asset_id`; text notes still work (`tests/disputes/run-b-live.test.ts`).

---

## Phase 2 — Member dispute surfaces

- [X] T006 [PS1] Implement `src/app/dashboard/disputes/page.tsx` + `[disputeId]/page.tsx` + actions —
  raise, list and track disputes with approved status labels.
  - Req: FR-001, FR-006, FR-015, PS1 | Depends: T003
  - Verify: all six statuses render exact labels; only the member's own organization's disputes appear
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: member-facing conflict surface where clarity and correct scoping both matter.
  - **RUN A (2026-09-19) — COMPLETE.** Buyer-side scope only: disputes on orders the ACTING organization
    bought. Seller-side participation (permitted by `can_view_order`) is not surfaced — no seller-side order
    read exists yet (Feature 007's recorded boundary). Not registered in the nav (that is T017). Proof:
    `tests/browser/feature012-runa.browser.mjs` (real Chrome + axe, EN/AR × light/dark × 390/1366).

- [X] T007 [PS4] Render dispute linkage from affected orders/shipments (`DISPUTED` state) **without
  implying an automatic freeze**.
  - Req: FR-007, SC-005, PS4 | Depends: T006
  - Verify: no copy states or implies that raising a dispute freezes quantity/settlement; the link between dispute and record state reflects actual behaviour
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: an honest-product judgment about a capability the SRS describes but the database does not yet implement (DB-OPEN-09).
  - **RUN B (2026-09-19) — COMPLETE.** Order detail lists the acting organization's disputes on that order with the
    no-effect statement; a shipment whose OWN status is `DISPUTED` links to the order's dispute records; the dispute
    detail shows the order's real status. No status is inferred either way. Live: raise + evidence + compliance
    FREEZE left every order/shipment/payment/reservation/history/custody/inventory row byte-identical. The DISPUTED-
    shipment linkage is unit-tested only (no DISPUTED shipment exists in fixture data).

- [X] T008 [P] [PS2] Build the evidence list/add UI with untrusted-text escaping and the DB-BLOCK-01
  explanation.
  - Req: FR-005, SEC-004 | Depends: T005
  - Verify: injected markup in a note renders inert; the file limitation is explained, not hidden
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: user-supplied content rendered in two surfaces (member + console) — the classic XSS path.
  - **RUN B (2026-09-19) — COMPLETE.** Evidence list (uploader relative to viewer, time, type) + text-note form on
    the dispute detail; visible DB-BLOCK-01 notice instead of any upload control. All free text goes through
    `components/disputes/untrusted-text.tsx`.

---

## Phase 3 — Notifications (honest read surface)

- [X] T009 [PS5] Implement `lib/notifications/read.ts` — own-user notification reads only.
  - Req: FR-008, SEC-001 | Depends: —
  - Verify: another user's notifications are never returned
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: simple scoped read.

- [X] T010 [PS5] Implement `lib/notifications/limitations.ts` + the notification page, stating
  honestly that notifications cannot currently be generated or marked read (DB-BLOCK-04).
  - Req: FR-008, SC-006, PS5 | Depends: T009
  - Verify: no client-side read state, no local-storage read flags, no notifications synthesised from other tables; the limitation is visible in-product
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the strongest temptation in this feature is to fake a working notification centre; refusing to is the correct — and non-obvious — call.
  - **RUN B (2026-09-19) — COMPLETE.** Own-user reads only (`user_id` filter on top of `notifications_own`, which
    would otherwise let an ADMIN read everyone's). No read_at, no unread count, no mark-read, no local storage, no
    synthesis. Live isolation proven against ONE test-only fixture row inserted by the seed script (the product
    cannot create notifications) and removed afterwards.

- [X] T011 [P] [PS6] Implement notification preferences (own-user read/write).
  - Req: FR-009 | Depends: —
  - Verify: preferences persist per user; another user's are unreachable
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small own-scoped CRUD.
  - **RUN B (2026-09-19) — COMPLETE.** Channels from the live CHECK (EMAIL/SMS/WHATSAPP). `notification_type` has no
    DB vocabulary, so the four transactional categories from the Hills design system
    (`docs/claude-design/ui_kits/shared/account-settings.jsx`) are used as application-owned keys ("Marketplace
    digest" omitted — saved filters don't exist). Must be reconciled when an approved generator defines types.

- [X] T012 Wire 004's reserved topbar notification entry to this surface, keeping it honest (no
  fabricated unread count).
  - Req: FR-008, SC-006 | Depends: T010
  - Verify: the entry links to the surface and displays no invented count
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: small integration with one honesty constraint.
  - **RUN B (2026-09-19) — COMPLETE.** The Feature 004 bell is now a real `<a>` to `/dashboard/notifications/` with
    no count; `tests/dashboard/shell.test.tsx` updated to the new contract.

---

## Phase 4 — History & audit surfaces

- [X] T013 [PS7] Implement `lib/audit/history.ts` — scoped reads for order, listing and account status
  history plus ownership events, with correlation IDs.
  - Req: FR-010, FR-011, SEC-001 | Depends: —
  - Verify: each history type returns exactly what its policy permits for member/compliance/auditor fixtures
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: four different scoping rules across four tables; a mistake exposes another organization's commercial history.
  - **RUN C (2026-09-19) — COMPLETE.** `lib/audit/history.ts` is the single read-only owner of all four queries
    (UUID-guarded; anon `42501` reported as "nothing visible", other errors thrown). Live
    (`tests/audit/history.test.ts`): order history — participant + ADMIN read, other org/COMPLIANCE/AUDITOR/
    WAREHOUSE/FINANCE/anon get nothing; listing history — COMPLIANCE/AUDITOR/ADMIN read, every member org gets
    nothing; account history — own org + ADMIN only; ownership — parties + ADMIN only. Recorded gap: the listing
    "owning seller" branch cannot be exercised live (no member-owned listing can exist — Feature 006's own gap).
    No correlation id is invented for the three status-history tables (none stored).

- [X] T014 [P] [PS7] Build read-only history components (`components/audit/history-timeline.tsx`,
  `correlation-id.tsx`) with **no mutation affordance in the component set at all**.
  - Req: FR-010, SC-008 | Depends: T013
  - Verify: the components expose no edit/delete props; correlation IDs render monospaced
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: read-only-by-construction is a stronger guarantee than conditional disabling.
  - **RUN C (2026-09-19) — COMPLETE.** Props are data only (`entries`, `labelledBy`, `emptyMessage`); no callback,
    button, link, form or input exists; correlation ids monospaced + break-all; reason via `UntrustedText`;
    actor is viewer-relative ("Not recorded" only for a genuinely NULL `changed_by`). Pinned by
    `tests/audit/immutability.test.ts` (mutation-proven).

- [X] T015 [PS7] Implement `lib/audit/access.ts` — who may read what, including the DB-OPEN-06
  explanation for auditors and `audit_logs`.
  - Req: FR-016, spec Open items | Depends: T013
  - Verify: an auditor fixture sees an explanation rather than an empty list; an admin sees the log
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: distinguishing "no data" from "not permitted" is exactly the honesty distinction the SRS's audit model depends on.
  - **RUN C (2026-09-19) — COMPLETE.** `resolveAuditLogAccess()`: live ADMIN → real rows (reusing Feature 010's
    existing `probeAuditLog`, no second query); AUDITOR → `limited`/DB-OPEN-06 with NO query and no fallback; any
    other role → `not-permitted`. `AuditAccessNotice` renders the explanation. DB-OPEN-06 stays OPEN (a direct
    auditor read still returns nothing). No member route renders it — Feature 010's audit console should adopt it.

- [X] T016 Integrate history components into 005/006/007's detail surfaces (ownership ledger, listing
  history, order history) without duplicating their read layers.
  - Req: FR-010 | Depends: T014
  - Verify: each surface renders history through these shared components; no duplicate history query exists
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: cross-feature composition with a de-duplication requirement.
  - **RUN C (2026-09-19) — COMPLETE (for 005/006/007).** Order detail (007) and listing detail (006) render the
    shared `HistoryTimeline`; 005's `LedgerTimeline` is now a thin adapter over it. `getOrderStatusHistory`,
    `getListingStatusHistory` and `getOwnershipEvents` delegate their queries to `lib/audit/history.ts`.
    Recorded: Feature 010's console (`lib/admin/compliance.ts`) still issues its own listing/account history
    reads — left untouched per the no-new-010-work boundary; a candidate for 010 to delegate.

---

## Phase 5 — Module registration

- [X] T017 Register `disputes` and `notifications` nav entries and any "needs your action"
  contributions with 004's contract.
  - Req: FR-014 | Depends: T006, T010
  - Verify: entries appear for member organizations; no fabricated action items are contributed
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: contract-conformant registration with an honesty constraint.
  - **RUN C (2026-09-19) — COMPLETE.** `disputes` (buy, "trading" group) and `notifications` (member, "account"
    group) registered in `lib/dashboard/registry.tsx`; neither contributes an overview card, count or action item.

---

## Phase 6 — Tests

- [X] T018 [P] Write `tests/disputes/isolation.test.ts` — unrelated organizations cannot read or write
  disputes, evidence, notifications or histories.
  - Req: SEC-001, SC-001 | Depends: T002, T009, T013
  - Verify: `npm test -- disputes/isolation` passes across all four data types
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: cross-tenant exposure of conflict and audit data would be among the most damaging leaks possible.
  - **RUN C (2026-09-19) — COMPLETE.** 8 live tests: disputes, evidence, notifications and all four history types —
    app layer AND raw RLS SELECT/INSERT/UPDATE/DELETE, for two unrelated organizations.

- [X] T019 [P] Write `tests/disputes/role-restriction.test.ts` — only compliance changes dispute
  status; member/warehouse/finance/auditor all refused.
  - Req: FR-002, SEC-002, SC-002 | Depends: T004
  - Verify: `npm test -- disputes/role-restriction` passes for all four refused roles
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: resolution authority boundary.

- [X] T020 [P] Write `tests/audit/immutability.test.ts` — no delete/edit path exists; database refuses
  ownership-event mutation.
  - Req: FR-003, SC-003 | Depends: T013
  - Verify: `npm test -- audit/immutability` passes; grep confirms no `.delete(` on these tables
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: OPS-02/LOT-03 compliance proven at the boundary.
  - **RUN C (2026-09-19) — COMPLETE.** Static: no product delete of any protected table; no update of history/
    ledger/audit/evidence; `disputes` updated only by `lib/disputes/compliance.ts`; `lib/audit` read-only;
    policies/grants pinned from the schema report. Live: Feature 005's privileged append-only probe passes; party +
    WAREHOUSE update/delete change nothing. Mutation-proven (evidence delete, `onDelete` prop each fail it).

- [X] T021 Write `tests/disputes/honest-limitations.test.ts` — asserts the **absence** of a simulated
  notification creation/read mechanism and the absence of any automatic-freeze claim.
  - Req: SC-005, SC-006 | Depends: T007, T010
  - Verify: `npm test -- disputes/honest-limitations` passes; it would fail if a fake read-state or freeze claim were introduced
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: an unusual but valuable test — it protects a *deliberate non-implementation* from being "helpfully" filled in later.
  - **RUN B (2026-09-19) — COMPLETE.** 15 checks (static + runtime write-recording). Mutation-proven: a freeze claim
    in copy, a localStorage read flag, and an app-side `orders.update({ status: "DISPUTED" })` each fail it.

- [X] T022 [P] Write `tests/disputes/escaping.test.tsx` — injected markup in reasons/resolutions/notes
  renders inert in both member and console surfaces.
  - Req: SEC-004 | Depends: T008
  - Verify: `npm test -- disputes/escaping` passes for both surfaces
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: two rendering contexts must both be safe.
  - **RUN B (2026-09-19) — COMPLETE (member surface + reusable operator-facing seam).** Feature 010's dispute console
    route is still a placeholder that renders no dispute text, so no second page exists yet; `UntrustedText`/
    `EvidenceList` (role-agnostic) are tested directly. When 010 builds its console it must reuse them and extend
    this test to that page.

---

## Phase 7 — States, accessibility, RTL

- [X] T023 State coverage (loading, empty, error, unauthorized, suspended, each dispute state) plus
  honest empty states that distinguish "nothing here" from "not permitted".
  - Req: FR-015, FR-016 | Depends: Phases 2–4
  - Verify: each state renders; permission-limited surfaces explain themselves
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the empty-vs-forbidden distinction requires deliberate copy, not a default empty state.
  - **RUN D (2026-09-19) — COMPLETE.** `tests/disputes/state-coverage.test.tsx` (16) renders every current surface
    in each applicable state: shared loading / error (raw message never shown) ; disputes list unauthorized / forbidden
    (blocked user, suspended org) / honest empty / no-orders / all six statuses ; detail unauthorized / forbidden /
    not-found (new disputes-specific not-found — previously the shared page said "Position not found") / six status
    descriptions / evidence empty, text-only, file-reference + DB-BLOCK-01 ; notifications unauthorized / forbidden /
    honest empty + DB-BLOCK-04 / real rows without read state ; preferences unauthorized / forbidden / not-saved vs
    saved / validation + signed-out codes ; history visible vs empty ; DB-OPEN-06 auditor explanation vs not-permitted.
    Copy scan: no hardcoded UI text in Feature 012 JSX.

- [X] T024 Accessibility and RTL pass across dispute, notification and history surfaces.
  - Req: FR-015 | Depends: Phases 2–4
  - Verify: a11y check clean; grep for physical CSS properties returns nothing; timelines are navigable by keyboard
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mechanical but broad.
  - **RUN D (2026-09-19) — COMPLETE.** `tests/browser/feature012-rund.browser.mjs`: 108 surfaces (9 surfaces × EN/AR ×
    light/dark × 390/1366/1920) — axe 0 violations (colour contrast on), correct lang/dir, one `<main>`, 0 overflow,
    textual badges, named non-interactive timelines, correlation ids inside the viewport, no focusable aria-disabled
    control, every focusable named; keyboard traversal of the dispute detail (EN 19 stops, AR/390 10 stops) all
    visibly focused, no trap; exact-field validation with `aria-invalid` + `role=alert` in EN and AR. Static: 0
    physical-direction class tokens in 694 scanned. Listing-detail history not browser-renderable (no member-owned
    listing can exist — Feature 006's recorded gap); no audit-access route exists (render-tested).

---

## Phase 8 — Verification & closure

- [ ] T025 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.
  - **RUN D (2026-09-19) — commands run; NOT CHECKED (dependency unmet).** `Depends: all` is unmet while T004 is
    PARTIAL (DB-OPEN-23). Results: `npm run typecheck` exit 0 · `npm run build` exit 0 · `git diff --check` exit 0 ·
    `npm run lint` **exit 1** — all 124 errors are in `docs/claude-design/` (the exported design-kit reference, unchanged
    since baseline `f71b911`; not product code); `eslint lib src components tests scripts` → 0 errors, 1 pre-existing
    Feature 006 warning. `npm test` cannot run monolithically (OOM-killed on this machine), so the complete suite ran as
    non-overlapping directory batches — 160/160 files, 1,804 tests: 1,795 passed, 6 skipped (Feature 009's opt-in live
    gates), **3 failed, all pre-existing Feature 010 admin tests** (two assert no `/dashboard/payments` route, stale since
    Feature 008 commit `3234458`; one expects an empty `shipping_rules`, which holds a RUN F residue row). Every Feature
    012 test passed. So T025's literal Verify ("four exit-0 results") is also unmet (lint + test), independent of T004.

- [ ] T026 Confirm no simulated capabilities were introduced: no notification generation/read-state, no
  application-side dispute freeze, no evidence byte storage, no fabricated audit access.
  - Req: SC-005, SC-006, FR-005, FR-016 | Depends: T025
  - Verify: targeted greps plus a review pass; each blocked capability is explained in-product rather than faked
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: this feature has four blocked capabilities — confirming none was quietly simulated is the central integrity check.
  - **RUN D (2026-09-19) — proof GREEN; NOT CHECKED (Depends: T025, which cannot close).** No notification
    generation/read state/unread count/local-storage state/synthesis; no app-side freeze; no evidence bytes (inert seam,
    file-asset count + buckets unchanged); no fabricated auditor access (DB-OPEN-06 explained, no fallback) — proven by
    `honest-limitations` (15, mutation-proven), `immutability` (10), `escaping`, `run-b-live`, `audit/history`, `state-coverage`.

- [ ] T027 Confirm no service-role usage, no caching of private data, no public exposure.
  - Req: SEC-003, SEC-005, FR-013 | Depends: T025
  - Verify: `grep -rn "SERVICE_ROLE\|cacheTag\|unstable_cache" lib/disputes lib/notifications lib/audit src/app/dashboard/disputes` returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical constitutional checks.
  - **RUN D (2026-09-19) — proof GREEN; NOT CHECKED (Depends: T025).** The literal grep returns nothing (two doc
    comments that named the APIs were reworded); extended scan over every Feature 012 path is clean; `/dashboard` is
    `noindex`, disallowed in `robots`, absent from the sitemap; no public route imports the Feature 012 libs; logs carry
    only SQLSTATE codes; no analytics calls.

- [ ] T028 Update the roadmap for 012 and ensure DB-BLOCK-04 (expanded) and DB-OPEN-09 are recorded in
  `docs/architecture/DATABASE-CAPABILITY-MAP.md` with SRS citations.
  - Req: spec Open items | Depends: T025
  - Verify: both entries present and accurate; MKT-07 marked as not fully satisfiable until resolved
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — High
  - Why: these gaps affect a release-relevant SRS requirement; accurate recording is a governance duty.
  - **RUN D (2026-09-19) — documentation reconciled; NOT CHECKED (Depends: T025).** Capability map: DB-BLOCK-01
    (dispute scope still OPEN), DB-BLOCK-04, DB-OPEN-06, DB-OPEN-09 each carry a dated "STILL OPEN" note; new
    **DB-OPEN-23** records the T004 attribution / missing transition-guard gap with options. Roadmap: 012 row updated
    (23/28, NOT closed), blocker table updated, **MKT-07 marked NOT fully satisfiable**.

---

## Dependencies & parallelisation

- Phase 1 blocks Phases 2 and the compliance seam 010 consumes.
- Phase 3 (notifications) is independent of Phases 1–2 and can proceed in parallel.
- Phase 4 (history) is independent of Phases 1–3 and can proceed in parallel.
- Phase 6's tests are mutually parallel except T021 (needs T007 + T010).
- Phase 8 depends on everything.

**Parallel-safe tasks**: T008, T011, T014, T018, T019, T020, T022 (7 of 28).
