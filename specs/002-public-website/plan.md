# Implementation Plan: Public Website

**Feature**: `002-public-website` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)
**Status**: Planning prepared — implementation NOT started
**Foundation**: 001-platform-foundation is **IMPLEMENTED AND VERIFIED** — its cache API decision,
Supabase client boundary, `StateScreen`, Server Action contract, i18n foundation, Hills tokens and
test tooling are live and binding on this feature.

## Summary

Build the public acquisition surface on top of 001: a server-rendered, tag-cached, SEO-correct site
that reads only anonymously-readable tables through explicit column allowlists, presents Hills'
coffee/origin/sourcing content, and routes visitors toward an RFQ or a membership entry. The homepage
is implemented **in place** at the locked `src/app/page.tsx`, sharing a `PublicShell` with the
`(public)` route group. No private data is ever queried, cached, or serialized on this surface, and
every capability the database cannot support is stopped at an explicit, recorded boundary.

## Companion contracts (binding)

| Contract | Governs |
|---|---|
| [`contracts/public-dto-allowlist.md`](./contracts/public-dto-allowlist.md) | Publishable fields, denylist, canary verification |
| [`contracts/public-cache-policy.md`](./contracts/public-cache-policy.md) | Cache API, tag register, ownership, fallback |
| [`contracts/public-route-lifecycle.md`](./contracts/public-route-lifecycle.md) | Status map, canonicals, trailing slash, indexation |
| [`contracts/rfq-contract.md`](./contracts/rfq-contract.md) | RFQ shape, results, abuse posture, blocked boundary |
| [`contracts/reference-price-presentation.md`](./contracts/reference-price-presentation.md) | Price presentation limits |
| [`contracts/public-copy-architecture.md`](./contracts/public-copy-architecture.md) | Server-safe typed English copy; i18next ownership; copy vs constant |
| [`contracts/product-ui-foundation.md`](./contracts/product-ui-foundation.md) | **Phase 5.5**: one Hills design system across Public/Member/Admin — 96rem grid, typography, controls, states, theme, direction, imagery |

## Phase 5.5 — Full Product UI Foundation (inserted before Phase 6)

A product-scope amendment adds **Phase 5.5** between Phases 5/7 and Phase 6. It establishes the UI
foundation for the entire Hills Coffee product — Public, Member (Buyer + Seller additive) and Admin —
rather than leaving Features 003–012 to invent five divergent visual systems.

- **Plan**: [`PHASE-5.5-UI-FOUNDATION-PLAN.md`](./PHASE-5.5-UI-FOUNDATION-PLAN.md)
- **Tasks**: [`PHASE-5.5-TASKS.md`](./PHASE-5.5-TASKS.md) — `UIF-001`–`UIF-058`, 9 blocks
- **Contract**: [`contracts/product-ui-foundation.md`](./contracts/product-ui-foundation.md)

It owns visual/structural readiness only — **UI FOUNDATION READY ≠ BUSINESS FEATURE COMPLETE**. It
renumbers no existing task and marks none complete. It formally amends FR-018 (EN/العربية) and adds
FR-032/FR-033; see the plan §8 for why that aligns with the SRS and `docs/claude-design`.

---

## Technical Context

**Language/Runtime**: TypeScript 5 strict, Next.js 16.3.4 App Router, React 19.2.8 — Server
Components by default.
**Data**: Supabase/PostgreSQL via 001's anonymous/user-scoped server client — anonymously-readable
tables only, explicit column allowlists.
**Caching**: **`unstable_cache` + `revalidateTag(tag, { expire: 0 })` from `next/cache`** — the
API Feature 001 pinned and verified. **Not** `"use cache"` / `cacheTag()` / `cacheLife()` /
`updateTag()` / `cacheComponents`. No Redis, no Upstash.
**Config change**: `next.config.ts` gains **`trailingSlash: true`** and nothing else. No cache flag.
**Design**: `docs/claude-design/` tokens through 001's existing `globals.css` remap and font
foundation — extended, never duplicated. Section guidance from
`docs/design-guidance/Hills-Coffee-Website-Recommendations.md`.
**Testing**: Vitest + RTL (from 001) for DTO/component/render logic and leakage canaries; **a real
browser** (Chrome over CDP, the technique 001 proved without adding a heavyweight dependency) for
layout, RTL, keyboard, reduced-motion and performance — jsdom is explicitly **not** accepted as
proof of browser layout.
**Constraints**: no service-role; no private table access; no locale routing (RTL-safe only);
restrained motion; minimal client JS.

