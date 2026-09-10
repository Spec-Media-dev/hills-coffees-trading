# Phase 5.5 implementation handoff

Updated: 2026-09-09

## Current scope

Block UIF-A — Shared Visual Foundation is implemented and verified (17 / 17).

Block UIF-B — Public Shell is implemented and verified — **8 / 8**.

Feature 002 Phase 6 has not started. No commit and no push was made by this implementation run.

## Completed task IDs

**UIF-A (17)**: UIF-001 … UIF-015, UIF-052, UIF-053.

**UIF-B (8)**: UIF-016, UIF-017, UIF-018, UIF-019, UIF-020, UIF-021, UIF-022, UIF-023.

## UIF-022 Verify — narrow reconciliation (2026-09-09)

`UIF-022`'s Verify opened with *"every footer href resolves to an existing route"*. Every other clause
passed; `/contact/` returned 404. That clause was stricter than the standard this same feature had
already accepted, and no footer could have satisfied it before Phase 6.

Evidence checked before amending:

- **`T002`** (complete, `[x]`) fixes the approved href set as `/`, `/coffee/`, `/origins/`,
  `/sourcing/`, `/contact/`, `/portal-entry/`; states its verification is *"**structural, checkable
  now** — the destination routes are created later in Phases 4–6"*; defers **runtime dead-link
  verification to `T038` and `T050`**; and instructs *"Do **not** create stub routes to make this
  task's verification pass."*
- **`T020`** (unchecked, `[ ]`) explicitly owns `src/app/(public)/contact/page.tsx`.
- `/contact/` is additionally required by `UIF-020`'s primary commercial CTA, so it cannot be removed.

`/contact/` is therefore an **approved deferred destination with a named future owning task**, not a
broken link. Clause 1 was amended to accept a footer href that either resolves 200 **or** is that one
named deferred destination.

**The exception is closed, not general.** `/contact/` → `T020` is the only permitted non-resolving
href; any other 404 remains a defect, and the harness asserts the allowlist holds exactly one entry.
Runtime dead-link coverage stays owned by `T038`/`T050`. `T020` was **not** implemented and no stub
route was created.

Re-run result: **506 / 506 checks passed.**

## What UIF-B delivered

**Theme (UIF-016)** — dependency-free provider toggling `.dark` on `<html>`, a blocking pre-paint
script in `<head>`, and a `ThemeToggle`. `prefers-color-scheme` is the initial default; an explicit
choice persists and wins. Built on `useSyncExternalStore` reading the document, so the first client
render matches the server by construction rather than by care. No second theme system; no token or
selector changed.

**Locale (UIF-017)** — EN/العربية control setting `lang` + `dir` via the same script and provider.
`lib/public/copy/ar.ts` is a partial overlay on the same dictionary (compiler-checked against `en`),
and `lib/i18n/config.ts` is now *fed from* `lib/public/copy` rather than retyping strings. No second
i18n library, no locale routing.

**Arabic content honesty (`CONTENT-AR-01`)** — `ar.ts` translates interface chrome only. Every
business, marketing and legal namespace is absent and resolves to reviewed English, declared in
`UNTRANSLATED_NAMESPACES`. No Arabic commercial claim was invented.

**Bilingual server chrome** — `components/locale/bilingual.tsx` renders both languages into the server
HTML and lets CSS pick from `<html lang>`. This is what lets the header and footer switch language
while staying **Server Components**, with no cookie and no dynamic rendering.

**`EnglishCopy`** — English fallback prose inside `dir="rtl"` is marked `lang="en" dir="ltr"`. Without
it the Unicode bidi algorithm moved trailing punctuation to the wrong end (`.in Dubai`). Applied to
the shell here; **page bodies still need it** — see "For the next block".

**Search (UIF-019)** — real dialog: focus trap, Escape, focus restore, focus into the field on open,
submit navigates to `/coffee/?q=`. **No result list, real or placeholder.** No query is issued at all,
so no private field can leak. Global cross-entity search stays deferred.

**Header (UIF-020)** — 76px sticky, logo ≥150px with the correct theme variant, nav (Coffee · Origins ·
Sourcing), search, theme, EN/AR, secondary Trading Portal text link, filled commercial CTA, mobile
trigger. Scrolled treatment is a **CSS scroll-driven animation** — no scroll listener, no client
island, no layout jump, and gated on `prefers-reduced-motion: no-preference`.

**Mobile drawer (UIF-021)** — inline-end sheet, 52px+ rows, theme + locale + CTA in the footer, focus
trapped and restored, body scroll locked, current route marked `aria-current="page"`.

