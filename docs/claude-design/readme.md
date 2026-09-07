# Hills Coffee — Design System

Design system for the **Hills Coffee B2B green coffee trading platform**. Hills Coffee is a
green coffee sourcing and trading business (Dubai and Egypt) selling to roasters and
importers — not a retail coffee brand. The platform has four access states and no combined
role: **Guest**, **Buyer**, **Seller**, **Admin**. Buyers and sellers each complete a KYB
application before any commercial function is enabled.

Positioning to hold on to: premium, natural, traceability-focused. Editorial where the
brand speaks, plain and fast where the product works.

## Sources this system was built from

| Source | What was taken from it |
| --- | --- |
| `uploads/Hills_Coffee_B2B_Trading_UI_UX_Design_Master_Guide_AR(1).docx` — "الدليل الرئيسي لتصميم منصة هيلز كوفي للتداول بين الشركات / Hills Coffee B2B Trading Platform UI/UX Design Master Guide, Design Baseline v1.0, September 2026" | Everything: exact colour values, light/dark token mapping, font roles, type scale, component inventory, page inventory per role, order/shipment/KYB state machines, motion, RTL and accessibility rules. Extracted text kept at `scraps/guide.txt`. |
| `uploads/logo-mark.png` | The official horizontal logo lockup → `assets/logo-horizontal.png` |
| Screenshot embedded in the guide (live `www.hillscoffees.com/admin` overview) | The admin operations console: sidebar structure and labels, dark chrome, KPI tiles, activity table, gold section labels. Kept at `assets/reference/admin-overview-screenshot.png` |
| Font binaries supplied with the brief | Benito (6 weights), Manrope (7 weights), Big Bang → `assets/fonts/` |

The guide itself cites four upstream documents that were **not** supplied: Hills Coffee
Brand Guidelines (Aug 2026), the HillsCoffee SEO Development Specification, the Product &
Engineering SRS, and the current project CSS theme. Where this system had to derive a value
(neutral ramps, radii, shadows, semantic danger/info), the file says so in a comment.

No codebase, Figma file or public-site HTML was provided. The public website, buyer portal
and seller portal are therefore built from the guide's described page functions, not from a
pixel reference. The admin workspace is the one surface with a real visual reference.

---

## Content fundamentals

**Bilingual by default.** Every screen must work in English and Arabic, LTR and RTL. The
source guide is written in Arabic prose with English technical terms left in English
(`KYB`, `Listing`, `Order`, `Dashboard`, `Proforma`) — mirror that: keep product nouns and
document names in English inside Arabic copy rather than inventing translations.

**Voice: operational, second person, no salesmanship inside the product.** The product
speaks to one person doing a job. Dashboards answer four questions in the user's words:
what did I buy, what do I owe, where is it, what does it need from me. Marketing copy is
editorial and short; product copy is instructional and specific.

- Product: "Your trade licence expired in June 2026. Ordering stays open for now, but new
  contracts pause on 30 September."
- Marketing: "Beyond the origin" · "Traceable lots from producing regions, held in bonded
  warehouses and contracted directly with roasters and importers."

**Name what is missing.** The guide's hardest content rule: when an application needs more
information, say exactly which items and give a direct CTA to the step that fixes them.
Never "additional information required".

- Yes: "Certified trade licence — the copy on file expired in June 2026" + **Fix the two items**
- No: "Your application requires attention"

**State labels are a closed vocabulary.** Draft · Quoted / Awaiting confirmation · Payment
pending · Paid · Processing / Allocated · In transit · Completed · Cancelled · Refunded ·
Disputed for orders; Draft · Requested · Confirmed · Reserved · Picking · Dispatched ·
Delivered · Cancelled · Failed · Disputed for shipments; Draft · Submitted · Under review ·
More info · Approved · Rejected · Suspended / Expired for KYB. Use these words verbatim,
in both languages, everywhere. Never invent a synonym for a state.

**Casing.** Sentence case for headings, buttons and labels ("Upload payment proof", not
"Upload Payment Proof"). UPPERCASE with wide tracking only for eyebrows and sidebar group
labels ("RECENT ACTIVITY", "COFFEE DATA"). Product nouns stay capitalised as proper terms
where the guide capitalises them (KYB, Proforma).

**Numbers and money.** Always with unit and currency: `USD 4.80 / kg`, `320 bags · 60kg`,
`480 bags`. Tabular figures. Numerals, IDs and currency stay LTR and readable inside RTL
layouts. Reference codes are monospaced (`HC-2026-0418`) so they can be read aloud and
matched by finance.

