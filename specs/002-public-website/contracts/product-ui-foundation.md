# Contract: Product UI Foundation (Phase 5.5)

Governs the Phase 5.5 `UIF-*` task set. Binds Public, Member and Admin to **one** Hills visual
system. Authority: `docs/claude-design/` (Constitution Principle II authority 4, Principle XIII).

> **Enforcement rule.** A `UIF` task is not complete if it introduces a generic Tailwind or default
> shadcn value where this contract specifies a Hills value. "It looked fine" is not a verification.

---

## 1. One design system, three densities

| Surface | Density | Shares |
|---|---|---|
| Public `/` | Editorial — generous whitespace, large display type, photography | tokens, primitives, states, theme, direction |
| Member `/dashboard` | Application — compact, task-oriented | the same tokens and primitives |
| Admin `/dashboard-admin` | Operational — densest, table-heavy | the same tokens and primitives |

There is **no** separate "public design system", "dashboard design system" or "admin design system".
Density is a composition choice, never a second token set.

---

## 2. Content grid

```
.hc-container {
  width: 100%;
  max-inline-size: 96rem;          /* LOCKED product frame — 1536px */
  margin-inline: auto;
  padding-inline: var(--gutter-page);   /* clamp(16px, 4vw, 48px) */
}
```

| Measure | Value | Use |
|---|---|---|
| Product frame | **96rem** | The one shared container: Public, Member, Admin |
| Editorial measure | 1280px | Public editorial sections, nested inside the frame |
| Article measure | 760px | Long-form prose |
| Reading measure | ≤ 62–70ch | Any paragraph block |

**Prohibited:** ad-hoc `max-w-5xl`, `max-w-6xl`, `max-w-7xl`, `max-w-screen-xl` on page/section
containers. Full-bleed bands span the viewport; their inner content aligns to the frame.

---

## 3. Colour and surface

Values are already correct in `src/app/globals.css` (`:root` and `.dark`) and MUST NOT be re-derived.
Tokens still missing from the implementation and required by this contract:

`--surface-raised` · `--surface-subtle` · `--surface-inverse` · the `--sand-*` and `--forest-*`
ramps · `--gold-on-light` `#75450D` · `--gold-on-dark` `#E8A84E` · `--primary-hover`/`--primary-active`
· `--border-strong`/`--border-subtle` · `--overlay` · `--scrim-top`/`--scrim-bottom` · the five
warm shadow steps · the status token pairs.

**Rules.**
- Gold is **selective** — key figures, one active-tab underline, sidebar group labels, an
  action-needed border. **Gold is never the default CTA colour.**
- Small gold text on cream fails contrast: use `--gold-on-light` on light, `--gold-on-dark` on dark.
- Burnt Orange is a **highlight**, never the error colour. `--danger` is the derived deep red.
- No cool greys. Every neutral comes from the warm `--sand-*` ramp.
- Dark mode is a **derived identity**, never an inversion, and never a second brand.
- Maximum two background colours per screen (`--bg`, `--surface-page`). The only sanctioned gradient
  is `--gradient-editorial`, for editorial moments only — never a card, never a button.

---

## 4. Typography

| Role | Face | Notes |
|---|---|---|
| Display / headings / KPI figures | **Benito** | identity face |
| UI, body, tables, forms, navigation | **Manrope** | all long text |
| Arabic display | **Readex Pro** | Google Fonts |
| Arabic UI | **Cairo** | Google Fonts |
| Reference codes | monospace | tabular, readable aloud |

Scale (fluid `clamp()`, never pinned): `--text-hero` 44→112px · `--text-h1` 36→72 ·
`--text-h2` 28→52 · `--text-h3` 21→32 · `--text-dash-title` 28→44 · `--text-body-lg` 17 ·
`--text-body` 16 · `--text-small` 14 · `--text-meta` 13 · `--text-micro` 12.

