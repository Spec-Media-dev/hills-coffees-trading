# Implementation Plan: Pricing & Reference Data

**Feature**: `011-pricing-reference-data` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)
**Status**: Planning prepared — implementation NOT started

## Summary

Own the price-type taxonomy and the reference-data domain: distinct types for the four price
concepts, a licence-gated read layer, a disclosure-complete presentation contract for 002, honest
staleness handling, and differential-based basis explanation. Two gaps (no FX storage, no quote
entity) are recorded, and no conversion or quote workflow is invented around them.

## Technical Context

**Data (read)**: `price_sources` (public: `is_active` + `licence_status='APPROVED'`),
`price_observations` (public via approved source), `price_differentials` (public: `is_active`).
**Data (admin write)**: same tables under `is_platform_admin()` — surfaced through 010.
**Caching**: public, tagged `reference-prices`; freshness metadata travels with the cached value.
**Testing**: type-separation checks, disclosure completeness, licence gating, staleness behaviour.

## Database capabilities consumed

| Need | Approved mechanism |
|---|---|
| Public source list | `price_sources` SELECT `price_sources_public_read` (`is_active` AND `licence_status='APPROVED'`) |
| Public observations | `price_observations` SELECT `price_observations_public_read` (only from such sources) |
| Public differentials | `price_differentials` SELECT `price_differentials_public_read` (`is_active`) |
| Administration | `price_*_admin` policies (`is_platform_admin()`) |

**Not available**: FX/conversion storage (DB-OPEN-08); Hills quote entity.

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| I Scope boundary | PASS | Reference data is information-only; never presented as executable |
| III Database authority | PASS | Zero schema change; FX and quote gaps recorded |
| VII Public/private boundary | PASS | Only public price tables; SEC-001 keeps member pricing out |
| VIII Server-side enforcement | PASS | SEC-003 — licence gating at the read layer |
| XI Caching | PASS | FR-007/FR-008 — public cacheable, freshness-safe |
| XIII Design fidelity | PASS | FR-013 — numerals/currency handling per the design system |
| XV Ambiguity rule | PASS | Licensing, FX and quote-entity gaps surfaced explicitly |

## Architecture decisions

1. **Branded types enforce separation.** `lib/pricing/types.ts` defines `ReferencePrice`,
   `HillsQuotePrice`, `ListingPrice` and `ExecutedPrice` as branded/opaque types. The compiler — not
   convention — prevents passing a reference value where an executable one is expected (FR-001,
   SC-001).
2. **Disclosure is structural, not optional.** `ReferencePrice` carries its disclosure fields as
   required properties; the presentation component takes the whole object, so a bare number cannot be
   rendered (FR-003).
3. **Licence gating lives in the read layer.** `lib/pricing/sources.ts` filters by licence/active
   status server-side; the UI never receives an unlicensed observation to hide.
4. **Freshness travels with the value.** The cached DTO includes `observedAt`, `isStale` and
   `lastSuccessAt`, so a cache hit can still render "stale" correctly (FR-008).
5. **No conversions until FX is approved.** The layer exposes raw value/unit/currency only. A
   deliberate absence of any conversion helper prevents a future agent from adding an unauditable
   one (FR-006, DB-OPEN-08).
6. **Quote type declared but unimplemented.** `HillsQuotePrice` exists as a type with a documented
   note that no quote entity is modelled — so when the workflow is approved it has a home, and until
   then nothing accidentally fills the gap.
7. **Administration is delivered through 010**, not through a separate admin surface here.

## Project structure (files this feature adds)

```text
lib/pricing/
├── types.ts          # NEW — the four branded price types + disclosure shape
├── sources.ts        # NEW — licence-gated source/observation reads (cached, tagged)
├── differentials.ts  # NEW — active differential reads + basis composition
├── freshness.ts      # NEW — staleness/last-success resolution
└── presentation.ts   # NEW — the contract 002 consumes

components/pricing/   # NEW — reference price display (disclosure-complete),
                      #       basis breakdown, stale/unavailable states

tests/pricing/        # NEW — type separation, disclosure, licence gating, staleness
```

(Admin CRUD screens live in 010's `(catalogue)` area and call this feature's layer.)

## Testing strategy

- **Type separation**: a compile-time test asserts a `ReferencePrice` cannot satisfy an executable
  price parameter.
- **Disclosure completeness**: the component renders only with all required fields; missing any field
  withholds the value.
- **Licence gating**: sources in each licence status — only approved+active return observations.
- **Staleness**: `is_stale` and absent-observation paths render honestly; cached values still show
  stale state.
- **Differentials**: expired differentials excluded; active ones render with all attributes.
- **No conversion**: a test asserts no conversion helper exists while FX storage is unavailable.

## Risks & blockers

| Risk / blocker | Impact | Handling |
|---|---|---|
| **Market-data licence not approved** | Nothing displayable from that source | FR-002 gating; business decision recorded |
| **DB-OPEN-08 — no FX storage** | Conversions impossible auditably | Raw values only; no conversion helper exists at all |
| **No quote entity** | Hills quote price type has no data model | Type declared, workflow not invented; recorded for a product decision |
| **No ingestion scheduler** | Observations must be entered administratively | Recorded; no unapproved infrastructure added |
| Cached staleness misrepresentation | Legal/commercial exposure | Freshness metadata travels with the cached DTO (FR-008) |