## Database capabilities consumed

Read-only, anonymous-safe, per `docs/architecture/DATABASE-CAPABILITY-MAP.md` §4:

`coffees` (PUBLISHED) · `coffee_media` (metadata only) · `coffee_tags` · **`coffee_certifications`** ·
`origins` (ACTIVE) · `regions` · `coffee_types` · `coffee_varieties` · `processing_methods` ·
**`packaging_types`** · `tags`.

**Deliberately NOT consumed, though anonymously readable:**

| Table | Why not |
|---|---|
| `warehouses` | Carries `owner_organization_id`, `address`, `city`, `code` — owner identity and exact location, forbidden by SEO-APP-02. Generic custody/logistics claims are reviewed page copy instead |
| `price_sources`, `price_observations`, `price_differentials` | Reading them would mean 002 inventing 011's freshness/licence/conversion semantics. Deferred (PRICE-011, DB-OPEN-08) |
| `coffee_translations`, `origin_translations` | English-first, no locale routing (001 Clarify). Recorded so they are not mistaken for the missing content source |

**Never touched**: `coffee_offers`, `coffee_lots`, `orders`, `order_financials`, `inventory_*`,
`payments`, `payouts`, `commission_policies`, `commission_tiers`, `tax_rules`, `shipping_rules`,
`payment_accounts`, `kyb_*`, `organizations`, `profiles`, `disputes`, `notifications`, `audit_logs`,
`file_assets`, `coffee_documents`, `support_*`.

**Database reality check**: grade, cup score and crop year are in `coffee_lots`, which is
member-only (and DB-OPEN-05 makes its policy suspect). Public coffee pages present taxonomy, origin,
description, tags and certifications — **not** a quality score. The spec's acceptance criteria are
written against that reality.

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| II Source priority | PASS | SRS §5/§9/§13.8/§20 → DB baseline → design guidance → Claude Design |
| III Database authority | PASS | Read-only; zero schema change; seven blockers recorded, none worked around |
| IV Locked root files | PASS | `page.tsx`/`layout.tsx`/`globals.css` stay at their paths; homepage implemented in place; narrow in-place edits permitted, relocation is not |
| V Surface separation | PASS | Public only. The one touch on `/dashboard*` is metadata-scoped (FR-009) with an authorization regression check |
| VII Public/private boundary | PASS | FR-003/022/024, SC-002; enforced by an allowlist contract and canary tests |
| VIII Server-side authorization | PASS (n/a) | No protected data here. Public pages never call `getRequestIdentity()` |
| XI Next.js-native caching only | PASS | `unstable_cache` + `revalidateTag`; no external cache; no Cache Components |
| XI Selective rate limiting | PASS | FR-015 scopes safeguards to the RFQ endpoint and states their limits honestly (ABUSE-01) |
| XII Rendering discipline | PASS | FR-020 makes Server-Component-by-default an explicit build rule, audited at closure |
| XIII Design fidelity | PASS | Extends 001's tokens/fonts; external sites are inspiration only (FR-021) |
| XIV Security/secrets | PASS | SEC-001…005 |
| XV Spec-driven / ambiguity | PASS | Seven blockers surfaced with explicit boundaries; nothing guessed |

## Architecture decisions

1. **Homepage in place, shell shared.** `src/app/page.tsx` becomes the real homepage. Because the
   root page does **not** inherit `src/app/(public)/layout.tsx`, header/footer live in a reusable
   **`PublicShell`** consumed by both the root page and the route-group layout. This is the fix for
   the previously-planned structure, which would have left the homepage without the public chrome.