**Honesty about unfinished decisions.** VAT display, proforma approval, escrow wording,
refund policy and payout timing are open business decisions. Copy says "per final policy"
or "quoted after review" rather than inventing a number. Never state a legal or accounting
term as settled.

**No emoji anywhere.** Not in product, not in marketing. Icons carry that load.

**Admin copy is factual.** "Live counts from the Hills Coffee database. No estimated or
sample figures." Never seed a dashboard with a plausible-looking fake number.

---

## Visual foundations

**Colour.** Four official colours: Deep Forest Green `#173C32`, Warm Cream `#EEE4D1`,
Golden Ochre `#CE8A39`, Burnt Orange `#A44819`. Cream and its neutral ramp own the largest
surface area; forest carries identity, navigation, strong headings and dark chrome; gold is
selective — key figures, one active-tab underline, sidebar group labels, an "action needed"
border — and explicitly **not** the default CTA colour. Burnt Orange is a highlight, not an
error colour; `--danger` is a derived deep red so alerts never read as brand accent. There
are no cool greys in the system: every neutral is warmed out of Warm Cream (`--sand-*`).

Small gold text on cream fails contrast, so the system ships two gold variants:
`--gold-on-light` `#75450D` for light surfaces, `--gold-on-dark` `#E8A84E` for dark ones. The pending/more-info status pills use the dark gold variant for the same reason.
Dark mode is derived from the same identity (`#1A2420` background, `#1E2C26` cards,
`#2A5C3E` primary) — not a second brand.

**Type.** Benito is the identity face: hero, public headings, standout figures, KPI numbers.
Manrope is the UI face: navigation, cards, forms, tables, dashboards, all long text. Arabic
maps to Readex Pro (display) and Cairo (UI). The Brand Guide's giant fixed samples
(177/110/68/42/16px) are translated into a fluid `clamp()` scale rather than pinned. Body
never below 16px, meta never below 12px. Display type carries `-0.03em` tracking; in RTL
that negative tracking is reduced and line-height opens up.

**Space and layout.** 4px base scale. Page gutters and section rhythm are fluid
(`--gutter-page`, `--section-y`). Dashboards use a fixed 264px dark sidebar with a sticky
topbar; public pages use a 1280px content container and a 760px measure for articles.
Generous vertical breathing room around section headings — the guide asks for "مساحة تنفس
واضحة". Touch targets never below 44×44px. Tablet collapses the sidebar and moves filters
into a drawer; mobile replaces heavy tables with card lists.

**Backgrounds.** Flat warm surfaces, not gradients. Two background colours per screen at
most: `--bg` cream and `--surface-page`. The one sanctioned gradient is
`--gradient-editorial` (forest → burnt orange) and it is for editorial moments only — a
hero, a campaign band — never a card or a button. A light pattern derived from the Hills
arch/bean icon is permitted as texture at low presence. Photography is documentary
editorial: origin, harvest, processing, green coffee, warehouses, quality inspection,
bags/lots, logistics — natural light, real materials, warm but not filtered, never
stock-photo gloss, and never café or roasted-coffee imagery. **No photography was supplied
with the brief**, so every media area in the UI kits is an explicit labelled placeholder
naming the shot required.

**Cards.** White (`--surface-card`) in light mode, `#1E2C26` in dark. 1px warm border
(`--border` `#D7C8AD`), 14px radius (`--radius-lg`), and a very soft forest-tinted shadow —
in light mode the border does the work and the shadow is almost subliminal; in dark mode
depth comes from the surface step, not shadow. No coloured left borders. No stacked
gradients. The only card that changes its border colour is one waiting on the user, which
turns gold.

**Radii.** 6 / 8 / 12 / 14 / 20 / 28px plus a full pill for status badges, chips and the
search field. The logo's arch silhouette is available as `--radius-arch` for editorial
media crops.

**Shadow system.** Five outer steps, all `rgba(23,60,50,…)` — warm, never neutral black in
light mode. `--shadow-inset` adds a 1px top highlight on raised light surfaces.
`--shadow-focus` is a 3px forest halo. Protection over imagery uses gradient scrims
(`--scrim-bottom`, `--scrim-top`), not opaque capsules.

**Transparency and blur.** Sparing. The public header goes transparent with
`--blur-panel` while over the hero and turns solid on scroll; overlays use
`--overlay` (forest at 55% light, near-black 66% dark) with a 2px backdrop blur on dialogs.
Inside dark chrome, hover and control fills are cream at 7–12% alpha rather than a new
colour. Text is never alpha-muted — muted text is a real token.

