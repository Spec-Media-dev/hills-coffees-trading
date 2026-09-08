# Contract: Public Route Lifecycle, Status Map & Canonical URLs

Governs FR-002, FR-004, FR-005, FR-006, FR-008, FR-009; PS1, PS6; SRS §5.1 (Routes, Lifecycle,
Rendering, Discovery), AC-07.

Blocker: **LIFE-01 — BLOCKS SUB-FLOW** (redirect/tombstone capability, §3).

---

## 1. Route inventory and status behaviour

| Route | Source | 200 when | 404 when |
|---|---|---|---|
| `/` | page composition (locked `src/app/page.tsx`) | always | — |
| `/coffee/` | `coffees` (PUBLISHED) | always (empty state if none) | — |
| `/coffee/{slug}/` | `coffees` | `status = 'PUBLISHED'` | any other status, or unknown slug |
| `/origins/` | `origins` (ACTIVE) | always (empty state if none) | — |
| `/origins/{slug}/` | `origins` | `status = 'ACTIVE'` | `INACTIVE`, `ARCHIVED`, or unknown slug |
| `/sourcing/` | reviewed page copy (002-owned) | always | — |
| `/knowledge/` · `/knowledge/{slug}/` | **CONTENT-01 — blocked** | — | see §4 |
| `/legal/{slug}/` | **CONTENT-01 — blocked** | — | see §4 |
| `/contact/` | RFQ form | always | — |
| `/sitemap.xml` · `/robots.txt` | generated | always | — |

**Non-public is indistinguishable from non-existent, deliberately.** A `DRAFT` coffee and a
never-existed slug both return a plain 404. Any distinction would leak the existence of unpublished
catalogue content to an anonymous visitor.

---

## 2. What is implementable today: 200 and 404 only

The approved database **cannot durably distinguish** *renamed* from *withdrawn* from
*never existed*:

- there is no alias / previous-slug table;
- there is no tombstone or redirect table;
- `coffees.status` has `ARCHIVED`, but that row is **not anonymously readable** (RLS gates on
  `PUBLISHED`), so the public layer cannot even observe that an archived coffee once existed;
- slugs are mutable in place, leaving no trace of the previous value.

Therefore Feature 002 implements exactly:

- **200** — active/public content
- **404** — everything else (unknown, unpublished, inactive, archived, renamed-away)

**301 and 410 are NOT implemented, and must not be faked.** Emitting 410 for an unknown slug would
assert "this existed and was removed" — a claim the database cannot support, and one that
misinforms crawlers. Guessing at renames would be worse.

### Next.js status-code note (verified against the installed version)

`permanentRedirect()` in the App Router returns **308**, and `redirect()` returns **307** — *not*
301/302. The SRS's "301" language predates this framework choice. When LIFE-01 is resolved, whoever
implements it must decide deliberately between 308 (framework-native) and a genuine 301 (which
requires emitting the response another way), rather than assuming `permanentRedirect()` satisfies a
literal "301" requirement.

---

## 3. LIFE-01 — deferred capability

| ID | LIFE-01 |
|---|---|
| **Need** | Durable redirect / tombstone lifecycle so renamed routes can 301/308 and withdrawn routes can 410 |
| **Missing** | Any alias/previous-slug store; any tombstone marker; any anonymously-readable signal that a route once existed |
| **SRS** | §5.1 Lifecycle — "Correct 200/301/404/410 behavior for active, renamed, ended, and removed offers/lots" |
| **Status** | **BLOCKS SUB-FLOW** — blocks only lifecycle beyond 200/404 |
| **Does not block** | Coffee, origin, homepage, shell, SEO metadata, sitemap, robots, RFQ, or any other 002 work |
| **Resolution** | A database-capability decision through the Constitution's process (alias/tombstone table + anonymous read policy), then the owning feature implements the codes |

The SRS requirement is **preserved, not deleted** — 002 records it as unmet for eventual production
compliance rather than silently narrowing the requirement.

---

## 4. Content routes and CONTENT-01

`/knowledge/*` and `/legal/*` have **no approved content source** (see `spec.md` → CONTENT-01). Until
one exists, these routes are **not published**: they are absent from navigation and absent from the
sitemap. An absent route returning 404 is honest; a published route rendering invented editorial or
invented legal wording is not.

**Legal copy specifically** must come from Content/Legal owners. Feature 002 must not author final
legal wording under any circumstance.

---

## 5. Canonical URL rules

Per SRS §5.1: lowercase, hyphenated, canonical public URLs **with enforced trailing slash**.