2. **Public route group.** Remaining public routes live under `src/app/(public)/…` — a route *group*
   for shared layout/metadata that never appears in a URL and never relocates the locked root files.
3. **Data access via an auditable public read layer.** All public queries live in `lib/public/*`,
   each using an explicit column allowlist and returning a named DTO. Pages never build ad-hoc
   Supabase queries. This makes SC-002 auditable by reading one directory.
4. **Cache tags per content domain**, registered with owner and fallback in
   `contracts/public-cache-policy.md`: `public-coffees`, `public-coffee:{slug}`, `public-origins`,
   `public-origin:{slug}`, `public-taxonomy`. Each carries a `revalidate` ceiling **because no
   mutation owner exists yet** — Feature 010 adds on-demand invalidation later.
5. **Reference pricing is a consumed contract, not a query.** 002 renders the unavailable state and
   never touches price tables.
6. **SEO layer is data-driven.** `sitemap.ts` and `robots.ts` generate from the same read layer, so a
   route cannot reach search without passing the DTO boundary.
7. **Content source is split, deliberately.** *Section/UI copy* (homepage, sourcing, navigation,
   CTAs) is this feature's own reviewed copy in 002-owned English resources. *CMS-managed editorial
   and legal documents* have **no approved source** — `/knowledge/*` and `/legal/*` are withheld
   under CONTENT-01 rather than invented. This split is what stops one blocked content module from
   freezing coffee, origin and homepage work.
8. **Abuse control is endpoint-local and honestly labelled.** In-process, per-instance, non-durable;
   ABUSE-01 records what is still missing.
9. **Motion budget.** `motion` for section reveals, hover and component enter/exit. **Amended
   2026-09-09 (MOTION-GSAP-01): GSAP is approved for Phase 5.5** — scoped via `gsap.context()`, one
   engine per property, timelines reverted on unmount. **Lenis is still not initialised.** Every
   motion respects `prefers-reduced-motion`.
10. **Trailing slash is a shared-config change.** `trailingSlash: true` affects `/dashboard*` too, so
    it ships with a Feature 001 authorization regression check (SC-010).

## Project structure (files this feature adds/edits)

```text
next.config.ts                        # EDITED — trailingSlash: true (only change)

src/app/
├── page.tsx                          # EDITED IN PLACE — homepage composition inside <PublicShell> (locked path)
├── sitemap.ts                        # NEW — generated from the public read layer
├── robots.ts                         # NEW — disallows /dashboard, /dashboard-admin
├── dashboard/layout.tsx              # NARROW EDIT ONLY — verify/extend noindex metadata; guards untouched
├── dashboard-admin/layout.tsx        # NARROW EDIT ONLY — same
├── foundation-status/page.tsx        # NARROW EDIT ONLY — add noindex metadata (001 route; cache proof untouched)
├── internal-test/cache-proof/route.ts # NEW — the cache-proof route (contracts/public-cache-policy.md §5.3):
│                                     #       GET reads the stamp, POST revalidates; requires BOTH
│                                     #       CACHE_PROOF_ENABLED=true AND x-cache-proof-secret matching
│                                     #       CACHE_PROOF_SECRET; empty 404 otherwise (NODE_ENV is not the gate);
│                                     #       fixed tag allowlist; noindex + robots-disallowed; unlinked
└── (public)/
    ├── layout.tsx                    # NEW — wraps children in the same <PublicShell>
    ├── coffee/page.tsx + [slug]/page.tsx
    ├── origins/page.tsx + [slug]/page.tsx
    ├── sourcing/page.tsx
    ├── contact/page.tsx              # NEW — RFQ entry
    ├── contact/actions.ts            # NEW — RFQ Server Action (validated; persistence blocked)
    └── portal-entry/page.tsx         # NEW — honest placeholder until 003 exists
    #  knowledge/* and legal/* are NOT created — CONTENT-01

components/public/
├── public-shell.tsx                  # NEW — the shared header/footer chrome (root + route group)
├── site-header.tsx · site-footer.tsx
├── hero.tsx · intent-cards.tsx · section blocks
├── coffee-card.tsx · origin-card.tsx
├── media-placeholder.tsx             # NEW — stable labelled placeholder (MEDIA-01)
├── rfq-form.tsx
└── reference-price.tsx               # NEW — unavailable-state shell

lib/public/
├── coffees.ts · origins.ts · taxonomy.ts     # NEW — cached, allowlisted, DTO-returning reads
├── seo.ts                                    # NEW — metadata + safe JSON-LD serialisation
└── copy/                                     # NEW — the single typed English dictionary (T000).
                                              #   Plain .ts: NO "use client", no react/i18next import,
                                              #   so Server AND Client Components share one source.

lib/validation/rfq.ts                 # NEW — shared RFQ schema (client + server)

scripts/seed-test-fixtures.ts         # EXTENDED — catalogue fixture section added to 001's existing
                                      #   privileged seed/teardown script (the only service-role site)
tests/public/fixture-catalogue.ts     # NEW — unprivileged catalogue fixture constants; reuses
                                      #   createAnonymousFixtureClient() from tests/auth/fixture-session.ts
tests/public/                         # NEW — canary leakage, metadata, status, cache, RFQ, JSON-LD
tests/browser/                        # NEW — real-browser layout/RTL/a11y/performance checks
```