**Floors:** body never below 16px; meta never below 12px.
**Tracking:** display `-0.03em`; heading `-0.015em`; label `+0.14em` (uppercase eyebrows only).
**RTL override (mandatory):** `--tracking-display: -.005em`, `--tracking-heading: 0`,
`--tracking-label: .04em`, `--lh-display: 1.18`, `--lh-heading: 1.32`, `--lh-body: 1.8`.

**Casing:** sentence case for headings, buttons and labels. UPPERCASE + wide tracking **only** for
eyebrows and sidebar group labels.

---

## 5. Controls

| Size | Height | Padding | Radius |
|---|---|---|---|
| sm | `--control-h-sm` 36px | 0 14px | `--radius-sm` 8px |
| md (default) | `--control-h` **44px** | 0 20px | `--radius-sm` 8px |
| lg | `--control-h-lg` 52px | 0 28px | `--radius-md` 12px |

Variants: `primary` · `secondary` · `outline` · `text` · `accent` · `destructive`.
Weight semibold, tracking `.005em`.

**States (all mandatory):** Default · Hover · Focus-visible · Active · Selected · Disabled ·
Loading · Success · Error.
- Hover **darkens** (`--primary-hover`) or lays a 7–8% forest tint. **Never a lightening wash.**
- Active adds `translateY(1px)` + `--primary-active`.
- Focus-visible: 2px `--focus-ring` outline at 2px offset (gold in dark). **Never removed.**
- Disabled: 45% opacity + `cursor: not-allowed`.
- Touch target never below **44×44px**.

**Known gap to close:** `components/ui/button.tsx` currently defaults to `h-8` (32px) — below the
touch minimum — and the public surfaces bypass it with local CTA class constants in
`components/public/section.tsx`. Both forks converge on this contract.

---

## 6. Cards, radii, elevation

Cards: `--surface-card` (white light / `#1E2C26` dark), 1px `--border` `#D7C8AD`, radius
`--radius-lg` **14px**, very soft forest-tinted shadow. In light the border does the work.
Interactive cards lift `-2px` on hover.

**Prohibited:** coloured left borders, stacked gradients, neutral-black shadows.
**Sole exception:** a card awaiting user action turns its border gold.

Radii: 6 · 8 · 12 · 14 · 20 · 28 · pill. `--radius-arch` for editorial media crops only.
Shadows: five outer steps, all `rgba(23,60,50,…)`. Over imagery use scrims, never opaque capsules.

---

## 7. Status vocabulary — closed set

Every status pairs a **dot + label**. Status is **never colour alone**. Labels are used verbatim in
both languages; synonyms are prohibited.

- **Order**: Draft · Quoted / Awaiting confirmation · Payment pending · Paid · Processing /
  Allocated · In transit · Completed · Cancelled · Refunded · Disputed
- **Shipment**: Draft · Requested · Confirmed · Reserved · Picking · Dispatched · Delivered ·
  Cancelled · Failed · Disputed
- **KYB**: Draft · Submitted · Under review · More info · Approved · Rejected · Suspended / Expired

Phase 5.5 ships the **presentation** of this vocabulary. It assigns no status to any real record.

---

## 8. Data presentation

| Breakpoint | Behaviour |
|---|---|
| Desktop | Full data table; sortable headers; row actions at the inline-end |
| Tablet | Reduced column set; filters move into a drawer |
| Mobile | **Card/list transformation** — not a horizontally-scrolling table |

Horizontal scroll MUST NOT be the only mobile strategy. Every table ships: empty state, loading
skeleton that holds layout, filter placement, sort control, row actions, pagination position.

**No fabricated rows.** Empty is empty, and says so honestly.

---

## 9. Forms

`Field` scaffold = label + optional hint + control + error, wired with `aria-describedby` and
`aria-invalid`. Controls: input, textarea, select, combobox, checkbox, radio group, switch, file
upload treatment, date, phone, country.

