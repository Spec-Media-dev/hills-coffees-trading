# Tasks: Phase 5.5 — Full Product UI Foundation & Visual System Freeze

**Input**: [`PHASE-5.5-UI-FOUNDATION-PLAN.md`](./PHASE-5.5-UI-FOUNDATION-PLAN.md),
[`contracts/product-ui-foundation.md`](./contracts/product-ui-foundation.md),
`docs/claude-design/`, `docs/design-guidance/Hills-Coffee-Website-Recommendations.md`,
`docs/requirements/Hills-Coffee-SRS-v1.md`, `docs/database/`,
`.specify/memory/constitution.md` (v2.0.0).

**Namespace**: `UIF-001`–`UIF-058`. Deliberately non-colliding with `T000`–`T057`, whose numbering
and completed history are preserved unchanged.

**Amendment 2026-09-09** — `UIF-052`–`UIF-058` were appended by the reference-pack / GSAP
reconciliation. Existing tasks were **not renumbered**, so their ids and dependencies are stable.
Because the new ids were appended rather than inserted, **id order is not execution order**: a task's
execution position is (block position, position within block), and every dependency is verified
against that position, not against the numeric id. `UIF-052` and `UIF-053` sit in Block UIF-A and
therefore run before every task in Blocks B–I regardless of their numbers.

**Status**: all 58 tasks unchecked — implementation NOT started.

## Task format

```
- [ ] UIF-NNN [P?] Description (files)
  - Scope: what this task owns
  - Requirement: which plan/contract section it satisfies
  - Depends: UIF-NNN
  - MUST NOT: the specific prohibitions that apply
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: one line on the difficulty/model choice
```

`[P]` = genuinely parallel-safe: disjoint files, no unmet dependency.

## Standing rules for every task in this phase

1. `docs/claude-design/` is **binding**, not inspiration. A generic Tailwind/shadcn default where the
   contract specifies a Hills value is a defect.
2. **No fake business data.** Honest empty states and skeletons only.
3. **No database change**, no service-role, no new private-table query, no DTO-allowlist widening.
4. `/dashboard` and `/dashboard-admin` guards are never weakened — not even to preview UI.
5. Logical CSS properties only. Physical `left`/`right` direction rules are prohibited.
6. Server Components by default; only the nine documented client islands plus the conditional
   tenth (`ProcessJourneySection`, only if UIF-056 renders a selector) — contract §16.
7. Root files are edited **in place**, never moved.
8. Lint baseline unchanged: 124 errors / 148 warnings, all confined to `docs/claude-design`.
9. The live site is flow reference only — never replicate its warehouse / quantity / grade /
   availability / sensory exposure.
10. **No task may mark `T033`, `T034`, `T035` or `T036` complete.**
11. **Animation ownership is single-owner, per interaction and per property.** GSAP, Motion and CSS
    are all approved (contract §13.1), but (a) each synchronised interaction has exactly one primary
    engine driving it end to end — Constitution XIII's *"do not combine animation engines on the same
    interaction"* — and (b) one property on one element has exactly one engine. Every animated surface
    is entered in the `ANIMATION-OWNERSHIP` registry with its interaction and primary engine.
    **Lenis stays uninitialised.**
12. **Reference boards are composition authority only.** Board colour, typography, button and chip
    styling never override `docs/claude-design/`, and no board sample statistic, contact detail,
    quote, generated logo or body paragraph is ever reproduced (contract 14.1).
13. **No decorative non-functional control.** A rendered arrow, dot or progress rail must work.

---

## BLOCK UIF-A — Shared Visual Foundation

**Codex: GPT-5.6 Sol — High · Claude: Opus — High**
Critical path. Every other block consumes these tokens and primitives.

- [ ] UIF-001 Self-host the brand faces and wire the font variables (`public/fonts/`, `src/app/layout.tsx`, `src/app/globals.css`)
  - Scope: copy Benito (6 weights) + Manrope (7 weights) from `docs/claude-design/assets/fonts/` into `public/fonts/`; load via `next/font/local`; add Readex Pro + Cairo via `next/font/google` for Arabic; expose `--font-display`, `--font-ui`, `--font-display-ar`, `--font-ui-ar`, `--font-mono`. **Retire the third, route-scoped font mechanism**: `src/app/dashboard/settings/hills-fonts.module.css` currently declares `"Hills Benito"`/`"Hills Manrope"` for one route only and loads the binaries **from `docs/claude-design/assets/fonts/` via a relative path out of `src/`**. Delete it and repoint `settings-foundation-shell.tsx` at the global tokens.
  - Requirement: contract §4; plan §1 gap 1
  - Depends: —
  - MUST NOT: move `layout.tsx`; keep Geist as the display or UI face; add a second font system; leave `hills-fonts.module.css` in place as a third; ship a font loaded from `docs/` in the build graph; load `BigBang.ttf` (no documented role).
  - Verify: computed `font-family` on a public `h1` resolves to Benito and on body copy to Manrope; `[lang="ar"]` resolves to Readex Pro/Cairo; `grep -rn "hills-fonts|Hills Benito|Hills Manrope" src components` returns nothing; `grep -rn "docs/claude-design" src components` returns nothing; `npm run build` succeeds; no layout shift attributable to font swap, checked in a real browser.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: mechanical but foundational — every subsequent visual judgement is made against the wrong face until this lands.

- [ ] UIF-002 Type scale + Arabic typography tokens (`src/app/globals.css`)
  - Scope: fluid `clamp()` scale (`--text-hero` … `--text-micro`), line heights, tracking, weights, and the mandatory `[dir="rtl"]`/`[lang="ar"]` overrides.
  - Requirement: contract §4
  - Depends: UIF-001
  - MUST NOT: pin the Brand Guide's fixed pixel samples; allow body below 16px or meta below 12px; leave RTL using the LTR negative tracking.
  - Verify: every scale token exists and is referenced by at least one primitive; under `dir="rtl"` computed `letter-spacing` on display text is `-0.005em` (not `-0.03em`) and body `line-height` is 1.8.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: token work with one genuinely subtle requirement — the RTL override that prevents Arabic from rendering cramped.

- [ ] UIF-003 The 96rem product content grid (`src/app/globals.css`, `components/layout/container.tsx`)
  - Scope: the single `.hc-container` primitive (`max-inline-size: 96rem`, `margin-inline: auto`, `padding-inline: var(--gutter-page)`) plus a full-bleed pattern and the nested 1280px / 760px reading measures.
  - Requirement: contract §2; plan §7 (locked decision)
  - Depends: —
  - MUST NOT: introduce a competing container; leave ad-hoc `max-w-6xl` in `components/public/section.tsx`; break full-bleed band backgrounds.
  - Verify: `grep -rn "max-w-5xl\|max-w-6xl\|max-w-7xl\|max-w-screen-xl" src components` returns nothing in product code; at ≥1536px viewport the content column measures 1536px and is centred; full-bleed bands still span the viewport.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: one locked number, but it must be reconciled against two narrower design-system measures without collapsing them into one.

- [ ] UIF-004 [P] Colour, surface and status token completion (`src/app/globals.css`)
  - Scope: add the tokens the implementation lacks — `--surface-raised/-subtle/-inverse`, `--sand-*` and `--forest-*` ramps, `--gold-on-light`/`--gold-on-dark`, `--primary-hover`/`--primary-active`, `--border-strong`/`--border-subtle`, `--overlay`, scrims, the five warm shadow steps, and the status token pairs — in both `:root` and `.dark`.
  - Requirement: contract §3
  - Depends: —
  - MUST NOT: re-derive or alter the existing correct palette values; introduce a cool grey; make gold the default CTA colour; use Burnt Orange as the error colour.
  - Verify: every token named in contract §3 resolves in both themes; `--gold-on-light` `#75450D` and `--gold-on-dark` `#E8A84E` present; no neutral outside the `--sand-*` ramp appears in product CSS.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: additive token work against an explicit table; the judgement is restraint, not invention.

- [ ] UIF-005 [P] Radii, elevation and motion tokens (`src/app/globals.css`)
  - Scope: radii 6/8/12/14/20/28/pill + `--radius-arch`; five warm shadow steps + `--shadow-inset`/`--shadow-focus`; motion durations and the two easing curves.
  - Requirement: contract §6, §13
  - Depends: —
  - MUST NOT: use neutral-black shadows in light mode; add bounce/spring easing; remove the existing `prefers-reduced-motion` rule.
  - Verify: tokens resolve; existing reduced-motion block still collapses durations to ≤1ms.
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small, mechanical, explicitly specified.

