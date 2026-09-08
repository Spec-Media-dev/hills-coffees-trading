# Implementation Plan: Public Website

**Feature**: `002-public-website` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)
**Status**: Planning prepared — implementation NOT started

## Summary

Build the public acquisition surface on top of 001's foundation: a server-rendered, cached,
SEO-correct site that reads only RLS-public tables, presents Hills' coffee/origin/knowledge content
and (where licensed) reference pricing, and converts visitors into an RFQ or a membership
application. The homepage is implemented **in place** at the locked `src/app/page.tsx`. No private
data is ever queried, cached, or serialized on this surface.

## Technical Context

**Language/Runtime**: TypeScript 5 strict, Next.js 16.3.4 App Router, React 19.2.8 (Server
Components by default).
**Data**: Supabase/PostgreSQL via 001's anonymous/user-scoped server client — public tables only.
**Caching**: Next.js-native only (`cacheTag`/`cacheLife`/`revalidateTag`), no external cache.
**Design**: `docs/claude-design/` tokens applied through 001's `globals.css` remap; section guidance
from `docs/design-guidance/Hills-Coffee-Website-Recommendations.md`.
**Testing**: Vitest + RTL (from 001) for component/render logic; route-level assertions for metadata,
sitemap and private-data leakage; accessibility checks on public pages.
**Constraints**: no service-role usage; no private table access; no locale routing (RTL-safe only);
restrained motion; low client JS.

## Database capabilities consumed

Per `docs/architecture/DATABASE-CAPABILITY-MAP.md` §4 — read-only, anonymous-safe:
`coffees` (PUBLISHED), `coffee_media`, `coffee_translations`, `coffee_tags`, `origins` (ACTIVE),
`origin_translations`, `regions`, `coffee_types`, `coffee_varieties`, `processing_methods`, `tags`,
`warehouses` (is_active — for generic custody/logistics context only, never per-lot location),
`price_sources` (APPROVED licence), `price_observations`, `price_differentials`.

**Never touched by this feature**: `coffee_offers`, `orders`, `inventory_*`, `payments`,
`kyb_*`, `organizations`, `disputes`, `notifications`, `audit_logs`.

**Blocked capability**: RFQ persistence — see DB-BLOCK-02 in the capability map.

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| II Source priority | PASS | SRS §5/§9/§20 → DB baseline → design guidance → Claude Design |
| III Database authority | PASS | Read-only; zero schema change; DB-BLOCK-02 recorded, not worked around |
| IV Locked root files | PASS | Homepage implemented *in place* at `src/app/page.tsx`; no relocation |
| V Surface separation | PASS | Public only; no `/dashboard*` route touched |
| VII Public/private boundary | PASS | FR-003, FR-022, SC-002 enforce it; SEO-APP-01/02 respected |
| VIII Server-side authorization | PASS (n/a) | No protected data on this surface |
| XI Next.js-native caching only | PASS | Tagged public caches; no Redis/Upstash; no shared cache of private data |
| XI Selective rate limiting | PASS | FR-015 scopes abuse control to the RFQ endpoint only |
| XIII Design fidelity | PASS | Hills tokens/typography; external sites are inspiration only (FR-021) |
| XIV Security/secrets | PASS | SEC-001..005 |
| XV Spec-driven / ambiguity | PASS | DB-BLOCK-02 and the CRM destination are surfaced, not guessed |

## Architecture decisions

1. **Homepage in place.** `src/app/page.tsx` becomes the real homepage; sections are extracted into
   `components/marketing/*` so the route file stays thin. The file is never moved (Constitution IV).
2. **Public route group.** Remaining public routes live under `src/app/(public)/…` — a route *group*
   for shared layout/metadata that does not alter the URL and does not relocate the root files.
3. **Data access via a public read layer.** All public queries live in `lib/public/…` modules
   (`coffees.ts`, `origins.ts`, `content.ts`), each returning a DTO with only public-safe fields.
   Pages never build ad-hoc Supabase queries inline — this makes SC-002 (no private leakage)
   auditable by reading one directory.
