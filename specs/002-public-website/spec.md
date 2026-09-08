# Feature Specification: Public Website

**Feature Directory**: `specs/002-public-website`
**Created**: 2026-09-08 · **Last synchronised**: 2026-09-08 (pre-implementation planning sync)
**Status**: Planning prepared — implementation NOT started
**Primary surface**: Public Website (`/`)
**Depends on**: 001-platform-foundation (**IMPLEMENTED / VERIFIED**) — route/layout/token/state/i18n
foundation, Supabase client boundary, Server Action contract, cache policy. Consumes 011 for price
semantics; links into 003 for membership/auth entry.

## Purpose

Turn organic B2B discovery into commercial conversations. The public website sells trust,
traceability, sourcing confidence and product knowledge, and routes qualified visitors into either a
commercial inquiry (RFQ) or a membership application. It is the only Hills surface a
non-authenticated visitor ever sees.

It must extend — never weaken — the approved SEO architecture (SRS §5, §20), and it must never leak
private trading data (SRS SEO-APP-01, SEO-APP-02).

## Companion contracts

Detailed rules live in `contracts/` and are binding:

| Contract | Governs |
|---|---|
| [`public-dto-allowlist.md`](./contracts/public-dto-allowlist.md) | Exactly which fields may be published; explicit denylist; canary verification |
| [`public-cache-policy.md`](./contracts/public-cache-policy.md) | Approved cache API, tag register, ownership and current fallback |
| [`public-route-lifecycle.md`](./contracts/public-route-lifecycle.md) | Route/status map, canonical URLs, trailing slash, indexation |
| [`rfq-contract.md`](./contracts/rfq-contract.md) | RFQ field shape, result shape, abuse posture, the blocked boundary |
| [`reference-price-presentation.md`](./contracts/reference-price-presentation.md) | What 002 may render about price, and what it must never invent |
| [`public-copy-architecture.md`](./contracts/public-copy-architecture.md) | Server-safe typed English copy dictionary; where i18next stays; copy vs technical constant |

## Scope

### In scope

- Public homepage and its section composition (implemented **in place** at the locked
  `src/app/page.tsx`).
- A shared public shell (header/footer) used by both the homepage and the `(public)` route group.
- Public coffee presentation (published catalogue entries only).
- Origins and regions presentation.
- Sourcing / supply-credibility content, from **reviewed page copy owned by this feature**.
- Public reference-price **presentation shell and unavailable state** only (data semantics: 011).
- RFQ / commercial inquiry entry, up to and including server-side validation.
- Membership application and sign-in **entry points** (hand-off to 003; non-deceptive placeholder
  until 003 exists).
- Public SEO technical layer: metadata, canonicals, trailing-slash enforcement, sitemap, robots,
  structured data.
- Public caching/revalidation, Core Web Vitals, accessibility, responsive behaviour, restrained
  motion.

### Out of scope

- Any private marketplace listing, member inventory, order, payment, settlement or KYB data.
- **Commission**: calculation is the database's (`docs/database/commission-capability.md`); financial
  workflow/presentation is Feature 008; Admin commission management is Feature 010. See
  *Cross-feature boundaries* below.
- Authentication implementation itself (003) and the member portal (004+).
- Price *sourcing*, ingestion, FX conversion, staleness computation (011).
- Knowledge/editorial and legal content **authoring and storage** — no approved source exists
  (CONTENT-01).
- CMS authoring tooling (010).
- Localisation into Arabic (RTL-safe markup only; translation delivery is a later decision).
- Redirect/tombstone lifecycle beyond 200/404 (LIFE-01).

## Cross-feature boundaries

- **Commission** — Feature 002 owns **no part** of commission. It must never render, derive, or
  reference a commission rate, a commission amount, a seller net amount, or any
  `commission_policies`/`commission_tiers` row. Commission configuration is private commercial data
  (`contracts/public-dto-allowlist.md` §3). Public legal/policy pages may carry approved *general*
  commercial wording supplied by Content/Legal, but general wording is not a commission
  configuration surface and must not state or imply specific rates.
- **Pricing** — presentation shell only; semantics belong to 011.
- **Catalogue authoring** — 010. This feature renders catalogue content; it never authors it.
- **Auth/membership** — 003. This feature provides entry points only.