- [ ] UIF-006 Button + IconButton convergence (`components/ui/button.tsx`, `components/ui/icon-button.tsx`)
  - Scope: converge to Hills sizes (36/44/52px), the six variants, semibold `.005em`, press `translateY(1px)`, 45% disabled, focus-visible ring; retire the ad-hoc CTA class constants in `components/public/section.tsx` and repoint every public CTA at the converged component.
  - Requirement: contract §5; plan §1 gap 3
  - Depends: UIF-002, UIF-004, UIF-005
  - MUST NOT: leave the 32px default height; keep two button systems; drop focus-visible; make gold the default CTA.
  - Verify: default button height is 44px; every interactive control ≥44×44px; `grep -n "CTA_PRIMARY\|CTA_SECONDARY\|CTA_ON_FOREST\|CTA_OUTLINE_ON_FOREST" components src` shows no remaining local CTA constant; all nine states render in both themes.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: two forked systems must become one without regressing verified public surfaces — the highest-blast-radius primitive in the phase.

- [ ] UIF-007 [P] Icon system (`components/ui/icon.tsx`)
  - Scope: one Lucide wrapper — line/outline, 1.75 stroke, size prop, `aria-hidden` by default, RTL-aware flipping for directional glyphs only.
  - Requirement: contract §12, §15; design README iconography
  - Depends: UIF-004
  - MUST NOT: add a second icon set; ship emoji; use a unicode glyph where a Lucide icon exists; flip non-directional icons in RTL.
  - Verify: one icon import path across the codebase; a directional icon mirrors under `dir="rtl"` while a clock/document does not; `grep` finds no emoji in product code.
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: small surface, but the RTL flip rule is easy to get wrong in both directions.

- [ ] UIF-008 Form control convergence + `Field` scaffold (`components/ui/{input,textarea,select,checkbox,radio-group,switch,label}.tsx`, `components/ui/field.tsx`)
  - Scope: Hills control height/radius/state treatment for every control; a `Field` scaffold (label + hint + control + error) wired with `aria-describedby`/`aria-invalid`; upload treatment; section grouping and action-bar patterns.
  - Requirement: contract §9
  - Depends: UIF-006
  - MUST NOT: implement any business validation rule or submission behaviour; leave default shadcn sizing; omit any of the nine states.
  - Verify: each control renders all nine states in both themes; a field with an error exposes `aria-invalid` and an `aria-describedby` pointing at the message; multi-column groups stack at 390px.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: broad but pattern-repetitive once the scaffold is right; the a11y wiring is the part that must not be approximated.

- [ ] UIF-009 [P] Card and panel system (`components/ui/card.tsx`, `components/layout/panel.tsx`)
  - Scope: base card (white/`#1E2C26`, 1px warm border, 14px radius, near-subliminal warm shadow), interactive `-2px` hover lift, the gold action-needed border variant, and a panel/section surface.
  - Requirement: contract §6
  - Depends: UIF-004, UIF-005
  - MUST NOT: add coloured left borders; stack gradients; use a neutral-black shadow; apply the gold border anywhere except an action-needed state.
  - Verify: rendered card matches the contract in both themes; gold border appears only on the action-needed variant; hover lift respects reduced motion.
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: explicit spec; the discipline is in what is *not* added.

- [ ] UIF-010 [P] Badge, StatusBadge and chips (`components/ui/badge.tsx`, `components/ui/status-badge.tsx`, `components/ui/filter-chip.tsx`)
  - Scope: dot+label status presentation over the closed vocabulary; filter chips; pill radius.
  - Requirement: contract §7
  - Depends: UIF-004
  - MUST NOT: convey status by colour alone; invent a status synonym; assign a status to any real record.
  - Verify: every badge renders a dot and a label; the component's accepted status values are exactly the closed vocabulary; contrast passes in both themes.
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: small, but the closed vocabulary is a cross-feature contract that later features depend on verbatim.

- [ ] UIF-011 Table system + mobile transformation (`components/app/data-table.tsx`, `components/ui/table.tsx`)
  - Scope: desktop data table (sortable headers, row actions at inline-end, pagination slot), tablet column reduction + filter drawer, and the **mobile card/list transformation**; empty and loading states that hold layout.
  - Requirement: contract §8
  - Depends: UIF-009, UIF-010
  - MUST NOT: rely on horizontal scrolling as the only mobile strategy; render a fabricated row; hard-code any business column set.
  - Verify: at 390px the table renders as a card list, not a scrolling table; `scrollWidth === clientWidth`; empty and loading states render without inventing data; column definitions are supplied by props.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: the responsive transformation is real architecture that every later data feature inherits.

- [ ] UIF-012 [P] Tabs, breadcrumbs, pagination, sort control (`components/ui/{tabs,breadcrumb}.tsx`, `components/app/{pagination,sort-control}.tsx`)
  - Scope: one active-tab gold underline; breadcrumb trail with a separator that flips in RTL; pagination and sort presentation.
  - Requirement: contract §7, §8, §12
  - Depends: UIF-006, UIF-007
  - MUST NOT: use gold for anything beyond the single active-tab underline here; leave the breadcrumb separator unflipped in RTL.
  - Verify: breadcrumb separator direction flips under `dir="rtl"`; tab keyboard interaction (arrow keys, Home/End) works; focus-visible present.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: several small components sharing one directional rule.

- [ ] UIF-013 State visual system (`components/layout/state-screen.tsx`, `components/app/empty-state.tsx`, `components/ui/skeleton.tsx`, `components/ui/inline-alert.tsx`)
  - Scope: converge Feature 001's `StateScreen`; build EmptyState, sand-toned Skeleton that holds layout, and InlineAlert; cover loading · empty · error · unavailable · retry · not-found · blocked sub-flow · unauthorized · suspended. Also converge the **four existing route-level state files** so protected surfaces do not keep a pre-Phase-5.5 look: `src/app/dashboard/{loading,error}.tsx` and `src/app/dashboard-admin/{loading,error}.tsx`.
  - Requirement: contract §10; plan §12
  - Depends: UIF-009, UIF-010
  - MUST NOT: mark `T033` complete; fabricate data in any state; write "additional information required" — name exactly what is missing and give a direct CTA.
  - Verify: every listed state renders in both themes; skeleton holds layout (no shift on resolve); all four route-level state files render the converged visuals; `T033` remains `[ ]` and the reconciliation note is present in `tasks.md`.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: this is where "visual foundation vs behavioural verification" must be split cleanly, and the copy rule is a judgement call.

- [ ] UIF-014 [P] Overlay system — Dialog, Drawer, Toast (`components/ui/{dialog,sheet}.tsx`, `components/app/toast.tsx`)
  - Scope: dialog rises 12px, toast rises 10px, drawer slides from the **inline-end** edge; `--overlay` + 2px backdrop blur; focus trap, Escape, focus restore.
  - Requirement: contract §6, §13, §15
  - Depends: UIF-006, UIF-009
  - MUST NOT: slide the drawer from a physical left/right edge; trap focus without an Escape path; animate under reduced motion.
  - Verify: drawer enters from the inline-end in both LTR and RTL; focus is trapped, Escape closes, focus returns to the trigger; all motion collapses under reduced motion.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: focus management is the part that is quietly wrong most often.

- [ ] UIF-015 Motion foundation — Motion + CSS layer (`components/motion/*`, `src/app/globals.css`)
  - Scope: Motion-based reveal / hover / entrance / enter-exit wrappers bound to the motion tokens, plus the CSS transition layer, with reduced-motion collapse built in. Owns component enter/exit, image crossfade, drawer, card, button and icon transitions.
  - Requirement: contract §13, §13.1, §13.5
  - Depends: UIF-005
  - MUST NOT: initialise **Lenis**; add bounce/spring; delay an action or hide content behind motion; take ownership of a property that GSAP owns (contract §13.2); mark `T034` complete.
  - Verify: `grep -rn "lenis" src components` returns nothing; every transition/animation duration ≤1ms under `prefers-reduced-motion` in a real browser; no wrapper writes a property listed as GSAP-owned in the `ANIMATION-OWNERSHIP` registry; `T034` remains `[ ]`.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the restraint and the reduced-motion guarantee matter more than the animation itself.

- [ ] UIF-052 Reference-pack audit and static-asset map (`docs/architecture/` or `specs/002-public-website/`, no runtime code)
  - Scope: turn plan §11.1 into a machine-checkable asset map — for each of the 28 extracted crops and each root `public/images/` asset: subject, intrinsic size, class (usable / re-crop-required / restricted / not-a-product-asset), and the slot(s) it may fill. Produce the re-cropped derivatives for the 6 `USABLE ONLY AFTER RE-CROP` assets, or mark them unused.
  - Requirement: plan §11, §11.1; contract §14, §14.1; record **ASSET-REF-01**
  - Depends: —
  - MUST NOT: plan asset usage from a filename; render `00_contact_sheet.jpg` or any `reference_board_*.jpg`; publish a restricted crop; treat a `features/` crop as hero-grade; map `22`/`23`/`24`/`25_origin_*_landscape.jpg` to an origin record.
  - Verify: the map covers **all** 34 files in `public/images/features/` and all 26 root assets with no "unclassified" entry; every asset later referenced by UIF-024/026/029/031/032/054/055/056 appears in the map with a matching class; `grep -rn "reference_board_\|00_contact_sheet" src components` returns nothing; every restricted crop is absent from the codebase.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the failure mode is publishing a fabricated brand mark or burned-in English text — cheap to prevent here, expensive to find later.

