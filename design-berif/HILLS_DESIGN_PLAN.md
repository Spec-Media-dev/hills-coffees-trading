# Hills Coffee Premium Public-Site Redesign Plan

## 1. Implementation Authority

This document is the approved Hills Coffee public-site design direction.

- The future implementation agent must implement this plan, not redesign it.
- Existing functionality, data/security boundaries, project architecture, localization, and approved business logic always take priority.
- Do not invent sections, marketing claims, statistics, partner logos, pricing, certifications, locations, or SaaS-style UI.
- Do not introduce fake dashboards, product screenshots, trading data, or café/e-commerce motifs.
- If implementation reveals a conflict with the real codebase, preserve functionality, document the conflict and affected design decision, then stop for direction rather than improvising a different design.
- Implement visual changes separately from Supabase, authentication, form, API, cache, SEO, pricing, admin, and authorization changes.
- Keep the redesign scoped to public routes. Protected dashboard, admin, finance, inventory, KYB, and operational UI remain out of scope.

---

## 2. Executive Design Summary

Create a premium B2B public website for green-coffee sourcing and trading: precise, tactile, spacious, and commercially credible. The design frames Hills as an origin-to-arrival partner for importers, roasters, distributors, and hospitality buyers across MENA—not as a café, retail coffee shop, financial exchange, or SaaS product.

**Visual thesis — “Cultivated Precision”**

A deep forest trading house: editorial-scale typography, disciplined sprout-green actions, real origin and custody photography, and calm data-like structure. Dark forest stages communicate confidence and trade infrastructure; pale botanical surfaces create breathing room for origins, coffee, and inquiry.

**Source boundary**

- Use the design brief, current implementation, supplied assets, documented Tomorro direction, and supplied reference frames.
- The local MP4 could not be decoded in this environment. Do not claim video-specific behavior as observed.
- Any motion not directly supported by documented reference material is labelled **recommended interpretation**.
- Refero is intentionally excluded.
- Vercel Optimize informs only performance, CTA, and hierarchy decisions; it does not define visual style.

---

## 3. Existing Project Audit

| Area | Current reality | Redesign decision |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/Base UI | Preserve architecture and Server Component boundaries. |
| Public shell | `PublicShell` provides shared header, skip link, main landmark, and footer; root homepage composes it explicitly. | Keep this contract. Add the redesigned public-only token scope here. |
| Public routes | `/`, `/coffee/`, coffee details, `/origins/`, origin details, `/sourcing/`, `/about/`, `/contact/`, `/portal-entry/` | Redesign all public marketing routes as one system. |
| Protected routes | Auth, dashboard, admin, finance, logistics, inventory, orders, KYB, pricing | Do not redesign or alter their behavior. |
| Data | Supabase public read layers, cache boundaries, public DTO restrictions, SEO/JSON-LD | Preserve all read layers, status gates, cache behavior, and metadata. |
| Localization | English/Arabic, RTL, pre-paint locale and direction setup | Every new layout must use logical properties and support Arabic typography. |
| Themes | Light/dark preference support already exists | Preserve the control; redesign only public token mappings. |
| Existing motion | GSAP, Motion, CSS transitions, CSS scroll timelines, Lenis dependency | Use current tools; do not add an animation library. Maintain one animation engine per interaction. |
| Imagery | Strong repository-owned origin, farm, inspection, warehouse, coffee-lot, and logistics images | Re-art-direct and reuse appropriate editorial images; never falsely attach static images to database records. |
| Fonts | Local Benito and Manrope; Readex Pro and Cairo for Arabic | Retain these loaded fonts for performance and bilingual coverage. |
| Forms | RFQ/contact form with validation and existing action flow | Restyle only; preserve fields, validation, submission states, and feedback. |

**Critical preservation rules**

- Do not move locked root files; edit in place only when implementation begins.
- Do not convert public Server Components into broad client islands.
- Do not expose prices, availability, grades, seller data, inventory, certifications, or statistics not already approved.
- Do not add decorative search, fictional partner logos, or unverified commercial claims.
- Keep public/private DTO separation, authorization, Supabase RLS, trailing-slash routing, JSON-LD, and cache contracts intact.

---

## 4. Tomorro Reference Study

### Observed / documented reference principles

The documented Tomorro direction establishes:

- Deep dark and warm-light alternation rather than a flat page canvas.
- Large, tightly composed editorial display typography.
- Restrained use of one vivid green accent.
- Floating or pill-like navigation and primary controls.
- Wide whitespace, high rhythm between sections, and selective rounded surfaces.
- Flat base surfaces with depth reserved for high-value media, menus, and CTAs.
- Full-bleed moments alternating with constrained editorial compositions.
- Rounded cards as intentional content stages, not default layout wrappers.

### Recommended interpretation for Hills Coffee

