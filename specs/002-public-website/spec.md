# Feature Specification: Public Website

**Feature Directory**: `specs/002-public-website`
**Created**: 2026-09-08
**Status**: Planning prepared — implementation NOT started
**Primary surface**: Public Website (`/`)
**Depends on**: 001-platform-foundation (route/layout/token/state foundation). Consumes 011 for
price semantics; links into 003 for membership/auth entry.

## Purpose

Turn organic B2B discovery into commercial conversations. The public website sells trust,
traceability, sourcing confidence and product knowledge, and routes qualified visitors into either
a commercial inquiry (RFQ) or a membership application. It is the only Hills surface a
non-authenticated visitor ever sees.

It must extend — never weaken — the approved SEO architecture (SRS §5, §20), and it must never leak
private trading data (SRS SEO-APP-01, SEO-APP-02).

## Scope

### In scope

- Public homepage and its section composition.
- Public coffee presentation (published catalogue entries only).
- Origins and regions presentation.
- Sourcing / supply-credibility / about content.
- Knowledge and editorial content pages.
- Public reference-price *presentation* (data semantics owned by 011).
- RFQ / commercial inquiry entry.
- Membership application and sign-in entry points (hand-off to 003).
- Public SEO technical layer: metadata, canonicals, sitemap, robots, structured data, redirects.
- Public caching/revalidation, Core Web Vitals, accessibility, responsive behaviour, restrained motion.

### Out of scope

- Any private marketplace listing, member inventory, order, payment, settlement or KYB data.
- Authentication implementation itself (003) and the member portal (004+).
- Price *sourcing*, ingestion, FX conversion, staleness computation (011).
- CMS authoring tooling (admin catalogue/content management is 010).
- Localisation into Arabic (RTL-safe markup only; translation delivery is a later decision).

## Actors

| Actor | Interest |
|---|---|
| **Anonymous visitor** (roaster, importer, green buyer) | Evaluate Hills' offer, origins, traceability and credibility; start a conversation. |
| **Returning member** | Reach the sign-in entry point quickly; never see member data on public pages. |
| **Search engine crawler** | Retrieve meaningful server-rendered HTML with valid metadata for indexable routes only. |
| **Hills commercial team** (indirect) | Receive qualified RFQs with attribution and consent. |

## Business journeys owned

Owns the first stage of the Buyer flow: **Public Website → (RFQ *or* membership entry)**, then
hands off to 003. Owns no part of the Seller or Admin flows beyond publicly presenting Hills'
credibility.

## Prioritized stories

### PS1 — Discover coffee and origins on fast, indexable public pages (P1)

A visitor reaches a coffee or origin page from search and sees factual specification, origin,
process, quality context and traceability framing, with a clear path to a commercial conversation.

**Why P1**: this is the platform's entire acquisition surface; without it there is no inbound flow.
**Independent test**: load the coffee index and one coffee detail page as an anonymous visitor with
JavaScript disabled and confirm meaningful server HTML, valid metadata, and a visible CTA.

**Acceptance scenarios**

1. Given an anonymous visitor, when they open a published coffee page, then origin, process,
   variety, grade/quality context and packaging information render server-side.
2. Given a coffee whose `status` is not `PUBLISHED`, when its URL is requested, then the site
   returns 404 — never a partially rendered draft.
3. Given any public page, when its HTML is inspected, then no member/order/inventory/listing data
   appears in markup or serialized props.

### PS2 — Understand sourcing credibility and knowledge content (P1)

A visitor evaluating Hills as a supplier reads sourcing, custody, logistics and quality-evidence
content plus editorial knowledge pages.

**Why P1**: trust is the stated product of the public site; the SRS positions credibility ahead of
transactional capability for public visitors.
**Independent test**: navigate the full public information architecture from the header alone and
reach every credibility/knowledge destination via crawlable anchors.

**Acceptance scenarios**