**Footer (UIF-022)** — forest closing composition, Explore · Account · Trade with Hills, cream lockup,
no fabricated address, phone, email, social account or statistic, no `/legal` column (CONTENT-01).

**Shell (UIF-023)** — the `CONTAINER` alias is retired repo-wide in favour of the shared `hc-container`
primitive; header and footer markup are byte-identical between `/` and the `(public)` group; the skip
link is the first focusable element.

## Files created

```
components/theme/preferences.ts          components/theme/theme-provider.tsx
components/theme/theme-toggle.tsx        components/locale/locale-provider.tsx
components/locale/language-switcher.tsx  components/locale/bilingual.tsx
components/public/routes.ts              components/public/search-control.tsx
components/public/mobile-nav.tsx         lib/public/copy/ar.ts
lib/public/copy/types.ts
```

## Files modified

```
src/app/layout.tsx            pre-paint script, providers, suppressHydrationWarning on <html>
src/app/globals.css           --header-h, --drawer-w, bilingual chrome rules, scrolled-header animation
src/app/page.tsx              CONTAINER alias -> hc-container (output-identical)
components/public/site-header.tsx   production build
components/public/site-footer.tsx   production build
components/public/public-shell.tsx  bilingual skip link, Hills focus treatment
components/public/section.tsx       CONTAINER alias retired
components/public/hero.tsx          CONTAINER alias -> hc-container
components/ui/icon.tsx              added globe, menu, moon, sun glyphs to the registry
lib/i18n/config.ts                  en + ar resources fed from lib/public/copy
lib/public/copy/en.ts               `controls` namespace, footer.accountHeading
lib/public/copy/index.ts            getCopy(locale), UNTRANSLATED_NAMESPACES
src/app/(public)/{coffee,origins,portal-entry,sourcing}/…  CONTAINER alias -> hc-container
```

## Narrow UIF-A adjustments

- `components/ui/icon.tsx` — four glyphs added to the Lucide registry (`globe`, `menu`, `moon`,
  `sun`). This is the registry's intended extension point; UIF-007's "one icon import path" holds.
- No other UIF-A file was reopened. UIF-A remains **17 / 17** valid.

## Verification evidence

- **Real browser (installed Chrome over CDP, no new dependency): 506 / 506 checks passed.**
- Matrix: 5 public routes × {390, 768, 1440, 1600} × {Light, Dark} × {LTR, RTL} — `scrollWidth ===
  clientWidth` everywhere, no shell element crosses the inline viewport edge, header stays exactly
  76px in every scenario, product frame is exactly 1536px at 1600px.
- Controls were **interacted with**, not just screenshotted: theme toggled and persisted across a
  reload on another route; locale switched to Arabic and back with `lang`/`dir` and the Readex
  Pro/Cairo stack applied; search opened, focused, Escape-closed with focus restored, and submitted
  through to `/coffee/`; drawer opened by pointer and keyboard, focus trapped and restored, Escape
  closed it, and it entered from the **left** edge under RTL and the **right** under LTR.
- `prefers-color-scheme` proven to drive the initial default in both directions.
- Pre-paint script proven blocking and inside `<head>` before `<body>` — no flash.
- No hydration or console warning on load.
- Reduced motion: every shell transition/animation duration ≤ 1ms.
- Accessibility: every shell control named and ≥44px, semantic landmarks labelled, one `h1`, no emoji.
- Long-Arabic injection into the nav at 390px: no overflow.
- `npm run typecheck` pass · `npm test` **76 / 76** pass · `npm run build` pass, public routes still
  **static** (cache architecture intact).
- `npx eslint src components tests scripts lib` — **zero findings**. Repo-wide baseline unchanged at
  **124 errors / 148 warnings**, all under `docs/claude-design/`.
- Anonymous `/dashboard/`, `/dashboard/settings/`, `/dashboard-admin/` still 307 to `/`; both URL forms
  hold. No guard touched.
- No `supabase/` or `docs/database/` change. No service-role, Redis, Upstash or Cache Components
  reference. No root file renamed. MEDIA-01 intact — no static asset in any record media slot, no
  restricted reference-pack crop referenced anywhere in source.

## Recorded limitation

The **desktop** navigation does not mark the current route. A Server Component cannot read the
pathname, and both workarounds are worse than the gap: a new client island would break the contract
§16 island list that `UIF-047` audits, and reading a request header would make every public route
dynamic and damage the verified cache architecture. The mobile drawer, already an island, does mark
it. Documented in `site-header.tsx`.

## For the next block

**UIF-C — Public Homepage.** First task: **`UIF-024`** (Homepage Hero — imagery, composition and
choreography). Recommended: **Claude Opus — High · Codex GPT-5.6 Sol — High.**