**Motion.** 160–420ms, `cubic-bezier(.2,.6,.2,1)` for state, `cubic-bezier(.16,1,.3,1)` for
entrances. Fades and short rises; no bounce, no spring, no attention-seeking loops.
Drawers slide from the inline-end edge, dialogs rise 12px into place, toasts rise 10px.
Motion never delays an action or hides content, and every duration collapses to 1ms under
`prefers-reduced-motion`.

**Interaction states.** Every component ships Default, Hover, Focus-visible, Active,
Selected, Disabled, Loading, Success and Error. Hover darkens (`--primary-hover`) or lays a
7–8% forest tint on transparent controls — never a lightening wash. Press adds
`translateY(1px)` and the darker `--primary-active`; interactive cards lift `-2px` on hover
instead. Focus-visible is a 2px `--focus-ring` outline at 2px offset (gold in dark mode) and
is never removed. Disabled is 45% opacity plus `not-allowed`. Loading uses a spinner inside
the button or sand-toned skeletons that hold the layout.

**Status is never colour alone.** Every badge pairs a dot with its label, and the label is
from the closed vocabulary above.

---

## Iconography

**Lucide, line/outline, uniform 1.75 stroke.** The live admin build uses Lucide glyphs, and
the guide's rule — line icons, constant weight, forest on light and cream on dark, never
more than one icon style in a screen — matches it. No icon font or SVG sprite was supplied
with the brief, so Lucide is loaded from CDN:

```html
<script src="https://unpkg.com/lucide@0.454.0/dist/umd/lucide.js"></script>
```

⚠️ **Substitution flagged:** Lucide is inferred from the admin screenshot, not confirmed by
a source file. If the production build uses a different set (Phosphor, Heroicons, a custom
sprite), send the asset and `components/icons/Icon.jsx` swaps in one place.

Use the `Icon` component rather than inline SVG. Glyphs seen in the live admin, mapped:
dashboard `layout-grid`, products `coffee`, offers `package`, pricing
`circle-dollar-sign`, origins `map-pin`, regions `map`, varieties `sprout`, warehouses
`warehouse`, taxonomy `tag`, pages `file-text`, articles `book-open`, media `image`,
low-stock `triangle-alert`, inquiries `clipboard-list`. Shipping adds `truck` and `ship`;
verification uses `shield-check`.

Icons are decorative next to a label (`aria-hidden`) and never the only carrier of meaning.
Directional icons flip in RTL; a clock, a document or a warehouse does not.

**No emoji as iconography. No unicode glyph substitutes** except the few typographic
characters already in the components (`✓`, `✕`, `▾`, `↑↓`, `/`) — replace those with Lucide
if you want them consistent with the rest.

**Logo.** `assets/logo-horizontal.png` is the official horizontal lockup: an arched frame
containing a coffee bean over hill contour lines, beside the HILLS wordmark with COFFEE
rule-set beneath. Minimum digital width 150px horizontal (100px stacked). Respect clear
space; never stretch, rotate, recolour or rearrange the parts. **The stacked and
monochrome/dark-surface variants were not supplied** — on dark surfaces the kits place the
logo on a Warm Cream plate (as the live admin does) rather than invent a recolour. Send the
official dark variant and the plate can be dropped.

---

## What is in this project

| Path | What it is |
| --- | --- |
| `styles.css` | The one file consumers link. `@import` list only. |
| `tokens/` | `fonts.css` `colors.css` `typography.css` `spacing.css` `radii.css` `elevation.css` `motion.css` `layout.css` `base.css` |
| `assets/` | `logo-horizontal.png`, `fonts/` (Benito, Manrope, Big Bang), `reference/admin-overview-screenshot.png` |
| `guidelines/` | 20 foundation specimen cards (Colors, Type, Spacing, Brand) |
| `components/` | 49 React primitives in 9 groups, each with `.d.ts`, `.prompt.md` and a group card |
| `ui_kits/` | `public_website/` `auth_kyb/` `buyer_portal/` `seller_portal/` `admin_workspace/` — screen files are kebab-cased on purpose so the compiler keeps them out of the shipped bundle |
| `thumbnail.html` | Homepage tile |
| `SKILL.md` | Agent Skills wrapper for use outside this tool |
| `scraps/guide.txt` | Extracted plain text of the master guide |

### Components

