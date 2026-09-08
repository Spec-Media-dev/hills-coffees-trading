# Tasks: Disputes, Notifications & Audit (012)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §8 (MKT-07), §13.5, §14 (OPS-02), §46.

**Status**: all tasks unchecked — implementation NOT started.
**Prerequisite**: 001, 003, 004, 007, 008, 009 implemented; 010 consumes this feature's compliance
layer.

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

- [ ] T001 Create `lib/disputes/errors.ts` and dispute/evidence DTO types.
  - Req: FR-006, FR-015 | Depends: —
  - Verify: dispute status type matches the six approved values exactly
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical typing against a closed vocabulary.

- [ ] T002 Implement `lib/disputes/read.ts` — scoped dispute and evidence reads (participants,
  compliance, auditor).
  - Req: FR-004, SEC-001 | Depends: T001
  - Verify: an unrelated organization's dispute id returns nothing for all three audiences' queries
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: three-audience scoping where one over-broad predicate leaks commercially sensitive conflict data.

- [ ] T003 [PS1] Implement `lib/disputes/member.ts` — raise a dispute (`can_view_order`, own user, not
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

- [ ] T005 [PS2] Implement the evidence file seam — private `file_assets` metadata only, inert until a
  Storage bucket is approved (DB-BLOCK-01).
  - Req: FR-005, SEC-003 | Depends: T003
  - Verify: no bytes are written anywhere; the seam is one marked function citing DB-BLOCK-01; text notes still work
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: same blocked-capability discipline as 003/008, applied to evidence that may later be legally significant.

---

## Phase 2 — Member dispute surfaces

- [ ] T006 [PS1] Implement `src/app/dashboard/disputes/page.tsx` + `[disputeId]/page.tsx` + actions —
  raise, list and track disputes with approved status labels.
  - Req: FR-001, FR-006, FR-015, PS1 | Depends: T003
  - Verify: all six statuses render exact labels; only the member's own organization's disputes appear
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: member-facing conflict surface where clarity and correct scoping both matter.

- [ ] T007 [PS4] Render dispute linkage from affected orders/shipments (`DISPUTED` state) **without
  implying an automatic freeze**.
  - Req: FR-007, SC-005, PS4 | Depends: T006
  - Verify: no copy states or implies that raising a dispute freezes quantity/settlement; the link between dispute and record state reflects actual behaviour
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: an honest-product judgment about a capability the SRS describes but the database does not yet implement (DB-OPEN-09).

- [ ] T008 [P] [PS2] Build the evidence list/add UI with untrusted-text escaping and the DB-BLOCK-01
  explanation.
  - Req: FR-005, SEC-004 | Depends: T005
  - Verify: injected markup in a note renders inert; the file limitation is explained, not hidden
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: user-supplied content rendered in two surfaces (member + console) — the classic XSS path.

---

## Phase 3 — Notifications (honest read surface)

- [ ] T009 [PS5] Implement `lib/notifications/read.ts` — own-user notification reads only.
  - Req: FR-008, SEC-001 | Depends: —
  - Verify: another user's notifications are never returned
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: simple scoped read.

- [ ] T010 [PS5] Implement `lib/notifications/limitations.ts` + the notification page, stating
  honestly that notifications cannot currently be generated or marked read (DB-BLOCK-04).
  - Req: FR-008, SC-006, PS5 | Depends: T009
  - Verify: no client-side read state, no local-storage read flags, no notifications synthesised from other tables; the limitation is visible in-product
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the strongest temptation in this feature is to fake a working notification centre; refusing to is the correct — and non-obvious — call.

- [ ] T011 [P] [PS6] Implement notification preferences (own-user read/write).
  - Req: FR-009 | Depends: —
  - Verify: preferences persist per user; another user's are unreachable
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small own-scoped CRUD.

- [ ] T012 Wire 004's reserved topbar notification entry to this surface, keeping it honest (no
  fabricated unread count).
  - Req: FR-008, SC-006 | Depends: T010
  - Verify: the entry links to the surface and displays no invented count
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: small integration with one honesty constraint.

---

## Phase 4 — History & audit surfaces

- [ ] T013 [PS7] Implement `lib/audit/history.ts` — scoped reads for order, listing and account status
  history plus ownership events, with correlation IDs.
  - Req: FR-010, FR-011, SEC-001 | Depends: —
  - Verify: each history type returns exactly what its policy permits for member/compliance/auditor fixtures
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: four different scoping rules across four tables; a mistake exposes another organization's commercial history.

- [ ] T014 [P] [PS7] Build read-only history components (`components/audit/history-timeline.tsx`,
  `correlation-id.tsx`) with **no mutation affordance in the component set at all**.
  - Req: FR-010, SC-008 | Depends: T013
  - Verify: the components expose no edit/delete props; correlation IDs render monospaced
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: read-only-by-construction is a stronger guarantee than conditional disabling.

- [ ] T015 [PS7] Implement `lib/audit/access.ts` — who may read what, including the DB-OPEN-06
  explanation for auditors and `audit_logs`.
  - Req: FR-016, spec Open items | Depends: T013
  - Verify: an auditor fixture sees an explanation rather than an empty list; an admin sees the log
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: distinguishing "no data" from "not permitted" is exactly the honesty distinction the SRS's audit model depends on.

