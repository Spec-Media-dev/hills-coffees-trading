# Feature 002 — Phase 5.5: Full Product UI Foundation & Visual System Freeze

**Status**: Planned — implementation NOT started
**Inserted**: before Feature 002 Phase 6 (RFQ), after Phases 5 and 7
**Task namespace**: `UIF-001` … `UIF-058` (non-colliding with `T000`–`T057`)
**Created**: 2026-09-09 · Product-scope amendment requested by the product owner

---

## 1. Why Phase 5.5 exists

Feature 002 Phases 1–5 and 7 are implemented and verified. The public surfaces are **functionally**
correct — correct DTO boundary, correct status gating, correct metadata, correct caching. They are
not yet a **product**.

Three concrete, evidence-backed gaps make the current state unsuitable as the foundation the rest of
Hills Coffee is built on:

1. **The brand typeface is absent — and has already forked three ways.** `src/app/layout.tsx` loads
   Geist globally. The approved identity faces are **Benito** (display) and **Manrope** (UI),
   supplied as binaries at `docs/claude-design/assets/fonts/`. A third mechanism already exists:
   `src/app/dashboard/settings/hills-fonts.module.css` declares `"Hills Benito"`/`"Hills Manrope"`
   for **one route only**, with only two weights each, loading the binaries **from `docs/` via a
   relative path out of `src/`**. So today: Geist globally, a route-scoped partial Hills stack on
   `/dashboard/settings`, and the design-system tokens implemented nowhere. UIF-001 collapses all
   three into one.
2. **Dark mode is defined but unreachable.** `src/app/globals.css` already carries a complete,
   correct Hills dark palette under `.dark`, but nothing in the application ever sets that class.
   The capability exists and is inert.