- [ ] UIF-053 GSAP foundation and animation-ownership registry (`components/motion/gsap-*`, `components/motion/ANIMATION-OWNERSHIP.md` or header comment)
  - Scope: the scoped GSAP layer — a `gsap.context()`-based helper bound to a ref, timeline creation/cleanup conventions, a seekable/pausable/resumable timeline primitive for the story section, and the `ANIMATION-OWNERSHIP` registry recording per surface the interaction, its primary engine, and which engine owns which property. Owns timeline-controlled, multi-step, synchronised sequences.
  - Requirement: contract §13.1, §13.2, §13.3; plan §13, §17 (**MOTION-GSAP-01**)
  - Depends: UIF-005, UIF-015
  - MUST NOT: initialise **Lenis**; register a global/bare-selector animation; create a timeline during render; leave a timeline, context, timer or rAF handle uncleaned on unmount; write a property Motion owns; use GSAP for a simple hover or focus transition.
  - Verify: every GSAP call site is inside a `gsap.context()` scoped to a ref and reverted on unmount; a mount → unmount → remount cycle in a real browser leaves the global timeline count unchanged; the `ANIMATION-OWNERSHIP` registry lists every animated surface with its interaction and a single primary engine, exactly one engine per property, and no property appears under two engines and no interaction under two engines; `grep -rn "lenis" src components` returns nothing.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: GSAP's failure mode is invisible — leaked timelines and duplicated cycles look correct until they compound; the ownership registry is what prevents two engines fighting.

---

## BLOCK UIF-B — Public Shell

**Codex: GPT-5.6 Sol — High · Claude: Opus — High**
Depends on Block A. Establishes theme, locale and the finished public chrome.

- [ ] UIF-016 Theme architecture and control (`components/theme/*`, `src/app/layout.tsx`)
  - Scope: dependency-free provider toggling `.dark` on `<html>`; pre-paint blocking inline script reading the stored preference; `ThemeToggle` control; `prefers-color-scheme` as the initial default.
  - Requirement: contract §11; plan §9
  - Depends: UIF-004, UIF-006
  - MUST NOT: add a theme dependency; create a second theme system; change the existing `.dark` token values or the `@custom-variant` selector; cause a flash of wrong theme or a hydration mismatch.
  - Verify: toggling switches the whole product; reload preserves the choice with **no** flash; React logs no hydration mismatch; toggle is keyboard reachable with a visible focus ring and an accessible name.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the pre-paint/hydration interaction is the classic failure mode, and it touches a locked root file.

- [ ] UIF-017 Locale and direction architecture (`components/locale/*`, `lib/i18n/config.ts`, `lib/public/copy/*`, `src/app/layout.tsx`)
  - Scope: EN/العربية control; `lang` + `dir` on `<html>` via the same provider/pre-paint script as the theme; an `ar` dictionary sibling fed from the same module; persistence identical to the theme.
  - Requirement: contract §12; plan §8, §9
  - Depends: UIF-016, UIF-002
  - MUST NOT: add a second i18n library; introduce locale routing (`/en`, `/ar`); duplicate the copy dictionary; **fabricate Arabic legal or business claims**; cause a hydration mismatch.
  - Verify: switching sets `lang="ar" dir="rtl"` and back; choice persists across reload with no flash; `grep -rn "i18next" package.json` shows no second library; untranslated keys fall back to reviewed English and are explicitly marked, never invented Arabic.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: a formally amended requirement, an honesty constraint on content, and a hydration-sensitive root-file edit in one task.

- [ ] UIF-018 Arabic typography and RTL primitive audit (`components/**`, `src/app/globals.css`)
  - Scope: apply the Arabic font stack and RTL type overrides; sweep every Phase-5.5 primitive for physical-direction rules.
  - Requirement: contract §4, §12
  - Depends: UIF-017, UIF-002
  - MUST NOT: leave a physical `left`/`right` layout rule in product code; mark `T036` complete.
  - Verify: `grep -rnE "text-left|text-right|[^-]\bml-|[^-]\bmr-|[^-]\bpl-|[^-]\bpr-|margin-left|margin-right" src components` returns nothing in product code; Arabic renders with Readex Pro/Cairo and the opened line-height; `T036` remains `[ ]`.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: mechanical sweep with a precise, greppable success condition.

- [ ] UIF-019 Search control architecture (`components/public/search-control.tsx`)
  - Scope: the reusable Search **control** — header placement, pill field, mobile behaviour, dialog/drawer shell, keyboard interaction (open, focus trap, Escape, arrows), focus-visible, both themes and directions. Resolves to the existing `/coffee/` catalogue.
  - Requirement: plan §10 (decision)
  - Depends: UIF-014, UIF-008
  - MUST NOT: render fake or placeholder results; create a search-results route; query any private field; expose or filter by warehouse, availability, quantity, grade, seller or sensory profile; ship a decorative dead control.
  - Verify: the control is fully keyboard operable and reaches `/coffee/`; no result list is fabricated; `grep` confirms no query against a denylisted table or field.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: the honesty boundary — this is precisely where an unsafe or fake search would be introduced.

- [ ] UIF-020 Public Header — production build (`components/public/site-header.tsx`)
  - Scope: 150px+ logo (green on light, cream on dark), navigation hierarchy, 76px header height, sticky + scrolled treatment (transparent over hero → solid on scroll with `--blur-panel`), hover/active states, primary commercial CTA, secondary Trading Portal entry, and deliberate slots for Search, Theme and EN/العربية.
  - Requirement: contract §5, §11, §12; plan §6.2; design README header rules
  - Depends: UIF-006, UIF-007, UIF-016, UIF-017, UIF-019
  - MUST NOT: make the Trading Portal entry visually primary; leave the header sparse because a future capability is unbuilt; use gold as the CTA colour; add `/knowledge` or `/legal` links (CONTENT-01).
  - Verify: logo ≥150px in both themes with the correct variant; header is keyboard traversable in a logical order with visible focus; all four control slots present and functional; no overflow at 390/768/1440px in LTR and RTL.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the most-seen surface in the product; hierarchy judgement plus four interacting controls.

- [ ] UIF-021 Mobile navigation drawer (`components/public/mobile-nav.tsx`)
  - Scope: 52px rows, slides from the inline-end edge, includes theme + locale controls and the primary CTA in its footer, full keyboard and focus management.
  - Requirement: contract §12, §13, §15; design MobileDrawer spec
  - Depends: UIF-014, UIF-020
  - MUST NOT: slide from a physical edge; trap focus without Escape; leave the trigger below 44×44px.
  - Verify: opens/closes by keyboard and pointer; focus trapped then restored; enters from the inline-end in both directions; rows ≥52px; no body scroll behind the drawer.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: standard pattern, but focus and direction correctness are non-negotiable.


- [ ] UIF-022 [P] Public Footer — production build (`components/public/site-footer.tsx`)
  - Scope: dark-forest closing composition; grouped navigation (Explore · Account · Contact) over routes that actually exist; cream logo at ≥150px; brand statement; closing line.
  - Requirement: contract §3, §14; plan §6.3 (adoptable footer richness)
  - Depends: UIF-006, UIF-007
  - MUST NOT: link to `/knowledge/*` or `/legal/*` (CONTENT-01); invent a social or legal link that does not exist; use the green logo on the dark surface.
  - Verify: every footer href resolves to an existing route; cream logo ≥150px on the forest surface; three-column at ≥768px, single-column stack at 390px; contrast passes.
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: composition work whose only trap is linking to unbuilt routes.

- [ ] UIF-023 PublicShell integration and 96rem adoption (`components/public/public-shell.tsx`, `components/public/section.tsx`)
  - Scope: adopt the shared container primitive throughout the public shell; retire the local `CONTAINER` constant; keep the skip link first in tab order.
  - Requirement: contract §2
  - Depends: UIF-003, UIF-020, UIF-022
  - MUST NOT: introduce a second container; break header/footer parity between `src/app/page.tsx` and the `(public)` route group.
  - Verify: header and footer markup remain byte-identical between `/` and a `(public)` route; the container primitive is the only page container; skip link is the first focusable element.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: shell parity is the specific defect this architecture exists to prevent — it must be re-proven after the change.

---

## BLOCK UIF-C — Public Homepage

**Codex: GPT-5.6 Sol — High · Claude: Opus — High**
Raised from Medium/High by the 2026-09-09 amendment: this block now carries the hero choreography
(UIF-024), the locked interactive story section (UIF-054) and the process/journey section (UIF-056).

