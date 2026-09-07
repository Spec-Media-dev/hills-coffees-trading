@AGENTS.md
# Hills Coffee — Website Recommendations & Sources

## Document Role

This document is a design, UX, content-structure, conversion, and visual-reference guide for the Hills Coffee website.

It is **not** the source of truth for business rules, permissions, trading logic, database behavior, KYB, settlement, inventory, payments, authorization, or legal/compliance requirements.

## Source Priority

When implementing the project, use the following source priority:

1. `docs/requirements/Hills-Coffee-SRS-v1.md`
   - Authoritative business, product, operational, compliance, and functional requirements.

2. `docs/database/`
   - Approved database, authorization, integrity, RLS, trading-flow, inventory, settlement, and security baseline.

3. This document
   - Website section recommendations, conversion guidance, page intent, customization direction, and external design references.

4. `docs/claude-design/`
   - Concrete visual design system, components, tokens, layouts, spacing, typography, and UI implementation reference.

If this document conflicts with the approved SRS or database baseline, the **SRS and database baseline win**.

External websites listed in this document are **inspiration references only**.

Do not copy their branding, text, layouts, photography, proprietary assets, or distinctive visual identity.

Adapt only the relevant design quality, hierarchy, interaction pattern, information architecture, and visual direction to the Hills Coffee brand.

---

## Positioning Locked

Hills Coffee is a Dubai-born B2B green-coffee sourcing and trading business serving the Arab region.

Egypt is an operational office and does not replace Dubai as the brand origin.

The public website should primarily sell:

- trust
- traceability
- sourcing confidence
- product knowledge
- commercial conversations
- RFQ opportunities
- membership interest

The Trading Portal is a separate authorized-member product.

The public website must never present Hills Coffee as an open public trading exchange.

---

## Recommended Customer Journey

Primary public journey:

`Landing → identify intent → evaluate coffee/origin/traceability → RFQ or commercial inquiry → sourcing conversation → commercial allocation → delivery`

Authorized trading journey:

`Trading Portal → sign in / KYB application → approved membership → authorized inventory → purchase / storage / delivery / resale`

Do not send every visitor directly into the Trading Portal.

Do not expose private marketplace inventory or member trading data publicly.

The current approved product model requires:

- manual KYB approval
- Hills-approved custody
- controlled inventory visibility
- authorized buyer/seller access
- fixed-price and/or RFQ-based resale
- settlement before title transfer
- no public order book
- no leverage
- no futures
- no speculative financial-exchange positioning

---

## Homepage and Public Website — Section-by-Section Guidance

