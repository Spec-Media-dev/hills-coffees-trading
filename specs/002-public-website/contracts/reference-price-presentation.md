# Contract: Reference-Price Presentation (Feature 002's half)

Governs FR-012, FR-013, SC-004; PS5. **Data semantics are owned by Feature 011** — this contract
defines only what the public website may render, and what it must never invent.

Blocker: **PRICE-011 — BLOCKS SUB-FLOW.** Feature 011 is not implemented. Additionally
**DB-OPEN-08** (no FX/conversion storage) means auditable unit/currency conversion is impossible in
the approved baseline regardless of 011's progress.

---

## 1. What Feature 002 owns *now*

Exactly one thing: **the presentation shell and its unavailable state.**

| 002 owns now | Deferred to 011 |
|---|---|
| The reference-price component and its layout | Any numeric value |
| The "reference information, not an offer" disclosure | Source identity and licence state |
| The **unavailable** state | Observation timestamp / time zone |
| Honest absence when no data exists | Delay type and delay minutes |
| Never-fabricate rules (§2) | Current vs. stale determination |
| | Last-successful-observation semantics |
| | Unit conversion (blocked — DB-OPEN-08) |
| | Currency conversion (blocked — DB-OPEN-08) |

**Feature 002 does not query `price_sources`, `price_observations` or `price_differentials`.** Those
tables are anonymously readable, but reading them here would mean 002 inventing the freshness,
licence and conversion semantics that are explicitly 011's requirements — the exact duplication the
Constitution's source-priority rule forbids. 002 consumes 011's presentation DTO when it exists;
until then it renders the unavailable state.

---

## 2. Never-fabricate rules (absolute)

The public site MUST NEVER display:

- a **number** that is not a real observation delivered by 011;
- a **source name** that is not the real licensed source;
- a **timestamp** that is not the real observation time;
- a **licence state** that is not the real one;
- a **converted** value (unit or currency) — no auditable conversion exists (DB-OPEN-08);
- a previously cached value **presented as current**;
- a placeholder, example or "sample" figure anywhere a real price would appear.

A missing price is presented as missing. Absence is honest; a plausible-looking number is not.

Reference prices are never presented as a Hills executable quote or a member listing price
(SRS §9, MKT-06). The disclosure text distinguishing *reference information* from an *offer* is
mandatory wherever any price-shaped element appears.

---

## 3. The states 002 implements

| State | When | Rendered |
|---|---|---|
| **Not yet available** (current default) | 011 unimplemented — today's state for every page | Explanatory copy: reference pricing is not yet published. No number, no source, no timestamp, no stale badge |
| **Unavailable** | 011 present but no approved-licence source / no observation | Same shape as above, with 011's reason where supplied |
| **Available** | 011 supplies a complete presentation DTO | Value + every disclosure element 011's contract requires, plus the "not an offer" disclosure |

The **Available** state is specified here for shape only; it is **not implementable in Feature 002**
and no Feature 002 task builds or tests it against real data. Its completeness requirement
(AC-06's six disclosure elements) belongs to 011's acceptance, not to 002's closure.

---

## 4. Boundary rules

- The component accepts a **discriminated union** from 011 (`{ status: "unavailable", reason? }` |
  `{ status: "available", ... }`) so an unavailable value cannot be structurally mistaken for a
  number-bearing one.
- No default/fallback number exists anywhere in the type or the component.
- The unavailable state is a **first-class design state**, not an error state — it renders calmly and
  does not suggest the site is broken (reuses 001's `StateScreen` idiom where appropriate).
- Reference-price presentation must not block or delay the rest of the page: it is an independent
  section, and its absence never prevents coffee/origin/homepage content from rendering.

---

## 5. Verification (Feature 002 scope only)

| Check | Expectation |
|---|---|
| Default render | The "not yet available" state renders; no numeric value in the output |
| Canary | No digit-bearing price string appears in SSR HTML, the RSC payload, metadata or JSON-LD from this component |
| Static analysis | `lib/public/` contains no query against `price_sources` / `price_observations` / `price_differentials` |
| Disclosure | Wherever a price-shaped element could appear, the "reference information, not an offer" disclosure is present |
| No fabrication | No fixture, placeholder or example numeric price exists in the component or its tests |

Tests for numeric pricing, staleness, last-success semantics and conversion are **deliberately not
written in Feature 002** — they would assert capabilities that neither 011 nor the database provides
today.