- [ ] UIF-024 Homepage Hero — imagery, composition **and** choreography (`components/public/hero.tsx`)
  - Scope: **(a) imagery/composition** — a genuinely strong hero built on a hero-grade root asset (`hero-banner.jpg`, 1288×1600 portrait, drying beds at origin; `farm-landscape.jpg` / `coffee-lot-*.jpg` as landscape alternates) with a scrim, Benito display type, deliberate negative space, eyebrow, primary + secondary CTA, and a mobile-specific composition and crop. Board 2 supplies the hero *shape* only. **(b) choreography** — a GSAP-owned entrance timeline: media reveal → eyebrow → headline sequencing → supporting copy → CTA pair, with a subtle image scale settle, controlled depth, a tasteful scroll response and a transition rhythm into the next section. **The hero entrance is one interaction and is GSAP end to end — Motion is not used inside it** (contract §13.2a); CSS owns hover/focus. The animated subtree is the `AnimatedHero` client island (contract §16 island 7); the page tree stays a Server Component.
  - Requirement: plan §11, §11.1, §13; contract §4, §13.1, §13.2, §13.3, §13.5, §14, §14.1; design guidance hero row
  - Depends: UIF-015, UIF-020, UIF-023, UIF-052, UIF-053
  - MUST NOT: use a `features/` crop as the hero image (none is hero-grade, plan §11.1); use `08_hero_mountain_origin` or `09_hero_green_beans_sack` (restricted — burned-in board UI/text); use a `MediaPlaceholder` where an approved static hero asset exists; use café or roasted-coffee imagery; use retail or consumer language; reproduce the board's `12+ Origins` / `200+ Global Partners` / `100% Traceable` statistic row; let text sit on unprotected imagery; let GSAP and Motion both drive the same property, or let Motion animate any part of the GSAP-owned entrance sequence; build a gimmicky animation demo; animate under reduced motion.
  - Verify: hero renders a root-library hero-grade asset with `next/image`, correct `sizes`, and zero layout shift; no `public/images/features/` path appears in `hero.tsx`; text contrast passes over the scrim in both themes; the mobile crop keeps the subject legible at 390px; the GSAP entrance timeline is scoped and reverted (mount→unmount→remount leaves timeline count unchanged); the registry shows the hero entrance as a single GSAP-owned interaction with one engine per property; under `prefers-reduced-motion` the hero renders complete and immediately with no sequencing, no scale and no scroll response; no fabricated statistic renders.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the single highest-impact visual decision in the product, and now the most complex choreography — composition judgement plus timeline discipline, not markup.

- [ ] UIF-025 Homepage narrative composition (`src/app/page.tsx`, `components/public/*`)
  - Scope: one continuous commercial story — hero → commercial intent → credibility → coffee discovery → origins → traceability → sourcing → how Hills works → reference information → final CTA. Visual rhythm via alternating forest/cream bands, split editorial layouts, asymmetry, typography-led sections and **selective** cards.
  - Requirement: plan §6.2, §6.3; contract §2, §3
  - Depends: UIF-024, UIF-013
  - MUST NOT: repeat a uniform card grid down the page; fabricate a statistic, certification or claim; expose warehouse/quantity/availability; move `src/app/page.tsx`.
  - Verify: `git diff --summary` shows `page.tsx` modified, never renamed; the documented section order renders; no two consecutive sections use the same layout pattern; every claim traces to approved copy.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: narrative rhythm is a design judgement that a checklist cannot capture.

- [ ] UIF-026 Homepage imagery and motion application (`src/app/page.tsx`, `components/public/*`)
  - Scope: compositional placement of the audited static assets across the narrative; section reveal and hover feedback bound to the motion foundation.
  - Requirement: plan §11; contract §13, §14
  - Depends: UIF-025, UIF-015
  - MUST NOT: use one image per section mechanically; present a generic photo as a specific Coffee/Origin record's media; ship an image without intrinsic dimensions or `sizes`.
  - Verify: zero cumulative layout shift attributable to imagery; no static asset appears inside a record media slot; motion collapses under reduced motion.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: restraint — the failure mode is over-decorating, and the MEDIA-01 line must hold.

- [ ] UIF-054 Interactive vertical story section (`components/public/interactive-story-section.tsx`, `src/app/page.tsx`)
  - Scope: the **locked** reference-driven section (contract §18.1–§18.11) as a real functional client island over static approved content. Desktop split composition: ~4 stacked story items (title + concise approved copy, one active) · a vertical progress/timeline rail beside them · a large corresponding static image opposite that changes with the active item · position counter · previous/next where the composition renders them. Autoplay ~3s per item, advancing 1→2→3→4→**loop to 1**, with the rail visibly consuming each interval. Hover pauses and freezes progress; leaving resumes **from the frozen state**. Click/tap activates an item immediately, swaps the image, updates active styling and rail position, and restarts timing from that item. Previous/next wrap in both directions. Image transition is a crossfade, optionally with a subtle settle, in a reserved box (zero layout shift). **The item advance — progress fill, active-item state and image transition — is one interaction and is GSAP end to end; Motion is not used inside it** (contract §13.2a); CSS owns hover/focus. The island is the animated subtree only (contract §16 island 8).
  - Requirement: contract §18.1–§18.11, §13.1, §13.2, §13.3, §16; plan §11.1, §13
  - Depends: UIF-053, UIF-015, UIF-023, UIF-052, UIF-013
  - MUST NOT: reproduce the board's Arabica/Robusta/Liberica/Excelsa sample copy or any board body paragraph; hard-code a user-facing string outside the T000 dictionary; query the database or hydrate a DTO for this section; present its images as a specific coffee/origin **record's** media; render a non-functional arrow, dot or rail; reset to item 1 on `mouseleave`; start a second autoplay cycle on manual selection; accumulate timers or timelines across repeated hover; drive any part of the advance sequence with Motion; make pause hover-only with no keyboard/touch equivalent; use a physical `left`/`right` rule; auto-advance under reduced motion.
  - Verify: in a real browser at 1440px — the active item advances at ~3s ±10% for four items then returns to item 1; the rail fill animates continuously within each interval; `mouseenter` freezes both item and fill, `mouseleave` resumes from the frozen position (item index unchanged, fill does not restart at 0); clicking item 3 activates it, swaps the image, moves the rail and restarts its interval, and exactly one cycle is running afterwards; next on the last item wraps to the first and previous on the first wraps to the last; 20 hover enter/leave cycles leave the timer and timeline counts unchanged; every string resolves from the T000 dictionary; `alt` text is present and non-empty; items and arrows are `<button>`, keyboard-reachable, activatable by Enter/Space, with visible focus and ≥44px targets; under `prefers-reduced-motion` there is no auto-advance, images swap immediately, and all manual controls and content remain.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the most behaviourally demanding task in the phase — timing, pause/resume state, wrapping, cleanup, a11y and reduced motion all have to hold simultaneously, and every one of them is a silent failure.

- [ ] UIF-056 Process / journey editorial section (`components/public/process-journey.tsx`, `src/app/page.tsx`)
  - Scope: board 3 concept 2 adapted to Hills — a step-based vertical navigation (numbered rail, title + concise approved copy per step) with corresponding side thumbnails and a main image. Static editorial content telling the sourcing-to-delivery story. Reuses the UIF-054 interaction primitives where a selector is warranted; a purely static presentation is acceptable if the selector adds nothing. If a selector is rendered it becomes the conditional `ProcessJourneySection` client island (contract §16 island 10) and its advance is one interaction with a single primary engine; if static, it stays a Server Component and that island MUST NOT exist.
  - Requirement: contract §18.12, §14.1; plan §11.1; design guidance sourcing/traceability rows
  - Depends: UIF-054, UIF-052
  - MUST NOT: use `18`/`19`/`20`/`21_process_*.jpg` (restricted — burned-in "01 Cultivation" / "02 Harvesting" / "03 Processing" / "04 Global Export" English text); reproduce the board's four process-step descriptions; invent a logistics, custody or compliance claim; imply a capability the SRS does not support; render a non-functional control.
  - Verify: no restricted `features/` crop appears in the component; every step's title and body resolve from the T000 dictionary and trace to approved copy; if a selector is rendered, it satisfies contract §18.2–§18.11 and is declared as island 10, and if none is rendered no `"use client"` is introduced by this task; the step numerals are rendered as **text**, not baked into an image, so they mirror under RTL and translate under `ar`.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: the honest-content risk is high here — a process story is exactly where invented claims creep in, and the tempting board assets are the restricted ones.

---

## BLOCK UIF-D — Coffee + Origins

**Codex: GPT-5.6 Sol — Medium · Claude: Opus — High**
Claude effort raised by the 2026-09-09 amendment: UIF-055 adds a horizontal showcase whose RTL and
wrapping-control behaviour is judgement-heavy.

