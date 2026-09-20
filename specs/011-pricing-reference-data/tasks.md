# Tasks: Pricing & Reference Data (011)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §9 (PX-01..PX-06), AC-06.

**Status**: **RUN A + post-apply verification (2026-09-20) — 18 / 22 complete; implementation DONE, migration APPLIED and live-verified.** T001–T012 and T014–T019 are checked. **Open, by cause**: T013 (Feature 010 has no price-administration surface to call `revalidateReferencePrices()` — the tag is registered and TTL-only), and T020–T022 (`Depends: all` — verification and documentation are recorded but the boxes stay open while T013 is). **DB-BLOCK-10 remainder RESOLVED**: the three pricing tables' `price_*_admin` policies were `TO public`, so every anonymous read aborted `42501 permission denied for function is_platform_admin` (live-verified before the fix) — migration `supabase/migrations/20260920160000_feature_011_db_block_10_price_policy_scope.sql` (role scope of exactly three policies) is applied with `supabase db push --linked` (the dry-run immediately before showed ONLY this migration; `migration list` Local = Remote through `20260920160000`); postflight 9/9 `ok`; live-proven by `tests/pricing/reference-prices-live.test.ts` 20/20 and the seeded real-Chrome + axe proof. **DB-OPEN-08** stands: raw values only, no conversion anywhere.
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

- [x] T001 [PS1] Create `lib/pricing/types.ts` — branded, non-interchangeable types for
  `ReferencePrice`, `HillsQuotePrice`, `ListingPrice` and `ExecutedPrice`, with the disclosure fields
  required on `ReferencePrice`.
  - Req: FR-001, FR-003, SC-001 | Depends: —
  - Verify: assigning a `ReferencePrice` where an executable price is expected fails type-checking; disclosure fields are non-optional
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this type design is the structural mechanism preventing the SRS's most-emphasised conflation error across the entire codebase.
  - **Done (Feature 011 RUN A, 2026-09-20)**: `lib/pricing/types.ts` — `ReferencePrice`, `HillsQuotePrice`, `ListingPrice`, `ExecutedPrice`, each carrying a
    UNIQUE-SYMBOL brand as a required property; `ExecutablePrice` deliberately excludes `ReferencePrice`; every disclosure field is required and the ONLY
    constructor is `makeReferencePrice` (returns `null` on any missing/malformed element). Raw values are exact decimal TEXT (never a float). Proof:
    `tests/pricing/type-separation.test.ts` (14 tests) — pairwise `@ts-expect-error` substitutions verified by `npx tsc --noEmit` (an accidental compile of any
    substitution would itself fail the typecheck), plus runtime brand/round-trip/factory-refusal facts.

- [x] T002 Document in `types.ts` that `HillsQuotePrice` has no data model yet (no quote entity in the
  approved schema) so the gap is visible at the point of use.
  - Req: spec Open items | Depends: T001
  - Verify: the type carries a comment citing the missing quote entity; no code path constructs one from listing/reference data
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: preventing a future agent from silently filling the gap with the wrong data is a judgment-shaped safeguard.
  - **Done (RUN A)**: `HillsQuotePrice` carries a "NO DATA MODEL EXISTS" comment citing the missing quote entity, has no fields beyond kind + brand and NO
    constructor; `type-separation.test.ts` scans `lib`/`components`/`src` and fails on any builder/cast. Recorded centrally as `QUOTE-OPEN-01` in the capability map.

---

## Phase 2 — Licence-gated read layer

- [x] T003 [PS3] Implement `lib/pricing/sources.ts` — cached (`reference-prices`) reads of sources and
  their observations, filtered server-side to `is_active` AND `licence_status = 'APPROVED'`.
  - Req: FR-002, FR-007, SEC-003, SC-003 | Depends: T001
  - Verify: sources in `PENDING`/`RESTRICTED`/`DISABLED` return no observations even when requested by id
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: displaying unlicensed market data is a legal exposure; the gate must be at the data layer, not the UI.
  - **Done (RUN A)**: `lib/pricing/sources.ts` — anonymous session-free client (`createPublicReadClient`), explicit column allowlists (no `metadata`, no `created_by`),
    `raw_value::text`, THREE independent licence layers (RLS · query `.eq is_active/licence_status` · mapper re-check), observations requested only for gated ids, latest per
    (source, symbol), coffee benchmarks only, `unstable_cache` tagged `reference-prices` (TTL 300s), failures thrown (never cached) and surfaced as `read_failed`.
    `tests/pricing/licence-gating.test.ts` (16): PENDING/RESTRICTED/DISABLED/inactive return nothing even BY ID (the observation table is never queried for them).
    **Live (post-apply, 2026-09-20)**: `tests/pricing/reference-prices-live.test.ts` 20/20 — anonymous reads no longer hit `42501` and return exactly the approved + active boundary; PENDING / RESTRICTED / DISABLED / inactive stay unreadable, also by id.