3. **The component layer has forked.** `components/ui/button.tsx` is still default shadcn/Base UI
   (32px default height — below the design system's 44px touch minimum), while the public surfaces
   bypass it entirely with ad-hoc CTA class constants in `components/public/section.tsx`. Two button
   systems already exist and neither is the approved one.

Beyond the public site, `/dashboard` and `/dashboard-admin` are single-paragraph placeholders with
working authorization guards and no application shell at all. Features 004–012 would each have to
invent their own navigation, tables, forms and states — guaranteeing five divergent visual systems.

Phase 5.5 exists to make the UI foundation **finished once**, so Features 003–012 plug business
logic into a coherent product instead of redesigning it twelve times.

### The governing distinction

> **UI FOUNDATION READY ≠ BUSINESS FEATURE COMPLETE.**

Phase 5.5 delivers visual and structural readiness. It delivers **no** business capability, **no**
authorization logic, **no** transactional behaviour, and **no** fabricated operational data.

---

## 2. What Phase 5.5 owns

| Area | Owned by Phase 5.5 |
|---|---|
| Design-system convergence | Brand fonts, type scale, colour/surface tokens, radii, elevation, motion tokens |
| Layout | The single 96rem product content grid + full-bleed pattern |
| Primitives | Button, IconButton, form controls, Card, Badge/StatusBadge, Table + mobile transform, Tabs, Breadcrumbs, Pagination, Dialog, Drawer, Toast, Skeleton, EmptyState, InlineAlert, StateScreen |
| Theme | Light + Dark across Public/Member/Admin, real accessible toggle, no-flash, persistence |
| Language | EN / العربية control, direction switching, Arabic typography, RTL layout correctness |
| Public surfaces | Header, mobile nav, Search **control**, Footer, Hero, homepage narrative, Coffee index/detail, Origins index/detail, Sourcing, Portal Entry, Reference Price, public not-found + state visuals |
| Member surface | The **visual** app shell at `/dashboard` — sidebar, topbar, page header, responsive drawer, module layout patterns, Seller-additive rendering architecture |
| Admin surface | The **visual** app shell at `/dashboard-admin` — dense operational chrome, navigation groups, table/filter/action-bar patterns, role-scalable navigation structure |
| Imagery | Intelligent, audited use of `public/images/` static editorial assets |
| Verification | Real-browser Light/Dark × LTR/RTL × mobile/tablet/desktop matrix, a11y, regression, visual freeze |

## 3. What Phase 5.5 does **not** own

| Not owned | Owner |
|---|---|
| Authentication, sign-in, registration, KYB workflow | **003** |
| Capability-driven member navigation, module registration contract, real overview data | **004** |
| Inventory / custody data and screens | **005** |
| Listings, resale, listing lifecycle | **006** |
| Orders, cart, checkout, reservations | **007** |
| Payments, settlement, invoices, payouts | **008** |
| Delivery / shipments | **009** |
| Every admin business module's behaviour and authorization | **010** |
| Numeric reference pricing, source, freshness, licence | **011** |
| Disputes, notifications, audit behaviour | **012** |
| RFQ form, validation, Server Action | **002 Phase 6 (T019–T022)** |
| SEO technical layer, JSON-LD, sitemap, robots | **002 Phase 8 (T024–T029)** |
| Cache registration + cache proof | **002 Phase 9 (T030–T032)** |
| Runtime-state **behaviour/coverage verification** | **002 Phase 10 (T033)** — see §12 |
| Public automated test suites | **002 Phase 11 (T037–T044)** |
| Feature-002 closure | **002 Phase 13** |

**Scope-theft rule.** Phase 5.5 may create a *presentational component with a documented prop
contract*. It may **not** supply that component with capability-derived, authorization-derived or
business data. Where a later feature owns the data, Phase 5.5 ships the component and an honest
empty state — never a plausible-looking fake record.

---

## 4. Effect on Feature 002

- Phase 5.5 is inserted **between Phases 5/7 and Phase 6**. No existing task is renumbered.
- `T000`–`T057` keep their identifiers and their completed history (20 tasks currently checked).
- Two existing tasks are **explicitly reconciled**, not silently absorbed:
  - **T033** (runtime states) — Phase 5.5 builds the *visual* state system; T033 remains open and
    becomes *behavioural coverage verification per route*. Recorded in §12.
  - **T034** (motion) — Phase 5.5 builds the *motion foundation*; T034 remains open and becomes
    *per-route reveal/hover application + reduced-motion verification*. Recorded in §12.
- **T035** (client-component audit) and **T036** (RTL/long-string pass) are likewise *not* completed
  by Phase 5.5; UIF-047 and UIF-044 produce the foundation they later verify.
- Three spec requirements are formally amended (§8): FR-018, FR-030, and the Out-of-scope line on
  Arabic localisation.

## 5. How future Features consume Phase 5.5

```
Feature 003 (auth/KYB)      → form system, Field scaffold, StateScreen, dialogs, public shell
Feature 004 (member)        → AppShell + Sidebar + Topbar + PageHeader; supplies real capability nav
Features 005–009, 012       → Table + mobile transform, filters, status vocabulary, drawers, forms
Feature 010 (admin)         → Admin shell + operational patterns; supplies real role-gated nav
Feature 011 (pricing)       → ReferencePrice `available` branch, already typed as a discriminated union
```

Each later feature mounts existing primitives and supplies real data. None re-derives visual
decisions.

---

## 6. Design authority

Source-of-truth order is the Constitution's Principle II, unchanged:

1. `docs/requirements/Hills-Coffee-SRS-v1.md`
2. `docs/database/`
3. `docs/design-guidance/Hills-Coffee-Website-Recommendations.md`
4. `docs/claude-design/` — **primary detailed visual implementation reference**
5. `https://www.hillscoffees.com/` — **flow/visual reference ONLY** (see §6.3)
6. Existing application code — implementation baseline only

### 6.1 Extracted Claude Design decisions (binding)

**Colour** — four official: Deep Forest `#173C32`, Warm Cream `#EEE4D1`, Golden Ochre `#CE8A39`,
Burnt Orange `#A44819`. Cream + its warm neutral ramp own the largest surface area; forest carries
identity, navigation, dark chrome; **gold is selective and explicitly NOT the default CTA colour**;
Burnt Orange is a highlight, **not** the error colour. No cool greys — every neutral derives from
Warm Cream (`--sand-*`). Small gold text fails contrast on cream, so two variants ship:
`--gold-on-light #75450D`, `--gold-on-dark #E8A84E`. Dark mode is a derived identity
(`#1A2420` bg, `#1E2C26` card, `#2A5C3E` primary) — **not** an inversion and not a second brand.

**Type** — Benito is the identity face (hero, public headings, standout figures, KPI numbers);
Manrope is the UI face (navigation, cards, forms, tables, all long text). Arabic maps to
**Readex Pro** (display) and **Cairo** (UI). Fluid `clamp()` scale, not pinned pixels. Body never
below 16px; meta never below 12px. Display carries `-0.03em` tracking; **in RTL that negative
tracking is reduced and line-height opens up** (`--tracking-display: -.005em`, `--lh-display: 1.18`,
`--lh-body: 1.8`).

**Space & layout** — 4px base. `--gutter-page: clamp(16px,4vw,48px)`,
`--section-y: clamp(48px,7vw,120px)`. Dashboards: fixed **264px** dark sidebar + sticky **64px**
topbar; public header **76px**. Article measure **760px**. Touch targets never below **44×44px**.
Tablet collapses the sidebar and moves filters into a drawer; mobile replaces heavy tables with card
lists.

**Controls** — `--control-h-sm 36px` / `--control-h 44px` / `--control-h-lg 52px`. Button variants:
primary, secondary, outline, text, accent, destructive. Semibold, `.005em` tracking, radius
`--radius-sm` (sm/md) and `--radius-md` (lg). Press adds `translateY(1px)` + `--primary-active`.
Disabled = 45% opacity + `not-allowed`.

**Cards** — white in light / `#1E2C26` in dark, 1px warm border `#D7C8AD`, **14px** radius
(`--radius-lg`), very soft forest-tinted shadow. In light the border does the work. **No coloured
left borders. No stacked gradients.** The only card that changes border colour is one awaiting the
user — it turns gold. Interactive cards lift `-2px` on hover.

**Radii** — 6 / 8 / 12 / 14 / 20 / 28px + `--radius-pill`; `--radius-arch` for editorial media crops.

**Shadow** — five outer steps, all `rgba(23,60,50,…)` — warm, never neutral black in light mode.
Scrims (`--scrim-bottom`, `--scrim-top`) protect text over imagery, **not** opaque capsules.

**Motion** — 160–420ms; `cubic-bezier(.2,.6,.2,1)` state, `cubic-bezier(.16,1,.3,1)` entrance. Fades
and short rises. **No bounce, no spring, no attention-seeking loops.** Drawers slide from the
inline-end edge; dialogs rise 12px; toasts rise 10px. Every duration collapses to 1ms under
`prefers-reduced-motion`.

**Interaction states** — every component ships Default, Hover, Focus-visible, Active, Selected,
Disabled, Loading, Success, Error. Hover **darkens** or lays a 7–8% forest tint — never a lightening
wash. Focus-visible is a 2px `--focus-ring` outline at 2px offset (gold in dark) and is **never
removed**.

**Status** — never colour alone: every badge pairs a dot with a label from the **closed vocabulary**
(orders: Draft · Quoted/Awaiting confirmation · Payment pending · Paid · Processing/Allocated ·
In transit · Completed · Cancelled · Refunded · Disputed; shipments and KYB have their own closed
sets). Never invent a synonym for a state.

**Iconography** — Lucide, line/outline, uniform 1.75 stroke, forest on light / cream on dark, one
icon style per screen. Icons are decorative next to a label (`aria-hidden`) and never the sole
carrier of meaning. **Directional icons flip in RTL; a clock, document or warehouse does not.**
**No emoji anywhere.**

**Logo** — horizontal lockup, **minimum digital width 150px**. Never stretch, rotate, recolour or
rearrange. The design system recorded "no dark-surface variant supplied"; the repository now
contains `hills-logo-light.png` (cream) and `hills-logo-dark.png` (green), which **closes that
documented gap** — the cream-plate workaround is therefore not needed.

**Content rules that bind the UI** — sentence case for headings/buttons/labels; UPPERCASE + wide
tracking only for eyebrows and sidebar group labels. Numbers always carry unit and currency, use
tabular figures, and **stay LTR inside RTL layouts**. Reference codes are monospaced.
**"Name what is missing"** — never "additional information required"; say which items and give a
direct CTA. **Admin copy is factual — never seed a dashboard with a plausible-looking fake number.**

**Bilingual by default** — *"Every screen must work in English and Arabic, LTR and RTL."* The design
system ships `LanguageSwitcher` and `ThemeToggle` components and specifies `data-theme="dark"` on
`<html>` and `lang="ar" dir="rtl"` for Arabic.

### 6.2 Design guidance (`Hills-Coffee-Website-Recommendations.md`)

Premium B2B positioning; header prioritises Coffee/Origins/Sourcing with a **secondary** Trading
Portal link and a primary commercial CTA; hero states Dubai-based regional green-coffee supply
immediately; supply credibility explains relationships, logistics and quality documentation **using
real proof only**; RFQ is short and progressive. **Do not send every visitor into the portal**, and
**never present Hills as an open public trading exchange**. Sample-led buying language is
inspiration-only and must not become a product claim.

### 6.3 Live site — reference only, with a hard exclusion list

`https://www.hillscoffees.com/` was inspected (EN and `/ar`). **Useful and adoptable:** the
Dubai-HQ/Egypt-operations framing; the "one business, three clear ways to buy" intent structure
(already mirrored by our intent cards); origins-led storytelling; an evidence/traceability section
placed before persuasion; a richer four-group footer (Explore · Account · Contact · Legal); and the
presence of Search and an EN/AR switcher in the header.

**MUST NOT be replicated — the live catalogue publicly exposes data our own boundary forbids:**

| Live site publicly shows | Why it is forbidden here |
|---|---|
| Warehouse location per coffee ("Dubai Warehouse", "Egypt Warehouse") + a warehouse filter | Private warehouse operational data — Principle VII, SEO-APP-02, DTO allowlist §3 |
| Bag quantity / weight ("15 × 100 kg") | Private quantity — FR-022, FR-024 |
| Grade / quality designation | `coffee_lots` is member-only (DB-OPEN-05) |
| Availability status ("In store", "Sold out", "Arriving soon") | Implies a live order book — SRS MKT-06, FR-024 |
| Search across "sensory profiles" | `offer_sensory_notes` is denylisted private data |

The live site is **not** a data-exposure authority. Where its flow is good we adopt the flow; where
it exposes private trading data we deliberately diverge. **This exclusion list is binding on every
UIF task.**

**Locale-routing divergence (recorded):** the live site uses path-prefix locale routing (`/ar/...`).
Phase 5.5 deliberately does **not** adopt locale routing — see §9.

---

## 7. The 96rem product content grid

**Locked product decision:** the shared principal content container is `max-width: 96rem` (1536px).

A single primitive is defined in `src/app/globals.css` (edited in place — never moved):

```
width: 100%;
max-inline-size: 96rem;
margin-inline: auto;
padding-inline: var(--gutter-page);   /* clamp(16px, 4vw, 48px) */
```

**Reconciliation with Claude Design.** The design system specifies `--container-max: 1280px`
(public content), `--container-narrow: 760px` (article measure) and `--container-wide: 1600px`.
96rem = 1536px sits inside that documented range. These are **not** in conflict once their roles are
separated:

| Role | Width | Applies to |
|---|---|---|
| **Product frame** (locked) | **96rem / 1536px** | The outer content grid for Public, Member and Admin — the single shared container |
| Editorial content measure | 1280px | Public editorial sections that read better narrower, nested *inside* the frame |
| Article measure | 760px | Long-form prose (Sourcing body; future knowledge/legal) |

The frame is the product's one grid. The two narrower measures are **reading constraints nested
inside it**, exactly as the design system intends — not competing page containers.

**Rules.** Full-bleed backgrounds, visual bands, hero imagery and editorial photography span the
viewport; their **inner content** aligns to the frame. Arbitrary repeated `max-w-5xl` / `max-w-6xl` /
`max-w-7xl` / `max-w-screen-xl` are prohibited; the current `mx-auto w-full max-w-6xl px-6` constant
in `components/public/section.tsx` is replaced by the shared primitive.

---

## 8. Formal spec amendment: EN / العربية

### The conflict

Feature 002 `spec.md` **FR-018** currently states: *"English-first; no locale routing, no locale
switcher."* Out-of-scope states: *"Localisation into Arabic (RTL-safe markup only; translation
delivery is a later decision)."* The product owner now requires a real EN/العربية experience.

### Why the amendment is sound (not a weakening)

- **The SRS is silent on language.** It contains no localisation requirement (`Arabic` appears only
  as *Arabica*, the species). There is therefore **no conflict with authority 1**.
- **Authority 4 already requires it.** `docs/claude-design/readme.md`: *"Bilingual by default. Every
  screen must work in English and Arabic, LTR and RTL."* It ships a `LanguageSwitcher` component and
  specifies `lang="ar" dir="rtl"`. Feature 002's "no switcher" was a **Feature-002 scope narrowing**,
  not a design-system rule.
- **The real business already ships Arabic** (`hillscoffees.com/ar`).

The amendment therefore *aligns* Feature 002 with authorities 1 and 4. It touches no locked
Constitution rule (Governance amendment list) — language is not among them.

### Amendment text

- **FR-018 (amended)** — replaces "English-first; no locale routing, no locale switcher" with:
  English and Arabic are both supported. A locale control switches the active language and document
  direction. **No locale routing** (`/en`, `/ar`) is introduced in this phase.
- **FR-030 (unchanged in force, clarified)** — Feature 001's i18next initialisation
  (`lib/i18n/config.ts`) remains **the only** i18n system. No second library. No duplicate
  dictionary. `lib/public/copy` remains the single copy source and gains an `ar` sibling fed from the
  same module.
- **New FR-032** — every product surface (Public, Member, Admin) MUST render correctly at
  `dir="rtl"` with Arabic typography, without layout redesign.
- **New FR-033** — a theme control MUST expose the existing Light/Dark token architecture across all
  three surfaces without introducing a second theme system.
- **Out-of-scope (amended)** — "Localisation into Arabic" is removed; replaced by: *approved Arabic
  **content** translation is owned by Content/Legal (see the A/B split below)*.

### A/B split — infrastructure vs. approved content

| | Owner | Phase 5.5 |
|---|---|---|
| **A. Infrastructure + UI switching** — locale control, `dir`/`lang` switching, Arabic font stack, RTL layout correctness, persistence, dictionary structure, RTL-safe primitives | **Phase 5.5** | **In scope** |
| **B. Approved Arabic content** — translated marketing, legal, compliance and business copy | **Content/Legal owners** | **Out of scope** |

**Do not fabricate Arabic legal or business claims.** Where approved Arabic copy does not exist, the
Arabic dictionary carries the reviewed English string (or an explicitly-marked untranslated key) and
the surface still renders correctly RTL. Untranslated content is a *content* gap, never a *layout*
gap — which is precisely what prevents a future Arabic redesign.

**Recorded as `CONTENT-AR-01`** (new, non-blocking): approved Arabic content translation is
unavailable; infrastructure ships without it and no Arabic claim is invented.

---

## 9. Theme, direction and locale architecture

**Theme.** `src/app/globals.css` already defines the complete Hills dark palette under `.dark` with
`@custom-variant dark (&:is(.dark *))`. **No second theme system is created.** The narrow extension
Phase 5.5 adds is the missing *control path*:

- a dependency-free provider that toggles the `.dark` class on `<html>`;
- a blocking inline script in `src/app/layout.tsx` (edited in place) that applies the stored
  preference **before first paint**, eliminating both flash-of-wrong-theme and hydration mismatch;
- `ThemeToggle` in the public header and both application topbars, per the design system's placement.

*Selector note:* the design system documents `data-theme="dark"`; the implementation uses the `.dark`
class. The **token values are identical**. The selector mechanism is an implementation detail already
established by Feature 001, and churning it would risk the verified Feature-001 surfaces for zero
product benefit. The equivalence is recorded here so no future agent "fixes" one to match the other.

**Direction and locale.** Feature 001's i18next stays the only i18n system. The locale control sets
`lang` + `dir` on `<html>` through the same provider pattern, persists identically to the theme, and
is applied pre-paint by the same script. **No locale routing** — this keeps Feature 002's canonical
URL contract, trailing-slash rule, sitemap and metadata architecture untouched.

**Recorded consequence:** without locale routing, Arabic content is not separately indexable. That is
an acknowledged **SEO trade-off**, not an oversight. Locale routing + `hreflang` is a larger change
touching the SEO layer (Phase 8) and the canonical contract; it is recorded as **`I18N-ROUTE-01`**
and assigned to a future decision, not silently adopted here.

---

## 10. Search architecture decision

**Decision: build the Search *control* architecture; do not build global search.**

*Capability assessment.* The public read layer (`lib/public/coffees.ts`, `origins.ts`, `taxonomy.ts`)
already exposes cached, allowlisted, anonymously-readable data. A **safe** public search is
technically possible over coffee name/description/slug, origin name and taxonomy — all already
public. What is **not** safe, and is permanently forbidden publicly, is the live site's search
surface: warehouse, availability, quantity, grade and sensory profiles.

*Scope assessment.* Feature 002's route contract (FR-002) does not include a search-results route,
and no task `T000`–`T057` owns search. A global search-results page would be **new public surface**
and new scope.

*The plan:*

- **UIF-019 (in scope)** — the reusable Search control: header placement, mobile behaviour, dialog/
  drawer shell, keyboard interaction (open, focus trap, Escape, arrow navigation), focus-visible,
  touch target, Light/Dark, LTR/RTL, `--radius-pill` field per the design system. It resolves to the
  existing `/coffee/` catalogue. **No fake results. No decorative dead control.**
- **UIF-030 (in scope, separable)** — an honest in-page filter over the **already-fetched public
  coffee index**: name, origin, processing method, tag. No new route, no new query, no new database
  access, no private field. Defined as a distinct task so it can be dropped without breaking the
  header.
- **Explicitly deferred and recorded** — global cross-entity search, ranked relevance, server-side
  search endpoints, search analytics. Functional ownership: a future feature.
- **Permanently forbidden publicly** — searching or filtering by warehouse, availability, quantity,
  grade, seller or sensory profile.

---

## 11. Imagery strategy (`public/images/`)

Every asset was inspected **visually**, not by filename. Filenames are unreliable — verified example:
`roasting-profile.jpg` contains **no roasting**; it is a farmer hand-picking cherries at origin, and
is therefore usable (roasted-coffee imagery would violate the green-coffee B2B positioning).

| Asset | Subject (verified) | Orientation | Planned use |
|---|---|---|---|
| `hero-banner.jpg` | Drying beds at origin, worker raking green coffee, hills behind, warm low sun | 1288×1600 **portrait** | **Primary hero.** Already adopted; strongest asset in the library |
| `coffee-cherry.jpg` | Ripe cherries on branch, shallow depth of field | 1344×752 landscape | Sourcing intro, origins editorial |
| `farmer-partnership.jpg` | Cherries in a woven basket, top-down, weathered wood | 1600×893 landscape | Credibility / relationships band |
| `roasting-profile.jpg` | **Farmer hand-picking cherries** (filename misleading) | 1600×893 landscape | Sourcing relationships |
| `farm-landscape.jpg` | Drying beds, workers, hills, wide | 1344×752 landscape | Full-bleed editorial band |
| `warehouse-bags.jpg` | Covered drying/processing area, workers, sacks | 1600×893 landscape | Custody / logistics storytelling, Portal Entry |
| `cupping-lab.jpg` | Hand inspecting green beans in a jute sack, warehouse interior | 1600×893 landscape | Quality documentation |
| `greenCoffe1.png`, `greenCoffe2.png` | Green beans spilling from a jute sack, close-up | 1448×1086 | Green-coffee texture band, catalogue/reference-price context |
| `origin-*.jpg` (6) | Generic origin/harvest scenes | mixed (3 portrait, 3 landscape) | **Editorial only** — see the MEDIA-01 rule below |
| `coffee-lot-1…7.jpg` | Generic lot/bean scenes | 1600×893 | **Editorial only** — see the MEDIA-01 rule below |
| `hills-logo-dark.png` | Green horizontal lockup | 2624×996 | Header/footer on **light** surfaces |
| `hills-logo-light.png` | Cream horizontal lockup | 2624×996 | Header/footer on **dark** surfaces |
| `hills-favicon-green.png` | Square brand mark | 512×512 | Favicon / brand mark |
| `logo-mark.png` | Small horizontal lockup | 529×231 | Superseded by the two full-resolution variants |

**Static assets vs MEDIA-01 — the load-bearing boundary.**

- `public/images/` = **approved repository-owned static editorial assets.** Usable now.
- Database-backed, entity-specific media remains governed by **MEDIA-01** and is still blocked.

**Therefore:** a generic repository photo MUST NEVER be rendered as the media of a specific Coffee or
Origin **record**. `origin-ethiopia.jpg` must not become the image for a database origin named
Ethiopia — it is not verified as that record's photograph, and mapping it by slug or name would
fabricate record media. Coffee and Origin **record** media slots keep `MediaPlaceholder` until
MEDIA-01 is resolved. Static imagery is used for **editorial context** (hero, narrative bands,
sourcing, portal entry) where it represents Hills' business, not a specific catalogue row.

Every image ships intrinsic dimensions, responsive `sizes`, a stable aspect ratio (no layout shift),
`next/image`, and alt text through the T000 copy architecture. Not every section needs a photograph —
imagery is used **compositionally**, with typography-led and full-bleed sections between.

---

## 11.1 The approved reference pack (`public/images/features/`)

**Inventory verified from the repository on 2026-09-09 — 34 files:** 3 reference boards, 1 contact
sheet, 28 extracted crops, `manifest.json` (per-asset source board + crop box + pixel size),
`README.md`. No subdirectories. Every board and every crop was inspected **visually**, and the
`manifest.json` sizes were independently re-derived from the JPEG headers (they match).

### The three boards and what each is authoritative for

| Board | Size | Authoritative for |
|---|---|---|
| `reference_board_01_interactive_examples.jpg` | 1312x1199 | **Interaction behaviour**: 4 stacked items, vertical progress rail, active dot, image swap, `01 / 04` counter, prev/next, and the board's own stated rule — *"3-second auto transition, pause on hover, loop back to start"* |
| `reference_board_02_brand_experience.jpg` | 1672x941 | **Composition**: hero shape (eyebrow -> display headline -> sub-copy -> primary + secondary CTA), header slot order (logo · nav · **search** · **EN** · CTA), origins showcase with rail + arrows + pagination, CTA band, featured triple, chips, and a mobile preview (hamburger, mobile hero, drawer carrying locale + CTA) |
| `reference_board_03_section_concepts.jpg` | 1222x1287 | **Section shape**, six labelled concepts: 1 interactive vertical story · 2 process/journey with numbered rail + side thumbnails · 3 origins horizontal slider with progress indicator · 4 image + key points with a small slider · 5 icon cards over a background band · 6 CTA/contact with brand statement |

### The authority equation (boards never win on styling)

```
reference boards            -> composition · interaction · section shape · rhythm
docs/claude-design/         -> colour · typography · fonts · sizing · buttons · surfaces ·
                               spacing · radii · component treatment        [STYLING AUTHORITY]
design-guidance             -> hierarchy · B2B experience · flow · storytelling
SRS + docs/database/        -> business truth; what may exist at all
T000 copy architecture      -> every user-facing string
public/images + features/   -> the real static imagery
```

A board colour, board typeface, board button shape or board chip style is **never** a reason to
deviate from `docs/claude-design/`. The boards contribute *where things go and how they behave*.

### Board sample content — explicitly excluded

The boards are generated mockups. The following appear on them and **must not be reproduced**:

- **Fabricated statistics** — `12+ Origins`, `200+ Global Partners`, `100% Traceable`, `EST. 2020`.
- **Fabricated contact details** — `sales@hillscoffee.com`, `+971 4 123 4567`.
- **A generated logo lockup** (mountain glyph + "HILLS COFFEE"). The approved marks are
  `hills-logo-dark.png`, `hills-logo-light.png` and `hills-favicon-green.png`.
- **Fabricated social proof** — the avatar row with "Trusted by partners worldwide", and the pull
  quote attributed to "THE HILLS COFFEE TEAM".
- **Sample sustainability / partnership claims** — "Sustainable Practices", "Fair Partnerships",
  "Lasting Impact", "Direct Trade", and every board body paragraph.
- **Sample taxonomy copy** — the Arabica / Robusta / Liberica / Excelsa descriptions, the origin
  descriptors ("Floral, vibrant, complex"), and the four process-step descriptions.

A section *subject* may be reused where Hills genuinely owns the content; the *words* come from the
T000 dictionary, never from a board.

### Per-asset classification — the 28 extracted crops

Two constraints emerged from visual inspection that neither the filenames nor `manifest.json` record.

**(a) Resolution ceiling.** The largest crop is 588x80; the largest usable rectangle is 396x263.
These are **small-slot assets**. None is a full-bleed hero asset — a 396x263 image upscaled across a
1440px viewport is visibly soft. Full-bleed and large editorial slots therefore continue to use the
`public/images/` root library (1600x893, 1288x1600, 1448x1086), which is genuinely hero-grade.

**(b) Baked-in artefacts.** Several crops carry text, UI chrome or a fabricated brand mark burned
into the pixels. Burned-in English text cannot be translated, cannot mirror for RTL, and bypasses the
T000 copy architecture — so those assets are restricted regardless of how attractive they are.

| Class | Assets | Ruling |
|---|---|---|
| **USABLE — small editorial slots** | `01_arabica_cherries_closeup` (290x448) · `03_coffee_farm_landscape` (298x303) · `13`/`14_product_green_beans_1/2` (166x98) · `15_product_red_cherries` (161x98) · `16_interactive_cherries` (299x380) · `17_process_mountain_farm` (199x387) · `22`/`23`/`24`/`25_origin_*_landscape` (85x154) · `26_story_hand_cherries` (273x312) · `28_cta_green_beans_closeup` (331x184) | Clean subjects, no burned-in text. Usable as **thumbnails, chips, small cards, strip accents** — never as a full-bleed hero |
| **USABLE ONLY AFTER RE-CROP** | `04`/`05`/`06`/`07_strip_*` (373x~68) · `11_farmer_origin_portrait` (173x396) · `27_advantages_landscape` (588x80) | An outer edge carries a sliver of board text or UI. Usable only if the implementation crops the artefact out; otherwise treat as restricted |
| **RESTRICTED — fabricated brand mark** | `02_dark_coffee_cup` | The mug carries a **generated** "HILLS COFFEE" logo that is not the approved lockup. Publishing it would ship a fake brand mark |
| **RESTRICTED — burned-in UI chrome** | `08_hero_mountain_origin` | Contains the board's own header bar (nav items, search icon, "EN", "Get a Quote" button) |
| **RESTRICTED — burned-in English text** | `09_hero_green_beans_sack` ("More Than Coffee", "SCROLL TO EXPLORE") · `10_origin_ethiopia_card` ("Ethiopia") · `12_cta_green_beans` ("GREAT COFFEE BUILDS") · `18`/`19`/`20`/`21_process_*` ("01 Cultivation", "02 Harvesting", "03 Processing", "04 Global Export") | Untranslatable, non-mirroring, bypasses T000. Not publishable as-is |
| **NOT A PRODUCT ASSET** | `00_contact_sheet.jpg` and the three `reference_board_*.jpg` | Planning artefacts. Never rendered by the application |

**Net:** of the 28 crops, **13 are usable as-is**, **6 are usable only after re-cropping**, and
**9 are restricted**. Recorded as **ASSET-REF-01** (section 18), enforced by task `UIF-052`.

### MEDIA-01 is unchanged by the reference pack

Every file under `public/images/features/` is a **static editorial asset**, exactly like the root
library. It may support hero, homepage editorial, sourcing, process/story sections, CTA bands and
static educational content. It may **never** be presented as verified media for a specific database
**coffee, origin, listing, seller, warehouse or inventory record**. In particular
`22`/`23`/`24`/`25_origin_*_landscape.jpg` must not be mapped to origin rows named Ethiopia,
Colombia, Guatemala or Indonesia — the name match is a coincidence of the mockup, not provenance.
Record media slots keep `MediaPlaceholder` until MEDIA-01 is resolved.

---

## 12. Reconciliation with existing Feature-002 tasks

| Existing task | Phase 5.5 provides | Task remains open, redefined as |
|---|---|---|
| **T033** runtime states | The reusable **visual** system: EmptyState, Skeleton, InlineAlert, StateScreen convergence, retry/unavailable/blocked treatments, custom public not-found | **Behaviour + per-route coverage verification**: each owned route renders the correct state for a seeded condition, no state fabricates data, blocked sub-flows explain honestly |
| **T034** motion | The motion **foundation**: tokens, Motion + CSS wrappers (`UIF-015`), the scoped **GSAP** layer and `ANIMATION-OWNERSHIP` registry (`UIF-053`), reveal/hover primitives, reduced-motion collapse. **T034's own "do not initialise GSAP" clause is superseded for Phase 5.5 by MOTION-GSAP-01; its Lenis clause stands.** | **Per-route application + verification** that reduced-motion removes all animation on every owned route |
| **T035** client-component audit | A minimal, documented client-island set — theme, locale, mobile nav, search control, motion wrappers, interactive form controls, `AnimatedHero`, `InteractiveStorySection`, `OriginsShowcase`, and conditionally `ProcessJourneySection` (contract §16) | Unchanged — the audit still runs against the final tree |
| **T036** RTL/long-string pass | RTL-correct primitives and Arabic typography | Unchanged — still verifies every public layout with the physical-property grep and `dir="rtl"` render |

**No existing task is marked complete by Phase 5.5.** Each stays `[ ]` and gains a note recording
which UIF task supplied its foundation. This prevents both duplicate work and false completion.

---

## 13. Architecture and component ownership

```
src/app/globals.css          EDIT IN PLACE — 96rem grid primitive, brand font vars,
                             token completion (surfaces, ramps, status, scrims, shadows)
src/app/layout.tsx           EDIT IN PLACE — brand fonts, pre-paint theme/dir script,
                             lang/dir wiring, real metadata (replaces "Create Next App")
src/app/page.tsx             EDIT IN PLACE — homepage narrative composition

components/ui/*              CONVERGED to Hills: button, input, textarea, select, checkbox,
                             radio-group, switch, label, card, badge, table, tabs, dialog,
                             sheet, separator, skeleton, tooltip, breadcrumb, progress
components/ui/icon.tsx       NEW — Lucide wrapper, one icon system
components/layout/           state-screen.tsx CONVERGED; container/section primitives
components/public/*          CONVERGED public surfaces (existing 10 components)
components/app/*             NEW — shared application shell primitives:
                               app-shell.tsx, sidebar.tsx, topbar.tsx, page-header.tsx,
                               mobile-nav-drawer.tsx, data-table.tsx, filter-bar.tsx,
                               action-bar.tsx, kpi-card.tsx, empty-state.tsx
components/theme/*           NEW — theme provider + ThemeToggle (client islands)
components/locale/*          NEW — locale/direction provider + LanguageSwitcher (client islands)

src/app/dashboard/*          Visual shell applied; authorization guards untouched
src/app/dashboard-admin/*    Visual shell applied; authorization guards untouched
```

**Deliberately excluded surface.** `/foundation-status` is Feature 001 internal cache-proof
infrastructure, not a product surface. Phase 5.5 does not restyle it, and `T028` (Phase 8) retains
ownership of its non-indexable metadata.

**Route ownership.** Phase 5.5 creates **no new public route**. Any UI-preview surface must sit
behind an existing guard and must never be publicly reachable. `/knowledge/*` and `/legal/*` remain
unbuilt (CONTENT-01).

**Server/client boundary.** Server Components remain the default. The complete permitted client-island
set is **nine, plus one conditional tenth** (contract §16): theme control · locale control · mobile
navigation · search control · motion wrappers (Motion/CSS layer + scoped GSAP helper) · genuinely
interactive form controls · `AnimatedHero` (UIF-024) · `InteractiveStorySection` (UIF-054) ·
`OriginsShowcase` (UIF-055) · and conditionally `ProcessJourneySection` (UIF-056) **only if** that
task renders a real step selector — if it ships static, it stays a Server Component and the island
must not exist. No page tree becomes a Client Component for animation: the island is the animated
subtree only, each island receives already-resolved, already-narrowed props from its server parent,
and no additional DTO is hydrated to feed an animation.

**Animation ownership — one engine per interaction, one engine per property.** Three engines are
approved, each owning distinct work:

| Engine | Owns | Examples |
|---|---|---|
| **GSAP** (`gsap ^3.15.0`) | Timeline-controlled, multi-step, precisely synchronised sequences | Hero choreography; the story section's 3s progress timeline with pause / resume / seek; layered entrance; synchronised text + media |
| **Motion** (`motion ^13.2.0`) | Component enter/exit and small interaction state | Image crossfade, mobile nav drawer, card and button feedback, icon transitions, small layout transitions |
| **CSS** | Simple stateless transitions | Hover colour, focus ring, border and opacity transitions |

**The conflict rule (two parts, both mandatory — contract §13.2).**

*(a) One engine per interaction.* Constitution XIII states *"Do not combine animation engines on the
same interaction."* An interaction is one synchronised user-visible sequence; exactly one engine is
its primary owner and drives every part that stays in lockstep with it. A second engine may not
animate any part of that sequence, even on a different node. The story section's item advance
(progress fill + active-item state + image transition) is one interaction, **GSAP end to end**. The
hero entrance is one interaction, **GSAP end to end**. Motion owns interactions that are separate
sequences of their own — mobile navigation, card/button hover response, icon state, section reveal.

*(b) One engine per property.* Within any interaction, a given element's given animatable property
has exactly one owner; GSAP and Motion never both write the same `transform`, `opacity` or layout
property on the same node. (b) is the narrower safety net; (a) governs, and satisfying (b) alone does
not satisfy (a).

An `ANIMATION-OWNERSHIP` registry comment is required in `components/motion/`, recording per animated
surface the interaction, its primary engine, and the properties each engine owns.

**Lenis is not initialised.** `lenis ^1.3.26` is present in `package.json` but stays uninitialised.
Native browser scrolling is preferred; smooth-scroll hijacking harms accessibility and reading
control. Adopting Lenis would require its own separate approval and its own task.

---

## 14. Security boundaries (unchanged and re-verified)

- **No database change of any kind** — no migration, schema, RLS, policy, function, trigger, Storage.
- **No runtime service-role.** No new private-table query. The public DTO allowlist is unchanged.
- **`/dashboard` and `/dashboard-admin` guards are untouched.** Visual work is verified through the
  existing approved test-fixture identities — guards are never weakened to preview UI.
- **Cache authority unchanged**: `unstable_cache` + tags + `revalidateTag` only. No Redis, no
  Upstash, no second cache, no `cacheComponents`, no `"use cache"`, no standalone `cacheTag`/
  `cacheLife`.
- **Root files edited in place, never moved** (Constitution IV).
- **Blockers preserved**: MEDIA-01, CONTENT-01, PRICE-011, DB-BLOCK-02, CRM-DEST-01, LIFE-01,
  ABUSE-01. Visual work never bypasses one.
- **No fake operational data** — no invented order, payment, inventory, listing, KYB approval,
  payout, settlement, shipment or financial total. Honest empty states and skeletons only.

---

## 15. Verification strategy

| Layer | Method |
|---|---|
| Per task | The task's own `Verify` condition — concrete and checkable |
| Real browser | Installed Chrome over CDP (the technique Features 001/002 already proved — **no new dependency**) |
| Matrix | 7 public routes + `/dashboard` + `/dashboard-admin` × {Light, Dark} × {LTR, RTL} × {390px, 768px, 1440px}, plus a ≥1536px check for the 96rem frame |
| Overflow | `scrollWidth === clientWidth` on every scenario; no tracked element crosses the inline viewport edge |
| Arabic | Long Arabic string injection on every RTL scenario — no clipping, no overflow |
| Motion | Every transition/animation duration ≤ 1ms under `prefers-reduced-motion` |
| A11y | WCAG 2.2 AA direction: contrast, keyboard traversal, focus-visible, semantic headings, labels, 44px targets, dialog/drawer focus behaviour, image alt |
| Security | Public canary/DTO tests, protected-route guard regression, no service-role, no new private query |
| Gate | `npm run typecheck`, `npm test`, `npm run build`, lint baseline unchanged (124 errors / 148 warnings, all confined to `docs/claude-design`) |

---

## 16. Implementation block order

| Block | Name | Depends on | Codex | Claude |
|---|---|---|---|---|
| **UIF-A** | Shared Visual Foundation (+ reference-pack audit, GSAP foundation) | — | Sol — High | **Opus — High** |
| **UIF-B** | Public Shell (header, nav, theme, locale, search, footer) | A | Sol — High | **Opus — High** |
| **UIF-C** | Public Homepage (hero + choreography, narrative, imagery, interactive story, process/journey) | A, B | Sol — **High** | **Opus — High** |
| **UIF-D** | Coffee + Origins (+ origins showcase) | A, B | Sol — Medium | **Opus — High** |
| **UIF-E** | Sourcing + Portal + Reference Price + state integration | A, B | Sol — Medium | Sonnet — High |
| **UIF-F** | Member App Foundation (shell, Buyer, Seller-additive) | A, B | Sol — High | **Opus — High** |
| **UIF-G** | Admin App Foundation (shell, operational patterns) | A, B, F | Sol — High | **Opus — High** |
| **UIF-H** | Whole-Product Convergence (Light/Dark, LTR/RTL, EN/AR, responsive, motion, a11y) | C–G | Sol — High | Sonnet — High |
| **UIF-I** | Real-Browser Verification (incl. interaction + animation-leak proof), Regression & Visual Freeze | H | Sol — High | **Opus — High** |

A and B are the critical path. C, D and E are mutually independent once B lands. F precedes G because
the admin shell reuses the member shell primitives at higher density.

**Task count after the 2026-09-09 amendment: 58** (`UIF-001`–`UIF-058`), still in **9 blocks** — the
seven new tasks were placed inside existing blocks rather than creating a tenth. Because they were
appended rather than inserted, **id order is not execution order**; dependency correctness is defined
and verified against execution position (block, then position within block).

---

## 17. Constitution check

| Principle | Status | Note |
|---|---|---|
| II Source priority | PASS | SRS → DB → guidance → claude-design → live site (reference only) → code |
| III Database authority | PASS | Zero database change of any kind |
| IV Locked root files | PASS | `page.tsx`, `layout.tsx`, `globals.css` edited in place, never moved |
| V Surface separation | PASS | Public `/`, one Member `/dashboard`, Admin `/dashboard-admin`. No `/buyer-dashboard`, no `/seller-dashboard` |
| VI Buyer/Seller model | PASS | Seller is additive inside `/dashboard`; visibility is never treated as authorization |
| VII Public/private boundary | PASS | Live-site exposure list explicitly excluded (§6.3); DTO allowlist unchanged |
| VIII Server-side authorization | PASS | Guards untouched; no UI check substitutes for authorization |
| XI Native caching only | PASS | No cache change; no external cache |
| XII Rendering discipline | PASS | Server-first; nine documented client islands + one conditional tenth (contract §16) |
| XIII Design system fidelity | PASS | claude-design is binding; shadcn defaults are explicitly converged, not left as-is |
| XIV Security & secrets | PASS | No secret, no service-role, no private file path |
| XV Spec-driven lifecycle | PASS | Plan → Tasks → Analyze; amendment recorded formally in §8 |

**Motion note — amended 2026-09-09, superseding the earlier narrowing.** Constitution XIII permits
GSAP and Lenis with justification. The earlier Phase 5.5 draft adopted a rule *narrower* than the
Constitution (Motion + CSS only). The product owner has since amended Phase 5.5 explicitly:

- **GSAP is approved** for Phase 5.5 visual/experience work. Justification, recorded in section 13:
  the required story section needs a seekable, pausable, resumable 3-second timeline per item, which
  is exactly GSAP's control model and is awkward and leak-prone to hand-roll.
- **Motion is approved**, and **CSS transitions are approved**.
- **Lenis remains not approved by default** — that half of the earlier narrowing stands.
- **XIII's second clause is honoured literally.** The Constitution also says *"Do not combine
  animation engines on the same interaction."* Phase 5.5 satisfies this by assigning exactly one
  **primary engine per interaction**, not merely one engine per property: the story-section item
  advance and the hero entrance are each GSAP end to end, and Motion is not used inside either
  sequence. Motion owns interactions that are separate sequences of their own. The per-property rule
  is retained as the narrower safety net. Recorded in section 13 and contract §13.2.

Lifting a self-imposed narrowing back to the Constitution's own permission is not a weakening: the
Constitution already allowed GSAP with justification, and the justification is now on record. The
Feature-002 `T034` rule text is reconciled in `tasks.md` so the two documents cannot contradict.

---

## 18. New records opened by this plan

| ID | Type | Summary | Blocking? |
|---|---|---|---|
| **CONTENT-AR-01** | Content ownership | Approved Arabic content translation is unavailable. Infrastructure ships; no Arabic business/legal claim is invented. | **No** — infrastructure is independent |
| **I18N-ROUTE-01** | Deferred decision | Locale routing (`/ar/…`) + `hreflang` for Arabic SEO indexability is deliberately not adopted in Phase 5.5. | **No** — recorded trade-off, future decision |
| **ASSET-REF-01** | Asset constraint | 9 of the 28 extracted reference crops carry a fabricated brand mark, burned-in board UI, or burned-in English text; 6 more need a re-crop. All 28 are small-slot resolution — none is hero-grade. Classification in section 11.1, enforced by `UIF-052`. | **No** — the root `public/images/` library covers every large slot |
| **MOTION-GSAP-01** | Approved amendment | GSAP is approved for Phase 5.5 (product-owner decision, 2026-09-09), superseding the earlier Motion+CSS-only narrowing. Motion and CSS remain approved. Lenis remains **not** approved. Ownership rules in section 13. | **No** — dependency already installed (`gsap ^3.15.0`) |