- [ ] UIF-027 Coffee index visual completion (`src/app/(public)/coffee/page.tsx`, `components/public/coffee-card.tsx`)
  - Scope: page intro hierarchy, catalogue scanability, card rhythm, taxonomy presentation, media-placeholder treatment, hover/focus interaction, responsive grid, honest empty state.
  - Requirement: contract §2, §6, §8; plan §6.3 exclusion list
  - Depends: UIF-009, UIF-023
  - MUST NOT: show or imply grade, cup score, crop year, quantity, MOQ, availability, seller or price; add a warehouse or availability filter; widen the DTO.
  - Verify: rendered HTML and RSC payload contain no denylisted field or value; grid reflows cleanly at 390/768/1440px; empty state renders honestly; existing canary tests still pass.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: visual work on the surface most tempting to enrich with the live site's unsafe fields.

- [ ] UIF-028 Coffee detail — sourcing dossier (`src/app/(public)/coffee/[slug]/page.tsx`)
  - Scope: premium B2B dossier hierarchy over the approved public DTO only — identity, description, origin/region/country, type, variety, process, packaging, tags, certifications, traceability framing, commercial CTA; record media stays `MediaPlaceholder`.
  - Requirement: contract §14; DTO allowlist §4
  - Depends: UIF-027, UIF-013
  - MUST NOT: render or imply grade, cup score, crop year, quantity, MOQ, availability, seller or price; substitute a static photo for record media; alter the 404 behaviour for non-`PUBLISHED` records.
  - Verify: a non-published slug still returns a 404 indistinguishable from an unknown slug; no denylisted value in HTML or RSC payload; record media slot still renders the placeholder.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: the most leak-prone page — every visual addition is a chance to leak a private field.

- [ ] UIF-029 Origins index and detail — editorial treatment (`src/app/(public)/origins/page.tsx`, `src/app/(public)/origins/[slug]/page.tsx`, `components/public/origin-card.tsx`)
  - Scope: place-led editorial storytelling rather than a database-table aesthetic; origin hierarchy; related coffees; honest empty state; typography-led composition.
  - Requirement: contract §14; plan §11
  - Depends: UIF-027
  - MUST NOT: map `origin-*.jpg` to a database origin record by slug or name; expose a raw foreign key; imply availability; alter non-`ACTIVE` 404 behaviour.
  - Verify: no static image is rendered as a specific origin record's media; an origin with zero published coffees renders an empty state and still returns 200; inactive/archived still 404.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the MEDIA-01 temptation is strongest here because the filenames look like a perfect match.

- [ ] UIF-030 [P] In-catalogue filter over public data (`src/app/(public)/coffee/page.tsx`, `components/public/catalogue-filter.tsx`)
  - Scope: an honest client-side filter over the **already-fetched** public coffee index — name, origin, processing method, tag. Separable: droppable without breaking UIF-019.
  - Requirement: plan §10
  - Depends: UIF-019, UIF-027
  - MUST NOT: add a route, a query, a database call or a private field; filter by warehouse, availability, quantity, grade, seller or sensory profile; create an indexable weak filter permutation.
  - Verify: no new network request or DB access is introduced; filtering operates only on already-public DTO fields; no filter state becomes an indexable URL; empty result renders an honest state.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: deliberately isolated so the safe capability can be dropped without destabilising the header.

- [ ] UIF-055 Origins horizontal showcase (`components/public/origins-showcase.tsx`, `src/app/page.tsx`)
  - Scope: board 2 / board 3 concept 3 adapted to Hills — a horizontal card slider of origins with a progress indicator, previous/next controls and pagination, rendered from the **already-fetched public origins DTO** on the homepage. **The slide advance is one interaction with a single primary engine** (contract §13.2a): if a progress indicator must stay synchronised with the slide, GSAP owns the whole advance (slide + indicator); otherwise Motion owns the whole advance and GSAP is not used here. CSS owns hover. The island is the animated subtree only (contract §16 island 9).
  - Requirement: contract §18.12, §18.5–§18.11, §14.1; plan §10, §11.1
  - Depends: UIF-029, UIF-053, UIF-052, UIF-023
  - MUST NOT: use `10_origin_ethiopia_card.jpg` (restricted — burned-in "Ethiopia") or map `22`/`23`/`24`/`25_origin_*_landscape.jpg` to an origin record by name or slug; add a route, query or database call; expose availability, quantity or any private field; reproduce the board's origin descriptor copy ("Floral, vibrant, complex"); render a non-functional arrow or dot; hard-code a physical direction; split the slide advance across two engines.
  - Verify: no new network request or DB access is introduced; no static image occupies an origin **record's** media slot; previous/next wrap in both directions and are keyboard-operable with visible focus and ≥44px targets; pagination reflects the real position; the track scrolls correctly under `dir="rtl"` with direction-aware icons and correct semantics; no card overflows the inline viewport edge at 390/768/1440px; motion collapses under reduced motion while the controls keep working.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: horizontal scroll plus RTL plus wrapping controls is where direction bugs hide, and the MEDIA-01 name-match temptation is at its strongest.

---

## BLOCK UIF-E — Sourcing, Portal, Reference Price, States

**Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High**

- [ ] UIF-031 Sourcing — flagship storytelling surface (`src/app/(public)/sourcing/page.tsx`)
  - Scope: strongest public narrative — sourcing relationships, custody, logistics, quality documentation, traceability — using audited static imagery and the 760px article measure.
  - Requirement: contract §2, §14; plan §6.2
  - Depends: UIF-025, UIF-013
  - MUST NOT: query `warehouses`; expose a warehouse owner, private location or organization; invent a logistics, legal or compliance claim; use café/roasted imagery.
  - Verify: `grep -n "warehouses" src/app/\(public\)/sourcing lib/public` returns nothing; every claim traces to approved copy; body renders at the article measure; imagery ships zero layout shift.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the page most tempting to back with real warehouse rows, which would publish owner identity and exact locations.

- [ ] UIF-032 [P] Portal Entry — polished commercial transition (`src/app/(public)/portal-entry/page.tsx`)
  - Scope: an editorial split with approved static imagery and a clear, honest unavailable-state hierarchy; commercial contact route as the working action.
  - Requirement: contract §10; plan §3 (003 ownership)
  - Depends: UIF-013, UIF-023
  - MUST NOT: render a sign-in or registration form; call auth; imply an account can be created; silently redirect to `/`; expose member data; look like a developer placeholder.
  - Verify: no form field, no auth call, no redirect; Feature 003 is named as the owner of the real destination; both header and homepage entries resolve here.
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: visually straightforward; the honesty requirement is the whole point.

- [ ] UIF-033 [P] Reference Price presentation (`components/public/reference-price.tsx`)
  - Scope: restrained unavailable-state hierarchy with the mandatory "reference information, not an offer" disclosure; the discriminated union preserved for Feature 011.
  - Requirement: `contracts/reference-price-presentation.md`; contract §10
  - Depends: UIF-013
  - MUST NOT: render a number, sample figure, source, timestamp, freshness, licence state or conversion; query any price table; make the unavailable state structurally mistakable for a numeric one.
  - Verify: `grep -n "price_sources\|price_observations\|price_differentials" lib/public components/public` returns nothing; rendered output contains no digit-bearing price; the disclosure is present.
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: the failure path *is* the feature; a plausible sample number would be a false commercial claim.

- [ ] UIF-034 Public not-found and state integration (`src/app/not-found.tsx`, public routes)
  - Scope: a branded public not-found presentation and the integration of the UIF-013 state visuals across the public routes.
  - Requirement: contract §10; plan §12
  - Depends: UIF-013, UIF-023
  - MUST NOT: change the 404 **behaviour** or status semantics; make a non-public record distinguishable from an unknown one; mark `T033` complete; imply a 301/410 lifecycle (LIFE-01).
  - Verify: DRAFT/ARCHIVED and unknown slugs remain indistinguishable in status and disclosed content; the not-found presentation is branded and themed; `T033` remains `[ ]`.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: a visual change adjacent to a security-relevant indistinguishability guarantee.

---

## BLOCK UIF-F — Member App Foundation

**Codex: GPT-5.6 Sol — High · Claude: Opus — High**

- [ ] UIF-035 Shared application shell primitives (`components/app/{app-shell,sidebar,topbar,page-header}.tsx`)
  - Scope: 264px dark-forest sidebar (always forest, regardless of theme) with gold uppercase group labels and a filled `--forest-500` active item; 64px sticky topbar carrying theme + locale + identity slots; page header; breadcrumb slot; responsive collapse to drawer. **Presentational, prop-driven.**
  - Requirement: contract §1, §11, §12; design Sidebar/Topbar specs
  - Depends: UIF-012, UIF-014, UIF-016, UIF-017
  - MUST NOT: read capability, role or organization data; implement the module-registration contract (Feature 004); treat navigation visibility as authorization; mirror the sidebar incorrectly in RTL.
  - Verify: navigation and identity are supplied purely by props; sidebar mirrors to the inline-end under `dir="rtl"`; collapses to a drawer at tablet and below; sidebar stays forest in both themes.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the architecture every member and admin screen inherits, and the sharpest scope-theft boundary against Feature 004.

