# Feature 002 — Public Website — Implementation Handoff

Canonical implementation handoff for Feature 002 phases outside Phase 5.5 (which has its own closed
handoff: [`PHASE-5.5-IMPLEMENTATION-HANDOFF.md`](./PHASE-5.5-IMPLEMENTATION-HANDOFF.md)). Phases 1–5
and 7 were completed and verified in earlier sessions (see `specs/002-public-website/tasks.md` for
their checkboxes); this file begins with Phase 6.

---

# Phase 6 Execution

## RFQ — T019, T020, T021, T022 (2026-09-10)

Started from a clean tree at commit `45d1f7d` (Phase 5.5 closed), with Phase 5.5 (58/58 UIF tasks)
and original Feature-002 T000–T018, T023 already complete/verified. `contracts/rfq-contract.md`
governs this block exactly as written; no field, length limit or behaviour was invented beyond it.

**T019** — `lib/validation/rfq.ts`: one Zod schema (`RfqInput`), the exact field set/lengths from
contract §2, explicit `true`-literal consent via `z.preprocess` (rejects unchecked/omitted), no
disposable-email/blocklist policy (contract §2 "Explicitly NOT specified" — confirmed absent by a
dedicated test). Also exports `RfqFormInput = z.input<typeof RfqInput>` for React Hook Form's
pre-coercion generic type, and `RFQ_UNAVAILABLE` (see the T021 defect below for why it lives here and
not in `actions.ts`). `lib/public/countries.ts` supplies the country select's reference data — real
ISO-3166-1 alpha-2 codes, weighted toward the Arab region and coffee-origin countries; not exhaustive,
documented as extendable.

**T020** — `components/public/rfq-form.tsx`: React Hook Form + `zodResolver(RfqInput)`, every field
through `Field`/`FieldGroup`/`FormActionBar` (UIF-008), the `Checkbox` primitive wired via
`Controller` (it uses `checked`/`onCheckedChange`, not a plain `onChange`), two native `<select>`
elements styled to match `Input` (`components/ui/select.tsx`'s Base UI Select is a controlled Root/
Trigger/Popup composition not suited to an uncontrolled `register()` field). Copy resolves through
`useLocale().t.contact.rfq` — the SAME per-locale public dictionary every other interactive control on
this surface reads — so the surrounding page stays a plain Server Component. Wired into
`src/app/(public)/contact/page.tsx`, replacing the prior "form is being prepared" static panel with
the real form; the rest of the page (intents, operating-locations block) is unchanged.

**T021** — `src/app/(public)/contact/actions.ts`: the six-step Server Action discipline (early size
control → validate → abuse guard → controlled-data-access boundary → honest result → no revalidate).
**No `ok: true` path anywhere** — a genuinely valid submission returns the documented *unavailable*
result (contract §1, §3), citing `DB-BLOCK-02`/`CRM-DEST-01` in its own header comment.

**T022** — `src/app/(public)/contact/abuse-guard.ts`: a per-instance, in-memory sliding-window
throttle (5 submissions / 10 minutes per best-effort client-IP key, capped tracked-key count),
documented in its own header as best-effort/single-instance/non-durable (**ABUSE-01**). Rejection
discloses no threshold or counter.

### A real defect found and fixed during this block

Real-browser closure testing (below) initially crashed every RFQ submission in production with
React's minified error #441 ("An error occurred in the Server Components render"). The server log
showed the actual cause: **`actions.ts` exported `RFQ_UNAVAILABLE` as a plain string constant
alongside `submitRfq`, and a `"use server"` file may export ONLY async functions** — Next.js accepts
this at `next build` but the module throws at the first real request. This is invisible to
`npm run typecheck` and `npm run build` alike, and only surfaces when a Server Action from that file
is actually invoked — exactly why the real-browser closure step below is load-bearing and not
optional. Fixed by moving `RFQ_UNAVAILABLE` into `lib/validation/rfq.ts` (a plain module) and
re-exporting nothing but `submitRfq` from `actions.ts`. A regression test now iterates every export of
`actions.ts` and asserts each is an `AsyncFunction` (`tests/public/rfq.test.tsx`).

### Verification

