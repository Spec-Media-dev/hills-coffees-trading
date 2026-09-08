# Hills Coffee — Website Recommendations & Sources

## Document Role

This document is a design, UX, content-structure, and visual-reference guide.

It is NOT the source of truth for business rules, permissions, trading logic, database behavior, KYB, settlement, inventory, payments, or authorization.

Source priority:

1. `docs/requirements/Hills-Coffee-SRS-v1.md`
   - Business and product requirements.

2. `docs/database/`
   - Approved database, authorization, integrity, and trading-flow baseline.

3. This document
   - Website section recommendations, conversion guidance, visual references, and customization direction.

4. `docs/claude-design/`
   - Concrete visual/design-system implementation reference.

If this document conflicts with the approved SRS or database baseline, the SRS/database rule wins.

External websites listed here are inspiration references only.
Do not copy their branding, text, layouts, images, or proprietary assets.
Adapt the intended design quality, hierarchy, interaction pattern, and visual direction to Hills Coffee.



# Hills Coffee - Website Recommendations & Sources

## Positioning locked

Hills Coffee is a Dubai-born B2B green-coffee sourcing and trading business serving the Arab region. Egypt is an operational office, not a replacement for the Dubai brand origin. The public site sells confidence, samples and commercial conversations; the Trading Portal is an authorized member product.

## Recommended customer journey

`Landing → identify intent → evaluate traceability/offer → RFQ or sample request → sourcing conversation → commercial allocation → delivery`

`Trading Portal link → sign in / KYB application → authorized inventory, storage, delivery or resale request`

Do not send every user into the portal and do not show an open, anonymous market. The current product rules specify manual KYB, Hills custody, controlled inventory visibility, fixed-price/RFQ resale, settlement before title transfer, and no order book, leverage or futures for the MVP.

## Section-by-section implementation

| Section | Recommendation for Hills | Design / conversion source |
|---|---|---|
| Header | Public routes: Coffee Offers, Origins, Sourcing, Knowledge. A visible but secondary Trading Portal link. Primary CTA: Request an Offer. | [Coffee Collective](https://www.awwwards.com/sites/coffee-collective) provides a calm, high-end minimal navigation and product focus. |
| Hero | Dubai-based regional supply, green coffee in context, one clear message and two actions: RFQ/Samples and Coffee Offers. No retail-cafe language. | [Maison Deuza](https://www.awwwards.com/sites/maison-deuza) for premium heritage / typography; adapt only the art direction. |
| Intent cards | Separate Source a Coffee, Buy Available Lots and Trade With Hills. Each card sends the buyer to its correct next action. | [CoffeeBridge](https://www.coffeebridge.co/) validates the B2B marketplace framing around producers, roasters, importers and green buyers. |
| Lot / origin pages | Every page must show traceability and decision data: origin, process, crop, producer, quality evidence, MOQ and availability. Sample/RFQ CTA stays visible. | [Nordic Approach](https://www.nordicapproach.no/) demonstrates a green importer built for roasters and buyers globally. |
| Supply credibility | Explain direct/farm relationships, sample-led buying, commercial logistics and quality documentation. Use real proof only. | [Falcon Coffees](https://falconcoffees.com/) is a specialty green-coffee trade house built around origin knowledge and collaborative supply chains. |
| RFQ | Use a short progressive form: buyer type, country, volume, profile/origin, timing, delivery point, contacts. Follow-up qualification happens after submission. | [Trabocca](https://www.trabocca.com/green-coffee-importer/) supports the importance of storage, logistics and delivery flexibility in green-coffee supply. |
| Trading Portal | Dedicated sign-in / KYB entry. Private routes, authorized inventory, allocation, storage, delivery and resale requests. Keep it technically and visually distinct from the public site. | Hills platform SRS; this is governed by the approved operational model, not copied from an open trading marketplace. |

## Visual direction from Awwwards

- Use **Maison Deuza** for editorial typography, atmospheric coffee imagery and restrained premium movement.
- Use **Coffee Collective** for calm product hierarchy and navigational clarity.
- Use **CoffeeTech** only for the corporate/technical confidence and clean product framing, not its heavy 3D approach: [Awwwards profile](https://www.awwwards.com/sites/coffeetech-r).
- Keep animation light. The brand needs loading speed, legible specs and RFQ conversion more than a long intro or scroll hijacking.

## Rules the developer must not break

1. Public origin/offer pages must be indexable for SEO; Portal routes must be private and non-indexed.
2. Use server-side permission checks for all portal inventory, pricing and actions; hiding buttons in the UI is not authorization.
3. KYB approval is manual. No account can trade merely because it registered.
4. Show only claims, certifications, stock and locations that Hills can evidence.
5. The website needs a CRM handoff for RFQ, samples and portal applications. Forms must capture attribution and consent.
6. Do not imply a financial exchange, speculation, leverage or futures activity.

## Files supplied

- `Hills_Coffee_B2B_Landing_Concept.html`: visual/interactive developer handoff.
- This file: recommendations, sources and guardrails.