- [ ] UIF-036 Member shell applied at `/dashboard` (`src/app/dashboard/layout.tsx`, `src/app/dashboard/page.tsx`)
  - Scope: mount the shell inside the existing guard; honest overview presentation stating that modules arrive with later features; page header and breadcrumbs. Also converge the **existing** `/dashboard/settings` surface — `page.tsx`, `settings-foundation-shell.tsx` and `profile-settings-form.tsx` — onto the shell, the converged form controls (UIF-008) and the global type tokens, so no protected surface keeps a pre-Phase-5.5 appearance.
  - Requirement: contract §1; plan §3 (004 ownership)
  - Depends: UIF-035, UIF-008
  - MUST NOT: touch the authorization guard or its predicate; change `updateMyProfile` or any Server Action behaviour/validation; fabricate an order, balance, KPI figure or record; implement capability-driven navigation; claim Feature 004 is complete.
  - Verify: the guard predicate is unchanged in `git diff`; anonymous and cross-surface denial still hold on both URL forms; the overview shows honest empty content, no invented number; `/dashboard/settings` renders on the converged shell and controls, and its existing Server Action tests still pass unchanged.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: edits a verified protected surface — the guard must be provably untouched.

- [ ] UIF-037 Buyer module layout patterns (`components/app/*`, documented patterns)
  - Scope: reusable layout patterns for future buyer areas — overview, discovery, orders, order detail, custody, deliveries, invoices, organisation, KYB status, notifications, settings. **Layout only.**
  - Requirement: contract §8, §9, §10; plan §3
  - Depends: UIF-036, UIF-011
  - MUST NOT: create a real buyer module, route or data read; fabricate an order, payment, inventory or invoice record; claim Features 005–009 or 012 are implemented.
  - Verify: every pattern renders with honest empty/skeleton content and prop-supplied structure; no business data is read; no new `/dashboard/*` business route is created.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the "no fake operational data" rule is load-bearing exactly here.

- [ ] UIF-038 Seller additive UI architecture (`components/app/*`)
  - Scope: the **rendering architecture** by which seller entries (selling, listings, seller inventory, sales activity, settlement, payout presentation) appear additively inside the same `/dashboard` when a future capability flag is supplied by Feature 004.
  - Requirement: Constitution V, VI; plan §3
  - Depends: UIF-037
  - MUST NOT: create `/seller-dashboard` or `/buyer-dashboard`; create a second shell; read `can_sell` or any capability; enable seller entries on the live route in this phase; treat visibility as authorization.
  - Verify: seller entries are a documented prop path exercised by a component-level test, **not** enabled on the live route; no second dashboard route exists anywhere in `src/app`; a comment records that Feature 004 supplies the real capability.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the exact place a "separate seller app" or a premature client-side capability check would be introduced.

---

## BLOCK UIF-G — Admin App Foundation

**Codex: GPT-5.6 Sol — High · Claude: Opus — High**

- [ ] UIF-039 Admin shell applied at `/dashboard-admin` (`src/app/dashboard-admin/layout.tsx`, `src/app/dashboard-admin/page.tsx`)
  - Scope: the same shell primitives at operational density — dense sidebar groups, sticky topbar with workspace eyebrow + identity slot, breadcrumbs, page headers.
  - Requirement: contract §1; plan §3 (010 ownership)
  - Depends: UIF-035, UIF-036
  - MUST NOT: touch the admin authorization guard; fabricate a KPI, queue count or activity row; implement any admin business module; claim Feature 010 is complete.
  - Verify: the guard predicate is unchanged in `git diff`; cross-surface denial still holds on both URL forms; the overview presents honest empty content with **no** invented figure ("live counts… no estimated or sample figures").
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the admin reference screenshot is full of numbers — this is where fake KPI tiles would appear.

- [ ] UIF-040 Admin operational UI patterns (`components/app/*`)
  - Scope: reusable operational patterns — queues/tables with filters, detail views, action bars, dialogs/drawers for review actions, status presentation from the closed vocabulary, empty/loading/error states — as layout foundations for future Overview, Organizations, Members, KYB, Catalogue, Inventory, Listings, Orders, Payment proofs, Finance, Settlement, Payouts, Delivery, Pricing, Commission, Disputes and Audit modules.
  - Requirement: contract §7, §8, §9, §10; plan §3
  - Depends: UIF-039, UIF-011
  - MUST NOT: implement any module's behaviour or authorization; fabricate a record; claim any listed module is functionally implemented.
  - Verify: each pattern renders from props with honest empty states; no business data is read; documentation states explicitly that these are visual foundations only.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: broad but repetitive once the table and drawer primitives exist.

- [ ] UIF-041 Role-scalable admin navigation structure (`components/app/sidebar.tsx`, documented structure)
  - Scope: a navigation/module/action structure that future permission logic can drive for SUPER_ADMIN, ADMIN, COMPLIANCE, WAREHOUSE, FINANCE and AUDITOR **without redesigning the shell**.
  - Requirement: Constitution V, VIII; plan §3
  - Depends: UIF-039
  - MUST NOT: implement authorization logic; read a role; hide a control as a substitute for server-side authorization; assume every staff user is a universal admin.
  - Verify: navigation groups and actions are prop-driven and role-agnostic; a comment records that Feature 010 supplies real role gating and that visibility is never authorization; the structure renders for an arbitrary supplied role set.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: least-privilege structure now avoids an admin redesign later, and the "visibility ≠ authorization" line must be explicit.

---

## BLOCK UIF-H — Whole-Product Convergence

**Codex: GPT-5.6 Sol — High · Claude: Sonnet — High**

- [ ] UIF-042 Light Mode whole-product pass (all surfaces)
  - Scope: intentional Light Mode across Public, Member and Admin — backgrounds, surfaces, cards, tables, forms, sidebar, header, footer, buttons, states, badges, icons, typography, imagery.
  - Requirement: contract §3, §11
  - Depends: UIF-026, UIF-034, UIF-037, UIF-040, UIF-054, UIF-055, UIF-056
  - MUST NOT: introduce a cool grey; use `--gold-on-dark` on a light surface; leave a primitive unverified.
  - Verify: every primitive and surface inspected in a real browser in Light; text contrast passes AA; no cool grey present.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: breadth, not depth — but it must actually be looked at, not assumed.

- [ ] UIF-043 Dark Mode whole-product pass (all surfaces)
  - Scope: the same coverage in Dark, using the approved dark palette with depth from surface steps rather than shadow.
  - Requirement: contract §3, §11
  - Depends: UIF-042
  - MUST NOT: invert colours automatically; use `--gold-on-light` on a dark surface; leave the green logo on a dark surface; leave any surface unverified.
  - Verify: every primitive and surface inspected in Dark; the cream logo is used on dark surfaces; contrast passes AA; no surface is an inversion artefact.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: dark mode is where unverified surfaces hide; the gold and logo variants are easy to get backwards.

- [ ] UIF-044 RTL whole-product pass (all surfaces)
  - Scope: verify header, hero, footer, public pages, member sidebar, admin sidebar, breadcrumbs, tabs, tables, forms, filters, drawers, icons, arrows and action placement under `dir="rtl"`.
  - Requirement: contract §12
  - Depends: UIF-043, UIF-018
  - MUST NOT: leave a physical-direction rule; mirror a non-directional icon; let numbers/currency/codes render RTL; mark `T036` complete.
  - Verify: no page overflow in RTL at any breakpoint; directional icons flip and non-directional ones do not; numbers and reference codes remain LTR; `T036` remains `[ ]`.
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: broad sweep with several precise, individually checkable rules.

- [ ] UIF-045 Responsive whole-product pass (all surfaces)
  - Scope: real transformations at 390 / 768 / 1440px plus a ≥1536px check of the 96rem frame — public editorial composition, member shell → drawer, admin sidebar → sheet, tables → card lists, multi-column forms → stacked.
  - Requirement: contract §2, §8
  - Depends: UIF-044
  - MUST NOT: rely on horizontal scrolling as a mobile strategy; allow any horizontal overflow; let the frame exceed 96rem on large screens.
  - Verify: `scrollWidth === clientWidth` on every route × breakpoint × theme × direction; tables render as card lists at 390px; content column is exactly 96rem at ≥1536px.
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: the largest matrix in the phase; mechanical once tooled.