`tests/public/rfq.test.tsx` (14 tests): schema accept/reject cases (consent, malformed email,
over-length fields, missing required fields, non-positive/absurd volume), no disposable-email
language in source, the Server Action's static safety (no `SERVICE_ROLE`/browser storage/outbound
call, cites `DB-BLOCK-02`/`CRM-DEST-01`, no successful-result path), the abuse guard's static
documentation and its actual throttle behaviour (allows 5, rejects the 6th, resets after the window,
independent per key), and `RfqForm`'s accessible-label wiring for every field plus a real `<button
type="submit">` inside the `<form>`. Plus the "use server exports only async functions" regression
test above.

Real-browser closure (`tests/design/phase6-8-closure.browser.mjs`, against a freshly rebuilt,
freshly started production server on port 3230 after the fix): desktop 1440 EN/light — server-
rendered H1 and the form's "Company name" label present in the initial HTML; submitting with every
field empty produces an inline `role="alert"` error with **no navigation**; filling every required
field + consent and submitting resolves to the honest unavailable panel with **no navigation and no
success claim**; zero console errors, zero page errors. Dark + Arabic/RTL at both 390 and 1440: no
horizontal overflow, `dir="rtl"` and the dark class both applied correctly. `npm run typecheck`,
`npm test` (161/161), `npm run lint` (product scope zero findings; full-repo baseline unchanged at
124 errors/148 warnings, `docs/claude-design` only) and `npm run build` all pass, with `/contact/`
still statically prerendered (`○`) — the RFQ form's client island does not make the page dynamic.

T019–T022 are now `[x]`.

---

# Phase 8 Execution

## SEO technical layer — T024, T025, T026, T027, T028, T029 (2026-09-10)

No standalone `HillsCoffee_SEO_Development_Specification` document exists anywhere in this
repository (confirmed by an exhaustive filename search) — per the run's own instruction, the SRS plus
Feature 002's spec/plan/tasks/contracts serve as repository authority instead of inventing or
assuming that document's contents.

**T024** — `lib/public/seo.ts`: JSON-LD builders (`buildOrganizationJsonLd`, `buildBreadcrumbJsonLd`,
`buildWebPageJsonLd`, `buildCoffeeJsonLd`, `buildOriginJsonLd`, `buildJsonLdGraph`) plus
`serializeJsonLd`, which escapes every literal `<` to `<` before the string is ever written into
markup — sufficient to neutralise `</script>`, `<script>` and `<!--` since none can begin without a
literal `<`. Every builder consumes the SAME `PublicCoffeeDetail`/`PublicOriginDetail` DTO the page
itself renders — no separate/hidden SEO query — so it inherits that DTO boundary for free: no grade,
cup score, crop year, quantity, MOQ, availability, seller identity, warehouse location, price or
offer field exists on the DTO to read. Deliberately NOT emitted despite historical aspirational SEO
examples: `Product.offers` (no public offer exists — emitting one bare would be exactly the
public/private offer leak this feature exists to prevent), `aggregateRating`/`review` (no review
system exists), `sku`/`gtin`/`brand` (no such data exists), per-record `image` (MEDIA-01).
`components/public/json-ld.tsx` renders one `<script type="application/ld+json">` from that escaped
string — the same `dangerouslySetInnerHTML` pattern `src/app/layout.tsx` already uses for the
pre-paint theme script, not a new pattern.

**T025** — Attached to all four Phase-4 routes (not `[P]`, since it edits files T014/T015/T016 own):
`coffee/page.tsx` and `origins/page.tsx` (Organization + CollectionPage + BreadcrumbList),
`coffee/[slug]/page.tsx` (Organization + Product + BreadcrumbList) and `origins/[slug]/page.tsx`
(Organization + Place + BreadcrumbList).

**T026** — `src/app/sitemap.ts`: static owned routes (`/`, `/coffee/`, `/origins/`, `/sourcing/`,
`/about/`, `/contact/`, `/portal-entry/`) plus every `PUBLISHED` coffee and `ACTIVE` origin from the
SAME `getPublicCoffeeIndex`/`getPublicOriginIndex` reads every page uses. Every URL goes through
`canonicalUrl`, the same function every page's own `alternates.canonical` uses, so sitemap and page
canonical can never drift apart. `revalidate` is a literal `3600` (Next.js statically extracts route
segment config exports — an imported constant failed the build with "Invalid segment configuration
export detected"; fixed by inlining the literal with a comment explaining it mirrors
`CATALOGUE_REVALIDATE_SECONDS`).

**T027** — `src/app/robots.ts`: disallows `/dashboard`, `/dashboard-admin`, `/foundation-status`,
`/internal-test/`; links `sitemap.xml`.

**T028** — Added `robots: { index: false, follow: false }` to `src/app/foundation-status/page.tsx`'s
existing `metadata` export only — confirmed first that `/dashboard` and `/dashboard-admin` already
carried it (001's own layouts), so those were left untouched. Metadata-only diff on the
`foundation-status` file: its guard-free body and its `getFoundationStatus()` read are unchanged.

**T029** — Already correctly implemented by T015/T016 (`notFound()` for any non-public record,
identical to an unknown slug); this block added an explicit `LIFE-01` citation to both detail pages'
existing status-gating comment blocks and verified live that no 301/308/410 exists anywhere in the
public route tree.

### Verification

`tests/public/json-ld.test.ts` (9 tests): a `</script><script>alert(1)</script>` payload embedded in
both a coffee name/description and an origin name is fully neutralised (no raw `<` survives; a bare
`JSON.stringify()` of the same input is shown, in the same test file, to still contain the
exploitable `</script>` — proving the escape is load-bearing, not redundant); no offer/rating/sku/
gtin/brand/price field and no grade/cup-score/crop-year/quantity/MOQ/availability/seller-identity
field appears anywhere in the serialized graph; one deterministic coffee `Product` node and one
deterministic origin `Place` node build correctly from their DTOs; the graph correctly nests an
`Organization` and a `BreadcrumbList`; `undefined` fields are dropped rather than serialized as
`null`/`undefined` literals.

`tests/public/seo-boundary.test.ts` (8 tests): the sitemap's static route list contains no private/
internal/blocked prefix and every route resolves through the shared `canonicalUrl`; `sitemap.ts`
imports only the approved public read layer (no raw `.from()`/`select()`); `robots()` disallows all
four private/internal prefixes and links the sitemap; `foundation-status`'s noindex diff is metadata-
only (still reads `getFoundationStatus()`, never `getRequestIdentity`); `dashboard`/`dashboard-admin`
already carry noindex (regression guard); neither coffee nor origin detail implements or fakes a
301/308/410, both call `notFound()`, both cite `LIFE-01`.

Live checks against the freshly rebuilt production server (curl + real-browser, after the T021 fix
above): `/sitemap.xml` and `/robots.txt` both `200`, sitemap contains exactly the seven static routes
plus the seeded `PUBLISHED` coffee and both seeded `ACTIVE` origins, robots disallows the four private
prefixes; coffee/origin detail status-lifecycle gating confirmed live — published/active → `200`,
draft/archived/inactive/unknown → identical `404`; `/foundation-status/` serves
`<meta name="robots" content="noindex, nofollow"/>`; `/dashboard/` anonymous request redirects (never
protected content); JSON-LD is genuinely present in the rendered DOM (not merely in a static fetch)
on both a real coffee detail and a real origin detail page, each parses as valid JSON containing the
expected `@graph` node types. `npm run typecheck`, `npm test` (161/161), `npm run lint` (zero product
findings; baseline unchanged) and `npm run build` all pass — `/coffee`, `/origins`, `/sitemap.xml`
and `/robots.txt` all remain statically prerendered.

T024–T029 are now `[x]`.

---

## Combined regression (both phases, final state)

`npm run typecheck` PASS · `npm test` **161/161** PASS · `npm run lint` product scope
(`src components lib tests scripts`) zero findings, full-repo baseline unchanged at **124 errors /
148 warnings** (`docs/claude-design` only) · `npm run build` PASS, `/contact/`, `/coffee/`, `/origins/`,
`/sitemap.xml`, `/robots.txt` all statically prerendered · real-browser closure
(`tests/design/phase6-8-closure.browser.mjs`) exit clean against a freshly rebuilt, freshly started
production server, zero console/page errors.

Feature-002 `tasks.md`: **30/59** real tasks checked (T000–T018, T023 already complete; T019–T022,
T024–T029 added this run). T030–T057 (Phases 9–13) remain untouched and unchecked, exactly as
required. No DB/RLS/migration/guard/proxy change. No commit, no push.

**Exact next action**: none from this run. Feature 002 Phase 9 (cache registration & proof) is the
next task-file phase but is explicitly NOT started here — the next permitted work is user review and
commit of this Phase 6 + Phase 8 working tree.