## Actors

| Actor | Interest |
|---|---|
| **Anonymous visitor** (roaster, importer, green buyer) | Evaluate Hills' offer, origins and credibility; start a conversation. |
| **Returning member** | Reach the sign-in entry point quickly; never see member data on public pages. |
| **Search engine crawler** | Retrieve meaningful server-rendered HTML with valid metadata for indexable routes only. |
| **Hills commercial team** (indirect) | Receive qualified RFQs with attribution and consent — *once an approved destination exists*. |

## Business journeys owned

Owns the first stage of the Buyer flow: **Public Website → (RFQ *or* membership entry)**, then hands
off to 003. Owns no part of the Seller or Admin flows beyond publicly presenting Hills' credibility.

## Prioritized stories

### PS1 — Discover coffee and origins on fast, indexable public pages (P1)

A visitor reaches a coffee or origin page from search and sees factual specification, origin,
process, packaging and traceability framing, with a clear path to a commercial conversation.

**Why P1**: this is the platform's entire acquisition surface.
**Independent test**: load the coffee index and one coffee detail page as an anonymous visitor with
JavaScript disabled and confirm meaningful server HTML, valid metadata, and a visible CTA.

**Acceptance scenarios**

1. Given an anonymous visitor, when they open a published coffee page, then **name, description,
   origin (with region/country), coffee type, variety, processing method, packaging type, tags and
   certifications** render server-side.
2. Given a coffee whose `status` is not `PUBLISHED`, when its URL is requested, then the site returns
   404 — never a partially rendered draft, and never a response distinguishable from an unknown slug.
3. Given any public page, when its HTML, RSC payload, metadata and structured data are inspected,
   then no member/order/inventory/listing/commission value appears.

> **Database reality**: grade, cup score and crop year live in `coffee_lots`, which is **not**
> anonymously readable (and whose policy is additionally suspect — DB-OPEN-05). Public coffee pages
> therefore present the taxonomy and origin story, **not** a quality score. Acceptance is written
> against what the approved database can actually publish.

### PS2 — Understand sourcing credibility (P1)

A visitor evaluating Hills as a supplier reads sourcing, custody, logistics and quality-evidence
framing.

**Why P1**: trust is the stated product of the public site.
**Independent test**: navigate the public information architecture from the header alone and reach
every credibility destination via crawlable anchors.

**Acceptance scenarios**

1. Given the public header, when a visitor navigates, then every priority destination is reachable
   through a real HTML anchor (not a JS-only control).
2. Given the sourcing page, when rendered, then every claim comes from reviewed, supplied copy — no
   claim is generated, and **no claim is derived from `warehouses` rows** (owner/location data is
   private, `contracts/public-dto-allowlist.md` §3).

> Knowledge/editorial article routes are **blocked by CONTENT-01** and are not part of this story's
> acceptance. See *Blockers*.

### PS3 — Submit a commercial inquiry (RFQ) (P1)

A visitor submits a short, progressive inquiry capturing buyer type, country, volume,
coffee/origin preference, timing, delivery point, contact details and explicit consent.

**Why P1**: RFQ is the primary public conversion event in the approved journey.
**Independent test**: submit invalid input and confirm field-level errors with nothing sent; submit
valid input and confirm the honest *unavailable* outcome with a working alternative contact route.

> **Constrained by DB-BLOCK-02 and CRM-DEST-01.** No approved destination exists for an anonymous
> RFQ. This story ships the form, validation and abuse posture, and **stops before persistence**.

**Acceptance scenarios**

1. Given a completed valid form, when submitted while no approved destination exists, then the
   visitor sees an honest statement that online submission is not yet available **plus an
   alternative contact route**, their entered data is preserved, and **no success confirmation is
   shown**.
2. Given invalid input (including missing consent, or an over-length field), when submitted, then
   field-level errors render, no data is sent anywhere, and the page does not reload.
3. Given repeated rapid submissions, when the endpoint-local safeguard triggers, then further
   submissions are rejected with a message that discloses no threshold or counter, and normal page
   traffic is unaffected.

### PS4 — Enter membership / authentication (P2)

A visitor finds a clearly secondary but discoverable Trading Portal entry and a membership
application entry.

