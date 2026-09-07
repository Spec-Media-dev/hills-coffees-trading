# Public website UI kit

The guest-facing B2B layer: green coffee sourcing and trading, not a retail coffee shop.
Built from §07 of the Master Guide (page model and SEO structure) plus the brand identity
rules in §02–§04. No published page HTML or screenshots of the public site were supplied,
so layout follows the guide's described page functions rather than a pixel reference.

Open `index.html` — the header, footer and in-page links move between every screen.

## Screens
| File | Screen | Reachable from |
| --- | --- | --- |
| `chrome.jsx` | Header, mobile drawer, `Section` scaffold, footer, image placeholder | — |
| `home.jsx` | Hero, live offers, origins, trust, dual apply CTA | Logo / "Home" |
| `marketplace.jsx` | Offer list: search, facets, sort, filter drawer, empty + loading states | "Green coffee" |
| `listing-detail.jsx` | Lot detail: media, specs, traceability, documents, buy panel | Any listing card |
| `public-more.jsx` → `OriginsHub` | Origins hub with search | "Origins" |
| `public-more.jsx` → `OriginDetail` | Origin profile: specs, regions, harvest calendar, related lots | Origin card |
| `public-more.jsx` → `KnowledgeHub` | Article index with category filter | "Knowledge" |
| `knowledge.jsx` | Knowledge article with related-lots rail | Any article card |
| `public-more.jsx` → `About` | Brand story, positioning, trade CTA | "About" |
| `public-more.jsx` → `Contact` | Enquiry form with success state, Dubai + Egypt offices | "Contact" / footer |
| `public-more.jsx` → `Shipping` | Fulfilment routes, shipment states, documents you receive | "Shipping" / footer |
| `public-more.jsx` → `HelpFaq` | Accordion FAQ by category | "Help" / footer |
| `public-more.jsx` → `Legal` | Terms, privacy, cookies, returns & refunds | Footer legal links |

Every screen in the §07 page inventory is now present. Regions and Processing footer links
route to the Origins hub, which is where that reference data lives.

## Photography
No image assets were supplied with the brand kit. Every media area is an explicit
placeholder naming the required shot (origin, harvest, processing, green coffee, warehouse,
quality inspection — documentary editorial, natural light). Never substitute café or
roasted-coffee stock imagery: this is a green coffee B2B surface.