- [ ] T016 Integrate history components into 005/006/007's detail surfaces (ownership ledger, listing
  history, order history) without duplicating their read layers.
  - Req: FR-010 | Depends: T014
  - Verify: each surface renders history through these shared components; no duplicate history query exists
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: cross-feature composition with a de-duplication requirement.

---

## Phase 5 — Module registration

- [ ] T017 Register `disputes` and `notifications` nav entries and any "needs your action"
  contributions with 004's contract.
  - Req: FR-014 | Depends: T006, T010
  - Verify: entries appear for member organizations; no fabricated action items are contributed
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: contract-conformant registration with an honesty constraint.

---

## Phase 6 — Tests

- [ ] T018 [P] Write `tests/disputes/isolation.test.ts` — unrelated organizations cannot read or write
  disputes, evidence, notifications or histories.
  - Req: SEC-001, SC-001 | Depends: T002, T009, T013
  - Verify: `npm test -- disputes/isolation` passes across all four data types
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: cross-tenant exposure of conflict and audit data would be among the most damaging leaks possible.

- [ ] T019 [P] Write `tests/disputes/role-restriction.test.ts` — only compliance changes dispute
  status; member/warehouse/finance/auditor all refused.
  - Req: FR-002, SEC-002, SC-002 | Depends: T004
  - Verify: `npm test -- disputes/role-restriction` passes for all four refused roles
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: resolution authority boundary.

- [ ] T020 [P] Write `tests/audit/immutability.test.ts` — no delete/edit path exists; database refuses
  ownership-event mutation.
  - Req: FR-003, SC-003 | Depends: T013
  - Verify: `npm test -- audit/immutability` passes; grep confirms no `.delete(` on these tables
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: OPS-02/LOT-03 compliance proven at the boundary.

- [ ] T021 Write `tests/disputes/honest-limitations.test.ts` — asserts the **absence** of a simulated
  notification creation/read mechanism and the absence of any automatic-freeze claim.
  - Req: SC-005, SC-006 | Depends: T007, T010
  - Verify: `npm test -- disputes/honest-limitations` passes; it would fail if a fake read-state or freeze claim were introduced
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: an unusual but valuable test — it protects a *deliberate non-implementation* from being "helpfully" filled in later.

- [ ] T022 [P] Write `tests/disputes/escaping.test.tsx` — injected markup in reasons/resolutions/notes
  renders inert in both member and console surfaces.
  - Req: SEC-004 | Depends: T008
  - Verify: `npm test -- disputes/escaping` passes for both surfaces
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: two rendering contexts must both be safe.

---

## Phase 7 — States, accessibility, RTL

- [ ] T023 State coverage (loading, empty, error, unauthorized, suspended, each dispute state) plus
  honest empty states that distinguish "nothing here" from "not permitted".
  - Req: FR-015, FR-016 | Depends: Phases 2–4
  - Verify: each state renders; permission-limited surfaces explain themselves
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the empty-vs-forbidden distinction requires deliberate copy, not a default empty state.

- [ ] T024 Accessibility and RTL pass across dispute, notification and history surfaces.
  - Req: FR-015 | Depends: Phases 2–4
  - Verify: a11y check clean; grep for physical CSS properties returns nothing; timelines are navigable by keyboard
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mechanical but broad.

---

## Phase 8 — Verification & closure

- [ ] T025 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [ ] T026 Confirm no simulated capabilities were introduced: no notification generation/read-state, no
  application-side dispute freeze, no evidence byte storage, no fabricated audit access.
  - Req: SC-005, SC-006, FR-005, FR-016 | Depends: T025
  - Verify: targeted greps plus a review pass; each blocked capability is explained in-product rather than faked
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: this feature has four blocked capabilities — confirming none was quietly simulated is the central integrity check.

- [ ] T027 Confirm no service-role usage, no caching of private data, no public exposure.
  - Req: SEC-003, SEC-005, FR-013 | Depends: T025
  - Verify: `grep -rn "SERVICE_ROLE\|cacheTag\|unstable_cache" lib/disputes lib/notifications lib/audit src/app/dashboard/disputes` returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical constitutional checks.

- [ ] T028 Update the roadmap for 012 and ensure DB-BLOCK-04 (expanded) and DB-OPEN-09 are recorded in
  `docs/architecture/DATABASE-CAPABILITY-MAP.md` with SRS citations.
  - Req: spec Open items | Depends: T025
  - Verify: both entries present and accurate; MKT-07 marked as not fully satisfiable until resolved
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — High
  - Why: these gaps affect a release-relevant SRS requirement; accurate recording is a governance duty.

---

## Dependencies & parallelisation

- Phase 1 blocks Phases 2 and the compliance seam 010 consumes.
- Phase 3 (notifications) is independent of Phases 1–2 and can proceed in parallel.
- Phase 4 (history) is independent of Phases 1–3 and can proceed in parallel.
- Phase 6's tests are mutually parallel except T021 (needs T007 + T010).
- Phase 8 depends on everything.

**Parallel-safe tasks**: T008, T011, T014, T018, T019, T020, T022 (7 of 28).