4. **Cache tags per content domain.** `catalog-coffees`, `catalog-coffee:{slug}`, `catalog-origins`,
   `catalog-origin:{slug}`, `public-content`, `reference-prices`. Registered in 001's cache-policy
   contract; revalidated by 010's catalogue mutations.
5. **Reference pricing is a consumed contract.** This feature renders 011's presentation DTO
   (value, unit, currency, observed_at, delay type, staleness, disclosure). If 011 is not yet
   implemented, the surface renders its documented "not yet available" state rather than querying
   price tables ad hoc.
6. **SEO layer is data-driven.** `sitemap.ts` and `robots.ts` are generated from the same public
   read layer, so a route can never be published to search without going through the DTO boundary.
7. **Abuse control is endpoint-local.** The RFQ Server Action carries its own throttle (in-process /
   database-backed counter, no external cache), per Constitution XI.
8. **Motion budget.** Motion (`motion`) only for section reveals and hover states; GSAP/Lenis are
   NOT initialised by this feature. Every motion respects `prefers-reduced-motion`.

## Project structure (files this feature adds/edits)

```text
src/app/
├── page.tsx                          # EDITED IN PLACE — real homepage composition (locked path)
├── sitemap.ts                        # NEW — generated from the public read layer
├── robots.ts                         # NEW — disallows /dashboard, /dashboard-admin
└── (public)/
    ├── layout.tsx                    # NEW — public header/footer shell, shared metadata
    ├── coffee/page.tsx + [slug]/page.tsx
    ├── origins/page.tsx + [slug]/page.tsx
    ├── sourcing/page.tsx
    ├── knowledge/page.tsx + [slug]/page.tsx
    ├── contact/page.tsx              # NEW — RFQ entry
    ├── contact/actions.ts            # NEW — RFQ Server Action (validated; persistence gated on DB-BLOCK-02)
    └── legal/[slug]/page.tsx

lib/public/
├── coffees.ts · origins.ts · content.ts · prices.ts   # NEW — cached, DTO-returning read layer
└── seo.ts                                             # NEW — metadata/structured-data builders

components/marketing/                  # NEW — header, footer, hero, intent cards, section blocks,
                                       #       coffee card, origin card, RFQ form, price disclosure

tests/public/                          # NEW — leakage, metadata, sitemap, a11y, RTL tests
```

## Caching & revalidation

| Read | Tag | Revalidated by |
|---|---|---|
| Coffee index / detail | `catalog-coffees`, `catalog-coffee:{slug}` | 010 catalogue mutations |
| Origin index / detail | `catalog-origins`, `catalog-origin:{slug}` | 010 catalogue mutations |
| Knowledge / legal content | `public-content` | 010 content mutations |
| Reference price presentation | `reference-prices` | 011 ingestion |

Nothing on this surface is user-scoped, so every cache entry here is safely shared.

## Testing strategy

- **Leakage tests** (highest value): render each public page against seeded data and assert the
  serialized output contains no private identifiers/fields.
- **Metadata/SEO tests**: title/description/canonical/OG presence; sitemap excludes private routes;
  robots disallows `/dashboard*`.
- **Status-gating tests**: non-`PUBLISHED` coffee → 404; non-`ACTIVE` origin → 404.
- **Price disclosure tests**: all six disclosure elements present; stale source renders stale state.
- **Form tests**: RFQ server-side validation rejects invalid input; abuse control triggers.
- **A11y/RTL tests**: keyboard operability, focus visibility, `dir="rtl"` layout integrity,
  reduced-motion.

## Risks & blockers

| Risk / blocker | Impact | Handling |
|---|---|---|
| **DB-BLOCK-02** — no anonymous RFQ destination | PS3 cannot fully ship | Build+validate the form and action; stop before persistence; escalate the destination decision |
| CRM hand-off unapproved | RFQ has no downstream owner | Recorded as an open item in spec.md; business decision required |
| 011 not yet implemented | PS5 has no data | Render the documented unavailable state; do not query price tables ad hoc |
| No photography supplied | Visual completeness | Labelled placeholders per design-system known gaps |
| Catalogue empty in dev | Pages look broken | Honest empty states (FR + edge cases), seeded fixtures for tests |