Every control ships all nine states from §5. Multi-column form layouts stack on mobile. Section
grouping and a sticky action bar are provided as patterns.

Phase 5.5 ships **presentation only** — no business validation rule, no submission behaviour.

---

## 10. State system

Visual system owned by Phase 5.5 (UIF-013): loading · empty · error · unavailable · retry ·
not-found · blocked sub-flow · unauthorized · suspended.

Reuses and converges Feature 001's `components/layout/state-screen.tsx`. **Per-route behavioural
coverage remains T033.**

Copy rule — **"name what is missing"**: state exactly which items are needed and give a direct CTA.
Never "additional information required".

---

## 11. Theme

- Light + Dark across **all three surfaces**. Dark is not an inversion.
- One system: the existing `.dark` class + `@custom-variant` in `globals.css`. **No second provider.**
- Pre-paint inline script applies the stored preference — no flash, no hydration mismatch.
- `ThemeToggle` placement: public header, member topbar, admin topbar.
- Every primitive must be verified in **both** themes: surfaces, text, muted text, borders, cards,
  tables, forms, navigation, sidebar, header, footer, states, icons, images, buttons.

---

## 12. Direction and language

- `dir` and `lang` are set on `<html>` by the same provider/script as the theme.
- **Logical CSS properties only**: `margin-inline`, `padding-inline`, `inset-inline`, `text-align:
  start/end`, `ms-*`/`me-*`. Physical `left`/`right`, `ml-*`/`mr-*`, `pl-*`/`pr-*`, `text-left`/
  `text-right` are prohibited in product code.
- Directional icons (arrows, chevrons, breadcrumb separators) flip in RTL. Clocks, documents,
  warehouses do **not**.
- Drawers slide from the **inline-end** edge.
- Numbers, currency, units and reference codes stay **LTR inside RTL layouts**.
- Arabic must survive **longer labels** without clipping or overflow.
- No second i18n library. `lib/public/copy` remains the single copy source with an `ar` sibling.

---

## 13. Motion

Durations 160–420ms for interface motion; a deliberate editorial sequence (hero choreography, story
progress) may run longer where the sequence itself is the content. `--ease-standard
cubic-bezier(.2,.6,.2,1)` for state; `--ease-out cubic-bezier(.16,1,.3,1)` for entrances. Fades and
short rises only.

### 13.1 Approved engines and their ownership

Amended 2026-09-09 (**MOTION-GSAP-01**): GSAP is approved for Phase 5.5, superseding the earlier
Motion+CSS-only rule. Three engines are approved, and each owns different work:

| Engine | Version | Owns |
|---|---|---|
| **GSAP** | `gsap ^3.15.0` | Timeline-controlled, multi-step, precisely synchronised, seekable sequences: hero choreography, layered entrance, synchronised text + media, image scale/depth within a sequence, the story section's per-item 3s progress timeline, restrained scroll-bound editorial effect |
| **Motion** | `motion ^13.2.0` | Component enter/exit and small interaction state **belonging to its own interaction**: mobile navigation, cards, buttons, icons, small layout transitions, and image crossfade **outside** a GSAP-owned synchronised sequence |
| **CSS** | — | Simple stateless transitions: hover colour, focus ring, border, opacity |

**Do not force one engine everywhere.** Choosing GSAP for a hover colour, or hand-rolling a seekable
timeline in `setInterval` to avoid GSAP, are both defects.

### 13.2 The single-owner rule

Two rules apply together. Both are mandatory.

**(a) One engine per interaction (Constitution XIII).** The Constitution states: *"Do not combine
animation engines on the same interaction."* An **interaction** is one synchronised user-visible
sequence — the story section's item advance, the hero's entrance, the showcase's slide. Exactly one
engine is the **primary owner** of that whole sequence and drives every part that must stay in
lockstep with it. A second engine MUST NOT animate any part of a synchronised sequence owned by
another engine, even on a different node.

