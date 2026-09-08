# Tasks: Pricing & Reference Data (011)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §9 (PX-01..PX-06), AC-06.

**Status**: all tasks unchecked — implementation NOT started.
**Prerequisite**: 001 implemented. 002 and 010 consume this feature's layer.

> **Standing rules**: reference data is never executable; nothing displays without full disclosure;
> unlicensed/inactive sources are never displayed; stale is never presented as current; **no currency
> conversion may be implemented while DB-OPEN-08 stands**.

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Price-type taxonomy

- [ ] T001 [PS1] Create `lib/pricing/types.ts` — branded, non-interchangeable types for
  `ReferencePrice`, `HillsQuotePrice`, `ListingPrice` and `ExecutedPrice`, with the disclosure fields
  required on `ReferencePrice`.
  - Req: FR-001, FR-003, SC-001 | Depends: —
  - Verify: assigning a `ReferencePrice` where an executable price is expected fails type-checking; disclosure fields are non-optional
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this type design is the structural mechanism preventing the SRS's most-emphasised conflation error across the entire codebase.

- [ ] T002 Document in `types.ts` that `HillsQuotePrice` has no data model yet (no quote entity in the
  approved schema) so the gap is visible at the point of use.
  - Req: spec Open items | Depends: T001
  - Verify: the type carries a comment citing the missing quote entity; no code path constructs one from listing/reference data
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: preventing a future agent from silently filling the gap with the wrong data is a judgment-shaped safeguard.

---

## Phase 2 — Licence-gated read layer

- [ ] T003 [PS3] Implement `lib/pricing/sources.ts` — cached (`reference-prices`) reads of sources and
  their observations, filtered server-side to `is_active` AND `licence_status = 'APPROVED'`.
  - Req: FR-002, FR-007, SEC-003, SC-003 | Depends: T001
  - Verify: sources in `PENDING`/`RESTRICTED`/`DISABLED` return no observations even when requested by id
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: displaying unlicensed market data is a legal exposure; the gate must be at the data layer, not the UI.

- [ ] T004 [PS4] Implement `lib/pricing/freshness.ts` — resolves `is_stale`, observation timestamp,
  time zone and last-success context, and carries them through the cache.
  - Req: FR-005, FR-008, SC-004 | Depends: T003
  - Verify: a cached stale observation still reports stale; an absent observation returns the explicit unavailable shape
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: "cached but honest" is subtle — this is exactly where a stale value would otherwise be presented as current.

- [ ] T005 [P] [PS5] Implement `lib/pricing/differentials.ts` — active, in-period differentials with
  type, amount, currency, unit and effective period.
  - Req: FR-010, PS5 | Depends: T001
  - Verify: expired or inactive differentials are excluded; each returned item carries all five attributes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused read module with clear filtering rules.

- [ ] T006 Confirm **no conversion helper exists** anywhere in the pricing layer while DB-OPEN-08
  stands; raw value/unit/currency only.
  - Req: FR-006, SC-005 | Depends: T003
  - Verify: `grep -rniE "convert|toUsd|perKg\(|fx" lib/pricing` returns nothing; a comment cites DB-OPEN-08
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: an unauditable conversion would violate PX-03 and is the most likely "helpful" addition a future agent would make.

---

## Phase 3 — Presentation contract

- [ ] T007 [PS2] Implement `lib/pricing/presentation.ts` — the contract 002 consumes: a
  disclosure-complete reference price, a basis breakdown, or an explicit unavailable/stale shape.
  - Req: FR-003, FR-005, SC-002 | Depends: T003, T004, T005
  - Verify: the contract cannot express "a number without disclosure"; unavailable and stale are distinct, explicit shapes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this contract is what makes AC-06 achievable for every consumer; a permissive shape would let disclosure be dropped downstream.

- [ ] T008 [PS2] Build `components/pricing/reference-price.tsx` — renders only with complete
  disclosure (source, unit, currency, timestamp, time zone, delay type, reference-only statement).
  - Req: FR-003, FR-004, SC-002 | Depends: T007
  - Verify: passing an incomplete object is a type error; the rendered output contains all seven elements
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the component is the last line of defence for a release-blocking disclosure requirement.

- [ ] T009 [P] [PS4] Build `components/pricing/stale-state.tsx` and `unavailable-state.tsx` — explicit,
  honest states with last-success context.
  - Req: FR-005, SC-004 | Depends: T007
  - Verify: neither renders a current-looking value; last-success timestamp appears where known
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: small components with a strict honesty rule.

- [ ] T010 [P] [PS5] Build `components/pricing/basis-breakdown.tsx` — benchmark plus differentials,
  labelled as basis explanation, never as an executable quote.
  - Req: FR-010, PS5 | Depends: T005, T007
  - Verify: each component of the basis renders with type/amount/currency/unit; the block is labelled explanatory
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: presentational component with a labelling constraint.