| Tomorro principle | Hills adaptation | Explicit rejection |
|---|---|---|
| Dark/light pacing | Alternate forest trade environments with pale botanical reading surfaces. | SaaS page bands, dashboard screenshots, neon tech backgrounds. |
| Large headline composition | Use large origin-, sourcing-, and quality-led statements over real coffee imagery. | Empty oversized type without business substance. |
| Burnt orange accent discipline | Use `#a44819` (Hills Burnt Orange) only for primary action, active progress, and directional markers. Text on `#a44819` is `#ffffff`. | Filling cards, large page backgrounds, or overusing in body text. |
| Floating rounded navigation | Use a compact, premium sticky navigation shell with one dominant CTA. | Excessive glassmorphism or a generic startup-navigation clone. |
| Framed floating panels | Use panels for traceability, coffee facts, inquiry, and navigation flyouts. | Fake product UI, fake tracking dashboards, fabricated trading analytics. |
| Scroll pacing | Move from origin → quality → custody → logistics → inquiry as a commercial narrative. | Scroll hijacking, long loader intros, or decorative parallax everywhere. |

### Motion interpretation

The following are **recommended interpretation**, not video-observed facts:

- Hero media settles from a slight scale and darkness into its final crop.
- Section content reveals upward by 16–24px with small stagger intervals.
- Navigation shifts from hero-overlay state to a stable surface on scroll.
- Cards and images use restrained crop movement rather than noticeable floating.
- Dark/light transitions happen through section composition and surface changes, not animated color washes.

---

## 5. Reference Lock

**Primary direction:** Cultivated Precision, based on documented Tomorro visual rhythm translated to green-coffee trade.

**Must survive implementation**