Concretely: the story section's item advance (progress fill + active-item state + image transition)
is **one** interaction, owned end to end by **GSAP** — Motion is not used inside it. The hero
entrance is **one** interaction, owned end to end by **GSAP**. Motion owns interactions that are
structurally separate sequences of their own — the mobile navigation drawer, a card or button hover
response, an icon state change, a section reveal — and CSS owns simple stateless transitions
anywhere.

**(b) One engine per property.** Within any single interaction, a given DOM element's given
animatable property has exactly **one** owner. GSAP and Motion must never both write the same
`transform`, `opacity` or layout property on the same node. Rule (b) is the narrower safety net;
rule (a) is the governing constraint, and satisfying (b) alone does **not** satisfy (a).

Every animated surface is recorded in an `ANIMATION-OWNERSHIP` registry comment in
`components/motion/`, naming the surface, **the interaction, its primary engine**, and the properties
each engine owns. A surface whose registry entry lists two engines inside one interaction is a
defect.

### 13.3 GSAP engineering requirements (all mandatory)

- Initialisation is **scoped** — `gsap.context()` (or the project's documented equivalent) bound to a
  ref, never a bare global selector.
- The context is **reverted on unmount**; every timeline created is killed.
- A re-render must not create a second timeline for the same surface. Timelines are created in an
  effect with a correct dependency list, not in render.
- Every `setTimeout` / `setInterval` / `requestAnimationFrame` handle is cleared on unmount and on
  dependency change.
- Hover pause/resume must not accumulate timers or timelines across repeated enter/leave.
- Manual selection must not start a second autoplay cycle; there is exactly one active cycle at a
  time.
- No stale animation state after navigating away and back.

### 13.4 Prohibited

Bounce, spring, attention-seeking loops, motion that delays an action or hides content, scroll
hijacking, long intro animations, aggressive zoom, parallax that damages readability, and **Lenis
initialisation**. `lenis ^1.3.26` is installed but stays uninitialised; native browser scrolling is
preferred, and adopting Lenis requires separate approval.

### 13.5 Reduced motion

**`prefers-reduced-motion: reduce` collapses every duration to ≤1ms.** The global rule already exists
in `globals.css` and must remain. Under reduced motion, every animated surface must additionally:

- eliminate parallax and scroll-bound movement entirely;
- eliminate decorative scale;
- reduce sequential entrance to an immediate, simultaneous appearance;
- switch image transitions to an immediate swap;
- **retain every manual control** (selection, previous, next) and every piece of content;
- remain visually finished — reduced motion is a different presentation, not a degraded one.

Autoplay under reduced motion: the sequence does **not** auto-advance. The progress rail renders its
static state and the user drives it manually.

---

## 14. Imagery

- `public/images/` = approved static editorial assets — usable now.
- Database-backed entity media = still **MEDIA-01 blocked**.
- **A generic repository photo MUST NEVER represent a specific Coffee or Origin record.** Record
  media slots keep `MediaPlaceholder`. Never map an image to a record by slug or name.
- `next/image` with intrinsic dimensions, responsive `sizes`, stable aspect ratio (zero layout
  shift), and alt text through the T000 copy architecture.
- Photography is documentary editorial — origin, harvest, processing, green coffee, warehouses,
  quality inspection, logistics. **Never café or roasted-coffee imagery.**
- Logo: horizontal lockup, **≥150px** wide; green on light surfaces, cream on dark. Never stretch,
  rotate, recolour or rearrange. The **only** approved marks are `hills-logo-dark.png`,
  `hills-logo-light.png` and `hills-favicon-green.png`. A logo appearing inside a photograph or on a
  reference board is not an approved mark.

### 14.1 The reference pack (`public/images/features/`)

- The three `reference_board_*.jpg` files and `00_contact_sheet.jpg` are **planning artefacts**. They
  are never rendered by the application, never imported, and never referenced by a page.
- The boards are authoritative for **composition, interaction and section shape only**. Board colour,
  typography, button shape and chip styling are **not** authoritative — `docs/claude-design/` is.
- Board sample content is **prohibited**: the fabricated statistics (`12+ Origins`,
  `200+ Global Partners`, `100% Traceable`, `EST. 2020`), the fabricated contact details
  (`sales@hillscoffee.com`, `+971 4 123 4567`), the generated logo lockup, the "Trusted by partners
  worldwide" avatar row, the "THE HILLS COFFEE TEAM" pull quote, and every board body paragraph,
  taxonomy description, origin descriptor and process-step description.
- The 28 extracted crops are **small-slot assets**. The largest is 588x80; the largest usable
  rectangle is 396x263. **None may fill a full-bleed or large editorial slot** — those keep using the
  `public/images/` root library (1600x893 / 1288x1600 / 1448x1086).
- **Restricted crops — not publishable as-is** (`ASSET-REF-01`): `02_dark_coffee_cup` (fabricated
  brand mark on the mug), `08_hero_mountain_origin` (burned-in board header UI),
  `09_hero_green_beans_sack`, `10_origin_ethiopia_card`, `12_cta_green_beans`,
  `18`/`19`/`20`/`21_process_*` (burned-in English text, which cannot translate, cannot mirror for
  RTL, and bypasses the T000 copy architecture).
- **Re-crop required before use**: `04`/`05`/`06`/`07_strip_*`, `11_farmer_origin_portrait`,
  `27_advantages_landscape` — each carries a sliver of board artefact on one edge.
- MEDIA-01 applies unchanged. `22`/`23`/`24`/`25_origin_*_landscape.jpg` must **not** be mapped to
  origin records named Ethiopia, Colombia, Guatemala or Indonesia. The name match is a coincidence of
  the mockup, not provenance.

---

## 15. Accessibility (WCAG 2.2 AA direction)

Contrast · full keyboard operability · visible focus (never removed) · semantic heading order ·
labelled controls · 44×44px targets · accessible dialogs and drawers (focus trap, Escape, restore) ·
table semantics · image alt · `prefers-reduced-motion` · reachable theme control · reachable locale
control. Icons beside labels are `aria-hidden` and never the sole carrier of meaning. **No emoji.**

---

## 16. Server/client boundary

Server Components by default. **Amended by UIF-047 (Block UIF-H)**: this list was authored while
Phase 5.5 was Public-only (Blocks A–E) and enumerated nine islands plus one conditional tenth for
that scope alone. Two islands were added to the live product before this amendment without the list
being updated — `CatalogueFilter` (UIF-030, committed with Block D) and `MobileAppNav` (UIF-035,
Block F) — and UIF-047's own audit is what caught the drift. The list below is the reconciled,
complete set for the **whole product** (Public, Member, Admin): no other `"use client"` may exist in
product code, where "product code" excludes (a) the underlying Base UI / shadcn primitives every
island above is built from (`components/ui/{dialog,sheet,select,tabs,...}.tsx` — inherently client
by upstream design, not separately counted islands) and (b) Next.js–mandated boundary files
(`error.tsx`, which the framework requires to be a Client Component regardless of product code — this
includes the two files that follow that convention, `src/app/(public)/error.tsx` and
`src/app/error.tsx`, plus their shared implementation `components/public/route-error.tsx`, added in
T033: factoring the boundary's logging/retry logic into one file rather than duplicating it across
the two segment-level `error.tsx` files does not change what mandates it).

1. theme control (`UIF-016`)
2. locale/direction control (`UIF-017`)
3. mobile navigation — public (`UIF-021`)
4. search control (`UIF-019`)
5. motion wrappers — the Motion/CSS layer (`UIF-015`) and the scoped GSAP helpers (`UIF-053`'s
   `useGsapTimeline`, and the public convergence pass's `GsapScrollReveal`, same role)
6. genuinely interactive form controls (`UIF-008`)
7. `AnimatedHero` — the hero's GSAP entrance choreography (`UIF-024`)
8. `InteractiveStorySection` (`UIF-054`)
9. `OriginsShowcase` (`UIF-055`)
10. `ProcessJourneySection` (`UIF-056`) — **conditional**: permitted only if that task renders a real
    step selector. If the section ships as a static presentation, it stays a Server Component and
    this island MUST NOT exist. As shipped, `components/public/process-journey.tsx` is static — this
    island does not exist in the current build.
11. `CatalogueFilter` — the public coffee index's client-side filter over the already-fetched DTO
    (`UIF-030`)
12. `MobileAppNav` — the Member/Admin application shell's mobile navigation drawer (`UIF-035`). The
    one new client island the shell introduces; `Sidebar`, `Topbar` and `AppShell` itself stay
    Server Components, exactly as the public shell's desktop navigation does.

Islands 7–9 (and 10, if it exists) receive already-resolved, already-narrowed props from a Server
Component parent, and the island is the **animated subtree only** — `src/app/page.tsx` and every
public page tree stay Server Components. A page tree never becomes a Client Component because it
contains an animated section, and no extra DTO is hydrated to feed an animation. The same rule holds
for island 12: `src/app/dashboard/layout.tsx` and `src/app/dashboard-admin/layout.tsx` stay Server
Components, and `MobileAppNav` receives only the already-built `AppNavGroup[]` structure.

No page tree becomes a Client Component for animation. No unnecessary DTO hydration. No
`getRequestIdentity()` on a public surface. No public cache entry varies by user, session or
organization.

---

## 17. Hard prohibitions

1. No database change of any kind.
2. No runtime service-role; no new private-table query; no widening of the public DTO allowlist.
3. No weakening of `/dashboard` or `/dashboard-admin` guards — not even to preview UI.
4. No fake operational data: no invented order, payment, inventory, listing, KYB approval, payout,
   settlement, shipment or financial total.
5. No `/buyer-dashboard`, no `/seller-dashboard`. Seller is additive inside `/dashboard`.
6. No public exposure of warehouse, availability, quantity, MOQ, grade, cup score, crop year, seller
   identity or any price — regardless of what the live site does.
7. No second theme system, second i18n library, second token set, or second container system.
8. No Redis, Upstash, `cacheComponents`, `"use cache"`, or standalone `cacheTag`/`cacheLife`.
9. No moving `src/app/page.tsx`, `src/app/layout.tsx` or `src/app/globals.css`.
10. No emoji, and **no Lenis initialisation**. GSAP is approved (13.1); Lenis is not.
11. No board sample content: no fabricated statistic, partner count, origin count, sustainability
    claim, quote, generated logo, generated brand copy or fake contact detail taken from a reference
    board (14.1).
12. No decorative non-functional control. If a previous/next arrow, pagination dot or progress rail
    is rendered, it must work (18).

---

## 18. Interactive editorial sections

Binding behavioural specification for the reference-driven public sections. Composition comes from
the boards; every colour, type size, control size, radius and surface comes from
`docs/claude-design/`; every string comes from the T000 dictionary.

### 18.1 Interactive vertical story section — required

A real, functional editorial interaction over **static** content. Not a mockup, and not backed by any
database record.

**Desktop structure (>=1024px)** — split editorial composition:

- One side: approximately **four** vertically stacked story items, each a title plus concise approved
  supporting copy. Exactly one is active.
- Beside the items: a **vertical progress/timeline rail** — filled dot for the active item, hollow
  for inactive, with a connecting line whose active segment fills as the interval is consumed.
- Opposite side: a **large corresponding static image** that changes with the active item, plus the
  position counter (`01 / 04` form) and, where the composition renders them, previous/next controls.

Subject and copy must be appropriate to approved Hills content. Board taxonomy copy is prohibited.

### 18.2 Autoplay timing

Item 1 runs for approximately **3 seconds**, then advances to item 2; item 2 for ~3s to item 3; item 3
for ~3s to item 4; item 4 for ~3s and then **loops back to item 1**, continuing indefinitely. The
progress rail must make the interval visibly being consumed — a static indicator that only jumps on
change does not satisfy this. A minor timing adjustment is permitted **only** when real-browser
verification demonstrates a readability reason, and the reason must be recorded in the task.

### 18.3 Hover pause and resume

On a pointer device: `mouseenter` on the interactive section **pauses** autoplay and freezes the
progress fill, preserving the current active item and image. `mouseleave` **resumes from the frozen
state** — never a reset to item 1, and never a restart of the current item's interval from zero.
Repeated enter/leave must not accumulate timers or timelines.

### 18.4 Manual selection

Click or tap on any story item immediately: activates that item, changes the image, updates the
active styling, moves the progress position to that item, and restarts timing from the selected item.
Exactly one autoplay cycle exists afterwards — selection never spawns a second cycle.

### 18.5 Previous / next controls

If the composition renders arrows, **they must function**. Previous moves to the previous item; next
moves to the next. Wrapping is required in both directions: first + previous -> last; last + next ->
first. Both are real `<button>` elements with accessible names, visible focus, and a >=44px target.
Decorative non-functional arrows are prohibited.

### 18.6 Image transition

A premium transition between active images: crossfade, optionally combined with a subtle scale settle,
a restrained reveal/mask, or a very small depth/position response. Aggressive zoom is prohibited. The
outgoing and incoming images occupy the same reserved box, so the transition causes **zero layout
shift**. Under reduced motion the transition becomes an immediate swap.

### 18.7 Progress rail behaviour

- Completed steps may indicate completion.
- The current step owns the animated progress fill for its interval.
- Future steps remain inactive.

The visual behaviour is the requirement; GSAP timelines, CSS, React state or a combination are all
acceptable implementations.

### 18.8 Responsive transformation

Explicit support at **390px**, **768px** and **1440px+**.

- **Desktop (1440px+)**: the split editorial composition above.
- **Tablet (768px)**: an intentional intermediate design — not a squeezed desktop layout.
- **Mobile (390px)**: a **dedicated transformation**, not the desktop vertical layout compressed. The
  reference pattern is image -> active content -> compact progress/controls, or another
  Claude-Design-compatible pattern. The behaviour (autoplay, pause, manual selection, wrapping
  previous/next) must remain understandable and operable by touch.

### 18.9 Direction

- **LTR**: as composed.
- **RTL**: the composition may mirror; text aligns correctly; the progress rail sits on the side that
  makes sense in the mirrored layout; previous/next icons are direction-aware, and their *semantics*
  stay correct (previous still means previous). Logical CSS properties only — no hard-coded physical
  direction assumption anywhere in the section.

### 18.10 Theme

Light and Dark are both required. Board colours are not copied; every surface, text, border, rail,
dot, fill and scrim maps to the approved Hills palettes.

### 18.11 Accessibility

Keyboard operable (items and arrows are semantic buttons, reachable and activatable) · touch operable
· visible focus · accessible names · **no hover-only functionality** (hover pause is an enhancement,
never the only way to stop motion) · a manual way to control the sequence always present · reduced
motion honoured · meaningful `alt` through the T000 copy architecture · contrast passing in both
themes over any scrim.

### 18.12 Other approved reference interactions

The same rules in 18.2–18.11 apply to any other interaction adopted from the boards. Adopt one only
when it strengthens the Hills flow, is honest with current capability, fits Claude Design, remains
accessible, and does not steal functionality owned by a future feature. Candidate patterns:
origins horizontal showcase with progress indicator and previous/next; process/journey step selector
with side thumbnails; image + key-points editorial split; animated image reveal; strong final CTA
composition; subtle card/media hover response. **Mechanical adoption of every board control is
prohibited.**