- [x] T004 [PS4] Implement `lib/pricing/freshness.ts` — resolves `is_stale`, observation timestamp,
  time zone and last-success context, and carries them through the cache.
  - Req: FR-005, FR-008, SC-004 | Depends: T003
  - Verify: a cached stale observation still reports stale; an absent observation returns the explicit unavailable shape
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: "cached but honest" is subtle — this is exactly where a stale value would otherwise be presented as current.
  - **Done (RUN A)**: `lib/pricing/freshness.ts` — verdict derived from stored facts (`is_stale`, `observedAt`, `receivedAt`), NO invented age threshold; explicit
    `Unavailable` shape with four distinct reasons and no value field; deterministic UTC timestamp formatting. Facts travel with each cached record (+ the entry's `readAt`).
    `tests/pricing/staleness.test.ts` (14): a cache HIT still reports stale after the database recovered; absent observation → explicit shape.

- [x] T005 [P] [PS5] Implement `lib/pricing/differentials.ts` — active, in-period differentials with
  type, amount, currency, unit and effective period.
  - Req: FR-010, PS5 | Depends: T001
  - Verify: expired or inactive differentials are excluded; each returned item carries all five attributes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused read module with clear filtering rules.
  - **Done (RUN A)**: `lib/pricing/differentials.ts` — active + in-period (query AND row AND render-time re-check), non-lot-scoped, explicit scope
    (`general` / one coffee / one origin, by slug), `amount::text`, exactly type/amount/currency/unit/effective period (no `notes`, no ids). `tests/pricing/differentials.test.ts` (14).

- [x] T006 Confirm **no conversion helper exists** anywhere in the pricing layer while DB-OPEN-08
  stands; raw value/unit/currency only.
  - Req: FR-006, SC-005 | Depends: T003
  - Verify: `grep -rniE "convert|toUsd|perKg\(|fx" lib/pricing` returns nothing; a comment cites DB-OPEN-08
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: an unauditable conversion would violate PX-03 and is the most likely "helpful" addition a future agent would make.
  - **Done (RUN A)**: `grep -rniE "convert|toUsd|perKg\(|fx" lib/pricing components/pricing` returns nothing; DB-OPEN-08 is cited in `types.ts`, `sources.ts` and
    `differentials.ts`; exchange-rate (`FX`) and `OTHER` observation types are never requested. Pinned by `tests/pricing/no-conversion.test.ts` (T018).

---

## Phase 3 — Presentation contract

- [x] T007 [PS2] Implement `lib/pricing/presentation.ts` — the contract 002 consumes: a
  disclosure-complete reference price, a basis breakdown, or an explicit unavailable/stale shape.
  - Req: FR-003, FR-005, SC-002 | Depends: T003, T004, T005
  - Verify: the contract cannot express "a number without disclosure"; unavailable and stale are distinct, explicit shapes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this contract is what makes AC-06 achievable for every consumer; a permissive shape would let disclosure be dropped downstream.
  - **Done (RUN A)**: `lib/pricing/presentation.ts` — `ReferencePresentation` = `unavailable` (four reasons) | `ready` {entries: `current` (disclosure-complete `ReferencePrice`) |
    `stale` (`StaleReference`, NO value field), basis (explanatory only, never summed), `readAt`}. A value can only exist inside a `ReferencePrice`; incomplete records are
    WITHHELD (`incomplete_disclosure`). Pure `buildReferencePresentation` + async `getReferencePresentation` (never throws).

- [x] T008 [PS2] Build `components/pricing/reference-price.tsx` — renders only with complete
  disclosure (source, unit, currency, timestamp, time zone, delay type, reference-only statement).
  - Req: FR-003, FR-004, SC-002 | Depends: T007
  - Verify: passing an incomplete object is a type error; the rendered output contains all seven elements
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the component is the last line of defence for a release-blocking disclosure requirement.
  - **Done (RUN A)**: `components/pricing/reference-price.tsx` (Server Component) takes the whole `ReferencePrice` (incomplete = TYPE ERROR, verified by tsc; a cast/round-tripped
    object renders the withheld state at runtime). All seven disclosure elements + the value, `<data value>` exact text, LTR-isolated numerals, `aria-describedby` to the
    reference-only statement, no controls. `tests/pricing/disclosure.test.tsx` (15).

- [x] T009 [P] [PS4] Build `components/pricing/stale-state.tsx` and `unavailable-state.tsx` — explicit,
  honest states with last-success context.
  - Req: FR-005, SC-004 | Depends: T007
  - Verify: neither renders a current-looking value; last-success timestamp appears where known
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: small components with a strict honesty rule.
  - **Done (RUN A)**: `components/pricing/stale-state.tsx` (source + symbol + last-success timestamp, no value) and `unavailable-state.tsx` (four distinct reasons, no value,
    reference-only statement, last-success only where known).

- [x] T010 [P] [PS5] Build `components/pricing/basis-breakdown.tsx` — benchmark plus differentials,
  labelled as basis explanation, never as an executable quote.
  - Req: FR-010, PS5 | Depends: T005, T007
  - Verify: each component of the basis renders with type/amount/currency/unit; the block is labelled explanatory
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: presentational component with a labelling constraint.
  - **Done (RUN A)**: `components/pricing/basis-breakdown.tsx` — benchmark(s) + differentials, `data-explanatory-only`, per-component type/amount/currency/unit/period,
    a "not added together, netted or converted" note, no total (`13.25` = 12.5 + 0.75 asserted absent), no controls.

---

## Phase 4 — Consumer integration

- [x] T011 [PS1] Integrate the contract into 002's public surfaces (replacing 002's placeholder
  `lib/public/prices.ts` shim with this feature's real layer).
  - Req: FR-007, FR-009, SEC-001 | Depends: T007
  - Verify: 002's price surfaces render through this contract; no public page queries price tables directly
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: cross-feature integration where a direct query would bypass licence gating.
  - **Done (RUN A)**: the homepage's reference band now mounts `ReferencePriceSection` (async Server Component over the presentation contract); no public page or component
    names a price table (`integration-boundary.test.ts`). **Stale path recorded**: the task names a `lib/public/prices.ts` shim — none exists; Feature 002's actual placeholder was
    `components/public/reference-price.tsx` (unavailable-only), which is left UNCHANGED with its closed 002 tests (`tests/public/reference-price.test.tsx`). Real Chrome proof of the
    live homepage state: `tests/browser/feature011-reference-prices.browser.mjs` part A.

- [x] T012 Ensure reference prices never appear in executable contexts (checkout, order, listing price
  fields) anywhere in the codebase.
  - Req: FR-009, SC-001 | Depends: T001, T011
  - Verify: type-checking prevents it; a review pass confirms no UI places a reference price adjacent to a purchase action without clear type labelling
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the conflation risk is contextual/visual as well as structural — it needs human-style judgment, not just types.
  - **Done (RUN A)**: types make the substitution a compile error; a static sweep proves NO module under `lib/{orders,listings,finance,delivery,inventory,disputes,notifications}`,
    `src/app/dashboard*` or `components/{orders,listings,finance,delivery,dashboard}` imports the pricing layer (the only importers are the homepage and `components/pricing`), and the
    pricing layer imports none of them. Review pass: no reference price is rendered next to a purchase action anywhere (the components contain no button/link/form).

- [ ] T013 Register cache tag `reference-prices` in 001's cache-policy contract and wire revalidation
  from 010's price administration.
  - Req: FR-007, FR-011, SC-006 | Depends: T003
  - Verify: an administrative change revalidates the tag and the public surface updates
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: cross-feature cache wiring with a clear expected effect.
  - **PARTIAL (RUN A, re-evaluated post-apply 2026-09-20) — left unchecked, honestly; BLOCKED on Feature 010.** The literal requirements are: task text "wire revalidation from 010's price administration" and Verify "an administrative change revalidates the tag and the public surface updates" (spec FR-011: "Administrative mutations MUST be `is_platform_admin()`-gated and delivered through 010's console, revalidating public tags"; SC-006: "Public price caches revalidate on administrative change"). A platform ADMIN can change price data (live-proven), but NOTHING in the product revalidates the tag on that change — the only invalidation is the 300s TTL — so "an administrative change revalidates the tag" is not true today; the hook + registration + TTL fallback are necessary parts of T013, not the whole of it. DONE: the `reference-prices` tag is registered in Feature 001's cache-policy contract (row + TTL 300s +
    invalidation owner + "TTL only" status), every cached pricing read carries it, and `revalidateReferencePrices()` (`lib/pricing/cache.ts`, mandatory `{ expire: 0 }` form) exists;
    `staleness.test.ts` proves — over a tag-aware memo — that calling it makes the next read reflect a licence revocation / recovered feed. NOT DONE (cannot be): the task's Verify
    ("an administrative change revalidates the tag and the public surface updates") needs Feature 010's PRICE ADMINISTRATION surface to call that function, and **Feature 010 has no price
    administration task or surface** (its 48 tasks cover catalogue, compliance, warehouse, audit and system configuration — not sources/observations/differentials). Feature 011 must not
    build a separate admin surface (plan decision 7). Until such a surface exists the tag is TTL-only, stated as such in the contract. **Unblocks when**: Feature 010 gains a price-administration
    task that calls `revalidateReferencePrices()` (recommended), or a human decision accepts the hook + registration as this task's closure.