1. Given the public header, when a visitor navigates, then every priority destination is reachable
   through a real HTML anchor (not a JS-only control).
2. Given a knowledge article, when rendered, then it uses the article measure/typography from the
   approved design system and remains readable at mobile widths.

### PS3 — Submit a commercial inquiry (RFQ) (P1)

A visitor submits a short, progressive inquiry capturing buyer type, country, volume, coffee/origin
preference, timing, delivery point and contact details.

**Why P1**: RFQ is the primary public conversion event in the approved journey.
**Independent test**: submit the form and confirm a durable, retrievable record plus a confirmation
state; submit invalid input and confirm field-level errors with no record created.

> **Constrained by DB-BLOCK-02** (see Open items): the approved baseline has no destination table
> for an *anonymous* RFQ. Until that is resolved, this story ships only to the boundary the
> database permits — see FR-014.

**Acceptance scenarios**

1. Given a completed valid form, when submitted, then the inquiry is durably recorded with
   attribution and consent evidence and the visitor sees a confirmation state.
2. Given repeated rapid submissions from one origin, when the abuse threshold is exceeded, then
   further submissions are rejected without affecting normal traffic.
3. Given a submission failure, when it occurs, then the visitor sees a recoverable error and their
   entered data is preserved.

### PS4 — Enter membership / authentication (P2)

A visitor finds a clearly secondary but discoverable Trading Portal entry and a membership
application entry.

**Why P2**: necessary for the funnel, but the destination experience belongs to 003.
**Independent test**: confirm both entries are present, visually secondary to the primary
commercial CTA, and route correctly.

**Acceptance scenarios**

1. Given the public header, when rendered, then a Trading Portal / sign-in entry exists and is
   visually secondary to the primary "Request an offer" CTA.
2. Given a visitor who follows the membership entry, when they arrive, then they land on 003's
   entry route, not a public page pretending to onboard them.

### PS5 — See reference pricing presented honestly (P2)

Where approved, a visitor sees reference benchmark pricing with source, unit, currency, timestamp
and delay/freshness context — clearly labelled as information, not an offer.

**Why P2**: valuable for credibility, but must not be confused with executable pricing (SRS §9).
**Independent test**: render the reference-price surface for an approved-licence source and confirm
every required disclosure element is present; simulate a stale feed and confirm stale labelling.

**Acceptance scenarios**

1. Given a displayed reference price, when rendered, then source, unit, currency, observation
   timestamp, time zone and delay context are all visible.
2. Given a stale or unavailable feed, when the page renders, then the last successful timestamp and
   an explicit stale status are shown and no value is fabricated.
3. Given any public page, when it shows any price, then it is never presented as a Hills executable
   quote or a member listing price.

### PS6 — Correct technical discovery behaviour (P2)

Crawlers receive clean sitemaps, robots rules, canonicals and structured data; private routes are
excluded from indexation.

**Why P2**: release-blocking per SRS AC-07, but depends on the content routes existing first.
**Independent test**: fetch `/sitemap.xml` and `/robots.txt`, confirm only public routes appear and
that `/dashboard*` is excluded; validate structured data on one coffee and one origin page.

**Acceptance scenarios**

1. Given the generated sitemap, when inspected, then it contains only public indexable routes and
   no member/account/order/inventory/admin route.
2. Given any private route, when its response headers/metadata are inspected, then it is marked
   non-indexable.
3. Given a renamed or withdrawn public offer/coffee route, when requested, then the correct
   200/301/404/410 behaviour applies.

## Functional Requirements

- **FR-001**: The site MUST serve the public homepage at `/` using the existing locked
  `src/app/page.tsx` — implementing its content in place, never relocating the file.
- **FR-002**: The site MUST provide public routes for coffee index/detail, origin index/detail,
  sourcing/about, knowledge index/article, contact/RFQ, and legal pages, using lowercase hyphenated
  canonical URLs.
