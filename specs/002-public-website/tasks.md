# Tasks: Public Website (002)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [`contracts/`](./contracts/),
`docs/architecture/DATABASE-CAPABILITY-MAP.md`, `.specify/memory/constitution.md` (v2.0.0),
`docs/requirements/Hills-Coffee-SRS-v1.md`,
`docs/design-guidance/Hills-Coffee-Website-Recommendations.md`, `docs/claude-design/`.

**Status**: Block A (Phases 1–2) **COMPLETE — 12 / 12 verified**. Block B (Phases 3–4)
**COMPLETE — 5 / 5 verified**. Block C (Phases 5 + 7) **COMPLETE — 3 / 3 verified**.
**20 / 59 tasks checked.** Phases 6 and 8–13 not started.
**Phase 5.5 (Full Product UI Foundation) is planned and inserted before Phase 6** — see
[`PHASE-5.5-UI-FOUNDATION-PLAN.md`](./PHASE-5.5-UI-FOUNDATION-PLAN.md) and
[`PHASE-5.5-TASKS.md`](./PHASE-5.5-TASKS.md). Its `UIF-001`–`UIF-058` namespace does not collide with
`T000`–`T057`, and **no existing task is renumbered or marked complete by it.**
**DB-BLOCK-10 is RESOLVED** — the approved policy-scoping migration is applied and the anonymous
public catalogue boundary is verified live.
**Prerequisite**: 001-platform-foundation **implemented and verified** (Hills tokens, `StateScreen`,
i18n foundation, Supabase client boundary, `unstable_cache` + `revalidateTag` decision, Server Action
contract, Vitest tooling, test fixtures).

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: one-line reason for the difficulty/model choice
```

`[P]` = genuinely safe to run in parallel: **disjoint files and no unmet dependency**. A task that
edits a file another task owns is never `[P]`, even if it feels small.

## Standing rules for every task here

1. **Never** query a table outside the allowlist, and never `select("*")`
   (`contracts/public-dto-allowlist.md`).
2. **Never** call `getRequestIdentity()` on a public page; no cache entry varies by user.
3. **Server Components by default** (FR-020) — a `"use client"` directive requires a genuine
   interaction reason stated in the code.
4. **Never** fabricate a price, a media URL, a legal sentence, an RFQ success, or a lifecycle status
   code the database cannot support.
5. Cache is `unstable_cache(fn, keyParts, { tags, revalidate })` +
   `revalidateTag(tag, { expire: 0 })`. Nothing else.
6. No new lint findings; the pre-existing `docs/claude-design` baseline stays as-is (SC-011).

---

## Phase 1 — Public shell, canonical URLs & shared config

**Purpose**: establish the chrome and URL rules everything else renders inside. Deliberately first
because the homepage and the route group must share one shell.

- [x] T000 Create the **public copy dictionary** `lib/public/copy/` — the single typed English
  source for every user-facing string on this surface, per
  [`contracts/public-copy-architecture.md`](./contracts/public-copy-architecture.md).
  **Server-safe by construction**: plain `.ts`, **no `"use client"` directive**, no `react` import, no
  `i18next` import — so a Server Component can import it without crossing the client boundary, and a
  Client Component imports the *same* module. Exported `as const` with a derived type, so a missing
  or misspelled key is a compile error rather than a runtime `undefined`.
  **Feature 001's i18next stays exactly where it is** (`lib/i18n/config.ts`, client-side, root-layout
  provider): no second initialisation, no second i18n library, no `useTranslation()` in this feature.
  English-first, RTL-ready, no locale routing, no locale switcher.
  **Ordered first in Phase 1** because every task rendering a user-facing string depends on it —
  including T001's skip-link label. *(Renumbered from T005 to T000 for exactly this reason; no other
  task ID changed.)*
  - Req: FR-018, FR-030 | Depends: —
  - Verify: `grep -rn "use client" lib/public/copy` returns nothing, and the module imports neither `react` nor `i18next`; a deliberately misspelled key fails `npm run typecheck`; `grep -rnE "initReactI18next|i18next\.init" lib src` matches only `lib/i18n/config.ts`; no second i18n library appears in `package.json`; no `/en` or `/ar` route exists
  - **The repository-wide "no hard-coded user-facing string" sweep is T057** (closure), when all consuming components exist. Do not retrofit components that have not been written yet.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: small, but getting the server-safety property wrong (one stray `"use client"`) would silently pull every public page into the client bundle — the exact opposite of FR-020.

- [x] T001 Build `components/public/public-shell.tsx` — the single shared public chrome (header +
  footer slots, landmarks, skip link) that both the locked root homepage and the `(public)` route
  group consume. Server Component; no client JS unless a genuine interaction requires it.
  - Req: FR-023, FR-020, FR-030 | Depends: T000
  - Verify: the component renders `<header>`/`<main>`/`<footer>` landmarks and a working skip link; it imports 001's existing tokens/fonts and defines no new token or font system
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: ordinary component work, but it is the structural fix for the homepage/route-group split so its shape matters more than its size.

- [x] T002 Build `components/public/site-header.tsx` and `site-footer.tsx` — crawlable HTML anchors
  for every priority destination, primary "Request an offer" CTA, secondary Trading Portal / sign-in
  entry. Footer links only to routes that actually exist (no `/knowledge`, no `/legal` — CONTENT-01).
  - Req: FR-016, FR-021, PS2, PS4 | Depends: T000, T001
  - Verify (**structural, checkable now** — the destination routes are created later in Phases 4–6): every priority destination is rendered as a real `<a href="…">` element with a concrete path (not a JS-only control, not `href="#"`, not a placeholder); the href set matches exactly the routes this feature will own — `/`, `/coffee/`, `/origins/`, `/sourcing/`, `/contact/`, `/portal-entry/` — in canonical trailing-slash form; **no** `/knowledge` or `/legal` href appears (CONTENT-01); the portal entry is visually secondary to the primary CTA
  - **Runtime dead-link verification is deferred to T038** (metadata/route coverage) and **T050** (JS-disabled anchor traversal), once the destinations exist. Do **not** create stub routes to make this task's verification pass.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: navigation correctness plus the discipline of not linking to blocked routes; the verification is deliberately structural because the targets do not exist yet.

- [x] T003 Create `src/app/(public)/layout.tsx` wrapping children in `PublicShell`. Confirm it is a
  route *group* (URL unchanged) and that the three locked root files are not moved.
  - Req: FR-001, FR-002, FR-023 | Depends: T001
  - Verify (**structural, provable in Phase 1** — the first real route inside the group is created in Phase 4, so the runtime URL assertion belongs to T014): `src/app/(public)/layout.tsx` exists and wraps `children` in `PublicShell`; a route placed inside the group resolves **without** a `(public)` URL segment while the literal `/(public)/…` path returns 404 — a temporary probe route may be used for this and **must be removed before the task is complete** (do not ship a stub); the production build's route list contains no `(public)` segment; `git diff --summary` shows **no rename** of `src/app/page.tsx`, `src/app/layout.tsx` or `src/app/globals.css`
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: route-group semantics against a Constitution-locked constraint.

- [x] T004 Enable canonical trailing-slash URLs: add **`trailingSlash: true`** to `next.config.ts`
  (the only change to that file — no cache flag), then **run a Feature 001 authorization regression
  check**: anonymous and cross-surface denial still hold on `/dashboard/` and `/dashboard-admin/`,
  and `src/proxy.ts`'s matcher still matches.
  - Req: FR-026, SC-010 | Depends: —
  - Verify (**both URL forms, every protected Foundation route**): `/coffee` → redirects to `/coffee/`; `/` unaffected. For **each** of `/dashboard`, `/dashboard/`, `/dashboard/settings`, `/dashboard/settings/`, `/dashboard-admin`, `/dashboard-admin/` — anonymous is denied (redirect or unauthorized state, never protected content and never a 200 carrying member data); the `buyer-only` fixture is denied on both admin forms; the `warehouse-admin` fixture is denied on all four member forms; the authorized fixture still reaches its own surface. `src/proxy.ts`'s matcher still matches both the slashed and unslashed forms — confirm the redirect hop does not skip the proxy or the layout guard. No redirect response leaks protected content or is indexable. `grep -n "cacheComponents" next.config.ts` returns nothing
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: a one-line config change that silently alters every URL in the app, including a security boundary Feature 001 already verified — the highest-blast-radius edit in this feature.

- [x] T006 [P] Build `components/public/media-placeholder.tsx` — a stable, labelled placeholder with
  explicit dimensions/aspect ratio for every public media slot. **MEDIA-01**: no Storage bucket is
  created, and no file URL is constructed, guessed or proxied.
  - Req: FR-028, SC-005 | Depends: T000
  - Verify: placeholders reserve layout space (no shift on load); `grep -rn "file_asset_id\|storage" components/public lib/public` returns nothing that builds a file URL; the placeholder's visible label and accessible name resolve through T000's dictionary — no hard-coded user-facing literal (`contracts/public-copy-architecture.md` §3.6)
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small presentational component whose only subtlety is refusing to invent a media path.

**Checkpoint**: one shell, canonical URLs enforced, 001's authorization still proven intact.

---

## Phase 2 — Catalogue fixtures & public read layer (the DTO boundary)

**Purpose**: the deterministic catalogue data every later runtime check depends on, plus the single
auditable boundary all public data flows through. Independent of every content blocker.

**Applies to T007, T008 and T009**: each cached function additionally records, **inside its cache
entry**, a computation stamp (`computedAt` + a per-computation token) exposed only through a
**test-only accessor** — never rendered, never in metadata/JSON-LD/sitemap, never shown to a
visitor. This is what makes the T031 revalidation proof observable without mutating catalogue data
(`contracts/public-cache-policy.md` §5.2). It is diagnostic provenance, not page content.

- [x] T006a **Catalogue test fixtures** — **extend** Feature 001's existing fixture infrastructure;
  do **not** build a parallel seed system.
  **Where the work goes**: add a catalogue section to `scripts/seed-test-fixtures.ts` (the one and
  only place the service-role key is ever constructed) reached through the existing
  `npm run test:seed` / `npm run test:seed:teardown` scripts, and add an unprivileged test-side
  helper (e.g. `tests/public/fixture-catalogue.ts`) exporting the deterministic constants and
  **reusing `createAnonymousFixtureClient()` from `tests/auth/fixture-session.ts`** rather than
  duplicating client construction. The test runtime never reads or imports the privileged
  credential — 001's stated rule.
  **Rows to create** (all values verified against the approved schema; every FK below is nullable in
  `coffees`/`origins`, and `created_by`/`updated_by` are left NULL so no profile coupling is
  introduced):
  1. **Reference/taxonomy** — one `regions`, `coffee_types`, `coffee_varieties`,
     `processing_methods`, `packaging_types`, `tags` row (each needs only `name` + `slug`; each has
     `UNIQUE (slug)`, which is the idempotency key), plus one `coffee_tags` link for the published
     coffee.
  2. **Public coffee** — one `coffees` row with `status = 'PUBLISHED'`, linked to the active origin
     and to all five taxonomy rows so the public DTO renders its full shape.
  3. **Non-public coffees** — one `status = 'DRAFT'` and one `status = 'ARCHIVED'` row. These are
     the **only** non-public values the `coffees` CHECK constraint allows
     (`DRAFT` | `PUBLISHED` | `ARCHIVED`).
  4. **Public origin** — one `origins` row with `status = 'ACTIVE'`, linked to the region.
  4b. **Second public origin, deliberately empty** — one further `status = 'ACTIVE'` origin with no
     coffees linked to it. *(Added during T016: an active origin with zero published coffees must
     render an honest empty state and still return 200, and the original row set could not express
     that case — its only ACTIVE origin carries the published coffee. T006a was re-verified after
     the change.)*
  5. **Non-public origins** — one `status = 'INACTIVE'` and one `status = 'ARCHIVED'` row. These are
     the only non-public values the `origins` CHECK constraint allows
     (`ACTIVE` | `INACTIVE` | `ARCHIVED`).
  6. **Certification** — one `coffee_certifications` row on the published coffee with `name` and
     `expires_at`, and **`file_asset_id` left NULL** (it is nullable, so no Storage asset is
     invented). Its `certificate_number` carries a canary (see 7), because the DTO contract's
     default is *not* to publish that field.
  7. **Private canaries** — unique sentinel strings placed **only** in values that must never reach a
     public surface: the `description` of each non-public coffee and origin (proving status gating),
     and `coffee_certifications.certificate_number` (proving field-level allowlisting). The
     owner-organization canary is **already provided** by 001's seeded organization display names —
     no new row is needed.
  **Explicitly NOT created**: `coffee_media` (its `file_asset_id` is **NOT NULL**, so a row would
  require inventing a Storage asset — forbidden; MEDIA-01 placeholders cover this instead),
  `coffee_offers`, `coffee_lots`, member listing prices, `warehouses`, reference-price rows,
  RFQ records, and any commission configuration.
  **Discipline inherited from 001**: fixed deterministic UUIDs/slugs, idempotent upsert by those
  keys, safe repeated execution, exact teardown by the same keys, canonical-state restoration in
  finally-style cleanup, service-role confined to the seed script, **no schema change, no RLS
  change, no permanent production-business records**. Note the documented side effect: `coffees`
  carries `trg_audit_coffees` → `write_audit_log`, so seeding appends append-only `audit_logs` rows
  that teardown deliberately does not delete (same rule 001 recorded).
  - Req: FR-003, FR-004, FR-005, SC-002 | Depends: —
  - Verify (**executed when this task is implemented, not now**): setup succeeds; a second identical run creates no duplicates (idempotent); through the **anonymous** public boundary the `PUBLISHED` coffee and `ACTIVE` origin are readable while the `DRAFT`/`ARCHIVED` coffees and `INACTIVE`/`ARCHIVED` origins are **not**; every canary value is retrievable for leakage assertions via the privileged path yet appears in no public DTO; teardown removes exactly these rows and restores canonical state; re-running after teardown recreates byte-identical deterministic fixtures; `git diff` shows **no** schema/RLS/function/trigger change and no migration
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: every runtime assertion in Phases 2, 4, 8 and 11–13 rests on this data being deterministic and correctly gated; a fixture that is publicly readable when it should not be would silently invalidate the leakage and status-gating proofs rather than fail loudly.

- [x] T007 [P] Create `lib/public/coffees.ts` — `unstable_cache` reads (tags `public-coffees`,
  `public-coffee:{slug}`, `revalidate: 3600`) of `coffees` (PUBLISHED only) joined to
  type/variety/processing/packaging/tags/certifications/media-metadata, using **explicit column
  allowlists**, returning a named public DTO.
  - Req: FR-003, FR-004, FR-010, FR-022, FR-024 | Depends: T006a
  - Verify: no `select("*")` and no raw-row spread; the DTO type contains no denylisted field (`contracts/public-dto-allowlist.md` §3); a `DRAFT` slug returns null; `grep -n "coffee_lots\|coffee_offers\|warehouses" lib/public/coffees.ts` returns nothing
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the most leak-prone module on the platform's only anonymous surface — the DTO shape defined here is what every public page can ever expose.

- [x] T008 [P] Create `lib/public/origins.ts` — `unstable_cache` reads (tags `public-origins`,
  `public-origin:{slug}`, `revalidate: 3600`) of `origins` (ACTIVE) + `regions`, allowlisted columns,
  returning a public DTO; parent/region resolved to `name`+`slug`, never raw FKs.
  - Req: FR-003, FR-005, FR-010 | Depends: T006a
  - Verify: an `INACTIVE`/`ARCHIVED` origin returns null; no `created_by`/`created_at` in the DTO; no raw FK emitted
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: same discipline as T007 over a smaller table set.

- [x] T009 [P] Create `lib/public/taxonomy.ts` — `unstable_cache` reads (tag `public-taxonomy`,
  `revalidate: 86400`) of `coffee_types`, `coffee_varieties`, `processing_methods`,
  `packaging_types`, `tags` — `name`/`slug` only.
  - Req: FR-003, FR-010 | Depends: —
  - Verify: the DTO exposes only `name` and `slug`; `created_by` appears nowhere
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small reference reads with an unambiguous allowlist.

- [x] T010 Write `tests/public/canary-leakage.test.ts` — the **primary** boundary proof. Assert that
  **no canary value reaches the public DTO output**, using only canaries this feature may legitimately
  obtain (`contracts/public-dto-allowlist.md` §5):
  (a) the **non-public row sentinels** seeded by T006a — the `description` of each `DRAFT`/`ARCHIVED`
  coffee and each `INACTIVE`/`ARCHIVED` origin (proves status gating);
  (b) `coffee_certifications.certificate_number` from T006a (proves field-level allowlisting of a
  column RLS *does* expose but the DTO contract withholds by default);
  (c) the **owner-organization display name already seeded by Feature 001's fixtures** — no new row
  is created for this.
  **Canaries in private business tables — contract price, reserved quantity, warehouse address,
  commission percentage — are deliberately NOT seeded here**: Feature 002 must not create
  `coffee_offers`, `coffee_lots`, `warehouses`, order/financial or commission rows. Those field
  *names* remain covered by T011's structural denylist check, and value-level canaries for them
  belong to the features that own those tables (006/007/008).
  - Req: SEC-002, SEC-005, SC-002 | Depends: T006a, T007, T008, T009
  - Verify: `npm test -- canary-leakage` passes; deliberately adding a private field to a DTO makes it fail; no canary requires a table outside T006a's permitted row set
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this test, not the field-name check, is what actually guarantees the public/private boundary — it follows values rather than labels, and its canary set must stay within what 002 is allowed to create.

- [x] T011 Write `tests/public/dto-structure.test.ts` — the **secondary** structural check: no
  denylisted field *name* in any `lib/public/*` export, no `select("*")`/implicit-all select, and no
  denylisted table name anywhere under `lib/public/`.
  - Req: FR-003, SEC-005, SC-002 | Depends: T007, T008, T009
  - Verify: `npm test -- dto-structure` passes and fails if `select("*")` or a denylisted table is introduced
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: cheap, fast regression net that catches the mistake before the canary test has to.

**Checkpoint**: every later page consumes DTOs; leakage is proven by value, not asserted.

---

## Phase 3 — Homepage (in place)

- [x] T012 [PS1] Build `components/public/hero.tsx` and `intent-cards.tsx` — Dubai-based regional
  supply message, two clear actions, three intents (Source coffee / Explore available coffee / Trade
  with Hills), per the design guidance. No retail-café language.
  - Req: FR-021, PS1 | Depends: T000, T001
  - Verify: renders at mobile/tablet/desktop without breakage; copy comes from T000's dictionary; content is original Hills work, not adapted from a reference site
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: component work guided by an explicit brief, with an originality constraint.

- [x] T013 [PS1] Compose the homepage **in place** in `src/app/page.tsx` from `PublicShell` +
  section blocks (hero, intent cards, credibility, featured coffee/origins, RFQ CTA). The file stays
  at its current path.
  - Req: FR-001, FR-021, FR-023, PS1, PS2 | Depends: T001, T002, T012, T007, T008
  - Verify: `git diff --summary` shows `src/app/page.tsx` **modified, never renamed**; the header/footer are identical to those on a `(public)` route; the documented section order renders
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: edits a Constitution-locked file and must prove shell parity with the route group — the specific defect this restructure exists to prevent.

---

## Phase 4 — Coffee & origin routes

- [x] T014 [PS1] Implement `src/app/(public)/coffee/page.tsx` — server-rendered index of published
  coffees **including its `generateMetadata`** (title, description, canonical, OG). Filters must not
  create indexable weak combinations.
  - Req: FR-002, FR-004, FR-006, FR-010, SC-001 | Depends: T000, T006a, T007, T003
  - Verify: repeat request serves the cached value; a `DRAFT` coffee never appears; initial HTML contains title, description and canonical in trailing-slash form; **`/coffee/` resolves and its URL contains no `(public)` segment** (the runtime route-group assertion deferred here from T003, which cannot run it before this route exists)
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: standard listing page; metadata is folded in because it edits the same file (it was incorrectly a separate parallel task before).

- [x] T015 [PS1] Implement `src/app/(public)/coffee/[slug]/page.tsx` — name, description, origin
  (region/country), type, variety, processing method, packaging, tags, certifications, media
  placeholders, traceability framing and a visible RFQ CTA; **`generateMetadata` in the same file**;
  `notFound()` for any non-`PUBLISHED` record.
  **Must not render or imply**: grade, cup score, crop year, quantity, MOQ, availability, seller
  identity or any price (not publicly available — `contracts/public-dto-allowlist.md` §4).
  - Req: FR-004, FR-006, FR-022, FR-024, SC-001, PS1 | Depends: T000, T006a, T007, T003, T006
  - Verify: a non-published slug returns 404 identical to an unknown slug; no denylisted value appears in HTML or the RSC payload; no quality/quantity/price element exists
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the single most leak-prone page on the public site, and the one most likely to be "helpfully" enriched with member-only data.

- [x] T016 [PS1] Implement `src/app/(public)/origins/page.tsx` and `[slug]/page.tsx` with their
  `generateMetadata`; `notFound()` for non-`ACTIVE` origins; honest empty state when an origin has no
  published coffees.
  - Req: FR-002, FR-005, FR-006, SC-001 | Depends: T000, T006a, T008, T003
  - Verify: inactive origin → 404; an origin with zero published coffees renders an empty state, not an error; metadata present on both routes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mirrors the coffee routes against a simpler dataset.

---

## Phase 5 — Sourcing & portal entry

- [x] T017 [P] [PS2] Implement `src/app/(public)/sourcing/page.tsx` — supply credibility (sourcing
  relationships, custody, logistics, quality documentation) from **reviewed 002-owned copy only**.
  **Must not query `warehouses`** or derive any claim from warehouse rows.
  - Req: FR-002, FR-003, FR-021, PS2 | Depends: T000, T003
  - Verify: `grep -n "warehouses" src/app/\(public\)/sourcing lib/public` returns nothing; every claim traces to supplied copy; renders at the article measure
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the page most tempting to back with real warehouse data, which would publish owner identity and exact locations.

- [x] T018 [P] [PS4] Implement `src/app/(public)/portal-entry/page.tsx` — an explicit, honest
  placeholder for Trading Portal / membership entry until Feature 003 exists. States plainly that
  membership and sign-in are not yet open and offers the commercial contact route.
  **Must not**: render a non-functional sign-in form, imply account creation, or silently redirect
  to `/`. Document that Feature 003 owns the real destination.
  - Req: FR-016, PS4 | Depends: T000, T002, T003
  - Verify: both header entries resolve here; no form field, no auth call, no redirect to `/`; the page names 003 as the owning feature; no member data appears
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: technically trivial, but the honesty requirement is the whole point — a fake sign-in would be a deceptive dead end.

> `/knowledge/*` and `/legal/*` are **not built** — **CONTENT-01**. They are absent from navigation
> and from the sitemap. Do not create placeholder article or legal routes, and do not author legal
> wording.

---

## Phase 5.5 — Full Product UI Foundation & Visual System Freeze

**Task namespace**: `UIF-001`–`UIF-058`, maintained in
[`PHASE-5.5-TASKS.md`](./PHASE-5.5-TASKS.md). Plan:
[`PHASE-5.5-UI-FOUNDATION-PLAN.md`](./PHASE-5.5-UI-FOUNDATION-PLAN.md). Contract:
[`contracts/product-ui-foundation.md`](./contracts/product-ui-foundation.md).

Inserted here deliberately: Phase 6 onward builds on the finished visual system rather than
retrofitting it. Phase 5.5 establishes the UI foundation for the **whole product** — Public, Member
(Buyer + Seller additive), and Admin — plus Light/Dark, LTR/RTL, EN/العربية, the 96rem product grid
and the shared component system.

> **UI FOUNDATION READY ≠ BUSINESS FEATURE COMPLETE.** Phase 5.5 creates no business capability, no
> authorization logic and no fabricated operational data. Features 003–012 keep every functional
> responsibility.

**Reconciliation with tasks in this file — none of these is completed by Phase 5.5:**

| Task | Phase 5.5 supplies | This task remains, redefined as |
|---|---|---|
| **T033** | The reusable *visual* state system (UIF-013, UIF-034) | Per-route **behavioural** state coverage verification |
| **T034** | The motion *foundation* (UIF-015) | Per-route reveal/hover application + reduced-motion verification |
| **T035** | A minimal documented client-island set (UIF-047) | Unchanged — the audit still runs against the final tree |
| **T036** | RTL-correct primitives + Arabic typography (UIF-018, UIF-044) | Unchanged — still verifies every public layout |

---

## Phase 6 — RFQ (UI → validation → honest unavailable result)

Independent of Phases 3–4. Governed by [`contracts/rfq-contract.md`](./contracts/rfq-contract.md).

- [x] T019 [P] [PS3] Create the RFQ Zod schema in `lib/validation/rfq.ts` — the field set, length
  limits and required explicit consent from `contracts/rfq-contract.md` §2. One schema, imported by
  both client and server. **No disposable-email policy** (none is approved).
  - Req: FR-014, SEC-003 | Depends: —
  - Verify: schema rejects missing consent, malformed email and every over-length field; `grep -rniE "disposable|tempmail|blocklist" lib/validation/rfq.ts` returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical schema from an explicit, sourced field list.

- [x] T020 [PS3] Build `components/public/rfq-form.tsx` (React Hook Form + zodResolver against T019's
  schema, accessible labels, error association, preserved input) and
  `src/app/(public)/contact/page.tsx`.
  - Req: FR-014, FR-017, FR-029 | Depends: T000, T019, T003
  - Verify: every field has an associated label and error message; fully keyboard operable; invalid submission shows inline errors **without a page reload**; entered data survives a rejected submission
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: accessible form work over a defined schema, reusing 001's proven RHF + Server Action pattern.

- [x] T021 [PS3] Implement the RFQ Server Action in `src/app/(public)/contact/actions.ts`:
  validate → abuse safeguard → **stop at the blocked boundary** → safe error mapping. Returns the
  documented *unavailable* outcome for valid input; **never** `ok: true`. No shadow table, no
  browser storage, no service-role, no unapproved outbound destination, no cache revalidation.
  - Req: FR-014, SEC-003, SEC-004, SC-008 | Depends: T019
  - Verify: invalid input returns field errors with no side effect; valid input returns the unavailable outcome and **no success claim**; `grep -rniE "SERVICE_ROLE|localStorage|sessionStorage|fetch\(|webhook" src/app/\(public\)/contact` returns nothing; DB-BLOCK-02 and CRM-DEST-01 are cited in a code comment
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the discipline of *stopping at a blocker* and refusing to claim success is a judgment call with direct commercial-honesty consequences.

- [x] T022 [PS3] Add endpoint-local abuse safeguards to the RFQ action (input-size bounds, early
  shape rejection, per-instance in-memory throttle), documented in code as **best-effort,
  single-instance, non-durable**. Rejection discloses no threshold or counter.
  - Req: FR-015 | Depends: T021
  - Verify: exceeding the threshold rejects further submissions while normal page traffic is unaffected; the rejection message reveals nothing; `grep -rniE "redis|upstash" src lib` returns nothing; the code comment states the ABUSE-01 limitation rather than claiming distributed protection
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: the risk is overstating the protection, not writing the counter.

---

## Phase 7 — Reference-price presentation shell

- [x] T023 [P] [PS5] Build `components/public/reference-price.tsx` — the **unavailable state only**,
  plus the "reference information, not an offer" disclosure. Accepts a discriminated union so an
  unavailable value cannot be mistaken for a numeric one. **Does not query price tables.**
  - Req: FR-012, FR-013, SC-004 | Depends: T000, T001
  - Verify: default render shows the unavailable state with **no** number, source, timestamp or licence claim; `grep -n "price_sources\|price_observations\|price_differentials" lib/public components/public` returns nothing; no fixture or example numeric price exists
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: the failure path *is* the feature here — the temptation to render a plausible sample number is exactly what would create a false commercial claim.

---

## Phase 8 — SEO technical layer

- [x] T024 [PS6] Implement `lib/public/seo.ts` — metadata builders and **safely serialized** JSON-LD
  (`@graph`) for organisation, coffee and origin entities. Inline structured data escapes `<` and
  the `</script` sequence (or uses an equivalent approved safe serializer).
  - Req: FR-007, FR-025, SEC-004, SEC-005 | Depends: T007, T008
  - Verify: a `</script><script>alert(1)</script>` payload in a coffee name/description cannot break out of the inline script; output contains no private field and no secret
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: an XSS sink on the anonymous surface — untrusted catalogue text flows straight into an inline script tag.

- [x] T025 [PS6] Attach structured data to the coffee and origin routes via T024's builders.
  **Not `[P]`**: it edits the route files owned by T014/T015/T016.
  - Req: FR-007, FR-025 | Depends: T024, T014, T015, T016
  - Verify: structured data validates on one coffee and one origin page and contains no private field
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mechanical wiring whose only hazard is file contention — hence sequenced, not parallel.

- [x] T026 [PS6] Implement `src/app/sitemap.ts` from the public read layer (published/active content
  only), emitting **canonical trailing-slash URLs** that match each page's canonical, with
  splitting/pagination if the catalogue grows large. Excludes `/knowledge/*` and `/legal/*`
  (CONTENT-01).
  - Req: FR-008, FR-026, SC-003 | Depends: T007, T008, T004
  - Verify: zero private routes; every URL in trailing-slash form and identical to the page's own canonical; no blocked content route appears
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: data-driven generation whose correctness is judged by exact agreement with canonicals.

- [x] T027 [P] [PS6] Implement `src/app/robots.ts` disallowing `/dashboard`, `/dashboard-admin`,
  **`/foundation-status`**, **`/internal-test/`** (the T031a cache-proof namespace — the exact path
  fixed in `contracts/public-cache-policy.md` §5.3), and any other private or non-product prefix.
  `/foundation-status` is Feature 001's cache-proof route: it is live, crawlable and currently has
  **no** `robots` metadata, so once this feature makes the site crawlable it would otherwise become
  indexable. It exposes no private data, but it is internal infrastructure and must not appear in
  search results.
  - Req: FR-008, FR-009, SC-003 | Depends: —
  - Verify: `GET /robots.txt` disallows `/dashboard`, `/dashboard-admin`, `/foundation-status` and `/internal-test/`; none of them appears in `sitemap.xml`
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small, explicit configuration file — the only subtlety is remembering the two non-product routes that are easy to overlook.

- [x] T028 [PS6] Verify — and only if genuinely absent, narrowly add — route-level non-indexable
  metadata so exclusion never depends on `robots.txt` alone (**defence in depth**), on:
  (a) the existing `/dashboard` and `/dashboard-admin` layouts — 001 already sets
  `robots: { index: false, follow: false }`; **confirm before editing**;
  (b) **`src/app/foundation-status/page.tsx`** — 001's cache-proof route, which today exports only a
  `title` and therefore has **no** noindex directive. Add
  `robots: { index: false, follow: false }` to its existing `metadata` export.
  **These are Feature 001 files: every edit is metadata-only and MUST NOT alter their authorization
  guards or the cache-proof behaviour.** Re-run the authorization regression check afterwards.
  - Req: FR-009, SC-003, SC-010 | Depends: T004
  - Verify: all three routes emit non-indexable metadata; `git diff` on each file shows metadata-only changes (no guard predicate, no `unstable_cache`/`revalidateTag` change in `foundation-status`); anonymous and cross-surface denial still hold on both protected surfaces; 001's `/foundation-status` cache proof still behaves as before
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: a small edit inside verified, security- and proof-critical files; the risk is collateral damage to guards or to 001's cache proof, not the metadata itself.

- [x] T029 [PS6] Implement the supported public route lifecycle: **200 for active/public, 404 for
  unknown/non-public**, with non-public indistinguishable from never-existed. **Do not implement or
  fake 301/308/410** — record LIFE-01 instead.
  - Req: FR-027, PS6 | Depends: T015, T016
  - Verify: published → 200; `DRAFT`/`ARCHIVED`/unknown → identical 404; `grep -rn "permanentRedirect\|410\|Gone" src/app/\(public\)` returns nothing; LIFE-01 is cited in a code comment
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: the correct behaviour is mostly *restraint* — the SEO instinct to emit 410/301 here would assert facts the database cannot support.

---

## Phase 9 — Cache registration & proof

- [x] T030 Confirm every `lib/public/*` read declares its tag and `revalidate` ceiling, and that the
  register in `contracts/public-cache-policy.md` §3 matches the code exactly — including the honest
  "no mutation owner yet" fallback column. **Then add 002's five tags as rows to the platform-wide
  table in `specs/001-platform-foundation/contracts/cache-policy-contract.md`**, which that contract
  designates as the register "every later feature adds a row to" — keeping 001 the single
  platform-wide authority and 002's contract a subordinate per-feature register
  (`contracts/public-cache-policy.md` §0).
  - Req: FR-010, FR-011 | Depends: T007, T008, T009
  - Verify: every exported read declares a tag and a TTL; every tag appears in **both** 002's register and 001's platform table, with no contradiction between them; the register claims no invalidation that does not exist; the edit to 001's contract adds rows only — it does not restate or fork 001's API/category rules
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: small, but it is what keeps one platform-wide cache authority instead of two competing ones — and the register must not overstate a capability Feature 010 has not built.

- [x] T031a Build the **cache-proof route** exactly as specified in
  `contracts/public-cache-policy.md` §5.3 — that section is the complete design; implement it
  verbatim rather than reinterpreting it.
  **File**: `src/app/internal-test/cache-proof/route.ts` · **URL**: `/internal-test/cache-proof/` ·
  **Methods**: `GET` (read stamp) and `POST` (revalidate) only ·
  **Env**: `CACHE_PROOF_ENABLED` must be exactly `"true"` **and** `CACHE_PROOF_SECRET` must match —
  both server-only, never `NEXT_PUBLIC_*`. **`NODE_ENV` is not the gate** (§5.3.2) ·
  **Header**: `x-cache-proof-secret`.
  `GET ?tag=<tag>` → `200 { ok, tag, stamp: { computedAt, token } }`;
  `POST { "tag": "<tag>" }` → `200 { ok, tag, revalidatedAt }` after
  `revalidateTag(tag, { expire: 0 })`;
  tag outside the allowlist → `400 tag_not_allowed`; malformed body → `400 bad_request`;
  missing/wrong secret → **`404`, empty body** (never 401/403); `CACHE_PROOF_ENABLED !== "true"` →
  **`404`** checked **first**, before any header, body or secret is read. **Every** response, 404s
  included, carries `X-Robots-Tag: noindex, nofollow`.
  This flag — not `NODE_ENV` — is what keeps the route absent from deployed production while still
  letting T031 run the proof against a locally-started production build (§5.3.2).
  **Allowlist**: `public-coffees`, `public-origins`, `public-taxonomy` (exact) plus
  `^public-coffee:[a-z0-9-]{1,100}$` and `^public-origin:[a-z0-9-]{1,100}$`. No arbitrary tag, path
  or function input; the handler validates and calls `revalidateTag` — nothing else.
  The namespace deliberately does **not** start with `_`: Next.js excludes `_folder` from routing
  (the trap 001 recorded for `/foundation-status`).
  **An anonymous or publicly-reachable cache-purge route MUST NOT be created** — 001's public
  `/foundation-status` button pattern must not be copied onto catalogue tags (§5.1).
  - Req: FR-010, FR-031, SEC-001, SEC-005, SC-009 | Depends: T030
  - Verify (against a locally-started production build): empty `404` with `CACHE_PROOF_ENABLED` unset **and** with `CACHE_PROOF_ENABLED=false`; empty `404` with the flag on but a missing **or** wrong `x-cache-proof-secret`; `400 tag_not_allowed` for `public-orders` and for `public-coffee:../x`; `X-Robots-Tag: noindex, nofollow` present on success **and** on 404 responses; `grep -rnE "CACHE_PROOF_(ENABLED|SECRET)" .next/static` returns nothing; the handler contains no `SERVICE_ROLE` and no `getRequestIdentity`, and returns no DTO or row content; `grep -rn "revalidateTag" src/app/\(public\) src/app/page.tsx` returns nothing
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this is the one place 002 could ship a public cache-purge/DoS vector; every guard is load-bearing, and the contract above leaves nothing to interpretation.

- [x] T031 Prove real cache behaviour against a **locally-started production build** — `npm run build`,
  then `next start` with `CACHE_PROOF_ENABLED=true` and `CACHE_PROOF_SECRET` set in the server
  environment, run the proof, stop the server (`contracts/public-cache-policy.md` §5.3.2). Per
  §5.2/§5.4: read a public page twice → **identical**
  `computedAt`/token (cache hit); invoke revalidation through T031a's guarded route → next read
  returns a **different** one. The stamp comes from inside the cache entry (T007–T009), so the proof
  needs **no catalogue mutation and no seeded catalogue row**. Mirrors 001's proven
  `/foundation-status` read → same → revalidate → different pattern.
  - Req: FR-010, FR-031, SC-009 | Depends: T030, T031a, T014
  - Verify (**A–D against one locally-started production build**, `contracts/public-cache-policy.md` §5.3.1/§5.3.2 — server started with `CACHE_PROOF_ENABLED=true`, stopped afterwards): **A** `GET /internal-test/cache-proof/?tag=public-coffees` with `x-cache-proof-secret` → stamp **S1**; **B** identical `GET` → stamp **S1** byte-identical; **C** `POST /internal-test/cache-proof/` `{"tag":"public-coffees"}` → `200`; **D** `GET` again → stamp **S2**, `S2 ≠ S1`. A run where B≠A or D=A is a failed proof and is investigated, not retried. Separately: the `computedAt`/`token` pair appears in no public page HTML, RSC payload, metadata, JSON-LD or sitemap
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: a cache proof that never observes a changed value has proven nothing; 001 showed this needs a real running server and a value that genuinely recomputes.

- [x] T032 Verify no public cache entry varies by user/session/organization and no private route uses
  these tags.
  - Req: FR-011, SEC-002, SC-002 | Depends: T030
  - Verify: `grep -rn "getRequestIdentity" src/app/\(public\) src/app/page.tsx lib/public` returns nothing; `grep -rln "unstable_cache" src/app/dashboard src/app/dashboard-admin` returns nothing; no cache key contains a user/session/org value
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical structural check with an unambiguous signal.

---

## Phase 10 — Runtime states, motion, accessibility, RTL

- [x] T033 Implement the public runtime states across every owned route — loading, empty, error,
  unavailable, not-found, retry, and blocked-sub-flow — reusing 001's `StateScreen` where
  appropriate. "Stale" is rendered **only** where genuinely supported (today: nowhere).
  - Req: FR-029, PS1, PS5 | Depends: T013, T014, T015, T016, T020, T023
  - Verify: each state renders for a seeded condition; no state fabricates data; blocked sub-flows explain the limitation honestly rather than appearing broken
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: broad and easy to under-deliver; honest blocked/unavailable states are a stated SRS design requirement, not polish.

- [x] T034 Apply restrained Motion reveals/hover states with `prefers-reduced-motion` support. Do
  **not** initialise Lenis.
  - **Amended 2026-09-09 (MOTION-GSAP-01).** GSAP is approved for Phase 5.5 visual/experience work
    (product-owner decision; Constitution XIII already permitted it with justification). The earlier
    "do not initialise GSAP" clause is superseded. **Lenis remains uninitialised.** Ownership rules:
    `contracts/product-ui-foundation.md` §13.1–§13.3. Foundation supplied by `UIF-015` (Motion + CSS)
    and `UIF-053` (scoped GSAP + `ANIMATION-OWNERSHIP` registry); leak/cleanup proof is `UIF-058`.
  - Req: FR-019 | Depends: T013, T014, T016
  - Verify: `grep -rn "lenis" src components` returns nothing; every GSAP call site is inside a
    ref-scoped `gsap.context()` reverted on unmount; no property is written by two engines;
    reduced-motion removes all animation
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Low
  - Why: the requirement is restraint; the risk is over-animating, not technical difficulty.

- [x] T035 Audit and minimise client components across public routes; convert any non-interactive
  island back to a Server Component; ensure no unnecessary DTO is hydrated and no private value
  enters the RSC payload.
  - Req: FR-020, SEC-005, SC-005 | Depends: T033
  - Verify: `grep -rln "use client" src/app/\(public\) src/app/page.tsx components/public` lists only genuinely interactive components, each with a stated reason; no DTO is passed to a client component beyond what it renders
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: requires judgment about which islands genuinely need the client, across many files, with a leakage consequence.

- [x] T036 RTL and long-string resilience pass across all public layouts (logical properties only).
  - Req: FR-018, SC-007 | Depends: T033
  - Verify: `grep -rnE "text-left|text-right|[^-]pl-|[^-]pr-|margin-left|margin-right" src/app/\(public\) src/app/page.tsx components/public` returns nothing; `dir="rtl"` renders without breakage
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mechanical but broad — one physical property breaks the guarantee.

---

## Phase 11 — Automated tests

**Catalogue data**: every runtime assertion in this phase runs against the deterministic
fixtures from **T006a** (reached transitively through T007/T008/T014/T015/T016). Do not seed ad-hoc
catalogue rows inside a test, and do not assert against whatever data happens to be in the database.

- [x] T037 [P] Write `tests/public/leakage-surfaces.test.ts` — extend T010's canaries **beyond the
  DTO** to every emitted surface: SSR HTML, the RSC/Flight payload, `generateMetadata` output,
  JSON-LD, `sitemap.xml`, and the fully rendered page.
  - Req: SEC-005, SC-002 | Depends: T010, T015, T024, T025, T026
  - Verify: `npm test -- leakage-surfaces` passes; a canary planted in any one surface fails the suite
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: Feature 001 proved a layout-level guard can look correct while the RSC payload still carries the data — the same class of defect is the top risk here.

- [x] T038 [P] Write `tests/public/metadata.test.ts` — title/description/canonical/OG on **every**
  owned public route: `/`, coffee index, coffee detail, origins index, origin detail, sourcing,
  contact, portal entry. Blocked routes are asserted **absent**, not asserted broken.
  - Req: FR-006, SC-001 | Depends: T006a, T013, T014, T015, T016, T017, T018, T020
  - Verify: `npm test -- metadata` passes for all eight routes; `/knowledge/*` and `/legal/*` are documented as intentionally unavailable
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Low
  - Why: mechanical assertions, but coverage must be exhaustive per route rather than sampled.

- [x] T039 [P] Write `tests/public/status-lifecycle.test.ts` — published coffee → 200; every
  non-`PUBLISHED` status and unknown slug → identical 404; active origin → 200; inactive/archived →
  404; trailing-slash redirect behaviour. **No 301/410 assertions** (LIFE-01).
  - Req: FR-004, FR-005, FR-026, FR-027 | Depends: T006a, T029, T004
  - Verify: `npm test -- status-lifecycle` passes; no test asserts an unimplemented lifecycle code
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused behavioural tests with an explicit instruction about what *not* to assert.

- [x] T040 [P] Write `tests/public/seo-boundary.test.ts` — sitemap excludes every non-public route
  and matches canonicals; robots disallows `/dashboard`, `/dashboard-admin`, **`/foundation-status`**
  and **`/internal-test/`**; **noindex metadata present on all three of** `/dashboard`,
  `/dashboard-admin` and `/foundation-status` (**regression guard for T028**); and the cache-proof
  route at `/internal-test/cache-proof/` returns `X-Robots-Tag: noindex, nofollow` and is absent
  from `sitemap.xml`, and — with `CACHE_PROOF_ENABLED` unset, as in a normal build — returns an empty
  `404` (**regression guard for T031a**).
  - Req: FR-008, FR-009, SC-003 | Depends: T026, T027, T028, T031a
  - Verify: `npm test -- seo-boundary` passes; removing the noindex metadata from **any** of the three routes fails the suite; adding any of them — or `/internal-test/cache-proof/` — to the sitemap fails the suite; removing `Disallow: /internal-test/` fails the suite
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mechanical assertions that also pin a security-adjacent property in Feature 001's files — and the one guard that stops an internal proof route drifting back into the index.

- [x] T041 [P] Write `tests/public/json-ld.test.ts` — structured-data shape, an **XSS payload** that
  must not break out of the inline script, and absence of any private field.
  - Req: FR-007, FR-025, SEC-004, SEC-005 | Depends: T024
  - Verify: `npm test -- json-ld` passes all three cases; removing the escaping fails the XSS case
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: directly tests an injection sink; a passing shape test alone would give false confidence.

- [x] T042 Write `tests/public/rfq.test.ts` — invalid input, missing consent, over-length input,
  abuse-safeguard triggering, and the honest *unavailable* result for valid input. Asserts the
  action never returns success and never escapes its boundary. Includes an escaping check for
  submitted `<script>` content (SEC-004).
  - Req: FR-014, FR-015, SEC-003, SEC-004, SC-008 | Depends: T021, T022
  - Verify: `npm test -- rfq` passes; **no test asserts persistence** while DB-BLOCK-02 stands; a test that asserted "submitted successfully" would fail by design
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: must prove security behaviour *and* commercial honesty without asserting a capability the database does not provide.

- [x] T043 [P] Write `tests/public/reference-price.test.tsx` — the unavailable state renders with no
  number, source, timestamp or licence claim, and the "not an offer" disclosure is present.
  - Req: FR-012, FR-013, SC-004 | Depends: T023
  - Verify: `npm test -- reference-price` passes; no numeric price fixture exists in the suite
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: one well-defined render case whose value is in what it refuses to contain.

- [x] T044 [P] Write `tests/public/media-placeholder.test.tsx` — placeholders render with stable
  dimensions and no constructed file URL.
  - Req: FR-028 | Depends: T006
  - Verify: `npm test -- media-placeholder` passes; no test or component builds a Storage URL
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small focused component test.

---

## Phase 12 — Real-browser, accessibility & performance verification

**Catalogue data**: every runtime assertion in this phase runs against the deterministic
fixtures from **T006a** (reached transitively through T007/T008/T014/T015/T016). Do not seed ad-hoc
catalogue rows inside a test, and do not assert against whatever data happens to be in the database.

**jsdom does not prove browser layout.** These tasks run against a real browser.

- [x] T045 Establish the real-browser verification harness under `tests/browser/` using the
  **CDP-over-installed-Chrome** technique Feature 001 proved (Node's built-in `WebSocket`/`fetch`,
  no heavyweight new dependency). Set a realistic viewport before interacting.
  - Req: SC-005, SC-006, SC-007 | Depends: T033
  - Verify: the harness loads a public page in a real browser, reads the live DOM, and reports a deterministic result; it adds no runtime dependency
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: 001 already hit the real pitfalls here (default viewport placing controls off-screen, streaming not settled at load) — reuse that hard-won approach rather than rediscovering it.

- [x] T046 Real-browser responsive verification at mobile, tablet and desktop breakpoints across
  every owned public route, including layout stability (no shift on media placeholder load).
  - Req: FR-018, SC-005, SC-007 | Depends: T045, T036
  - Verify: no horizontal overflow, no overlapping content and no layout shift at any of the three breakpoints on any route
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: broad but mechanical once the harness exists.

- [x] T047 Real-browser RTL and long-string verification: `dir="rtl"` with long strings across every
  owned public route.
  - Req: FR-018, SC-007 | Depends: T045, T036
  - Verify: no breakage, clipping or mirrored-icon errors under `dir="rtl"` with long content
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: the grep in T036 proves the CSS discipline; only a browser proves the result.

- [x] T048 Real-browser accessibility verification against **WCAG 2.2 AA**: keyboard traversal
  reaching every CTA, visible focus indicators, semantic landmarks, heading order, form label/error
  association, contrast against Hills tokens, and `prefers-reduced-motion`.
  Introduce an axe-style rule engine as a **dev-only dependency**, recorded explicitly here.
  - Req: FR-017, FR-019, SC-006 | Depends: T045, T033, T034
  - Verify: automated checks report no critical violations; manual keyboard traversal reaches every CTA with a visible focus ring; reduced-motion removes all animation in the browser
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: needs contextual judgment about semantics, and the dependency choice must be deliberate rather than assumed.

- [x] T049 Measure Core Web Vitals on a throttled mid-tier mobile profile against SC-005's
  thresholds (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1).
  - Req: SC-005 | Depends: T045, T035
  - Verify: measured values recorded per route; any route exceeding a threshold is reported, not rounded down; thresholds are the published CWV "good" values, not invented ones
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: measurement discipline — the failure mode is reporting a number nobody actually measured.

- [x] T050 Verify meaningful server-rendered content with **JavaScript disabled**: primary content,
  navigation and CTAs work on every owned public route.
  - Req: FR-006, FR-020, PS1 | Depends: T045, T035
  - Verify: with JS disabled, each route renders its primary content and every priority anchor is followable
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: the crawler/no-JS guarantee the SEO architecture depends on.

---

## Phase 13 — Verification & closure

- [ ] T051 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: SC-011 | Depends: T000, T001, T002, T003, T004, T006, T006a, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023, T024, T025, T026, T027, T028, T029, T030, T031a, T031, T032, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048, T049, T050
  - Verify: typecheck/test/build exit 0; lint shows **zero new findings from this feature**, with the pre-existing `docs/claude-design` baseline (124 errors / 148 warnings) unchanged — that baseline is **not** required to reach zero
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution against an explicitly-scoped baseline.

- [ ] T052 Manual leakage sweep: view source **and the RSC payload** on homepage, coffee detail,
  origin detail, sourcing and contact; confirm zero private values.
  - Req: SC-002, FR-022 | Depends: T006a, T051
  - Verify: no owner identity, contract price, private quantity, warehouse location, commission value or member data appears in any inspected surface
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: a judgment-based compliance sweep against SEO-APP-02 where a miss is release-blocking.

- [ ] T053 Confirm locked root files are unmoved: `src/app/page.tsx`, `src/app/layout.tsx` and
  `src/app/globals.css` remain at their existing paths. In-place edits are permitted; relocation is
  not.
  - Req: FR-001 | Depends: T051
  - Verify: `git diff --summary` shows **no rename** for any of the three; each may legitimately show as modified
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical structural git check — corrected from the earlier version, which wrongly implied only `page.tsx` could be touched.

- [ ] T054 Confirm zero Redis/Upstash/external-cache references, no Cache Components adoption, and no
  service-role usage in this feature.
  - Req: SEC-001, FR-010, Constitution XI | Depends: T051
  - Verify: `grep -rniE "redis|upstash|SERVICE_ROLE" src/app lib components` returns nothing for this feature's files; `grep -rn "use cache\|cacheLife(\|cacheTag(\|updateTag(\|cacheComponents" src lib next.config.ts` returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical grep verification of two locked constitutional rules.

- [ ] T055 Final Feature 001 authorization regression confirmation after all shared-config and
  metadata edits (`trailingSlash`, dashboard noindex).
  - Req: SC-010, FR-009, FR-026 | Depends: T051
  - Verify (**re-run the full both-forms matrix from T004**): for each of `/dashboard`, `/dashboard/`, `/dashboard/settings`, `/dashboard/settings/`, `/dashboard-admin`, `/dashboard-admin/` — anonymous denied; `buyer-only` denied on the admin forms; `warehouse-admin` denied on the member forms; authorized access still succeeds on its own surface. No trailing-slash redirect produces an authorization bypass, leaks protected content, or yields an indexable response. **001's guard predicates are unchanged in `git diff`** — this planning pass and this feature must not alter them
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this feature touches shared config and two verified security files — the closure gate must re-prove the boundary, not assume it survived.

- [ ] T057 **Public copy architecture closure check** — confirm Feature 002's user-facing copy did not
  bypass T000's dictionary, per
  [`contracts/public-copy-architecture.md`](./contracts/public-copy-architecture.md) §4. Run it at
  closure, because most consuming components do not exist until later phases.
  - Req: FR-018, FR-030, SC-012 | Depends: T000, T051
  - Verify: no user-facing string literal appears directly in JSX text, `alt`, `title`, `placeholder`, `aria-label`, or a state/error message under `src/app/(public)`, `src/app/page.tsx` or `components/public` — each resolves through `lib/public/copy`; **technical constants are explicitly out of scope** (route paths, cache tags, HTML ids, `data-*`, test ids, class names, header names) and must not be forced into the dictionary to make this pass; the dictionary has no unused key; `grep -rn "use client" lib/public/copy` returns nothing and it imports neither `react` nor `i18next`; `grep -rnE "initReactI18next|i18next\.init" lib src` matches only `lib/i18n/config.ts`
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: the copy architecture only holds if nothing quietly bypassed it, and the judgment call — copy versus technical constant — needs a human-grade distinction rather than a blunt string sweep.

- [ ] T056 Record remaining blockers (DB-BLOCK-02, CRM-DEST-01, PRICE-011, CONTENT-01, LIFE-01,
  ABUSE-01, MEDIA-01) in the handoff notes and confirm the roadmap row for 002 is accurate. Confirm
  no blocker was silently resolved.
  - Req: spec Blockers | Depends: T051, T052, T053, T054, T055, T057
  - Verify: `docs/architecture/IMPLEMENTATION-ROADMAP.md` reflects the true state; every blocker still recorded with its true severity; no capability is claimed that was not built
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: honest status reporting across features is continuity-critical judgment, and seven blockers is a lot to report accurately.

---

## Security requirement traceability

Direct task coverage — no requirement relies on implicit coverage.

| Requirement | Tasks |
|---|---|
| **SEC-001** — no service-role anywhere | T054 |
| **SEC-002** — no identity-varying cache; no `getRequestIdentity()` on public pages | T010, T032 |
| **SEC-003** — server-side Zod validation, safe errors | T019, T021, T042 |
| **SEC-004** — submitted content untrusted, never rendered unescaped, never interpolated into JSON-LD | **T021** (never echoes raw input), **T024** (safe JSON-LD serialisation), **T041** (XSS case), **T042** (escaping check) |
| **SEC-005** — no secret/privileged identifier in bundles, RSC payload, metadata or structured data | **T010** (DTO canaries), **T024** (structured-data output), **T035** (RSC payload/client boundary), **T037** (all emitted surfaces), **T041** (JSON-LD) |

## Blockers

| ID | Summary | Severity | Blocks | Explicitly does **not** block |
|---|---|---|---|---|
| **DB-BLOCK-02** | No approved destination for anonymous RFQ | BLOCKS SUB-FLOW | RFQ persistence + success outcome | T019–T022, T042 |
| **CRM-DEST-01** | No approved CRM destination | PRE-PRODUCTION BLOCKER | RFQ delivery to the business | all other 002 work |
| **PRICE-011** | Feature 011 unimplemented (+ DB-OPEN-08 conversions) | BLOCKS SUB-FLOW | numeric price, source, freshness, conversion | T023, T043 |
| **CONTENT-01** | No approved content source for knowledge/editorial/legal | BLOCKS SUB-FLOW | `/knowledge/*`, `/legal/*` | homepage, coffee, origins, sourcing, shell, RFQ, SEO |
| **LIFE-01** | No alias/redirect/tombstone capability | BLOCKS SUB-FLOW | 301/308/410 lifecycle | T029's 200/404 behaviour |
| **ABUSE-01** | No durable multi-instance abuse protection | PRE-PRODUCTION BLOCKER | production-grade abuse defence | T022's endpoint-local safeguards |
| **MEDIA-01** | No Storage bucket / public file delivery (DB-BLOCK-01) | BLOCKS SUB-FLOW | real public imagery | T006, T044 |
| **DB-BLOCK-10** | **RESOLVED 2026-09-09.** The `anon` role could not read the public catalogue: `is_platform_admin()` is executable only by `authenticated`/`service_role`, yet every catalogue table carried `catalog_admin_* FOR ALL TO public USING (is_platform_admin())`, so an anonymous `SELECT` aborted with `42501` instead of the policy evaluating false. Fixed by scoping those five policies to `authenticated` — least privilege preserved, no grant added to `anon`. Verified live: anonymous reads succeed on all Feature-002 catalogue tables, `DRAFT`/`ARCHIVED` and `INACTIVE`/`ARCHIVED` stay hidden, and anon gains no admin or write capability. | **RESOLVED** — no longer blocks | nothing | T006a, T007, T008, T010 all verified and complete |

**Opened by the Phase 5.5 plan (all four non-blocking):**

| ID | Type | Summary | Blocking? |
|---|---|---|---|
| **CONTENT-AR-01** | Content ownership | Approved Arabic **content** translation is unavailable. The EN/العربية *infrastructure* ships regardless; untranslated keys fall back to reviewed English and no Arabic business or legal claim is invented. | **No** |
| **I18N-ROUTE-01** | Deferred decision | Locale routing (`/ar/…`) + `hreflang` for Arabic SEO indexability is deliberately **not** adopted in Phase 5.5 (it would touch the canonical/SEO contract). Recorded trade-off, future decision. | **No** |
| **ASSET-REF-01** | Asset constraint | 9 of the 28 extracted `public/images/features/` crops carry a fabricated brand mark, burned-in board UI or burned-in English text; 6 more need a re-crop; none is hero-grade. Classified in the Phase 5.5 plan §11.1, enforced by `UIF-052`. | **No** |
| **MOTION-GSAP-01** | Approved amendment | GSAP approved for Phase 5.5 (2026-09-09), superseding T034's "do not initialise GSAP" clause. Motion and CSS remain approved. **Lenis remains not approved.** | **No** |

**COMMISSION-OPEN-01** is **not** a Feature 002 blocker. It is a Business/Finance decision owned by
Feature 008 and must not be addressed here.

**PLAN-GATE-002 is removed**: every planning correction from the previous Analyze has been applied
across spec.md, plan.md, tasks.md and the five companion contracts.

## Dependencies & parallelisation

**Phase 1 does not block everything** — the shell and the read layer are independent streams, and
blocked content work is fully separated:

- **Phase 1** (shell/config) and **Phase 2** (catalogue fixtures + read layer) run concurrently — disjoint files. Within Phase 2, **T006a comes first**: T007/T008 and every later runtime check read its data.
- **Phase 3** (homepage) needs the shell *and* the read layer.
- **Phase 4** (coffee/origins) needs the read layer + route group; independent of the homepage.
- **Phase 5**: sourcing needs only copy + route group; portal entry needs only the header.
- **Phase 6** (RFQ) needs only the schema + route group — independent of Phases 3, 4, 7, 8.
- **Phase 7** (reference-price shell) needs only the shell — independent of Feature 011.
- **Phase 8** (SEO) follows the routes it describes, not the whole feature.
- **Phases 9–11** follow the surfaces they verify.
- **Phase 12** (real browser) follows the pages; **Phase 13** follows everything.
- `/knowledge/*` and `/legal/*` appear nowhere — withheld under CONTENT-01, blocking nothing.

**Parallel-safe tasks** (disjoint files, no unmet dependency): T006, T007, T008, T009, T017,
T018, T019, T023, T027, T037, T038, T039, T040, T041, T043, T044 — **16 of 59**.
T031a is deliberately **not** parallel-safe: it gates T031 and creates a security-sensitive guarded
route that must be reviewed on its own.

**Corrections from the previous task list**: the old T013 (coffee metadata) and old T028 (structured
data attachment) were marked `[P]` while editing route files owned by other tasks. Metadata is now
folded into its own route task (T014/T015/T016), and structured-data attachment (T025) is explicitly
sequenced after those routes. Every remaining `[P]` was re-evaluated against the file it touches
after the restructure, not carried over.

## Task count

| Metric | Value |
|---|---|
| Total tasks | **60** (T000–T057, incl. T006a and T031a) |
| Phases | **13** |
| Parallel-safe | **16** |
| Tasks with both Codex and Claude metadata | **60 / 60** |
| Tasks checked | **52 / 60** — through Phase 12; Phase 13 onward remains unchecked |
| Phase 5.5 (`UIF-001`–`UIF-058`) | **58 tasks / 9 blocks**, tracked separately in [`PHASE-5.5-TASKS.md`](./PHASE-5.5-TASKS.md) — 0 checked |