---

## Phase 5 — Tests

- [x] T014 [P] Write `tests/pricing/type-separation.test.ts` — a compile-time/type test asserting the
  four price types are non-interchangeable.
  - Req: FR-001, SC-001 | Depends: T001
  - Verify: `npm test -- pricing/type-separation` passes; deliberately substituting types fails the build
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: type-level tests need care to actually assert failure rather than silently passing.
  - **Done (RUN A)**: `tests/pricing/type-separation.test.ts` — compile-time proofs are checked by `tsc --noEmit`; `npm test -- pricing/type-separation` passes (14).

- [x] T015 [P] Write `tests/pricing/disclosure.test.tsx` — every required disclosure element renders;
  incomplete data withholds the value.
  - Req: FR-003, SC-002 | Depends: T008
  - Verify: `npm test -- pricing/disclosure` passes for both paths
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: direct assertion of a release-blocking criterion.
  - **Done (RUN A)**: `tests/pricing/disclosure.test.tsx` (15) — all seven elements render; incomplete/forged/round-tripped data withholds the value; delay types labelled honestly.

- [x] T016 [P] Write `tests/pricing/licence-gating.test.ts` — sources in each licence status; only
  approved+active return data.
  - Req: FR-002, SC-003 | Depends: T003
  - Verify: `npm test -- pricing/licence-gating` passes for all four statuses
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: legal-exposure boundary; must be proven at the data layer.
  - **Done (RUN A)**: `tests/pricing/licence-gating.test.ts` (16) — all four licence statuses + inactive; a fake client that exposes EVERY row proves the layer itself gates; each of the
    three defences is independently necessary (mutation block). Live RLS proof after apply: `tests/pricing/reference-prices-live.test.ts`.