- **FR-003**: Public pages MUST read only from publicly readable tables (see
  `docs/architecture/DATABASE-CAPABILITY-MAP.md` §4) and MUST NOT query any member/organization/
  order/inventory/listing/payment table.
- **FR-004**: A coffee page MUST render only when its `status = 'PUBLISHED'`; any other status MUST
  return 404.
- **FR-005**: An origin page MUST render only when its `status = 'ACTIVE'`.
- **FR-006**: Public pages MUST be server-rendered with meaningful HTML, `title`, meta description,
  canonical URL, and Open Graph data present in the initial response.
- **FR-007**: The site MUST emit structured data (`@graph`) for organisation, product/offer-style
  coffee entities and article content, consistent with the approved SEO architecture.
- **FR-008**: The site MUST generate `sitemap.xml` from published/active public content only, and
  `robots.txt` rules that disallow `/dashboard`, `/dashboard-admin` and any other private route.
- **FR-009**: Private routes MUST additionally declare non-indexable metadata at the route level, so
  exclusion does not depend on `robots.txt` alone.
- **FR-010**: Public catalogue reads MUST use Next.js-native caching with named cache tags and MUST
  be revalidated when the corresponding catalogue content changes (tag names registered in
  `specs/001-platform-foundation/contracts/cache-policy-contract.md`).
- **FR-011**: No public page MUST ever include a user- or organization-scoped value in a shared
  cache entry.
- **FR-012**: Reference-price presentation MUST display source, raw unit, raw currency, observation
  timestamp, time zone, delay type, and an explicit "reference information, not an offer" disclosure.
- **FR-013**: When a price source is stale, disabled, unlicensed or unavailable, the page MUST show
  last-success timestamp and stale status, and MUST NOT display a fabricated or silently cached
  value as current.
- **FR-014**: The RFQ/inquiry entry MUST capture buyer/company type, country, estimated volume,
  coffee/origin preference, timing, delivery location, contact details, and explicit consent, and
  MUST record submission attribution. **Until DB-BLOCK-02 is resolved, the implementable boundary
  is: build and validate the full form and its server-side handling, and persist through an
  approved destination only once one exists** — no shadow table, no client-only storage, no
  service-role bypass.
- **FR-015**: RFQ submission MUST be protected by an endpoint-specific abuse control owned by this
  feature (Constitution Principle XI: selective, not global, and without external cache
  infrastructure).
- **FR-016**: The header MUST expose Trading Portal / sign-in and membership-application entries as
  secondary to the primary commercial CTA, routing into 003's entry routes.
- **FR-017**: All public interactive elements MUST be keyboard reachable with visible focus, and all
  public pages MUST meet the approved accessibility baseline (WCAG 2.2 AA target, SRS §13.8).
- **FR-018**: All public layouts MUST be responsive and built RTL-safe using logical CSS properties,
  with copy externalised per 001's i18n foundation.
- **FR-019**: Motion MUST remain restrained (reveal/hover/section transitions only), MUST respect
  `prefers-reduced-motion`, and MUST NOT introduce scroll hijacking or long intro sequences.
- **FR-020**: Public pages MUST NOT ship unnecessary client JavaScript; interactive islands MUST be
  the exception, not the page default.
- **FR-021**: The site MUST implement the section-by-section public guidance in
  `docs/design-guidance/Hills-Coffee-Website-Recommendations.md` adapted to the Hills design system,
  copying no external site's code, branding, layout, text or imagery.
- **FR-022**: Public commercial pages MUST never expose owner identity, private contract price,
  private documents, exact warehouse location, or private quantity (SRS SEO-APP-02).

## Security Requirements

- **SEC-001**: All public data access MUST run through the anonymous/user-scoped Supabase client;
  the service-role key MUST NOT appear anywhere in this feature.