### Public copy — one typed dictionary, server-safe by construction

Feature 001's `lib/i18n/config.ts` is `"use client"` and its dictionary is **empty** — it wired the
mechanism and deliberately shipped no copy. A Server Component therefore cannot read copy from it
without being pulled across the client boundary, which would defeat FR-020.

The fix (T000, full rules in
[`contracts/public-copy-architecture.md`](./contracts/public-copy-architecture.md)) is **one plain
TypeScript dictionary**, not a second i18n system:

| Concern | Decision |
|---|---|
| Location | `lib/public/copy/` — `en.ts` (the dictionary, `as const`) + `index.ts` (typed accessor) |
| Server-safe property | **no `"use client"`, no `react` import, no `i18next` import** — a neutral module importable from Server Components, Client Components, `generateMetadata`, `sitemap.ts` and Route Handlers alike |
| Server Components read it | direct import; strings are inlined into server-rendered HTML; **zero** client JS added |
| Client Components read it | the **same** direct import — one source, no duplicate dictionary |
| i18next stays | exactly where 001 put it (`lib/i18n/config.ts`, client-side, root-layout provider). No second initialisation, no second library, no `useTranslation()` in this feature |
| Type safety | a missing or misspelled key is a **compile error**, not a runtime `undefined` |
| Runtime | English-first; RTL-ready (no directional assumptions in copy); **no locale routing, no switcher** |
| Later locale switching | feeds i18next's `en.translation` **from this same module** — one dictionary either way, so no drift is possible |

**Copy vs technical constant**: route paths, cache tags, HTML ids, `data-*`, test ids, class names
and header names are constants and stay in code. The test is *"would a translator or content owner
ever change this string?"* Closure check: **T057** (SC-012).

### Catalogue test fixtures — extend 001, do not fork it

Feature 002's runtime checks (status gating, canary leakage, metadata, sitemap, JSON-LD, cache) need
deterministic catalogue data. That is **T006a**, and it **extends Feature 001's existing fixture
architecture rather than creating a parallel seed system**:

- The privileged half lives in `scripts/seed-test-fixtures.ts`, reached through the existing
  `npm run test:seed` / `test:seed:teardown` scripts. It remains the **only** place the service-role
  key is constructed; runtime application code never touches it.
- The unprivileged half follows `tests/auth/fixture-session.ts`'s convention — deterministic exported
  constants plus **reuse of `createAnonymousFixtureClient()`** so public-boundary assertions run as a
  genuine anonymous client. The test runtime never reads the privileged credential.