- [x] T017 [P] Write `tests/pricing/staleness.test.ts` — stale flags, absent observations and cached
  staleness all render honestly.
  - Req: FR-005, FR-008, SC-004 | Depends: T004, T009
  - Verify: `npm test -- pricing/staleness` passes, including the cached-value case
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the cached-stale case is the subtle one and the one PX-05 explicitly warns about.
  - **Done (RUN A)**: `tests/pricing/staleness.test.ts` (14) — stale flag, absent observation, read failure, and the CACHED cases (a cache hit keeps reporting stale; a licence revocation +
    `revalidateReferencePrices()` removes the source; failures are never cached) through a tag-aware `unstable_cache` stand-in that JSON-round-trips stored values.

- [x] T018 Write `tests/pricing/no-conversion.test.ts` — asserts no conversion/FX helper exists.
  - Req: FR-006, SC-005 | Depends: T006
  - Verify: `npm test -- pricing/no-conversion` passes and would fail if a conversion helper were added
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: a durable guard around a recorded database gap.
  - **Done (RUN A)**: `tests/pricing/no-conversion.test.ts` (15) — the T006 grep, export-name sweep, no arithmetic/rounding/locale formatting, no rate table, plus a MUTATION block proving
    the detector fires on seven synthetic conversion helpers. Also `price-integrity.test.tsx` (18): exact digit-for-digit rendering (`0.10`, `9007199254740993`, …).

---

## Phase 6 — Accessibility & RTL