Carry forward into UIF-C/D/E:

1. **Apply `EnglishCopy` to page-body prose.** Every English string shown to an Arabic viewer needs
   `lang="en" dir="ltr"`, or its trailing punctuation renders at the wrong end. The shell is done; the
   hero, intent cards, credibility, coffee, origins, sourcing and portal-entry bodies are not.
2. The hero currently uses `hero-banner.jpg` through the pre-Phase-5.5 composition. `UIF-024` owns the
   real hero, its GSAP entrance and the `AnimatedHero` island (contract §16 island 7).
3. `?q=` is already carried to `/coffee/` by the search control and is the input `UIF-030` consumes.

## Next action

Block UIF-B is closed. Begin `UIF-024` only after explicit authorization.

---

# UIF-C Execution

Canonical Phase-5.5 handoff. Started 2026-09-10.

## RECORDED DISCREPANCY — read before resuming

The invoking prompt named the UIF-C scope as "UIF-022, UIF-023, UIF-024". The repository disagrees
and the repository is authoritative (prompt §1: the task file's definitions govern):

| Prompt said | `PHASE-5.5-TASKS.md` says | State at run start |
|---|---|---|
| UIF-022 | Public Footer — **Block UIF-B** | `[x]` complete |
| UIF-023 | PublicShell integration — **Block UIF-B** | `[x]` complete |
| UIF-024 | Homepage Hero — **Block UIF-C** | `[ ]` not started |

**Block UIF-C actually = UIF-024, UIF-025, UIF-026, UIF-054, UIF-056** (5 tasks). The prompt's ID
list is shifted by two; every substantive requirement it states maps onto those five (Hero §8–9 →
UIF-024; homepage narrative §14 → UIF-025/026; timed story §12 → UIF-054; "how Hills works" §19 →
UIF-056). This run therefore implements **Block UIF-C as the repository defines it**.

**Second discrepancy — GSAP.** Prompt §10 says "do NOT initialize GSAP". The repository's UIF-024 and
UIF-054 **Verify conditions explicitly require a GSAP timeline**, and `MOTION-GSAP-01` approved GSAP
for Phase 5.5, superseding the older prohibition the prompt restates. Prompt §1 forbids weakening an
existing Verify, so the repository wins: **GSAP is used for the hero entrance and the story advance;
Lenis remains uninitialised** (both sources agree on Lenis).

## Asset allocation (UIF-C.2 â€” every asset visually inspected, cross-checked against ASSET-MAP.json)

| Homepage slot | Asset | ASSET-MAP class | Verified subject |
|---|---|---|---|
| Hero media (portrait) | `hero-banner.jpg` 1288Ã—1600 | usable Â· `homepage-hero` | origin drying beds, worker raking, warm low sun |
| Story 1 â€” origin relationships | `roasting-profile.jpg` 1600Ã—893 | usable Â· `homepage-story` | farmer hand-picking red cherries (filename misleading; no roasting) |
| Story 2 â€” documented quality | `cupping-lab.jpg` 1600Ã—893 | usable Â· `sourcing-quality` | hand inspecting green beans inside a jute sack, warehouse |
| Story 3 â€” custody | `warehouse-bags.jpg` 1600Ã—893 | usable Â· `process-editorial` | covered drying beds, workers, golden hour |
| Story 4 â€” reviewed membership | `greenCoffe1.png` 1448Ã—1086 | usable Â· `homepage-editorial` | green beans spilling from a jute sack |
| Traceability full-bleed band | `farm-landscape.jpg` 1344Ã—752 | usable Â· `sourcing-editorial` | wide drying beds, hills behind |
| Credibility/journey thumbnails | `features/03,16,17,26` | usable Â· small-slot | small editorial crops, no burned-in text |
| Final CTA band | `coffee-lot-1.jpg` 1600Ã—893 | usable Â· `homepage-editorial` | green coffee sack detail |

Restricted assets confirmed excluded: `greenCoffe2.png`, `logo-mark.png`, `02`, `08`, `09`, `10`,
`12`, `18`â€“`21`, all `reference_board_*`, `00_contact_sheet`. Re-crop-required assets stay unused.

## Content sourcing decision (no invented claims)

- **UIF-054 interactive story** renders the four **approved** `copy.home.credibility.*` pillars
  (origin Â· quality Â· custody Â· membership) â€” already-reviewed strings, now image-led and timed
  instead of a flat definition list.
- **UIF-056 process/journey** renders the four **approved** `copy.sourcing.*` pillars
  (relationships Â· custody Â· logistics Â· quality) as a **static** numbered rail. The task explicitly
  permits a static presentation "if the selector adds nothing"; a second timed selector on one page
  would be gimmicky and duplicative, so no `ProcessJourneySection` client island is created and
  contract Â§16 island 10 stays non-existent.
- Traceability band reuses the approved `copy.coffee.detail.traceabilityBody` claim.
- New keys added are section framing, alt text and control labels only â€” never business claims.

## Status

Last fully completed checkpoint:
UIF-C.17 â€” final report

Current checkpoint:
NONE â€” Block UIF-C is complete and verified

Last fully verified task:
UIF-056 (all five Block UIF-C tasks verified)

Tasks currently complete:
- UIF-024 Homepage Hero: COMPLETE
- UIF-025 Homepage narrative composition: COMPLETE
- UIF-026 Homepage imagery and motion: COMPLETE
- UIF-054 Interactive vertical story section: COMPLETE
- UIF-056 Process / journey editorial section: COMPLETE
(UIF-022 and UIF-023, which the prompt named, were already `[x]` in Block UIF-B before this run.)

Current file being edited:
NONE

Current work completed:
Block UIF-C in full. See "Files" and "Defects found and fixed" below.

Current work remaining:
NONE for UIF-C. Next block is UIF-D (Coffee + Origins), first task UIF-027.

Verification already run:
- Real browser (installed Chrome over CDP): **UIF-C 117/117**, **UIF-B regression 506/506**.
- `npm run typecheck` PASS Â· `npm test` **76/76** PASS Â· `npm run build` PASS (`/` still static).
- `npx eslint src components tests scripts lib` â€” zero findings. Repo baseline exactly
  **124 errors / 148 warnings**, all under `docs/claude-design/`.
- Protected routes still 307 to `/`; no DB/migration change; no service-role/Redis/Upstash/Cache
  Components; no root file renamed; no `getRequestIdentity` on a public surface.

Temporary/debug code:
NONE

Exact next action:
Begin Block UIF-D with `UIF-027` (Coffee index visual completion) only after explicit authorization.

## Files created (UIF-C)

```
components/public/animated-hero.tsx             GSAP hero entrance (contract Â§16 island 7)
components/public/interactive-story-section.tsx timed story (island 8)
components/public/process-journey.tsx           STATIC numbered rail (no island 10)
components/public/traceability-band.tsx         full-bleed photographic band
```

## Files modified (UIF-C)

```
src/app/page.tsx                     rebuilt into the documented 9-beat narrative (edited in place)
components/public/hero.tsx           full-bleed forest ground, arch media, mobile-specific composition
components/public/intent-cards.tsx   card radius aligned to --radius-lg; routes import
lib/public/copy/en.ts                home.{story,traceability,journey,reference} framing keys
components/motion/ANIMATION-OWNERSHIP.md  two new GSAP surfaces; ownership made per-surface
components/{locale,public,ui}/*      typography fix, see below
```

## Defects found and fixed during this run

1. **Systemic typography defect (pre-existing, affected UIF-A and UIF-B too).** Every
   `text-[var(--text-*)]` was silently rendering at the inherited 16px â€” Tailwind treats a bare
   `text-[var(â€¦)]` as a *colour*, not a font-size. Header nav, footer links, badges and the hero had
   all lost their type scale. Fixed repo-wide with the documented `text-[length:var(â€¦)]` hint
   (9 files). Measured after: h1 68.8px, lead 17px, nav 14px, footer 14px. This is the narrow,
   justified UIF-B integration correction that prompt Â§22 permits; UIF-B's suite was re-run (506/506).
2. **Hero measure bug.** `max-w-[34ch]` on the hero container resolved against the container's 16px
   font (~272px), crushing the lead; and `--text-hero` (~106px at 1440) wrapped the headline to five
   lines and pushed both CTAs below the fold. Now `--text-h1` with rem-based measures.
3. **Gold not theme-aware on flipping surfaces.** Story rail, journey numerals and two eyebrows used
   `--gold-on-light` unconditionally and went muddy in dark. Paired `dark:` variants added
   (contract Â§3). Forest-only surfaces correctly keep `--gold-on-dark`.
4. **React Compiler violation.** `pausedRef.current = paused` during render. Moved into a
   `useLayoutEffect` declared before the build effect, so the mirror is current when the build effect
   reads it.

## Harness note for the next agent

React's delegated events do **not** observe a synthetic `MouseEvent('mouseenter')`. Hover pause can
only be verified with real CDP `Input.dispatchMouseEvent` calls â€” the first run produced four false
failures until the harness was corrected. `scratchpad/verify-uif-c.mjs` now does this properly.