- **SEC-002**: Public pages MUST NOT call `getRequestIdentity()` to gate content in a way that
  makes a shared cache entry vary by user; any personalised element MUST be an explicitly
  non-cached island.
- **SEC-003**: Form handling MUST validate server-side with Zod at the Server Action boundary and
  MUST return safe errors that never echo database messages.
- **SEC-004**: Submitted inquiry content MUST be treated as untrusted input and never rendered
  unescaped anywhere, including in any operational view built later by 010.
- **SEC-005**: No secret, connection string or privileged identifier may appear in client bundles or
  in structured data output.

## Edge Cases

- A coffee is unpublished while a visitor is on its cached page → the next revalidation removes it;
  a direct request 404s.
- An origin has no published coffees → the origin page renders with an honest empty state, not an
  error.
- A price source's `licence_status` changes from `APPROVED` to `RESTRICTED` → the price element
  disappears or degrades to a disclosure, and never renders the last-known value as current.
- Sitemap generation encounters a very large catalogue → pagination/splitting per the SEO contract.
- A crawler requests a removed offer route → 410 rather than a soft 404.
- A visitor with reduced-motion enabled loads a section-reveal page → content appears without motion.
- RFQ submitted with a disposable/invalid email → server-side validation rejects it with a field
  error, and the abuse control counts the attempt.
- JavaScript fails to load entirely → primary content, navigation and CTAs still work.

## Success Criteria

- **SC-001**: 100% of public pages return meaningful server-rendered content with valid title,
  description and canonical in the initial HTML response.
- **SC-002**: Zero private (member/order/inventory/listing/payment/KYB) values appear in any public
  page's HTML, serialized props, or structured data, verified by automated inspection.
- **SC-003**: The generated sitemap contains zero private routes, and every private route is
  independently marked non-indexable.
- **SC-004**: Every displayed reference price shows all six required disclosure elements; a stale
  feed is labelled stale in 100% of observed cases.
- **SC-005**: Public pages meet the project's Core Web Vitals targets on a mid-tier mobile profile.
- **SC-006**: All public interactive elements are operable by keyboard with a visible focus
  indicator, and automated accessibility checks report no critical violations.
- **SC-007**: Every public layout renders without breakage at `dir="rtl"` and at mobile, tablet and
  desktop breakpoints.
- **SC-008**: An RFQ submission cannot be persisted through any path that bypasses server-side
  validation or the approved data destination.

## Assumptions

- Public catalogue content (published coffees, active origins, media, translations) is populated by
  Hills operations via 010; this feature renders it and does not author it.
- The approved public data set is exactly the RLS-public tables listed in the capability map; no
  additional public exposure is inferred.
- Price semantics, ingestion, conversion and staleness determination are owned by 011; this feature
  consumes 011's presentation contract.
- Photography and editorial imagery are supplied by content owners; every media area is a labelled
  placeholder until then (per `docs/claude-design/` known gaps).

## Open items / blockers

- **DB-BLOCK-02 (blocking PS3/FR-014)**: no approved destination exists for an anonymous RFQ.
  Options requiring a product/business decision: (a) gate RFQ behind lightweight account creation so
  `support_tickets` can be used; (b) approve a new public inquiry table through the Constitution's
  database-change process; (c) route public RFQ to an external CRM/email destination approved by
  the business. Do not choose silently.
- The SRS requires a CRM hand-off for RFQ, samples and portal applications (design-guidance "rules
  the developer must not break" #5). No CRM integration is approved in the current baseline —
  record the destination decision before implementing FR-014's persistence.

## Dependencies

| Depends on | Why |
|---|---|
| 001-platform-foundation | Root layout, design tokens, state components, i18n, caching conventions, Supabase client boundary |
| 011-pricing-reference-data | Price type semantics, freshness/disclosure contract consumed by PS5 |
| 003-auth-membership-kyb | Destination of the membership/sign-in entry points |
| 010-admin-operations-console | Authoring of the catalogue/content this feature renders |