| Rule | Implementation |
|---|---|
| Trailing slash | `trailingSlash: true` in `next.config.ts` — Next.js then redirects `/coffee` → `/coffee/` |
| Case & separators | lowercase, hyphenated slugs; no camelCase or underscores in public paths |
| Canonical tag | every indexable page emits `<link rel="canonical">` with the **trailing-slash form**, absolute, from a single configured site origin |
| Sitemap | every URL in `sitemap.xml` uses the identical trailing-slash canonical form — sitemap and canonical must never disagree |
| Route group | `(public)` is a **route group**: it groups layout only and must never appear in a URL |

### Trailing slash is a cross-cutting change — treat it as one

`trailingSlash` is **global** `next.config.ts` configuration. It changes `/dashboard` to
`/dashboard/` and `/dashboard-admin` to `/dashboard-admin/` as well, which touches Feature 001's
already-verified authorization surface:

- `src/proxy.ts`'s matcher (`/dashboard/:path*`, `/dashboard-admin/:path*`) must still match;
- the layout guards and each protected page's independent re-check must still deny anonymous and
  under-privileged requests;
- redirect targets and any internal links must not break.

**Feature 002 must therefore run an authorization regression check after enabling it** — anonymous
and cross-surface denial on both protected surfaces, in both the slashed and unslashed forms. This
is the single highest-risk change 002 makes to shared configuration, and the only one that can
regress a verified security boundary.

Exceptions Next.js applies automatically (documented, not a defect): static file URLs with
extensions, and paths under `.well-known/`.

---

## 6. Indexation boundary

| Surface | Behaviour |
|---|---|
| Public indexable routes | In `sitemap.xml`; canonical; indexable metadata |
| `/dashboard*`, `/dashboard-admin*` | `robots.txt` disallow **and** route-level non-indexable metadata (defence in depth — exclusion must not depend on `robots.txt` alone, FR-009) |
| **`/foundation-status`** | Same defence in depth: `robots.txt` disallow **and** noindex metadata. Feature 001's cache-proof route is live and crawlable and currently carries **no** `robots` directive — only a `title`. It leaks no private data, but it is internal infrastructure and must not be indexed once this feature makes the site crawlable |
| **`/internal-test/cache-proof/`** (cache-policy contract §5.3) | `Disallow: /internal-test/` in `robots.txt`, `X-Robots-Tag: noindex, nofollow` on every response, absent from sitemap, linked from nowhere, `404` in production and without the `x-cache-proof-secret` |
| Blocked/unpublished routes (`/knowledge/*`, `/legal/*` under CONTENT-01) | Absent from sitemap and navigation |
| Weak filter combinations | Not indexed and not emitted as canonical destinations (SRS §5.1 Filters) |

Feature 001 already sets `robots: { index: false, follow: false }` on both dashboard layouts, but
**not** on `/foundation-status`. Feature 002's task (T028) is to **verify and, where genuinely
absent, narrowly extend** that metadata — never to alter the authorization guards in those files, and
never to change `/foundation-status`'s cache-proof behaviour.

---

## 7. Verification

| Check | Expectation |
|---|---|
| Published coffee | `/coffee/{slug}/` → 200 with server-rendered content |
| Every non-PUBLISHED status | → 404 (`DRAFT`, `ARCHIVED`) |
| Unknown slug | → 404, identical response shape to unpublished |
| Active origin | `/origins/{slug}/` → 200 |
| Inactive/archived origin | → 404 |
| Trailing slash | `/coffee` redirects to `/coffee/`; `/` unaffected; dynamic routes and sitemap agree with canonicals |
| Authorization regression (full protected-route matrix) | After `trailingSlash: true`, all six protected forms — `/dashboard`, `/dashboard/`, `/dashboard/settings`, `/dashboard/settings/`, `/dashboard-admin`, `/dashboard-admin/` — are re-verified in **both the unslashed and the slashed form**: anonymous denied on every form; `buyer-only` denied on the admin forms; `warehouse-admin` denied on the member forms; each authorized identity still reaches its own surface. Whether a form is served directly or reached through the trailing-slash redirect, no form yields a bypass, protected content, or an indexable response, and Feature 001's guard predicates are unchanged. Executed by T004 (before the config change) and re-run in full by T055 (closure) |
| Sitemap | contains only public indexable routes; zero private routes; every entry in canonical trailing-slash form |
| Robots | disallows both private prefixes |
| No faked lifecycle | `grep` finds no 410 emission and no redirect asserting a rename |