**Why P2**: necessary for the funnel; the destination experience belongs to 003.
**Independent test**: confirm both entries are present, visually secondary to the primary commercial
CTA, and behave non-deceptively while 003 does not exist.

**Acceptance scenarios**

1. Given the public header, when rendered, then a Trading Portal / sign-in entry exists and is
   visually secondary to the primary "Request an offer" CTA.
2. Given 003 does not yet exist, when a visitor activates either entry, then they reach an
   **explicit, honest placeholder** stating that membership/sign-in is not yet open and offering the
   commercial contact route. It must **not** silently route to `/`, must **not** present a
   non-functional sign-in form, and must **not** imply an account can be created.
3. Given 003 exists later, when the entries are re-pointed, then only the entry destination changes —
   no public page begins onboarding a visitor itself.

### PS5 — Reference pricing presented honestly, or not at all (P2)

Where approved data exists, a visitor sees reference benchmark pricing with full disclosure; where it
does not, the visitor sees an honest unavailable state.

**Why P2**: valuable for credibility, but must never be confused with executable pricing (SRS §9).
**Independent test**: render the reference-price surface today and confirm the unavailable state
appears with **no** number, source, timestamp or licence claim anywhere in the output.

**Acceptance scenarios**

1. Given Feature 011 is not implemented (today's state), when a page renders the reference-price
   section, then the documented unavailable state appears and **no numeric value is fabricated**.
2. Given any public page, when it shows any price-shaped element, then the "reference information,
   not an offer" disclosure is present and it is never presented as a Hills executable quote or a
   member listing price.

> Numeric values, source identity, staleness, last-success semantics and unit/currency conversion
> are **deferred to 011** (PRICE-011; conversion additionally blocked by DB-OPEN-08).

### PS6 — Correct technical discovery behaviour (P2)

Crawlers receive clean sitemaps, robots rules, canonicals, trailing-slash-consistent URLs and
structured data; private routes are excluded from indexation.

**Why P2**: release-blocking per SRS AC-07, but depends on the content routes existing first.
**Independent test**: fetch `/sitemap.xml` and `/robots.txt`, confirm only public routes appear and
`/dashboard*` is excluded; validate structured data on one coffee and one origin page.

**Acceptance scenarios**

1. Given the generated sitemap, when inspected, then it contains only public indexable routes, zero
   private routes, and every URL in canonical trailing-slash form matching the page's own canonical.
2. Given any private route, when its metadata is inspected, then it is marked non-indexable
   independently of `robots.txt`.
3. Given a public route, when requested without a trailing slash, then it redirects to the
   trailing-slash canonical form; `/` is unaffected.
4. Given an unknown or non-public slug, when requested, then **404** — 301/410 lifecycle is
   **not implemented** (LIFE-01).

## Functional Requirements

### Structure & shell

- **FR-001**: The homepage MUST be served at `/` by the existing locked `src/app/page.tsx`,
  implemented **in place**. `src/app/page.tsx`, `src/app/layout.tsx` and `src/app/globals.css` MUST
  remain at their existing paths (Constitution IV). Narrow in-place edits to any of the three are
  permitted where this feature genuinely requires them; **relocation is not**.
- **FR-002**: The site MUST provide public routes for coffee index/detail, origin index/detail,
  sourcing, contact/RFQ, plus `sitemap.xml` and `robots.txt`, using lowercase hyphenated canonical
  URLs with an enforced trailing slash. Knowledge and legal routes are **withheld** until CONTENT-01
  is resolved (`contracts/public-route-lifecycle.md` §4).
- **FR-023**: A single reusable **PublicShell** component (header + footer + shared public chrome)
  MUST be consumed by **both** `src/app/page.tsx` and `src/app/(public)/layout.tsx`, because the root
  homepage does **not** inherit the route group's layout. Header/footer MUST be identical across
  both. The `(public)` route group MUST NOT appear in any URL.

### Data boundary

- **FR-003**: Public pages MUST read only the anonymously-readable tables listed in
  `docs/architecture/DATABASE-CAPABILITY-MAP.md` §4, through explicit **column allowlists**
  (`contracts/public-dto-allowlist.md` §1). `select("*")` and implicit-all selects are forbidden on
  this surface, as is spreading a raw row into a DTO. This feature MUST NOT query `warehouses`.
- **FR-004**: A coffee page MUST render only when `status = 'PUBLISHED'`; any other status MUST
  return 404, indistinguishable from an unknown slug.
- **FR-005**: An origin page MUST render only when `status = 'ACTIVE'`.
- **FR-022**: Public pages MUST never expose owner/seller identity, private or executed prices,
  private or reserved quantities, MOQ, exact warehouse location, private documents, order/payment/
  settlement data, commission configuration or order financial snapshots (SRS SEO-APP-02;
  `contracts/public-dto-allowlist.md` §3).
- **FR-024**: Public coffee pages are **catalogue/discovery** pages. They MUST NOT expose or imply
  member `coffee_offers`, tradeable availability, executable member pricing, or seller identity.
  Private trading remains inside the authorized member experience (SRS MKT-06).

### Rendering & SEO

- **FR-006**: Public pages MUST be server-rendered with meaningful HTML, `title`, meta description,
  canonical URL and Open Graph data in the initial response, for **every** owned public route.
- **FR-007**: The site MUST emit structured data (`@graph`) for organisation and coffee/origin
  entities, **safely serialized** so no injected content can break out of the inline script
  (FR-025).
- **FR-025**: Inline JSON-LD MUST be serialized with dangerous characters escaped (at minimum `<`,
  and the `</script` sequence) or through an equivalent approved safe serializer. Structured data
  MUST contain no private field.
- **FR-008**: `sitemap.xml` MUST be generated from published/active public content only, in canonical
  trailing-slash form; `robots.txt` MUST disallow `/dashboard`, `/dashboard-admin`,
  **`/foundation-status`**, **`/internal-test/`** (the FR-031 cache-proof namespace), and any other
  private or non-product prefix.
- **FR-009**: Non-public routes MUST additionally declare non-indexable metadata at the route level,
  so exclusion does not depend on `robots.txt` alone (**defence in depth**). This applies to
  `/dashboard`, `/dashboard-admin` **and `/foundation-status`** — Feature 001's cache-proof route,
  which is live and crawlable today but carries no `robots` directive. Any edit made to Feature 001's
  files for this purpose MUST be limited to metadata, MUST NOT alter their authorization guards, and
  MUST NOT change `/foundation-status`'s cache-proof behaviour; an authorization regression check
  MUST follow.
- **FR-031**: The cache-revalidation proof (SC-009) MUST be invoked through the **non-public,
  non-production, secret-guarded** route fully specified in `contracts/public-cache-policy.md` §5.3 —
  `src/app/internal-test/cache-proof/route.ts` at `/internal-test/cache-proof/`, `GET`/`POST` only,
  gated by **both** the server-only `CACHE_PROOF_ENABLED="true"` flag **and** a matching
  `CACHE_PROOF_SECRET` supplied via the `x-cache-proof-secret` header, restricted to a fixed
  public-tag allowlist, returning an empty `404` whenever the flag is absent/false or the secret is
  missing/wrong, and carrying `X-Robots-Tag: noindex, nofollow` on every response. **`NODE_ENV` is
  not the gate** — the proof must be executable against a locally-started production build
  (`next build` + `next start`), while a deployed production environment leaves the flag unset and
  therefore has no such route. An **anonymous or publicly-reachable cache-purge/revalidation route MUST NOT be created** —
  it would let any caller evict shared catalogue cache entries and force repeated database reads.
  The observable change MUST come from a per-cache-entry computation stamp that is never rendered as
  page content (§5.2), so the proof requires no catalogue mutation. Redis, Upstash, `"use cache"`,
  `cacheTag()`, `cacheLife()`, `updateTag()` and `cacheComponents` remain forbidden.
- **FR-026**: The site MUST enforce canonical trailing-slash URLs via `trailingSlash: true` in
  `next.config.ts`, keeping `/`, dynamic public routes, sitemap URLs, canonical tags and
  **`/dashboard*` authorization** all consistent (`contracts/public-route-lifecycle.md` §5).
- **FR-027**: Public route lifecycle MUST implement **200 for active/public and 404 for
  unknown/non-public** only. 301/308/410 behaviour MUST NOT be faked (LIFE-01). The SRS lifecycle
  requirement is preserved as unmet, not narrowed.

### Caching

- **FR-010**: Public catalogue reads MUST use **`unstable_cache` from `next/cache`** with tags and a
  `revalidate` ceiling declared in the options object, and MUST be invalidated with
  `revalidateTag(tag, { expire: 0 })`. `"use cache"`, `cacheTag()`, `cacheLife()`, `updateTag()`,
  `cacheComponents: true`, Redis and Upstash are all forbidden
  (`contracts/public-cache-policy.md` §1).
- **FR-011**: No public cache entry may vary by user, session, organization or auth state, and no
  public page may call `getRequestIdentity()`. Every tag MUST be registered in
  `contracts/public-cache-policy.md` §3 with its owner and current fallback behaviour.

### Reference price

- **FR-012**: The reference-price surface MUST render 011's presentation DTO when it exists, showing
  every disclosure element 011's contract requires plus the "reference information, not an offer"
  disclosure.
- **FR-013**: When no approved data exists — **including today, where 011 is unimplemented** — the
  surface MUST render the documented unavailable state and MUST NOT fabricate a value, source,
  timestamp or licence state, and MUST NOT present a cached value as current. Feature 002 MUST NOT
  query `price_sources`, `price_observations` or `price_differentials`.

### RFQ

- **FR-014**: The RFQ entry MUST capture the field set in `contracts/rfq-contract.md` §2 with
  explicit consent and best-effort attribution, and MUST validate server-side with Zod at the Server
  Action boundary. **Persistence is out of reach (DB-BLOCK-02, CRM-DEST-01)**: no shadow table, no
  browser-storage persistence, no service-role bypass, no unapproved outbound destination. A valid
  submission MUST return the honest *unavailable* outcome and MUST NOT claim success.
- **FR-015**: The RFQ endpoint MUST carry endpoint-local abuse safeguards (input-size bounds, early
  shape rejection, a per-instance throttle) documented honestly as **best-effort and
  non-distributed**. It MUST NOT be described as durable or distributed rate limiting (ABUSE-01).

### Entry points, media, states, presentation

- **FR-016**: The header MUST expose Trading Portal / sign-in and membership-application entries as
  secondary to the primary commercial CTA. Until 003 exists they MUST resolve to an explicit,
  honest placeholder — never a fake form, never a silent redirect to `/`.
- **FR-028**: Public media slots MUST render stable, labelled placeholders with correct
  dimensions/aspect ratio. No public file delivery path exists (MEDIA-01, DB-BLOCK-01): no Storage
  bucket may be created, and no file URL may be constructed, guessed or proxied.
- **FR-029**: Every public surface MUST provide the applicable runtime states — loading, empty,
  error, unavailable, not-found, retry, and blocked-sub-flow — reusing 001's `StateScreen` where
  appropriate. "Stale" is presented **only** where genuinely supported by real data (today: nowhere).
- **FR-017**: All public interactive elements MUST be keyboard reachable with visible focus, and all
  public pages MUST meet **WCAG 2.2 AA** (SRS §13.8).
- **FR-018**: All public layouts MUST be responsive and RTL-safe using logical CSS properties, with
  every user-facing string sourced from the **single typed English dictionary** at `lib/public/copy/`
  (`contracts/public-copy-architecture.md`). That module MUST be **server-safe** — no `"use client"`
  directive, no `react` or `i18next` import — so Server Components read it without crossing the
  client boundary, and Client Components consume the same module. English-first; no locale routing,
  no locale switcher.
- **FR-030**: Public typography and tokens MUST extend Feature 001's existing Hills token/font
  foundation. A second, independent token or font system MUST NOT be created. Likewise, Feature
  001's i18next initialisation (`lib/i18n/config.ts`) MUST remain the only one: this feature adds
  **no** second i18n initialisation, **no** second i18n library, and **no** duplicate copy
  dictionary.
- **FR-019**: Motion MUST remain restrained (reveal/hover/section transitions only), MUST respect
  `prefers-reduced-motion`, and MUST NOT introduce scroll hijacking or long intro sequences.
- **FR-020**: Public routes MUST be **Server Components by default**; Client Components are permitted
  only for genuine interaction, MUST NOT receive unnecessary DTO hydration, and MUST NOT place any
  private value in the RSC payload. Metadata and structured data generation MUST remain server-side.
- **FR-021**: The site MUST implement the section-by-section public guidance in
  `docs/design-guidance/Hills-Coffee-Website-Recommendations.md` adapted to the Hills design system,
  copying no external site's code, branding, layout, text or imagery.

## Security Requirements

- **SEC-001**: All public data access MUST run through the anonymous/user-scoped Supabase client;
  the service-role key MUST NOT appear anywhere in this feature.
- **SEC-002**: Public pages MUST NOT call `getRequestIdentity()`, and no shared cache entry may vary
  by user; any personalised element MUST be an explicitly non-cached island.
- **SEC-003**: Form handling MUST validate server-side with Zod at the Server Action boundary and
  MUST return safe errors that never echo database or framework messages.
- **SEC-004**: Submitted inquiry content MUST be treated as untrusted input for its whole life —
  never rendered unescaped anywhere, including any operational view built later by 010, and never
  interpolated into HTML or JSON-LD.
- **SEC-005**: No secret, connection string or privileged identifier may appear in client bundles,
  the RSC payload, metadata or structured-data output.

## Edge Cases

- A coffee is unpublished while a visitor is on a cached page → the next revalidation (or the TTL
  ceiling) removes it; a direct request 404s.
- An origin has no published coffees → the origin page renders an honest empty state, not an error.
- Catalogue is empty in development → index pages render honest empty states.
- A visitor requests a renamed route → **404** today; correct 301/410 lifecycle awaits LIFE-01.
- Sitemap generation encounters a very large catalogue → pagination/splitting per the SEO contract.
- A visitor with reduced-motion enabled loads a section-reveal page → content appears without motion.
- RFQ submitted with a malformed email → server-side **format** validation rejects it with a field
  error. *(No disposable-domain policy is implemented — none is approved;
  `contracts/rfq-contract.md` §2.)*
- RFQ submitted validly while no destination exists → honest unavailable outcome, data preserved,
  no success claim.
- JavaScript fails to load entirely → primary content, navigation and CTAs still work.
- A private canary value exists in the database → it appears in no public output whatsoever.

## Success Criteria

- **SC-001**: 100% of owned public routes return meaningful server-rendered content with valid title,
  description and canonical in the initial HTML response.
- **SC-002**: Zero private values appear in any public DTO, SSR HTML, RSC/Flight payload, metadata,
  JSON-LD, sitemap or rendered page — verified by **seeded private canary values**, not only by
  field-name checks.
- **SC-003**: The generated sitemap contains zero private routes, every entry matches its page's
  canonical trailing-slash form, and every private route is independently marked non-indexable.
- **SC-004**: The reference-price surface renders the unavailable state with zero fabricated value,
  source, timestamp or licence claim.
- **SC-005**: Public pages meet the **Core Web Vitals "good" thresholds** — LCP ≤ 2.5s, INP ≤ 200ms,
  CLS ≤ 0.1 — measured on a throttled mid-tier mobile profile. (SRS §13.8 "Non-functional baseline
  targets" states "Public Core Web Vitals targeted" without redefining the metrics; these are the
  metric set's own published thresholds, not an invented stricter product requirement.)
- **SC-006**: All public interactive elements are operable by keyboard with a visible focus
  indicator, and an automated accessibility check reports no critical violations against the
  **WCAG 2.2 AA** target.
- **SC-007**: Every public layout renders without breakage at `dir="rtl"`, with long strings, and at
  mobile/tablet/desktop breakpoints — verified in a **real browser**, not jsdom.
- **SC-008**: No RFQ submission is persisted through any path, and no submission produces a success
  claim, while DB-BLOCK-02 and CRM-DEST-01 stand.
- **SC-009**: A public read returns the same cached value on repeated reads and a **different** value
  after an approved revalidation — proven against a **locally-started production build**
  (`npm run build` + `next start` with `CACHE_PROOF_ENABLED=true`, `contracts/public-cache-policy.md`
  §5.3.2), via the non-public guarded entry point in §5.3 (never an anonymous purge route), observed
  through the per-cache-entry computation stamp (§5.2).
- **SC-010**: Enabling trailing-slash canonicalisation causes **no** Feature 001 authorization
  regression on **either URL form** of every protected Foundation route — `/dashboard`,
  `/dashboard/`, `/dashboard/settings`, `/dashboard/settings/`, `/dashboard-admin`,
  `/dashboard-admin/` — for anonymous, member and cross-surface access, and no redirect leaks
  protected content or yields an indexable response.
- **SC-012**: Every user-facing string on the public surface resolves through the typed copy
  dictionary — no hard-coded user-facing literal remains in `src/app/(public)`, `src/app/page.tsx` or
  `components/public` (technical constants excluded), and no second i18n initialisation exists.
- **SC-011**: Feature 002 adds **zero** new lint findings. The pre-existing `docs/claude-design`
  baseline (124 errors / 148 warnings, captured by 001's T001) remains unchanged and is **not**
  required to reach zero.

## Assumptions

- Public catalogue content (published coffees, active origins, media metadata, certifications) is
  populated by Hills operations via 010; this feature renders it and does not author it.
- The approved public data set is exactly the anonymously-readable tables in the capability map §4,
  minus `warehouses` and minus the price tables, which this feature deliberately does not query.
- Price semantics, ingestion, conversion and staleness are owned by 011.
- Photography and editorial imagery are supplied by content owners; every media area is a labelled
  placeholder until MEDIA-01 is resolved.
- Sourcing/homepage **section copy** is this feature's own reviewed UI copy — not CMS-managed
  editorial, and not a substitute for the missing content source.

## Blockers and open items

| ID | Summary | Severity | Blocks | Does **not** block |
|---|---|---|---|---|
| **DB-BLOCK-02** | No approved destination for an anonymous RFQ (`support_tickets` requires `auth.uid()`; no inquiry table) | **BLOCKS SUB-FLOW** | RFQ persistence + success outcome | RFQ form, schema, validation, abuse posture, unavailable result |
| **CRM-DEST-01** | No approved CRM/email destination for RFQ hand-off (SRS design-guidance rule #5) | **PRE-PRODUCTION BLOCKER** | RFQ delivery to the business | everything else in 002 |
| **PRICE-011** | Feature 011 unimplemented — no numeric reference pricing (conversion also blocked by DB-OPEN-08) | **BLOCKS SUB-FLOW** | numeric price, source, freshness, conversion | the presentation shell and unavailable state |
| **CONTENT-01** | No approved content source for knowledge/editorial/legal — the approved DB has no CMS/article/legal table, and the SRS assigns content authoring to the Catalogue/CMS admin area (010) | **BLOCKS SUB-FLOW** | `/knowledge/*`, `/legal/*` routes and their sitemap entries | homepage, coffee, origins, sourcing, shell, RFQ, SEO layer for existing routes |
| **LIFE-01** | No alias/redirect/tombstone capability — renamed, withdrawn and never-existed are indistinguishable | **BLOCKS SUB-FLOW** | 301/308/410 lifecycle | 200/404 behaviour, which is fully implementable |
| **ABUSE-01** | No durable, multi-instance abuse protection available (no Redis/Upstash approved) | **PRE-PRODUCTION BLOCKER** | production-grade abuse defence | endpoint-local best-effort safeguards |
| **MEDIA-01** | No Supabase Storage bucket and no public file-delivery path (DB-BLOCK-01) | **BLOCKS SUB-FLOW** | real public imagery/documents | labelled placeholders with stable layout |

**Not a Feature 002 concern**: `COMMISSION-OPEN-01` (0% commission fallback) is a Business/Finance
decision owned by **Feature 008**. It does not block, and must not be addressed by, this feature.

**Legal copy** must be supplied by Content/Legal owners. This feature must not author final legal
wording even if a content source appears.

## Dependencies

| Depends on | Why |
|---|---|
| 001-platform-foundation (**implemented/verified**) | Root layout, design tokens, `StateScreen`, i18n, cache API decision, Supabase client boundary, Server Action contract, test tooling |
| 011-pricing-reference-data | Price presentation DTO consumed by PS5 |
| 003-auth-membership-kyb | Destination of the membership/sign-in entry points |
| 010-admin-operations-console | Authoring of the catalogue this feature renders; future owner of cache-tag invalidation |