1. Forest-dark and pale-botanical section rhythm.
2. Dense editorial headline hierarchy with calm readable body copy.
3. Hills Burnt Orange (#a44819) reserved for meaningful action, primary CTAs, and active progression.
4. Real coffee-origin, inspection, warehouse, and logistics photography as visual evidence.
5. Sparse borders, controlled radii, and shallow elevation.

**Borrow only**

- Floating/pill navigation proportions.
- Premium section pacing and restrained reveal choreography.

**Reject**

- SaaS screenshots, glass-card grids, gradients as page backgrounds, generic feature grids, faux data panels, decorative blobs, beige café styling, roasted-bean/latté imagery, and arbitrary animated motion.

**Media lock**

- Use existing repository images first.
- Photography must feel documentary/editorial: natural light, restrained grading, visible material process, no posed stock-model energy.
- Preserve current entity-media restrictions: static editorial images must not be represented as actual media for dynamic Coffee or Origin records.
- Generate or license replacement photography only when an important truthful slot has no suitable asset.

---

## 6. Public-Only Design Token Strategy

Introduce a public scope, for example on `PublicShell`, rather than replacing root application tokens. This protects dashboard, admin, auth, finance, and operational surfaces.

### Color roles

| Token role | Value | Use |
|---|---:|---|
| `--hc-forest` | `#122314` | Primary dark canvas, footer, dark hero scrims. |
| `--hc-moss` | `#273f2b` | Raised dark panels, dark navigation settled state. |
| `--hc-olive` | `#30322a` | Strong dark text on light surfaces. |
| `--hc-sage` | `#7e8371` | Secondary metadata, quiet labels, inactive markers. |
| `--hc-fern` | `#b7bda5` | Disabled controls, quiet dividers. |
| `--hc-accent` / `--hc-burnt` | `#a44819` | Hills Burnt Orange: Filled primary CTA, active step, active progress only (text: `#ffffff`). |
| `--hc-accent-hover` | `#8c3a12` | Hover/pressed burnt orange treatment. |
| `--hc-accent-wash` | `#fdf5f0` | Subtle active background / accent wash surface. |
| `--hc-sprout` (alias) | `#a44819` | Backwards-compatibility alias to primary accent. |
| `--hc-mist-green` | `#d9deca` | Light-section divider and low-emphasis panel border. |
| `--hc-bone` | `#f2f5eb` | Default pale public canvas. |
| `--hc-white` | `#ffffff` | Elevated light card and form surface. |
| `--hc-soft-mist` | `#dcdfe3` | Neutral border and skeleton surface. |
| `--hc-carbon` | `#222222` | High-contrast light-surface text fallback. |

Rules:

- Vivid green is never a page background, body-copy color, or decorative glow.
- Dark sections use white/bone text and pale green secondary text only after contrast validation.
- Dark-mode preference retains the same hierarchy with dark equivalents; it must not flatten every pale section into identical charcoal.
- Keep semantic status colors for protected application UI outside the public scope.

### Typography

| Role | Font | Implementation |
|---|---|---|
| Display / hero / major headings | Benito, weight 600–800 | Existing local font; tight tracking, no artificial condensed transform. |
| Body / navigation / controls | Manrope, weight 400–700 | Existing local font; default public UI face. |
| Arabic display | Readex Pro | Existing loaded Arabic display fallback. |
| Arabic UI | Cairo | Existing loaded Arabic UI fallback. |
| Editorial accent | None in V1 | Avoid a new font request and ornamental serif treatment. |

Type scale:

- Hero: `clamp(3rem, 6.2vw, 7.25rem)`, 0.98–1.02 line height.
- H1: `clamp(2.5rem, 4vw, 5rem)`.
- H2: `clamp(2rem, 2.8vw, 3.5rem)`.
- H3: `clamp(1.375rem, 1.5vw, 2rem)`.
- Body large: 18px / 1.6.
- Body: 16px / 1.65.
- Label: 12px / 1.25, medium weight, uppercase only where Arabic remains readable.

### Grid, spacing, shape, and elevation

- Public content container: 1200px maximum; 24px desktop/16px mobile minimum gutters.
- Wide media container: 1440px maximum where composition needs extra breathing room.
- Desktop: 12 columns, 24px gaps.
- Tablet: 8 columns, 20px gaps.
- Mobile: 4 columns, 16px gaps.
- Base spacing unit: 8px; use 16/24/32/48/64/96/128px steps.
- Desktop section spacing: 112–144px; tablet 80–96px; mobile 56–72px.
- Controls: 44px minimum touch target; 48–52px primary CTA height.
- Radius: 10px compact control, 16px content panel, 24px hero/media panel, 999px navigation and compact status controls only.
- Elevation: none for ordinary text blocks; subtle shadow for sticky nav and cards; strong shadow only for flyouts, dialog-like panels, or over-photo inquiry panels.
- Borders: 1px low-contrast hairlines; no heavy outlined-card grid.

---

## 7. Exact Asset and Image Strategy

### Asset rules

- Prefer root `public/images/` assets over `public/images/features/` assets.
- The `features/` directory contains static/reference-board crops. Use them only in small, non-record editorial slots where their source dimensions are sufficient.
- Do not use `reference_board_*` images as live page imagery.
- Never assign a static image to a dynamic coffee or origin record solely because its filename matches.
- Use `next/image`, fixed intended aspect-ratio wrappers, explicit `sizes`, and only one priority hero source at each responsive breakpoint.
- If several candidates are listed, choose the preferred candidate during implementation after rendering crops at desktop and mobile.

### Global brand assets

| Slot | Candidate paths | Preferred choice | Purpose | Crop / behavior | Meaningful / alt |
|---|---|---|---|---|---|
| Header logo on light surface | `/public/images/hills-logo-dark.png` | Dark logo | Primary brand identity. | Intrinsic 2624×996; render at fixed visual width, never crop. | Meaningful; linked image announces “Hills Coffee” once. |
| Header logo over dark media | `/public/images/hills-logo-light.png` | Light logo | Maintain contrast in hero overlay state. | Same dimensions; cross-fade only when current header behavior permits. | Decorative if the linked header already has an accessible home label. |
| Footer logo | `/public/images/hills-logo-light.png` | Light logo | Forest footer close. | Uncropped, larger than header. | Decorative if surrounding footer branding supplies the name. |
| Favicon / mark | `/public/images/hills-favicon-green.png`, `/public/images/logo-mark.png` | Existing favicon | Browser/application identity only. | No page-content role. | No content alt. |

### Homepage asset map

| Section / slot | Candidate paths | Preferred choice and rationale | Desktop crop | Mobile crop | Alt behavior |
|---|---|---|---|---|---|
| Hero landscape | `/public/images/coffee-lot-5.jpg`, `/public/images/farmer-partnership.jpg`, `/public/images/farm-landscape.jpg` | `/public/images/coffee-lot-5.jpg`; already used as a 1600×893 origin-action landscape and supports headline-safe sky/field space. | 16:10 or full-viewport; focal point around meaningful farm activity, approximately upper-middle. | Do not force this crop below tablet. | Meaningful; describe the visible sourcing/farm action using approved copy. |
| Hero portrait | `/public/images/hero-banner.jpg`, `/public/images/origin-colombia.jpg`, `/public/images/origin-ethiopia.jpg` | `/public/images/hero-banner.jpg`; existing 1288×1600 portrait is the strongest mobile hero candidate. | Not used at desktop. | 4:5 or 390×viewport portrait; preserve drying-bed/work detail. | Meaningful; concise equivalent of desktop hero alt. |
| Commercial pathways | `/public/images/origin-guatemala.jpg`, `/public/images/coffee-lot-2.jpg`, `/public/images/coffee-lot-7.jpg` | Retain current three-image mix; it provides origin, coffee, and custody variety without making claims about a record. | 3:2 or 4:3 small editorial crops. | 16:10 horizontal crops above text, or no image if text density requires. | Decorative when adjacent route text fully expresses meaning; otherwise concise descriptive alt. |
| Sourcing-standard lead image | `/public/images/cupping-lab.jpg`, `/public/images/coffee-lot-4.jpg`, `/public/images/warehouse-bags.jpg` | `/public/images/cupping-lab.jpg` for quality/inspection; choose `/public/images/coffee-lot-4.jpg` if the approved story emphasizes grower relationships. | 4:5 desktop media stage, object position centered on process. | 16:10 full-width stage above linear content. | Meaningful; name the relevant quality, origin, or custody action. |
| Coffee discovery tall panel | `/public/images/origin-ethiopia.jpg`, `/public/images/origin-colombia.jpg`, `/public/images/hero-banner.jpg` | `/public/images/origin-ethiopia.jpg`; existing 1288×1600 portrait works without artificial portrait cropping. | 4:5, portrait. | 4:5, retain original orientation. | Decorative category photography; empty alt if caption conveys the panel’s information. |
| Coffee discovery landscape panels | `/public/images/coffee-lot-2.jpg`, `/public/images/coffee-lot-3.jpg`, `/public/images/greenCoffe1.png` | Keep `coffee-lot-2.jpg` and `coffee-lot-3.jpg`; reserve PNGs for a small technical/bean-detail slot only. | 16:10. | 16:10 with centered focal crop. | Decorative when captions carry meaning. |
| Coffee marquee | `/public/images/coffee-cherry.jpg`, `/public/images/farmer-partnership.jpg`, `/public/images/farm-landscape.jpg`, `/public/images/coffee-lot-6.jpg` | Retain existing alternating strip sources. | 3:2 repeated panels; no upscaling beyond sensible display size. | Horizontal native scroller, 4:3 cards. | Decorative; the marquee must not be the sole carrier of content. |
| Origin field-guide background | `/public/images/farm-landscape.jpg`, `/public/images/coffee-lot-5.jpg` | `/public/images/farm-landscape.jpg`; current 1344×752 landscape is suitable at low opacity. | Inset panel background, 16:9, darkened substantially. | Crop 4:5 or remove background if focal point becomes unclear. | Decorative, empty alt. |
| Traceability background | `/public/images/origin-kenya.jpg`, `/public/images/warehouse-bags.jpg` | `/public/images/origin-kenya.jpg`; currently supports the traceability stage and has suitable landscape scale. | Full bleed 16:9 with strong inline-start forest wash. | 4:5 with panel stack; preserve legibility over image. | Decorative when four traceability panels carry the meaning. |
| Process journey | `/public/images/coffee-lot-4.jpg`, `/public/images/coffee-lot-7.jpg`, `/public/images/coffee-lot-1.jpg`, `/public/images/coffee-lot-6.jpg` | Retain current sequence: relationships, custody, logistics, quality. | 4 × 3:2 thumbnails within a 12-column route. | 16:10 stage image above each step. | Meaningful only if process stage depends on image; otherwise decorative. |
| Reference-market stage | None | No image. This is intentionally a restrained information/disclosure surface. | Text/data stage. | Same hierarchy, stacked. | Not applicable. |
| Final inquiry CTA | `/public/images/origin-yemen.jpg`, `/public/images/warehouse-bags.jpg`, `/public/images/coffee-lot-1.jpg` | `/public/images/origin-yemen.jpg` remains preferred for a dark, origin-led close; use warehouse imagery if approved CTA copy emphasizes supply continuity. | 16:9 or 3:2 background with deep Forest wash. | 4:5 or 1:1 crop; CTA panel remains legible. | Decorative because CTA content conveys the message. |

### Other public-route imagery

| Route | Existing asset strategy |
|---|---|
| About | `/public/images/coffee-lot-4.jpg` for relationship/origin story; `/public/images/warehouse-bags.jpg` for commercial infrastructure. Both are meaningful editorial support, not proof of a particular operation unless approved copy says so. |
| Sourcing | `/public/images/coffee-cherry.jpg` for source context and `/public/images/cupping-lab.jpg` for inspection. Use descriptive alt text because these images support the page’s instructional content. |
| Contact | `/public/images/coffee-lot-7.jpg` as a quiet contextual panel beside the form. Decorative if the form and heading independently establish the page purpose. |
| Portal entry | `/public/images/coffee-lot-1.jpg` for editorial operational context only. It must not imply that portal inventory is visible or available. |
| Mega menus | Current `/public/images/coffee-lot-6.jpg`, `/public/images/farmer-partnership.jpg`, `/public/images/warehouse-bags.jpg`, and `/public/images/coffee-lot-4.jpg` remain appropriate as small decorative previews. Use empty alt text. |

### Small reference assets

Use only if a slot is small enough for the available resolution:

- `/public/images/features/18_process_cultivation.jpg`
- `/public/images/features/19_process_harvesting_flower.jpg`
- `/public/images/features/20_process_processing.jpg`
- `/public/images/features/21_process_export_ship.jpg`
- `/public/images/features/28_cta_green_beans_closeup.jpg`

They may support small process thumbnails, a small bean-detail inset, or a mobile-only secondary crop. They must not be used as full-width hero imagery.

### ASSET REQUIRED

**Direct freight / port-loading photograph, only if a literal shipment visual is needed.**

The repository has warehouse and process imagery but no confirmed high-resolution documentary image of shipment loading or port logistics. Source or generate a 3:2 image showing green-coffee sacks or sealed cargo being handled in a credible warehouse-to-export context:

- Natural daylight or neutral industrial lighting.
- No visible third-party branding.
- No posed workers or generic corporate-stock look.
- No containers used as decorative scenery without meaningful trade context.
- Desktop: 3:2, 1600px+ wide.
- Mobile: 4:5 crop with people/material action retained.
- Meaningful alt text when used as process evidence.

This asset is optional; prefer existing warehouse/process assets if the page remains truthful without literal shipment imagery.

---

## 8. Navigation Specification

### Desktop, 1024px and above

- Sticky navigation sits inside the public container with a 16px top offset on light openings; it is full-width only on small screens.
- Hero opening state: transparent Forest tint with cream logo/text; no hard border.
- Settled state: Bone or Moss surface, 1px border, subtle shadow, same fixed height to prevent layout shift.
- Retain existing routes: Coffee, Origins, Sourcing, About, Contact.
- Retain account state, sign-in/sign-up links, theme toggle, language switcher, search behavior, and Request an Offer CTA.
- Retain keyboard-accessible mega menus; reframe them as concise editorial route previews with one small truthful image.
- The only filled desktop action is Request an Offer.

### Mobile, below 1024px

- Keep the existing accessible Sheet drawer, focus trap, Escape close, scroll lock, route-aware active state, locale control, theme control, account state, and CTA.
- Use a 64px compact header with a single menu trigger and visible logo.
- Drawer: Forest canvas, 52px rows, hairline dividers, primary CTA anchored above utility controls.
- Do not reproduce desktop flyouts on touch; route groups remain direct links.

---

## 9. Homepage Information Architecture

| Section | Objective | Layout and media | CTA / interaction |
|---|---|---|---|
| 1. Hero — “Origin, held to a higher standard” | Establish sourcing, quality, custody, and B2B trust immediately. | Full-viewport dark Forest stage; approved desktop/mobile hero pair; desktop 7-column type zone and 5-column quiet inquiry panel; mobile stacks over portrait crop. | Primary: Explore coffee. Secondary: Request an offer. |
| 2. Commercial pathways | Clarify three legitimate next actions without invented proof. | Three editorial pathways divided by hairlines, not equal floating cards. Reuse current intent content. | Each route has a text arrow and full-card keyboard focus. |
| 3. Sourcing standard | Explain how Hills works before asking buyers to trust the catalogue. | Dark Moss section: one documentary image, short narrative, and four evidence stages: origin, quality, custody, member relationship. | Sourcing page link. |
| 4. Coffee discovery | Make catalogue exploration tangible without unsafe record media. | Asymmetric editorial image composition using existing coffee-lot photography and approved category copy. | Explore coffee catalogue. |
| 5. Origin field guide | Make origins feel geographically and commercially distinct. | Bone ground with inset Forest origin rail; dynamic summaries remain text-led. | Explore all origins; accessible native horizontal controls remain. |
| 6. Traceability and custody | Show the chain of responsibility from origin to buyer. | Full-bleed dark photograph with four numbered low-opacity panels; connector is structural, not dashboard-like. | Link to sourcing or inquiry. |
| 7. From lot to arrival | Communicate warehousing, logistics, and trade readiness. | Light editorial sequence with four steps and selective process thumbnails. | Request a commercial conversation. |
| 8. Reference-market context | Present reference pricing honestly and without implying an offer. | Quiet ruled information stage; preserve licence-gated component and disclosures. | No aggressive CTA beside pricing. |
| 9. Inquiry close | Convert intent after credibility is established. | Forest closing stage with origin/warehouse image, one statement, and concise CTA pair. | Request an offer; Contact Hills. |
| 10. Footer | Provide confidence, owned navigation, approved locations, and account access. | Deepest Forest close, grouped links, lockup, no invented social/network proof. | Existing owned routes only. |

### Detailed section requirements

#### Hero

- Use the approved image pair from the asset map.
- Desktop crop prioritizes quiet sky/field behind headline and meaningful origin detail opposite it.
- Mobile crop keeps supply-chain/farm action; never crop to texture alone.
- Dark scrims support readability; avoid a large opaque glass card.
- CTA panel may be a restrained Moss surface with a translucent hairline.
- Do not add statistics, badges, partner logos, or certification claims.

#### Commercial pathways

- Reuse current intent architecture, but replace visually equal cards with three commercial routes.
- Each route contains number, concise heading, two-line explanation, and directional link.
- On mobile, stack with hairline separators and full target areas.

#### Sourcing standard

- Reuse current interactive storytelling data and approved image.
- One oversized image crop anchors the section; numbered content changes alongside it.
- Treat it as commercial process storytelling, not an app carousel.
- On mobile, show image first, then an accessible linear stage list.

#### Coffee discovery

- Preserve static/editorial treatment until truthful record photography exists.
- Use origin context, processing/quality, and packaging/commercial readiness panels.
- Images use 4:5 and 16:10 proportions; captions sit in a bottom scrim.
- Hover enlarges imagery slightly; all content remains readable without hover.

#### Origin field guide

- Preserve dynamic origin data and active-origin gating.
- Keep origin cards text-first; do not map static origin imagery to dynamic records.
- Dark inset panel gives the rail a premium stage without making carousel motion mandatory.
- At mobile sizes, retain native scroll-snap and labeled controls.

#### Traceability and custody

- Preserve current four-stage factual framework.
- Use a 2×2 desktop layout and single mobile stack.
- Each item uses stage number, heading, and short factual statement.
- Photo is decorative where text fully communicates the content.

#### From lot to arrival

- Preserve existing process content and route links.
- Treat logistics as a calm commercial sequence, not a shipping dashboard.
- Use a 12-column route line at desktop and vertical line at tablet/mobile.
- Process thumbnails require meaningful alt only when communicative.

#### Inquiry close

- Preserve existing Contact/RFQ destinations and never bypass validation.
- Use one filled Hills Burnt Orange (#a44819) CTA and one quiet outline/text CTA.
- Keep copy focused on commercial discussion, coffee requirements, and supply partnership—not urgency tactics.

---

## 10. Component Inventory

### Retain and restyle

- `PublicShell`
- `SiteHeader`, `MobileNav`, `SiteFooter`
- `Hero`, `AnimatedHero`
- `IntentCards`
- `InteractiveStorySection`
- `CoffeeShowcase`, `CoffeeMarquee`
- `OriginsShowcase`, `OriginCard`
- `TraceabilityBand`, `ProcessJourney`
- `FinalCta`
- `CatalogueFilter`, `CoffeeCard`
- `RfqForm`
- Existing motion primitives and UI controls

### Add or formalize

- `PublicTokenScope` — scoped public semantic variables.
- `EditorialSection` — controlled background, spacing, and container variants.
- `SectionIntro` — eyebrow, title, body, action alignment.
- `EditorialMedia` — image aspect-ratio, scrim, crop, and reveal rules.
- `EvidenceStage` — reusable numbered traceability/process item.
- `TextArrowLink` — accessible directional text-link treatment.
- `PublicButton` variants — Burnt Orange primary, Forest primary, quiet secondary, text link.
- `PageOpening` — consistent route opener for public non-home pages.

No new generic card component should replace purpose-specific layouts.

---

## 11. Effect and Motion Implementation Notes

### Motion rules

- Use the documented Tomorro polish as the quality target, not a literal interaction blueprint.
- Every effect must have one owner: GSAP, Motion, or CSS.
- Default markup must be visible without JavaScript.
- Do not animate layout-affecting values where transform/opacity can provide the effect.
- No autoplay video, scroll hijacking, constant floating, large parallax, or decorative cursor effects.
- Reference-backed means supported by the documented Tomorro direction; all other effects are explicitly marked recommended interpretation.

| Effect | Evidence | Trigger / element | Initial → final | Timing | Owner | Desktop / mobile / reduced motion |
|---|---|---|---|---|---|---|
| Hero entrance | **Recommended interpretation** | Initial page render; existing hero media, scrims, eyebrow, headline, rule, CTA panel. | Media `opacity:0; scale:1.06` → `opacity:1; scale:1`; scrims `0→1`; content `opacity:0; y:22px` → visible / `y:0`. | Media 1.4–1.5s; scrim 700ms, overlapping by 900ms; content 700ms, 90ms stagger; `power3.out`. | GSAP via existing `AnimatedHero`. | Desktop full sequence. Mobile same order with media scale max 1.03. Reduced motion: no timeline; fully rendered first frame. |
| Header transition on scroll | **Reference-backed** by documented floating/dark-light navigation behavior. | Scroll from hero opening; header surface, border, shadow, ink, logo variants. | Forest translucent/cream text/no shadow → settled Bone or Moss surface/appropriate ink/subtle shadow. | Scroll-timeline over first 1–1.6 header heights; linear progress. | CSS existing registered custom property and scroll timeline. | Desktop and tablet progressive enhancement. Mobile may use stable solid header after first scroll threshold. Reduced motion/browser fallback: settled, fully legible state from first frame. |
| Hero image drift | **Recommended interpretation** | Hero leaving viewport; media wrapper only. | `translateY(0)` → max `12%` viewport-relative drift; image element itself remains owned by GSAP entrance. | Scroll-linked, linear. | CSS scroll timeline. | Desktop only. Tablet/mobile: disable. Reduced motion: disable. |
| Image reveal | **Reference-backed** in spirit through documented polished media pacing. | Section enters viewport; editorial-media wrapper. | `clip-path: inset(8% 0 0 0)` or `scale:1.04`, opacity 0 → unclipped/scale 1, opacity 1. | 650–750ms, `cubic-bezier(.16,1,.3,1)`. | Motion for isolated `Reveal`; GSAP only where a sequence already belongs to GSAP. | Desktop image clip/scale permitted. Mobile opacity plus 12px translate only. Reduced motion: instant visible. |
| Section reveal | **Recommended interpretation** | Intersection; section intro and non-sequenced content. | `opacity:0; translateY(20px)` → `opacity:1; translateY(0)`. | 500–600ms, `cubic-bezier(.16,1,.3,1)`. | Motion existing `Reveal`. | Desktop full movement; mobile maximum 12px. Reduced motion: no hidden initial state. |
| Text stagger | **Recommended interpretation** | Hero and tightly grouped evidence/process labels. | Individual children `opacity:0; y:16–20px` → visible / 0. | 550–700ms each; 70–90ms stagger. | GSAP only for hero/story sequences; Motion only for independent group reveals. | Desktop may stagger 3–4 elements max. Mobile limit to two staggered groups. Reduced motion: all visible. |
| Subtle crop movement | **Reference-backed** through documented premium image movement, exact behavior is interpretation. | Hover/focus on media panel. | Image `scale:1` → `1.025–1.035`; caption overlay gains slight contrast. | 600–700ms, `cubic-bezier(.16,1,.3,1)`. | CSS. | Desktop pointer hover only. Mobile no scale; active/focus contrast feedback only. Reduced motion: no scale. |
| Card/media movement | **Recommended interpretation** | Hover/focus on pathway, coffee, or origin media panel. | Border/ink subtly strengthens; image crop moves as above; panel itself stays in place. | 180–220ms for color/border; image timing above. | CSS. | No vertical card lift greater than 2px; mobile no lift. Reduced motion: color only. |
| CTA hover/focus | **Reference-backed** in quality, not exact motion. | Pointer hover, keyboard focus, active press. | Background/border contrast change; directional icon `translateX(0→4px)` in LTR and logical inverse in RTL; press `translateY(0→1px)`. | 160–220ms, `cubic-bezier(.2,.6,.2,1)`. | CSS. | Same semantic feedback everywhere. Mobile uses active/focus state; reduced motion retains color/focus, removes translation. |
| Dropdown/flyout | **Reference-backed** by documented premium navigation treatment. | Hover or `focus-within` on desktop nav item. | `opacity:0; visibility:hidden; translateY(8px)` → visible / 0. | 220ms; 90ms pointer intent delay; `cubic-bezier(.16,1,.3,1)`. | CSS. | Desktop only. At under 1024px, do not render flyout; use existing Sheet navigation. Reduced motion: immediate visibility state. |
| Mobile menu | **Reference-backed** in quality; behavior remains current accessible Sheet implementation. | Menu trigger and close/Escape/route change. | Inline-end drawer `translateX(100%)` / opacity 0 → 0 / visible. | 280–320ms, existing sheet easing. | CSS through existing Base UI Sheet. | Mobile/tablet only. Reduced motion: existing ≤1ms fallback. |
| Dark/light section pacing | **Reference-backed** as visual rhythm, not a scroll animation. | Normal document scroll through section boundaries. | Static Forest ↔ Bone/Mist section transitions; optional 1px hairline/overlap between adjacent stages. | No continuous animation. | CSS layout/surfaces. | Identical information order at all breakpoints. Reduced motion: unaffected. |

---

## 12. Responsive Strategy

| Viewport | Required behavior |
|---|---|
| 1440+ | 1200px content container; 12-column layout; asymmetric hero; full desktop nav and flyouts. |
| 1280 | Preserve 12 columns but reduce section media width and headline measure before reducing type dramatically. |
| 1024 | Transition navigation to mobile drawer; change split compositions to 7/5 or stacked where readability requires. |
| 768 | Eight-column grid; origin rail remains horizontally scrollable; process becomes vertical or two-column; form stacks beneath contextual copy. |
| 390 | Four-column layout; 16px gutters; portrait hero; CTA buttons full width only when wrapping; all panels single-column. |
| 360 | Verify no clipped Arabic/English headlines, no horizontal scrolling, 44px targets, and no fixed-width media panels. |

All layouts must preserve logical `start/end` properties, directional icon behavior, Arabic reading order, and the current language switcher.

---

## 13. Accessibility and Performance

### Accessibility

- Retain skip link, semantic landmarks, heading order, focus-visible states, and Sheet dialog semantics.
- Minimum AA contrast for text and controls; validate Burnt Orange CTA foreground (#ffffff on #a44819 has >6:1 ratio, exceeding WCAG AA).
- Use real buttons/links, not clickable containers without semantics.
- Every form error, loading, success, and disabled state must remain programmatically available.
- Alt strategy follows the asset map; decorative backgrounds and repeated visual crops use empty alt.
- Preserve keyboard flyout behavior and focus return from mobile navigation.
- `prefers-reduced-motion` removes scroll-linked and repeated movement, not merely shortens it.
- Maintain 44px minimum pointer targets.

### Performance

- Preserve `next/image`, explicit `sizes`, responsive crops, and one priority hero source per breakpoint.
- Do not use the Tomorro MP4 as a homepage background.
- Keep below-fold photography lazy-loaded and reserve dimensions to prevent layout shift.
- Retain local font families; avoid new visual font dependencies.
- Keep public page data fetching server-side and cache behavior unchanged.
- Do not make header, homepage, or route sections client components merely for visual state.
- Prefer CSS transforms/opacity and current GSAP/Motion islands.
- Do not add a large carousel, map, smooth-scroll, animation, or icon package.
- Before release, use Vercel metrics only to validate real route performance; do not make unverified metric claims.

---

## 14. Implementation Roadmap

| Phase | Objective | Main work | Acceptance criteria |
|---|---|---|---|
| 0. Baseline protection | Protect current behavior before visual change. | Record public-route screenshots, tests, responsive behavior, and data-boundary expectations. | No public/private regression baseline is ambiguous. |
| 1. Scoped foundation | Establish public visual language without affecting applications. | Add public token scope, typography mappings, grid helpers, button/link primitives. | Dashboard/admin/auth appearance and behavior remain unchanged. |
| 2. Shared shell | Rebuild header, flyouts, drawer presentation, footer, and route openers. | Preserve current server/client boundaries and semantics. | Keyboard, RTL, theme, account states, and mobile drawer work. |
| 3. Homepage composition | Recompose existing homepage modules into the locked narrative. | Hero, pathways, sourcing standard, coffee discovery, origins, traceability, process, pricing, close. | No fabricated claims; existing routes/data behavior retained. |
| 4. Public route system | Extend system across Coffee, Origins, Sourcing, About, Contact, and Portal Entry. | Page openers, catalogue, dossier, reading, and form treatments. | Every public route feels related but not repetitive. |
| 5. Motion refinement | Apply motion ownership plan. | Refine current GSAP/Motion/CSS behaviors; remove conflicts. | Reduced-motion and JavaScript-disabled fallback remain complete. |
| 6. Responsive/a11y/performance | Resolve layout and runtime issues. | Breakpoint tuning, RTL, image sizes/crops, contrast, focus, bundle/client-island audit. | No overflow, readable wrapping, stable layout, no unnecessary hydration. |
| 7. Visual QA and release readiness | Compare implementation with reference lock. | Screenshot comparison, test suite, browser checks, regression review. | No unresolved P0/P1/P2 visual or functional issue. |

Likely implementation touchpoints: public components, public route pages, `src/app/page.tsx`, `src/app/globals.css` in place, copy dictionaries only when approved copy is supplied, and visual-test configuration.

---

## 15. Execution Protocol

The implementation agent must work phase-by-phase. A mass rewrite of public routes is not permitted.

For every roadmap phase:

1. Inspect all affected files and their immediate dependencies first.
2. Confirm the phase does not alter protected behavior, data boundaries, or unrelated application surfaces.
3. Implement only the phase’s approved scope.
4. Run relevant lint, typecheck, unit tests, and route-specific tests.
5. Render the affected route or component in a browser.
6. Verify at minimum one desktop viewport and one mobile viewport before continuing.
7. Fix regressions, visible drift, overflow, accessibility defects, or behavior changes before starting the next phase.
8. Report:
   - changed files;
   - preserved contracts;
   - tests and commands run;
   - screenshot/visual checks completed;
   - remaining risks, blocks, or design/code conflicts.

Additional controls:

- Do not alter Supabase schema, migrations, RLS, DTOs, APIs, auth guards, or cache policy as part of visual phases.
- Do not bundle token replacement for protected surfaces into the public scoped-token phase.
- Do not replace working components when restyling or composition changes can preserve their business behavior.
- If a planned image crop fails at mobile, choose an approved candidate from the asset map before requesting/generated new imagery.
- If a motion effect conflicts with existing ownership, retain the existing engine or remove the effect; never layer GSAP, Motion, and CSS transforms onto the same element/property.

---

## 16. Playwright Visual QA Plan

Add Playwright only as a development/QA dependency if it is not already available. Capture deterministic screenshots for:

- `/`
- `/coffee/`
- a published coffee detail
- `/origins/`
- an active origin detail
- `/sourcing/`
- `/about/`
- `/contact/`
- `/portal-entry/`

Required viewports:

- 1440×1000
- 1280×900
- 1024×900
- 768×1024
- 390×844
- 360×800

Required states:

- Light and dark preference.
- English LTR and Arabic RTL.
- Header at top and settled scroll position.
- Desktop mega-menu hover/focus.
- Mobile drawer open, keyboard close, and route change.
- CTA hover/focus.
- RFQ blank, invalid, loading, error, and successful submission states.
- Reduced-motion mode.
- Empty catalogue/origin and reference-price unavailable states where fixture coverage allows.

Checks:

- `scrollWidth === clientWidth`.
- No clipped headline, control, form error, image, or dynamic content.
- Correct image focal point at every breakpoint.
- No layout shift after font/image load.
- Correct logo variant and contrast on header/footer surfaces.
- No content hidden by animation when JavaScript or reduced motion is active.
- No public leakage of private fields or unauthorised data.
- Compare screenshots against the reference lock, not generic “modern website” expectations.

---

## 17. Final Implementation Handoff Checklist

- [ ] This approved plan was implemented without a parallel redesign.
- [ ] Public tokens are scoped and protected application surfaces are unchanged.
- [ ] Existing routes, Supabase integration, forms, APIs, auth, localization, SEO, and caching remain intact.
- [ ] Every public section maps to a business purpose and approved content source.
- [ ] No fake dashboards, partner logos, quantitative proof, records, prices, or certifications were introduced.
- [ ] Existing static images are not misrepresented as dynamic entity media.
- [ ] Asset selection follows the exact asset map and all important mobile crops are verified.
- [ ] Hills Burnt Orange (#a44819) is limited to meaningful actions and active progress.
- [ ] Hero and route imagery use purposeful desktop/mobile crops.
- [ ] Desktop, tablet, mobile, dark mode, light mode, RTL, and reduced-motion behavior are verified.
- [ ] Public navigation remains keyboard accessible and mobile navigation remains dialog-correct.
- [ ] Motion follows the one-engine-per-interaction rule.
- [ ] Images, fonts, and client islands meet the performance strategy.
- [ ] Playwright screenshots and functional tests show no unresolved visual or business regression.
- [ ] Each completed implementation phase includes changed files, tests, visual checks, and remaining-risk reporting.