- [ ] UIF-046 Accessibility pass (all surfaces)
  - Scope: WCAG 2.2 AA direction — contrast, keyboard traversal, focus-visible, semantic heading order, labels, 44px targets, navigation, dialogs/drawers, tables, forms, image alt, reduced motion, theme control, locale control.
  - Requirement: contract §15
  - Depends: UIF-045
  - MUST NOT: remove a focus indicator; leave an icon as the sole carrier of meaning; ship an unlabelled control; introduce an emoji.
  - Verify: every interactive element reachable and visibly focused; heading order sound per page; dialogs trap and restore focus; automated checks report no critical violation; no emoji in product code.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: requires contextual judgement about semantics that automated checks cannot supply alone.

- [ ] UIF-047 Server/client boundary audit (all surfaces)
  - Scope: confirm the final client-island set is exactly the documented set — the nine fixed islands of contract §16, plus `ProcessJourneySection` if and only if UIF-056 rendered a selector — and that no page tree became a Client Component.
  - Requirement: contract §16
  - Depends: UIF-046
  - MUST NOT: leave an undocumented `"use client"`; hydrate an unnecessary DTO; call `getRequestIdentity()` on a public surface; mark `T035` complete.
  - Verify: `grep -rln "use client" src components` lists only the documented islands — the nine fixed ones, plus `ProcessJourneySection` if and only if UIF-056 rendered a selector — each with a stated reason, and no page tree (`src/app/**/page.tsx`, `layout.tsx`) among them; no public surface calls `getRequestIdentity()`; no public cache entry varies by user; `T035` remains `[ ]`.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: judgement about which islands are genuinely necessary, with a real leakage consequence.

---

## BLOCK UIF-I — Verification, Regression & Visual Freeze

**Codex: GPT-5.6 Sol — High · Claude: Opus — High**

- [ ] UIF-048 Real-browser verification matrix (`tests/browser/` or an equivalent harness)
  - Scope: installed Chrome over CDP across 9 surfaces × {Light, Dark} × {LTR, RTL} × {390, 768, 1440} plus a ≥1536px frame check, with long-Arabic injection on every RTL scenario.
  - Requirement: plan §15
  - Depends: UIF-047
  - MUST NOT: add a heavyweight browser dependency; weaken a guard to reach a protected surface — use the approved test-fixture identities.
  - Verify: every scenario reports `scrollWidth === clientWidth`; no tracked element crosses the inline viewport edge; long Arabic injection causes no overflow or clipping; every animation duration ≤1ms under reduced motion.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: the harness pitfalls (viewport, settle timing, fixture auth) are already known from Features 001/002 — reuse, don't rediscover.

- [ ] UIF-057 Real-browser interaction verification — story, showcase, hero (`tests/browser/` or the UIF-048 harness)
  - Scope: drive the interactive sections in an installed Chrome over CDP and assert the *behaviour*, not the markup: autoplay cadence, looping, hover pause/resume, manual selection, previous/next wrapping, image transition, progress fill, mobile transformation, RTL layout and semantics, both themes, and the reduced-motion variant.
  - Requirement: contract §18.2–§18.11; plan §15
  - Depends: UIF-048, UIF-054, UIF-055, UIF-056, UIF-024
  - MUST NOT: assert on a fixed pixel value that a legitimate design change would break; weaken a timing assertion to make a flaky implementation pass; add a heavyweight browser dependency; skip the RTL or reduced-motion scenario.
  - Verify: measured advance interval is ~3s ±10% across a full 4-item cycle and the sequence returns to item 1; `mouseenter` freezes the active index and the fill width, `mouseleave` resumes from that fill (not from 0); a click on a non-active item switches within one frame budget and restarts only that item's interval; last+next → first and first+previous → last on every control that renders arrows; the image transition produces no layout shift (`scrollHeight` stable, reserved box unchanged); at 390px the dedicated mobile transformation renders and every control is operable by touch; at 768px the intermediate design renders; under `dir="rtl"` composition mirrors, arrow semantics stay correct and `scrollWidth === clientWidth`; under `prefers-reduced-motion` autoplay is off, images swap immediately, and every manual control still works.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: these are timing- and state-dependent behaviours that only a real browser can prove; a unit test would pass on a broken implementation.

- [ ] UIF-058 Animation cleanup and leak verification (`components/motion/*`, all animated surfaces)
  - Scope: prove the GSAP/Motion engineering requirements hold — scoped contexts, timeline revert on unmount, no duplicate timelines after rerender, no timer accumulation, no stale state, and no property owned by two engines.
  - Requirement: contract §13.2, §13.3; plan §13
  - Depends: UIF-057, UIF-053
  - MUST NOT: silence a leak by disabling an animation; accept "looks fine" as evidence; leave a surface out of the `ANIMATION-OWNERSHIP` registry.
  - Verify: for every animated surface, a mount → unmount → remount cycle in a real browser leaves `gsap.globalTimeline.getChildren().length` at its pre-mount value; repeated hover enter/leave (≥20 cycles) and repeated manual selection (≥20) leave timer and timeline counts unchanged and exactly one autoplay cycle running; navigating away and back shows no stale animation state; every GSAP call site is inside a ref-scoped `gsap.context()` reverted on unmount; the registry covers every animated surface with exactly one engine per property and no property listed twice; `grep -rn "lenis" src components` returns nothing.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: leaked timelines and duplicated cycles are silent until they compound — this is the only task that would catch them.

- [ ] UIF-049 Security and functional regression (all surfaces)
  - Scope: re-run the public/private boundary and protected-route regression after the whole-product visual change.
  - Requirement: plan §14
  - Depends: UIF-058
  - MUST NOT: weaken a guard; widen the DTO allowlist; introduce a service-role or private-table query.
  - Verify: canary/DTO tests pass; anonymous and cross-surface denial hold on both URL forms of `/dashboard`, `/dashboard/settings` and `/dashboard-admin`; no service-role, Redis, Upstash or Cache Components reference; no database/migration/policy change in `git status`.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: a whole-product visual pass touching two protected surfaces must re-prove the boundary rather than assume it survived.

- [ ] UIF-050 Quality gate (`npm run typecheck`, `npm test`, `npm run build`, `npm run lint`)
  - Scope: the full aggregate gate on final source.
  - Requirement: plan §15
  - Depends: UIF-049
  - MUST NOT: modify ESLint configuration to hide a finding; weaken or delete a test to make the gate pass.
  - Verify: typecheck, test and build exit 0; lint shows **zero new findings**, with the pre-existing `docs/claude-design` baseline (124 errors / 148 warnings) unchanged and not required to reach zero.
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution against an explicitly-scoped baseline.

- [ ] UIF-051 Visual system freeze and handoff (`specs/002-public-website/PHASE-5.5-*`, `docs/architecture/IMPLEMENTATION-ROADMAP.md`)
  - Scope: record the frozen visual system, the component inventory future features consume, the `T033`/`T034`/`T035`/`T036` reconciliation outcome, `CONTENT-AR-01` and `I18N-ROUTE-01` status, and the roadmap row.
  - Requirement: plan §4, §5, §12, §18
  - Depends: UIF-050
  - MUST NOT: mark `T033`, `T034`, `T035` or `T036` complete; claim any Feature 003–012 capability is implemented; record a capability that was not built.
  - Verify: the roadmap reflects true state; every open blocker retains its true severity; the four reconciled tasks remain `[ ]` with their notes intact; `ASSET-REF-01` and `MOTION-GSAP-01` are recorded with their true status; the `ANIMATION-OWNERSHIP` registry is listed in the component inventory future features consume; the handoff names the exact next task.
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: honest status reporting across features is continuity-critical judgement.

---

## Dependency graph

Generated from the `Depends:` line of every task — this table and the task bodies are the same data.
Rows are listed in **execution order**: block by block, and top-to-bottom within each block.