| Section | Recommendation for Hills | Design / Conversion Reference |
|---|---|---|
| Header | Public navigation should prioritize Coffee, Origins, Sourcing, Knowledge, and commercial contact paths. Include a visible but secondary Trading Portal link. Primary CTA: **Request an Offer** or **Start an RFQ**. | [Coffee Collective](https://www.awwwards.com/sites/coffee-collective) for calm, high-end navigation, strong hierarchy, and restrained product focus. |
| Hero | Communicate Dubai-based regional green-coffee supply immediately. Use green coffee in context, one strong commercial message, and clear actions such as **Request an Offer** and **Explore Coffee**. Avoid retail-café language. | [Maison Deuza](https://www.awwwards.com/sites/maison-deuza) for premium editorial typography, atmosphere, and restrained art direction. |
| Intent Cards | Separate the main user intents clearly: **Source Coffee**, **Explore Available Coffee**, and **Trade With Hills**. Each card must lead to the correct public or authorized-member journey. | [CoffeeBridge](https://www.coffeebridge.co/) for B2B marketplace framing around producers, roasters, importers, and green-coffee buyers. |
| Coffee / Origin Pages | Show decision-making data such as origin, process, crop, producer, quality evidence, grade, availability context, traceability, and relevant commercial information. Keep RFQ/contact action visible. | [Nordic Approach](https://www.nordicapproach.no/) for specialty green-coffee information architecture aimed at professional buyers. |
| Supply Credibility | Explain sourcing relationships, origin knowledge, quality documentation, logistics capability, custody, and commercial supply reliability. Use real Hills evidence only. | [Falcon Coffees](https://falconcoffees.com/) for specialty green-coffee trade positioning built around supply chains, origin knowledge, and commercial credibility. |
| RFQ | Keep the initial RFQ concise and progressive. Capture buyer/company type, country, estimated volume, coffee/origin preference, timing, delivery location, and contact details. Additional qualification can happen after submission. | [Trabocca](https://www.trabocca.com/green-coffee-importer/) for professional green-coffee supply messaging around storage, logistics, and delivery flexibility. |
| Trading Portal Entry | Provide a dedicated sign-in / KYB entry point. Clearly distinguish the authorized Trading Portal from the public marketing website. | Governed by the Hills Coffee SRS and approved database model, not by an open trading-marketplace reference. |

---

## Public Website vs Private Trading Portal

### Public Website

The public website may expose:

- public brand and company information
- coffee identities and approved catalog content
- origins
- sourcing information
- traceability information approved for public use
- knowledge/content pages
- reference benchmark pricing where approved
- RFQ/contact forms
- membership application entry
- Trading Portal sign-in entry

### Private Trading Portal

The private portal contains authorized information such as:

- member trading listings
- member-specific prices where applicable
- owned inventory
- custody positions
- warehouse-specific operational information
- reservations
- purchases
- storage allocations
- deliveries
- resale actions
- settlement information
- payouts
- private documents
- disputes
- organization/member information

Private trading data must never become public merely for SEO or UI convenience.

---

## Visual Direction from Awwwards

### Maison Deuza

Use as inspiration for:

- editorial typography
- premium composition
- atmospheric photography
- strong whitespace
- restrained motion
- visual storytelling

Do **not** copy its layout or branding directly.

### Coffee Collective

Use as inspiration for:

- calm navigation
- clean product hierarchy
- readable product information
- controlled spacing
- minimal visual noise
- premium but practical interaction

### CoffeeTech

Reference:

[CoffeeTech — Awwwards](https://www.awwwards.com/sites/coffeetech-r)

Use only for:

- corporate confidence
- clean technical presentation
- polished commercial framing

Do not adopt its heavy 3D approach unless specifically approved.

---

## Motion and Interaction

Motion should support understanding, not become the product.

Prefer:

- subtle reveal animations
- restrained hover states
- smooth section transitions
- lightweight image movement
- small micro-interactions
- clear loading states

Avoid:

- long intro animations
- scroll hijacking
- excessive parallax
- animation that hides specifications
- effects that reduce accessibility
- heavy effects that damage performance

Hills Coffee needs speed, credibility, legibility, and RFQ conversion more than visual spectacle.

---

## Homepage Customization Rule

The exported Claude Design is a visual foundation, not an instruction to reproduce every section without adaptation.

For each public-facing section:

1. Preserve the approved Hills Coffee design system.
2. Understand the business purpose of the section.
3. Use the external reference listed in this document only for the intended design principle.
4. Adapt the section specifically to Hills Coffee.
5. Preserve consistency with the rest of the Hills design system.
6. Do not introduce a design pattern solely because it exists in the external reference.
7. Do not introduce functionality that is not supported by the SRS or approved database.

The final website should feel like **one Hills Coffee product**, not a collection of copied references.

---

## Sample Requests

References in external inspiration material to samples or sample-led buying are **design/content inspiration only**.

Do not implement a dedicated Sample Request feature unless it is explicitly approved by the authoritative product requirements.

Where no approved sample workflow exists, use:

- RFQ
- Request an Offer
- Contact Sales
- Commercial Inquiry

as the conversion path.

---

## Rules the Developer Must Not Break

1. Public pages may be indexable for SEO, but **private member marketplace listings, inventory, member pricing, and portal routes must remain private and non-indexed**.

2. Never treat hiding a button as authorization. All private inventory, pricing, organization, payment, settlement, and trading actions require server/database-side permission enforcement.

3. KYB approval is manual. Registration alone never authorizes trading.

4. Only display claims, certifications, inventory, warehouse/location information, and commercial facts that Hills can evidence and is authorized to disclose.

5. Public forms should support appropriate CRM/commercial handoff and capture the required attribution, contact, and consent information when that integration is implemented.

6. Do not position Hills Coffee as a financial exchange.

7. Do not imply:
   - speculation
   - investment products
   - leverage
   - margin
   - futures
   - derivatives
   - anonymous trading

8. Private member listings must not be converted into public SEO pages.

9. Reference benchmark pricing must remain conceptually separate from:
   - Hills commercial quotes
   - member resale listing prices
   - executed trade prices

10. Trading Portal functionality must always follow the approved SRS and database baseline.

---

## Design Implementation Guidance

When a section exists in both this document and `docs/claude-design/`:

- use `docs/claude-design/` for the Hills visual language
- use this document for section purpose and customization direction
- use the external reference for inspiration only

Example:

**Hero**

- Hills Claude Design determines colors, typography, spacing, buttons, and component language.
- This document determines the commercial purpose and content hierarchy.
- Maison Deuza informs the premium editorial feeling.
- The final implementation must still be an original Hills Coffee design.

---

## Files Supplied

### `docs/claude-design/`

Contains the exported Hills Coffee design system and UI references, including relevant:

- assets
- components
- tokens
- guidelines
- UI kits
- layouts
- styles

### `docs/requirements/Hills-Coffee-SRS-v1.md`

Authoritative product and business requirements.

### `docs/database/`

Approved database baseline, including:

- schema report
- RLS and policy information
- relations
- functions
- triggers
- integrity rules
- final audit

### This File

Provides:

- public website recommendations
- homepage customization guidance
- section purposes
- conversion guidance
- external inspiration references
- visual guardrails

---

## Final Implementation Principle

Claude Code, Codex, or any developer working on the project must not implement any single source in isolation.

The intended implementation is the intersection of:

**Business requirements**
+
**Approved database rules**
+
**Hills Coffee design system**
+
**Website customization guidance**
+
**Original implementation quality**

The final result must remain recognizably and consistently **Hills Coffee**.