**Buttons** — `Button`, `IconButton`
**Icons** — `Icon`
**Forms** — `Field`, `Input`, `Textarea`, `Select`, `Combobox`, `SearchField`, `DatePicker`, `FileUpload`, `PhoneField`, `CountryField`, `Checkbox`, `RadioGroup`, `Switch`
**Data** — `StatusBadge`, `FilterChip`, `SortControl`, `Tabs`, `Pagination`, `DataTable`
**Cards** — `Card`, `KpiCard`, `ListingCard`, `OrderCard`, `ShipmentCard`, `KybCard`, `DocumentCard`
**Feedback** — `Dialog`, `Drawer`, `ConfirmationModal`, `Toast`, `InlineAlert`, `Skeleton`, `EmptyState`, `StateScreen`
**Progress** — `Stepper`, `Timeline`
**Finance** — `DocumentRow`, `InvoiceCard`, `PaymentProofCard`
**Navigation** — `Header`, `MobileDrawer`, `Sidebar`, `Topbar`, `Breadcrumbs`, `LanguageSwitcher`, `ThemeToggle`

The inventory follows §05 of the master guide item for item.

**Intentional additions** (not named in §05, added with reason):
- `Icon` — a wrapper for the glyph set, so no screen hand-rolls SVG.
- `Field` — the label/hint/error scaffold every listed input needs.
- `Card` — the base surface the six named card types are built on.
- `Textarea` — required by reviewer notes, listing descriptions and contact forms.
- `Checkbox`, `RadioGroup`, `Switch` — required by KYB agreements, the Buyer/Seller role
  select, bulk table selection and notification preferences.
- `StateScreen` — the guide lists Unauthorized / Suspended / Pending review as required
  states; this is their shared full-page shell.

### UI kits

| Kit | Screens | Reference |
| --- | --- | --- |
| `ui_kits/public_website` | Home, Marketplace, Listing detail, Origins hub, Origin detail, Knowledge hub, Knowledge article, About, Contact, Shipping & storage, Help/FAQ, Legal (terms · privacy · cookies · returns) | Guide §07 |
| `ui_kits/auth_kyb` | Login, Forgot/reset password, Register & role select, Email verification, KYB wizard (6 steps), Application status (all states) | Guide §08 |
| `ui_kits/buyer_portal` | Dashboard, Marketplace, Cart → checkout → payment, My orders, Order detail, Invoices & documents, Shipments, Notifications, KYB & company profile, Settings | Guide §09, §12, §13, §14 |
| `ui_kits/seller_portal` | Dashboard, My listings, Create listing (7 sections), Sales orders, Sales order detail, Settlements & payouts, Shipments, Shipment handover detail, Notifications, KYB & company profile, Settings | Guide §10, §13, §14 |
| `ui_kits/admin_workspace` | Operations overview, Approvals queue, KYB review, Users & organizations, All listings, Listing review, Create Hills listing, Orders, Order detail, Finance & payments, Shipments, Shipment detail, Catalog & coffee data, Content & CMS, Site appearance & brand, Activity & audit, Admin settings | Live admin screenshot + §11 |
| `ui_kits/shared` | Account & settings surface shared by the buyer and seller portals | Guide §14 |

Every page in the guide's role inventories (§07–§14) now has a screen. Each kit's
`README.md` maps file → screen → how it is reached, and each kit's `index.html` is a
click-through: sidebars, headers, footers and in-page links move between all screens.

The compiler bundles every `.jsx` in the project, kit files included, so no kit module may
have a side effect at module scope: each kit file only defines components and calls
`Object.assign(window, {…})`. The `ReactDOM.createRoot(...)` mount lives in an inline
`<script type="text/babel">` at the end of each kit's `index.html`, which is never bundled.

### Usage

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
<script>const { Button, ListingCard, StatusBadge } = window.HillsCoffeeDesignSystem_ca006d;</script>
```

Dark mode is `data-theme="dark"` on `<html>`. Arabic is `lang="ar" dir="rtl"` — the font
stack and tracking swap automatically.

## Known gaps

1. **Readex Pro and Cairo are loaded from Google Fonts** — the Arabic faces were named in
   the guide but not supplied as binaries.
2. **No photography or illustration assets.** Every image area is a labelled placeholder.
3. **No dark-surface or stacked logo variant.**
4. **`BigBang.ttf` has no documented role** — it is declared as `--font-decorative` and
   used nowhere.
5. **Lucide is an inferred icon set**, read from the admin screenshot.
6. **Radii, shadows, neutral ramps and semantic danger/info are derived**, not quoted from
   the Brand Guidelines.