| # | Task | Depends on | [P] |
|---|---|---|---|
| | **BLOCK UIF-A — Shared Visual Foundation** | | |
| 1 | UIF-001 | — |  |
| 2 | UIF-002 | UIF-001 |  |
| 3 | UIF-003 | — |  |
| 4 | UIF-004 | — | [P] |
| 5 | UIF-005 | — | [P] |
| 6 | UIF-006 | UIF-002, UIF-004, UIF-005 |  |
| 7 | UIF-007 | UIF-004 | [P] |
| 8 | UIF-008 | UIF-006 |  |
| 9 | UIF-009 | UIF-004, UIF-005 | [P] |
| 10 | UIF-010 | UIF-004 | [P] |
| 11 | UIF-011 | UIF-009, UIF-010 |  |
| 12 | UIF-012 | UIF-006, UIF-007 | [P] |
| 13 | UIF-013 | UIF-009, UIF-010 |  |
| 14 | UIF-014 | UIF-006, UIF-009 | [P] |
| 15 | UIF-015 | UIF-005 |  |
| 16 | UIF-052 | — | [P] |
| 17 | UIF-053 | UIF-005, UIF-015 |  |
| | **BLOCK UIF-B — Public Shell** | | |
| 18 | UIF-016 | UIF-004, UIF-006 |  |
| 19 | UIF-017 | UIF-016, UIF-002 |  |
| 20 | UIF-018 | UIF-017, UIF-002 |  |
| 21 | UIF-019 | UIF-014, UIF-008 |  |
| 22 | UIF-020 | UIF-006, UIF-007, UIF-016, UIF-017, UIF-019 |  |
| 23 | UIF-021 | UIF-014, UIF-020 |  |
| 24 | UIF-022 | UIF-006, UIF-007 | [P] |
| 25 | UIF-023 | UIF-003, UIF-020, UIF-022 |  |
| | **BLOCK UIF-C — Public Homepage** | | |
| 26 | UIF-024 | UIF-015, UIF-020, UIF-023, UIF-052, UIF-053 |  |
| 27 | UIF-025 | UIF-024, UIF-013 |  |
| 28 | UIF-026 | UIF-025, UIF-015 |  |
| 29 | UIF-054 | UIF-053, UIF-015, UIF-023, UIF-052, UIF-013 |  |
| 30 | UIF-056 | UIF-054, UIF-052 |  |
| | **BLOCK UIF-D — Coffee + Origins** | | |
| 31 | UIF-027 | UIF-009, UIF-023 |  |
| 32 | UIF-028 | UIF-027, UIF-013 |  |
| 33 | UIF-029 | UIF-027 |  |
| 34 | UIF-030 | UIF-019, UIF-027 | [P] |
| 35 | UIF-055 | UIF-029, UIF-053, UIF-052, UIF-023 |  |
| | **BLOCK UIF-E — Sourcing, Portal, Reference Price, States** | | |
| 36 | UIF-031 | UIF-025, UIF-013 |  |
| 37 | UIF-032 | UIF-013, UIF-023 | [P] |
| 38 | UIF-033 | UIF-013 | [P] |
| 39 | UIF-034 | UIF-013, UIF-023 |  |
| | **BLOCK UIF-F — Member App Foundation** | | |
| 40 | UIF-035 | UIF-012, UIF-014, UIF-016, UIF-017 |  |
| 41 | UIF-036 | UIF-035, UIF-008 |  |
| 42 | UIF-037 | UIF-036, UIF-011 |  |
| 43 | UIF-038 | UIF-037 |  |
| | **BLOCK UIF-G — Admin App Foundation** | | |
| 44 | UIF-039 | UIF-035, UIF-036 |  |
| 45 | UIF-040 | UIF-039, UIF-011 |  |
| 46 | UIF-041 | UIF-039 |  |
| | **BLOCK UIF-H — Whole-Product Convergence** | | |
| 47 | UIF-042 | UIF-026, UIF-034, UIF-037, UIF-040, UIF-054, UIF-055, UIF-056 |  |
| 48 | UIF-043 | UIF-042 |  |
| 49 | UIF-044 | UIF-043, UIF-018 |  |
| 50 | UIF-045 | UIF-044 |  |
| 51 | UIF-046 | UIF-045 |  |
| 52 | UIF-047 | UIF-046 |  |
| | **BLOCK UIF-I — Verification, Regression & Visual Freeze** | | |
| 53 | UIF-048 | UIF-047 |  |
| 54 | UIF-057 | UIF-048, UIF-054, UIF-055, UIF-056, UIF-024 |  |
| 55 | UIF-058 | UIF-057, UIF-053 |  |
| 56 | UIF-049 | UIF-058 |  |
| 57 | UIF-050 | UIF-049 |  |
| 58 | UIF-051 | UIF-050 |  |

**No cycles.** **No dangling dependency.** Every dependency resolves to a task at a strictly earlier
row number above — verified against this exact table.

**Execution position, not id.** `UIF-052`–`UIF-058` were appended rather than inserted, so id order is
deliberately not execution order; the row numbers above are the execution order. `UIF-052`/`UIF-053`
live in Block A and run before all of B–I; `UIF-054`/`UIF-056` run inside Block C after `UIF-026`;
`UIF-055` runs inside Block D after `UIF-030`; `UIF-057`/`UIF-058` run inside Block I after `UIF-048`
and before `UIF-049`.
**Parallel-safe** (`[P]`, disjoint files, no unmet dependency): UIF-004, UIF-005, UIF-007, UIF-009,
UIF-010, UIF-012, UIF-014, UIF-022, UIF-030, UIF-032, UIF-033, UIF-052 — **12 of 58**. UIF-003 is parallel-safe
against 004/005 but is listed without `[P]` because it edits `globals.css`, which UIF-004 and UIF-005
also edit — those three are sequenced within Block A to avoid file contention.

---

## Coverage proof

| Requirement | Covered by |
|---|---|
| **PUBLIC — 100% of current surfaces** | Header UIF-020 · mobile nav UIF-021 · search UIF-019 · footer UIF-022 · shell UIF-023 · `/` UIF-024/025/026/054/055/056 · `/coffee/` UIF-027 · `/coffee/[slug]/` UIF-028 · `/origins/` + `[slug]` UIF-029 · `/sourcing/` UIF-031 · `/portal-entry/` UIF-032 · ReferencePrice UIF-033 · not-found UIF-034 |
| **MEMBER — shell + Buyer + Seller additive** | UIF-035 shell · UIF-036 mount · UIF-037 Buyer · UIF-038 Seller additive |
| **ADMIN — shell + operational** | UIF-039 shell · UIF-040 operational patterns · UIF-041 role scalability |
| **DESIGN SYSTEM** | 96rem UIF-003 · typography UIF-001/002 · colour UIF-004 · radii/elevation/motion UIF-005 · buttons UIF-006 · icons UIF-007 · forms UIF-008 · cards UIF-009 · badges UIF-010 · tables UIF-011 · tabs/breadcrumbs UIF-012 · states UIF-013 · overlays UIF-014 · motion UIF-015 |
| **THEME — Light + Dark** | UIF-016 architecture · UIF-042 Light · UIF-043 Dark |
| **DIRECTION — LTR + RTL** | UIF-017 · UIF-018 · UIF-044 |
| **LANGUAGE — EN/AR** | UIF-017 switching architecture · UIF-018 Arabic typography · UIF-044 RTL verification (content ownership = CONTENT-AR-01) |
| **DEVICES** | UIF-045 (390 / 768 / 1440 / ≥1536) · UIF-048 real browser · interactive-section mobile transformation proven in UIF-057 |
| **CLIENT ISLANDS** | Contract §16 set (9 fixed + 1 conditional) declared in 008/015/016/017/019/021/024/053/054/055/056 · audited in UIF-047 |
| **ACCESSIBILITY** | UIF-046 · reinforced in 006, 008, 012, 014, 019, 020 |
| **IMAGES** | **Reference-pack audit + asset map UIF-052** · UIF-024 hero · UIF-026 homepage · UIF-031 sourcing · UIF-032 portal · MEDIA-01 line enforced in 026/028/029/054/055/056 · restricted-crop rule enforced in 052/024/054/055/056 |
| **REFERENCE BOARDS** | Audited in UIF-052 · composition consumed by UIF-024 (hero shape) · UIF-054 (interactive story) · UIF-055 (origins showcase) · UIF-056 (process/journey) · UIF-020 (header slot order) · UIF-021 (mobile drawer) · sample-content exclusion enforced in 024/054/055/056 |
| **ANIMATION** | GSAP foundation + ownership registry UIF-053 · Motion/CSS foundation UIF-015 · hero choreography UIF-024 (GSAP end to end) · story timeline UIF-054 (GSAP end to end) · showcase UIF-055 (single primary engine) · one-engine-per-interaction (Constitution XIII) enforced in 024/054/055/056 and registry-checked in 053/058 · Lenis excluded in 015/053/058 · cleanup/leak proof UIF-058 |
| **INTERACTION BEHAVIOUR** | 3s cadence · loop · hover pause/resume · manual selection · prev/next wrapping · image transition · progress rail — specified in contract §18, owned by UIF-054, extended by UIF-055/056, proven in a real browser by UIF-057 |
| **REFERENCE** | Claude Design bound in every Block A/B task · Design Guidance in 019/024/025/031/054/056 · live-site exclusion list in 027/028/030/031 |

**Model/effort metadata: 58 / 58 tasks carry both Codex and Claude recommendations.**

---

## Task count

| Metric | Value |
|---|---|
| Total UIF tasks | **58** (UIF-001 – UIF-058) |
| Execution blocks | **9** (UIF-A … UIF-I) — unchanged; the 7 new tasks were placed inside existing blocks |
| Parallel-safe | **12** |
| Tasks with both Codex and Claude metadata | **58 / 58** |
| Tasks checked | **0** — implementation not started |
| Existing `T000`–`T057` renumbered | **0** |
| Existing tasks marked complete by this phase | **0** |