- Same discipline as 001: fixed UUIDs/slugs, idempotent upsert, safe repeated execution, exact
  teardown, canonical-state restoration, **no schema change, no RLS change, no migration, no
  permanent production-business records**.

**Schema-verified shape** (all FKs on `coffees`/`origins` are nullable; `created_by`/`updated_by` are
left NULL so no profile coupling is introduced): minimal taxonomy/reference rows; one `PUBLISHED`
coffee plus `DRAFT` and `ARCHIVED` coffees (the only other values `coffees.status` permits); one
`ACTIVE` origin plus `INACTIVE` and `ARCHIVED` origins (likewise for `origins.status`); one
`coffee_certifications` row with `file_asset_id` left NULL.

**Deliberately not created**: `coffee_media` — its `file_asset_id` is **NOT NULL**, so a row would
require inventing a Storage asset (forbidden; MEDIA-01 placeholders cover this) — and no
`coffee_offers`, `coffee_lots`, member prices, `warehouses`, reference-price, RFQ or commission rows.
Canaries are therefore limited to non-public row descriptions, the certification number, and the
organization name 001 already seeds.

Note `components/public/` rather than `components/marketing/`: this surface is a public *product*
surface, and 001's component-organization rule (research §13) is to create a domain folder only when
real components need one. One folder, named for the surface it serves.

## Caching & revalidation

Full register in [`contracts/public-cache-policy.md`](./contracts/public-cache-policy.md) §3.
Summary — **and an honest statement of today's behaviour**:

| Read | Tag | TTL ceiling | Invalidated by | Today |
|---|---|---|---|---|
| Coffee index / detail | `public-coffees`, `public-coffee:{slug}` | 3600s | 010 catalogue mutations | **not implemented — TTL only** |
| Origin index / detail | `public-origins`, `public-origin:{slug}` | 3600s | 010 catalogue mutations | **not implemented — TTL only** |
| Taxonomy | `public-taxonomy` | 86400s | 010 catalogue mutations | **not implemented — TTL only** |

Nothing on this surface is user-scoped, so every entry is safely shared. No content tag and no
price tag are registered, because neither source exists.

**Authority**: `specs/001-platform-foundation/contracts/cache-policy-contract.md` remains the
**platform-wide** cache authority (approved/excluded APIs, cacheable categories, the platform tag
table). 002's `contracts/public-cache-policy.md` is a **subordinate per-feature register**, not a
second architecture; on any conflict 001 governs. T030 adds 002's five tags as rows to 001's table.

**Proving revalidation safely**: each cached entry carries a computation stamp (`computedAt` + token)
exposed only to tests, so a recompute is observable without mutating catalogue data. It is invoked
through a **non-public, non-production, secret-guarded** route (T031a). **An anonymous or publicly
reachable cache-purge route must not be created** — on catalogue tags that is a DoS and
cost-amplification vector. Full rules: `contracts/public-cache-policy.md` §5.

## Verification strategy

**Leakage (highest value)** — seed private canary values and assert they appear in none of: public
DTO output, SSR HTML, RSC/Flight payload, metadata, JSON-LD, sitemap, rendered pages. Field-name
checks are kept as a *secondary* structural test; the canary is the primary proof because it follows
the value rather than the label.

**SEO/metadata** — title/description/canonical/OG on every owned public route; sitemap excludes
private routes and matches canonicals; robots disallows both private prefixes; trailing-slash
redirects behave; JSON-LD validates, escapes an injected `<` payload, and carries no private field.

**Status gating** — non-`PUBLISHED` coffee and non-`ACTIVE` origin both 404, indistinguishably from
an unknown slug. No test asserts 301/410 (LIFE-01).

**Cache** — a real read → same value → approved revalidation → **different** value cycle against a
running build, mirroring 001's proven `/foundation-status` pattern.

**RFQ** — invalid input rejected with field errors; missing consent rejected; over-length rejected;
valid input returns the honest *unavailable* outcome; safeguard triggers without disclosing
thresholds; **no test asserts persistence**.