---

## Phase 4 — Consumer integration

- [ ] T011 [PS1] Integrate the contract into 002's public surfaces (replacing 002's placeholder
  `lib/public/prices.ts` shim with this feature's real layer).
  - Req: FR-007, FR-009, SEC-001 | Depends: T007
  - Verify: 002's price surfaces render through this contract; no public page queries price tables directly
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: cross-feature integration where a direct query would bypass licence gating.

- [ ] T012 Ensure reference prices never appear in executable contexts (checkout, order, listing price
  fields) anywhere in the codebase.
  - Req: FR-009, SC-001 | Depends: T001, T011
  - Verify: type-checking prevents it; a review pass confirms no UI places a reference price adjacent to a purchase action without clear type labelling
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the conflation risk is contextual/visual as well as structural — it needs human-style judgment, not just types.

- [ ] T013 Register cache tag `reference-prices` in 001's cache-policy contract and wire revalidation
  from 010's price administration.
  - Req: FR-007, FR-011, SC-006 | Depends: T003
  - Verify: an administrative change revalidates the tag and the public surface updates
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: cross-feature cache wiring with a clear expected effect.

---

## Phase 5 — Tests

- [ ] T014 [P] Write `tests/pricing/type-separation.test.ts` — a compile-time/type test asserting the
  four price types are non-interchangeable.
  - Req: FR-001, SC-001 | Depends: T001
  - Verify: `npm test -- pricing/type-separation` passes; deliberately substituting types fails the build
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: type-level tests need care to actually assert failure rather than silently passing.

- [ ] T015 [P] Write `tests/pricing/disclosure.test.tsx` — every required disclosure element renders;
  incomplete data withholds the value.
  - Req: FR-003, SC-002 | Depends: T008
  - Verify: `npm test -- pricing/disclosure` passes for both paths
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: direct assertion of a release-blocking criterion.

- [ ] T016 [P] Write `tests/pricing/licence-gating.test.ts` — sources in each licence status; only
  approved+active return data.
  - Req: FR-002, SC-003 | Depends: T003
  - Verify: `npm test -- pricing/licence-gating` passes for all four statuses
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: legal-exposure boundary; must be proven at the data layer.

- [ ] T017 [P] Write `tests/pricing/staleness.test.ts` — stale flags, absent observations and cached
  staleness all render honestly.
  - Req: FR-005, FR-008, SC-004 | Depends: T004, T009
  - Verify: `npm test -- pricing/staleness` passes, including the cached-value case
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the cached-stale case is the subtle one and the one PX-05 explicitly warns about.

- [ ] T018 Write `tests/pricing/no-conversion.test.ts` — asserts no conversion/FX helper exists.
  - Req: FR-006, SC-005 | Depends: T006
  - Verify: `npm test -- pricing/no-conversion` passes and would fail if a conversion helper were added
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: a durable guard around a recorded database gap.

---

## Phase 6 — Accessibility & RTL

- [ ] T019 Accessibility and RTL pass: numerals, currency and timestamps remain LTR-readable inside
  RTL layouts; tabular figures; disclosure text is programmatically associated with its value.
  - Req: FR-013 | Depends: Phases 3–4
  - Verify: a11y check clean; RTL rendering keeps numeric/currency strings readable per the design system
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: bidirectional numeric formatting is a genuinely tricky area the design system calls out explicitly.

---

## Phase 7 — Verification & closure

- [ ] T020 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [ ] T021 Confirm no unlicensed data path, no conversion helper, no service-role usage, and no
  ingestion integration was added.
  - Req: FR-002, FR-006, FR-012, SEC-002 | Depends: T020
  - Verify: `grep -rniE "convert|fx|SERVICE_ROLE|fetch\(" lib/pricing` returns nothing unexpected; licence filter present in every read
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: several distinct legal/constitutional boundaries verified in one sweep.

- [ ] T022 Update the roadmap for 011 and record DB-OPEN-08 (no FX storage) and the missing quote
  entity in `docs/architecture/DATABASE-CAPABILITY-MAP.md`.
  - Req: spec Open items | Depends: T020
  - Verify: both items appear in the capability map with SRS citations and affected features
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: these gaps affect 002/006/007 as well; recording them centrally is a continuity responsibility.

---

## Dependencies & parallelisation

- Phase 1 blocks everything (types are the spine).
- Phase 2: T005 parallel to T003/T004; T006 is a verification of T003's absence-of-conversion.
- Phase 3 depends on Phase 2; T009/T010 parallel.
- Phase 4 integrates with 002/010 and depends on Phase 3.
- Phase 5 tests are mutually parallel except T018.
- Phase 7 depends on everything.

**Parallel-safe tasks**: T005, T009, T010, T014, T015, T016, T017 (7 of 22).