- [x] T019 Accessibility and RTL pass: numerals, currency and timestamps remain LTR-readable inside
  RTL layouts; tabular figures; disclosure text is programmatically associated with its value.
  - Req: FR-013 | Depends: Phases 3–4
  - Verify: a11y check clean; RTL rendering keeps numeric/currency strings readable per the design system
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: bidirectional numeric formatting is a genuinely tricky area the design system calls out explicitly.
  - **Done (RUN A)**: real Chrome + axe-core (colour-contrast on) — `tests/browser/feature011-reference-prices.browser.mjs`: the live homepage (honest `read_failed` state, pre-apply) and a
    TEMPORARY static-fixture harness route (removed after the run) rendering every state — current ×2, stale, basis, and each of the four unavailable reasons — across EN/AR × light/dark × 390/1366
    (8 home + 48 harness surfaces): 0 axe violations, no horizontal overflow, exactly one `<main>`, all seven disclosure elements on every benchmark, numerals/currency/timestamps are isolated LTR
    runs, values programmatically associated with their disclosure, no interactive control inside the reference stage, keyboard traversal with visible focus and no trap (EN/1366 and AR/390), zero
    console/page/request errors. **Post-apply seeded proof (2026-09-20)**: `HILLS_F011_EXPECT=seeded HILLS_F011_HARNESS=0 node tests/browser/feature011-reference-prices.browser.mjs` — the LIVE homepage over disposable
    `F011-` rows, EN/AR × light/dark × 390/1366 (8 surfaces): the approved benchmark with all disclosure elements, the stale feed as stale with NO value, an explanatory basis, stored amounts/currency/unit/timestamp
    shown exactly (`250.125000`, `cents/lb`, `USD`, `2026-09-01 12:00 UTC`; differentials `12.50…`/`0.75…`), no non-approved value, no `FX` observation, no conversion or summed figure; 0 axe violations, no overflow, keyboard OK, zero console/page/request errors; fixtures removed.

---

## Phase 7 — Verification & closure

- [ ] T020 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.
  - **VERIFIED (RUN A, re-run post-apply 2026-09-20) but NOT closable while T013 is open (`Depends: all`).** `npm run lint` (0 errors; the single pre-existing `tests/listings/manage-page.test.tsx` warning), `npx tsc --noEmit`,
    `npm run build` all exit 0; `tests/pricing` 160/160 (140 static + 20 live); regression batches (public/design 216, database 39, dashboard/finance/audit/disputes 280, auth 338, admin 297, listings/inventory 255) green.

- [ ] T021 Confirm no unlicensed data path, no conversion helper, no service-role usage, and no
  ingestion integration was added.
  - Req: FR-002, FR-006, FR-012, SEC-002 | Depends: T020
  - Verify: `grep -rniE "convert|fx|SERVICE_ROLE|fetch\(" lib/pricing` returns nothing unexpected; licence filter present in every read
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: several distinct legal/constitutional boundaries verified in one sweep.
  - **VERIFIED (RUN A) but NOT closable (`Depends: T020`).** Pinned by `tests/pricing/integration-boundary.test.ts` (22): licence filter in every source read (query + mapper), no service-role/privileged key,
    anonymous client only, no identity/cache-key variation, no mutation/RPC, no ingestion (no `fetch`, no URL, no scheduler), no client component, no authorization decision in the UI.

- [ ] T022 Update the roadmap for 011 and record DB-OPEN-08 (no FX storage) and the missing quote
  entity in `docs/architecture/DATABASE-CAPABILITY-MAP.md`.
  - Req: spec Open items | Depends: T020
  - Verify: both items appear in the capability map with SRS citations and affected features
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: these gaps affect 002/006/007 as well; recording them centrally is a continuity responsibility.
  - **RECORDED (RUN A) but NOT closable (`Depends: T020`).** DB-OPEN-08 already stood in the capability map; added `QUOTE-OPEN-01` (no Hills quote entity — SRS §9, Appendix D #8; affects 011, 002, 006/007) and
    the DB-BLOCK-10 remainder entry; the roadmap's 011 row now reflects this state. Checkbox flips together with T013/T020/T021.

---

## Dependencies & parallelisation

- Phase 1 blocks everything (types are the spine).
- Phase 2: T005 parallel to T003/T004; T006 is a verification of T003's absence-of-conversion.
- Phase 3 depends on Phase 2; T009/T010 parallel.
- Phase 4 integrates with 002/010 and depends on Phase 3.
- Phase 5 tests are mutually parallel except T018.
- Phase 7 depends on everything.

**Parallel-safe tasks**: T005, T009, T010, T014, T015, T016, T017 (7 of 22).