**Browser (real, not jsdom)** — mobile/tablet/desktop rendering, `dir="rtl"` with long strings,
keyboard traversal and focus visibility, `prefers-reduced-motion`, layout stability, and Core Web
Vitals against SC-005's thresholds. Automated accessibility checks run against WCAG 2.2 AA.

**Authorization regression** — after `trailingSlash: true` and the noindex metadata edits, Feature
001's guards still deny anonymous and cross-surface access on both protected surfaces.

## Tooling decisions required

| Need | Position |
|---|---|
| Real browser verification | Use the **CDP-over-installed-Chrome** technique Feature 001 proved (Node's built-in `WebSocket`/`fetch`, no new package). If a richer harness is later wanted, adding it is a dependency decision to be recorded, not assumed |
| Automated accessibility | Requires an axe-style rule engine. Introduce it as a **dev-only dependency**, recorded explicitly at the task that needs it. Do not claim WCAG conformance from hand-written assertions alone |
| Performance measurement | Collect CWV from the real browser session against SC-005's thresholds; do not infer performance from bundle size alone |

## Risks & blockers

| Risk / blocker | Impact | Handling |
|---|---|---|
| **DB-BLOCK-02** — no anonymous RFQ destination | PS3 cannot persist | Build form + validation + safeguards; stop before persistence; return the honest unavailable outcome |
| **CRM-DEST-01** — no approved CRM destination | RFQ has no downstream owner | Recorded; business decision required before production |
| **CONTENT-01** — no approved content source | `/knowledge/*`, `/legal/*` cannot ship | Routes withheld, not faked. Section copy is 002-owned and unaffected. **Does not block** coffee/origin/homepage/shell |
| **PRICE-011** — 011 unimplemented | No numeric pricing | Render the unavailable state; never query price tables |
| **LIFE-01** — no redirect/tombstone capability | No 301/410 | Implement 200/404 only; preserve the SRS requirement as unmet |
| **ABUSE-01** — no durable abuse protection | Production hardening gap | Endpoint-local best-effort only, labelled honestly |
| **MEDIA-01** — no Storage/public file delivery | No real imagery | Stable labelled placeholders; no bucket created, no URL guessed |
| `trailingSlash` affects `/dashboard*` | Could regress verified auth | Explicit authorization regression check (SC-010) |
| Catalogue empty in dev | Pages look broken | Honest empty states + seeded fixtures for tests |

## Execution graph (truthful)

**Phase 1 does not block everything.** Blocked content work is separated, so independent streams run
concurrently:

```text
P1 Shell & config ─────────────┬──────────────────────────────────────────┐
 (PublicShell, route group,    │                                          │
  trailingSlash + auth check)  │                                          │
                               ▼                                          ▼
                    P2 Public read layer                      P5 RFQ (UI → validation
                    (coffees, origins, taxonomy)                  → unavailable result)
                       │            │                                     │
        ┌──────────────┘            └───────────┐                         │
        ▼                                       ▼                         │
   P3 Homepage                        P4 Coffee & origin routes           │
        │                                       │                         │
        └──────────────┬────────────────────────┘                         │
                       ▼                                                  │
              P6 SEO layer (metadata, sitemap,                            │
                 robots, JSON-LD, lifecycle)                              │
                       │                                                  │
                       └────────────────┬─────────────────────────────────┘
                                        ▼
                            P8 Verification & closure
                                        ▲
   P7 Reference-price shell ────────────┘   (depends on nothing but the shell)
   Portal placeholder ──────────────────┘
```

- **Coffee/origin DTO work proceeds independently** of any content blocker.
- **Shell/homepage work is safe** once `PublicShell` exists.
- **RFQ UI/validation/unavailable flow proceeds** without persistence.
- **Reference-price shell proceeds** without Feature 011.
- **SEO work follows the routes it describes**, not the whole feature.
- **Browser/a11y/performance phases follow the pages**, not the tests.
- `/knowledge/*` and `/legal/*` are **absent from the graph** — withheld under CONTENT-01, blocking
  nothing else.
