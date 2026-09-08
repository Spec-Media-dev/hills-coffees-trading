# Tasks: Public Website (002)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md),
`docs/architecture/DATABASE-CAPABILITY-MAP.md`, `.specify/memory/constitution.md` (v2.0.0),
`docs/design-guidance/Hills-Coffee-Website-Recommendations.md`, `docs/claude-design/`.

**Status**: all tasks unchecked — implementation NOT started.
**Prerequisite**: 001-platform-foundation implemented (tokens, state components, i18n, Supabase
client boundary, cache conventions, test tooling).

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: one-line reason for the difficulty/model choice
```

`[P]` = safe to run in parallel (disjoint files, no incomplete dependency). `[PSn]` maps to a
prioritized story in spec.md.

---

## Phase 1 — Public read layer (DTO boundary)

**Purpose**: create the single auditable boundary through which all public data flows, before any
page exists. This is what makes "no private leakage" verifiable by reading one directory.

- [ ] T001 [P] Create `lib/public/coffees.ts` — cached (`catalog-coffees`, `catalog-coffee:{slug}`) reads of `coffees` (PUBLISHED only) joined to type/variety/processing/packaging/media/tags, returning a public DTO with no owner, price-contract, quantity or warehouse-location fields.
  - Req: FR-003, FR-004, FR-010, FR-022 | Depends: —
  - Verify: the module's exported types contain no field sourced from a non-public table; a query for a `DRAFT` coffee returns null
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused data-access module against an explicit, already-mapped public schema.

- [ ] T002 [P] Create `lib/public/origins.ts` — cached (`catalog-origins`, `catalog-origin:{slug}`) reads of `origins` (ACTIVE) + `regions` + `origin_translations`, returning a public DTO.
  - Req: FR-003, FR-005, FR-010 | Depends: —
  - Verify: a query for an `INACTIVE`/`ARCHIVED` origin returns null
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: same shape as T001 against a smaller table set.

- [ ] T003 [P] Create `lib/public/content.ts` — cached (`public-content`) reads for knowledge/legal/editorial content from the approved public content source.
  - Req: FR-003, FR-010 | Depends: —
  - Verify: module reads only public tables listed in the capability map §4
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: straightforward content read with an explicit table allow-list.

- [ ] T004 Create `lib/public/prices.ts` — consumes 011's reference-price presentation contract; when 011 is unimplemented or a source's licence is not `APPROVED`, returns the documented unavailable/stale shape instead of querying ad hoc.
  - Req: FR-012, FR-013 | Depends: —
  - Verify: with no approved-licence source seeded, the module returns the unavailable shape and never a numeric value
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the honesty rules (never fabricate, never show stale as current) need careful reasoning, not just wiring.

- [ ] T005 Add an automated leakage guard test asserting every export of `lib/public/*` is free of private field names (`owner_organization_id`, `reserved_quantity_kg`, `unit_price_per_kg`, `buyer_*`, `kyb_*`, etc.) in `tests/public/leakage.test.ts`.
  - Req: SEC-002, SC-002 | Depends: T001, T002, T003, T004
  - Verify: `npm test -- leakage` passes and fails if a private field is added to any DTO
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: this test is the durable guarantee behind the platform's public/private boundary.

**Checkpoint**: every later page consumes DTOs, never raw queries.

---

## Phase 2 — Public shell & navigation

- [ ] T006 Create the public route group layout `src/app/(public)/layout.tsx` with shared header/footer slots and default metadata. Confirm this is a route *group* (URL unchanged) and that `src/app/layout.tsx` and `src/app/page.tsx` are not moved.
  - Req: FR-001, FR-002 | Depends: —
  - Verify: `git status` shows no rename/move of the three locked root files; `/coffee` resolves without a `(public)` segment in the URL
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: route-group semantics plus a Constitution-locked constraint to respect.

- [ ] T007 [P] Build `components/marketing/site-header.tsx` — crawlable HTML anchors for Coffee, Origins, Sourcing, Knowledge; primary CTA "Request an offer"; secondary Trading Portal / sign-in entry.
  - Req: FR-016, FR-021, PS2, PS4 | Depends: T006
  - Verify: every priority destination is a real `<a href>`; the portal entry is visually secondary to the primary CTA
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: component architecture plus adherence to documented navigation guidance.

- [ ] T008 [P] Build `components/marketing/site-footer.tsx` — secondary navigation, legal links, company information.
  - Req: FR-002, FR-021 | Depends: T006
  - Verify: all footer links resolve to existing public routes (no dead links)
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: straightforward presentational component.

---

## Phase 3 — Homepage (in place)

- [ ] T009 [PS1] Compose the homepage **in place** in `src/app/page.tsx` from `components/marketing/*` section blocks (hero, intent cards, credibility, featured coffee/origins, RFQ CTA), per the section-by-section design guidance. The file stays at its current path.
  - Req: FR-001, FR-021, PS1, PS2 | Depends: T007, T008, T001, T002
  - Verify: `git diff --summary` shows `src/app/page.tsx` modified, never renamed; the rendered page contains the documented section order
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: touches a Constitution-locked file and must translate design guidance into an original composition.

- [ ] T010 [P] [PS1] Build `components/marketing/hero.tsx` and `intent-cards.tsx` — Dubai-based regional supply message, two clear actions, three intents (Source coffee / Explore available coffee / Trade with Hills).
  - Req: FR-021, PS1 | Depends: T007
  - Verify: renders at mobile/tablet/desktop without layout breakage; no retail-café copy
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: normal component work guided by an explicit brief.

---

## Phase 4 — Coffee catalogue pages

- [ ] T011 [PS1] Implement `src/app/(public)/coffee/page.tsx` — server-rendered index of published coffees with filters that do not create indexable weak combinations.
  - Req: FR-002, FR-004, FR-006, FR-010 | Depends: T001, T006
  - Verify: page renders from cache on repeat request; a `DRAFT` coffee never appears
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: standard listing page over an existing DTO layer.

- [ ] T012 [PS1] Implement `src/app/(public)/coffee/[slug]/page.tsx` — factual specification (origin, process, variety, grade/cup context, packaging), traceability framing, visible RFQ CTA; `notFound()` for any non-`PUBLISHED` record.
  - Req: FR-004, FR-006, FR-022, PS1 | Depends: T001, T006
  - Verify: requesting a non-published slug returns 404; no owner/price-contract/quantity field appears in HTML
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the public/private field discipline here is the most leak-prone page on the site.

- [ ] T013 [P] Add `generateMetadata` for coffee index/detail (title, description, canonical, OG) in the same route files.
  - Req: FR-006, SC-001 | Depends: T012
  - Verify: initial HTML response contains title, meta description and canonical
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical metadata wiring.

---

## Phase 5 — Origin pages

- [ ] T014 [PS1] Implement `src/app/(public)/origins/page.tsx` and `[slug]/page.tsx` with `generateMetadata`; `notFound()` for non-`ACTIVE` origins; honest empty state when an origin has no published coffees.
  - Req: FR-002, FR-005, FR-006 | Depends: T002, T006
  - Verify: inactive origin → 404; origin with zero published coffees renders an empty state, not an error
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mirrors the coffee pages against a simpler dataset.

---

## Phase 6 — Sourcing, knowledge and legal content

- [ ] T015 [P] [PS2] Implement `src/app/(public)/sourcing/page.tsx` — supply credibility: sourcing relationships, custody, logistics, quality documentation, using only evidence Hills can substantiate.
  - Req: FR-002, FR-021, PS2 | Depends: T003, T006
  - Verify: page makes no claim not backed by supplied content; renders at the article measure
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: content-shaped page with a factual-claims constraint.

- [ ] T016 [P] [PS2] Implement `src/app/(public)/knowledge/page.tsx` and `[slug]/page.tsx` with article typography, reading measure and metadata.
  - Req: FR-002, FR-006 | Depends: T003, T006
  - Verify: article renders within the design system's 760px measure and passes the a11y check
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: standard content templates over an existing read layer.

- [ ] T017 [P] Implement `src/app/(public)/legal/[slug]/page.tsx` for terms/privacy/cookies content.
  - Req: FR-002 | Depends: T003, T006
  - Verify: each legal route resolves and is linked from the footer
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: simple content route.

---

## Phase 7 — Reference-price presentation

- [ ] T018 [PS5] Build `components/marketing/price-disclosure.tsx` rendering source, raw unit, raw currency, observation timestamp, time zone, delay type and the "reference information, not an offer" disclosure.
  - Req: FR-012, SC-004 | Depends: T004
  - Verify: all six disclosure elements are present in the rendered output for an approved-licence source
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: a compliance-shaped component where an omitted disclosure is a release-blocking defect (AC-06).

- [ ] T019 [PS5] Implement the stale/unavailable presentation path: last-success timestamp + explicit stale status; never a fabricated or silently-cached current value.
  - Req: FR-013, SC-004 | Depends: T018
  - Verify: with a stale/disabled/unlicensed source, the UI shows stale status and no current-looking value
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: the failure path is the part that actually protects the business claim; easy to get subtly wrong.

---

## Phase 8 — RFQ / commercial inquiry

- [ ] T020 [PS3] Create the RFQ Zod schema in `lib/validation/rfq.ts` (buyer/company type, country, estimated volume, coffee/origin preference, timing, delivery location, contacts, explicit consent).
  - Req: FR-014 | Depends: —
  - Verify: schema rejects missing consent and malformed contact details
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical schema from an explicit field list.

- [ ] T021 [PS3] Build `components/marketing/rfq-form.tsx` (React Hook Form + zodResolver, progressive fields, accessible labels/error association) and `src/app/(public)/contact/page.tsx`.
  - Req: FR-014, FR-017 | Depends: T020, T006
  - Verify: every field has an associated label and error message; the form is fully keyboard operable
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: standard accessible form work over a defined schema.

- [ ] T022 [PS3] Implement the RFQ Server Action in `src/app/(public)/contact/actions.ts` following 001's server-action contract (validate → server-side validation → safe errors). **Persistence stops at the DB-BLOCK-02 boundary**: the action must not write to any shadow table, browser storage, or service-role path.
  - Req: FR-014, SEC-003, SC-008 | Depends: T020
  - Verify: invalid input returns field errors with no side effect; the action contains no write to a non-approved destination; the blocker is referenced in a code comment pointing at the capability map
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: the discipline of *stopping at a blocker* rather than inventing persistence is a judgment call with compliance consequences.

- [ ] T023 [PS3] Add an endpoint-local abuse control to the RFQ action (no external cache, no global limiter).
  - Req: FR-015 | Depends: T022
  - Verify: exceeding the threshold rejects further submissions while normal page traffic is unaffected; `grep -rniE "redis|upstash" src lib` returns nothing
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: rate limiting without external infrastructure needs careful, correct scoping.

---

## Phase 9 — Membership / portal entry points

- [ ] T024 [PS4] Wire the Trading Portal / sign-in and membership-application entries to 003's entry routes, with a documented placeholder destination until 003 exists.
  - Req: FR-016 | Depends: T007
  - Verify: both entries resolve; neither renders member data; visual hierarchy keeps the commercial CTA primary
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: simple routing with a clear hand-off boundary.

---

## Phase 10 — SEO technical layer

- [ ] T025 [PS6] Implement `src/app/sitemap.ts` generated from `lib/public/*` (published/active content only), with splitting/pagination if the catalogue grows large.
  - Req: FR-008, SC-003 | Depends: T001, T002, T003
  - Verify: generated sitemap contains zero `/dashboard`, `/dashboard-admin` or other private routes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: data-driven generation over an existing DTO layer.

- [ ] T026 [PS6] Implement `src/app/robots.ts` disallowing `/dashboard`, `/dashboard-admin` and any other private prefix.
  - Req: FR-008 | Depends: —
  - Verify: `GET /robots.txt` disallows both private prefixes
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small, explicit configuration file.

- [ ] T027 [PS6] Add route-level non-indexable metadata to the private surfaces (`/dashboard`, `/dashboard-admin` layouts from 001) so exclusion does not rely on robots.txt alone.
  - Req: FR-009, SC-003 | Depends: —
  - Verify: both private layouts emit non-indexable metadata; verified by fetching each route's head
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: small change, but it edits 001-owned files so it needs care not to disturb their guards.

- [ ] T028 [P] [PS6] Build structured-data (`@graph`) builders in `lib/public/seo.ts` for organisation, coffee and article entities, and attach them to the relevant routes.
  - Req: FR-007 | Depends: T001, T002, T003
  - Verify: structured data validates and contains no private field
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: schema-shaped output with a clear specification.

- [ ] T029 [PS6] Implement lifecycle status behaviour for public routes: 200 active, 301 renamed, 404 unknown, 410 withdrawn.
  - Req: FR-002, PS6 | Depends: T012, T014
  - Verify: each of the four cases returns the documented status code
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: correct HTTP lifecycle semantics across dynamic routes is easy to get wrong and is SEO-critical.

---

## Phase 11 — Caching & revalidation

- [ ] T030 Register this feature's cache tags in `specs/001-platform-foundation/contracts/cache-policy-contract.md` and ensure every `lib/public/*` read declares its tag.
  - Req: FR-010, FR-011 | Depends: T001, T002, T003, T004
  - Verify: every exported read function declares a tag; the contract table lists each new tag with its revalidating mutation
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: small but must stay consistent with the platform-wide policy document.

- [ ] T031 Verify no public cache entry varies by user/session, and that no private route uses these tags.
  - Req: FR-011, SC-002 | Depends: T030
  - Verify: `grep -rn "cacheTag\|unstable_cache" src/app/dashboard src/app/dashboard-admin` returns nothing; no public read references identity
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical structural check.

---

## Phase 12 — Accessibility, responsiveness, motion, performance

- [ ] T032 Apply restrained Motion reveals/hover states to public sections with `prefers-reduced-motion` support; do **not** initialise GSAP or Lenis.
  - Req: FR-019 | Depends: T009, T011, T014
  - Verify: `grep -rn "gsap\|lenis" src components` returns nothing for this feature; reduced-motion removes all animation
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: restraint is the requirement; the risk is over-animating, not technical difficulty.

- [ ] T033 Audit and minimise client components across public routes; convert any non-interactive island back to a Server Component.
  - Req: FR-020, SC-005 | Depends: T009–T019
  - Verify: `grep -rln "use client" src/app/\(public\) src/app/page.tsx components/marketing` lists only genuinely interactive components
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: requires judgment about which islands genuinely need the client, across many files.

- [ ] T034 Add image optimisation and stable-layout handling (explicit dimensions/aspect ratios) for all public media placeholders.
  - Req: FR-020, SC-005 | Depends: T009–T016
  - Verify: no layout shift on image load in a throttled profile
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: routine but repeated work across pages.

- [ ] T035 Accessibility pass: semantic landmarks, heading order, focus visibility, form label/error association, contrast against Hills tokens.
  - Req: FR-017, SC-006 | Depends: T009–T021
  - Verify: automated accessibility check reports no critical violations; manual keyboard traversal reaches every CTA
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: needs contextual judgment about semantics, not just automated rule-passing.

- [ ] T036 RTL and long-string resilience pass across all public layouts (logical properties only).
  - Req: FR-018, SC-007 | Depends: T009–T021
  - Verify: `grep -rn "text-left\|text-right\|[^-]pl-\|[^-]pr-" src/app/\(public\) components/marketing` returns nothing; `dir="rtl"` renders without breakage
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mechanical but broad; a single physical property breaks the guarantee.

---

## Phase 13 — Automated tests

- [ ] T037 [P] Write `tests/public/metadata.test.ts` asserting title/description/canonical/OG presence on homepage, coffee detail, origin detail and knowledge article.
  - Req: SC-001 | Depends: T013, T014, T016
  - Verify: `npm test -- metadata` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Low
  - Why: mechanical assertions over rendered output.

- [ ] T038 [P] Write `tests/public/status-gating.test.ts` asserting non-published coffee and non-active origin return 404.
  - Req: FR-004, FR-005 | Depends: T012, T014
  - Verify: `npm test -- status-gating` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Low
  - Why: focused test with clear expected behaviour.

- [ ] T039 [P] Write `tests/public/seo-boundary.test.ts` asserting the sitemap excludes private routes and robots disallows them.
  - Req: FR-008, FR-009, SC-003 | Depends: T025, T026, T027
  - Verify: `npm test -- seo-boundary` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Low
  - Why: mechanical assertions over generated artefacts.

- [ ] T040 [P] Write `tests/public/price-disclosure.test.tsx` covering the full-disclosure and stale paths.
  - Req: FR-012, FR-013, SC-004 | Depends: T018, T019
  - Verify: `npm test -- price-disclosure` passes for both paths
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: two well-defined render cases.

- [ ] T041 Write `tests/public/rfq.test.ts` covering server-side validation rejection and abuse-control triggering.
  - Req: FR-014, FR-015, SEC-003, SC-008 | Depends: T022, T023
  - Verify: `npm test -- rfq` passes; no test asserts persistence while DB-BLOCK-02 stands
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: must test the security behaviour without asserting a capability the database does not yet provide.

---

## Phase 14 — Verification & closure

- [ ] T042 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — all green.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical command execution.

- [ ] T043 Manual leakage sweep: view source on homepage, coffee detail, origin detail, knowledge article and confirm zero private values.
  - Req: SC-002, FR-022 | Depends: T042
  - Verify: no owner identity, contract price, private quantity, exact warehouse location or member data appears
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: a judgment-based compliance sweep against SRS SEO-APP-02, where a miss is release-blocking.

- [ ] T044 Confirm locked root files are unmoved and only `src/app/page.tsx` was edited in place.
  - Req: FR-001 | Depends: T042
  - Verify: `git diff --summary` shows no rename for `page.tsx`, `layout.tsx`, `globals.css`
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical structural git check.

- [ ] T045 Confirm zero Redis/Upstash/external-cache references and no service-role usage in this feature.
  - Req: SEC-001, Constitution XI | Depends: T042
  - Verify: `grep -rniE "redis|upstash|SERVICE_ROLE" src/app lib components` returns nothing for this feature's files
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical grep verification.

- [ ] T046 Record remaining blockers (DB-BLOCK-02, CRM destination) in the PR/handoff notes and confirm the roadmap status row for 002 is accurate.
  - Req: spec.md Open items | Depends: T042
  - Verify: `docs/architecture/IMPLEMENTATION-ROADMAP.md` reflects the true state; no blocker was silently resolved
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: honest status reporting across features is a continuity-critical judgment.

---

## Dependencies & parallelisation

- **Phase 1 blocks everything** — pages consume DTOs only.
- Phases 4, 5, 6 are mutually parallel once Phases 1–2 are done (disjoint route files).
- Phase 7 depends only on T004; can run parallel to Phases 4–6.
- Phase 8 depends only on T020/T006; can run parallel to Phases 4–7.
- Phase 10 depends on the routes existing (Phases 3–6).
- Phases 12–13 depend on the pages being complete; Phase 14 depends on everything.

**Parallel-safe tasks**: T001, T002, T003, T007, T008, T010, T013, T015, T016, T017, T028, T037,
T038, T039, T040 (15 of 46).
