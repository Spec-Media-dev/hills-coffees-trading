# Admin / Operations workspace UI kit

Recreation of the Hills Coffee admin console. The only visual reference supplied for this
surface was a screenshot of the live `hillscoffees.com/admin` overview
(`assets/reference/admin-overview-screenshot.png`); everything else follows the page
inventory in §11 of the Master Guide.

Open `index.html` — the sidebar reaches every workspace.

## Screens
| File | Screen | Source |
| --- | --- | --- |
| `admin-chrome.jsx` | Sidebar + topbar chrome, full nav tree | Screenshot (nav labels, grouping, active state) |
| `overview.jsx` | Operations overview — KPIs + recent activity | Screenshot (copy, counts and activity rows are the live values shown) |
| `approvals.jsx` | Buyer & seller approvals queue | §11 |
| `kyb-review.jsx` | KYB application detail + review actions | §08, §11 |
| `admin-more.jsx` → `AdminUsers` | Users & organizations with suspend/reinstate guard | §11 |
| `admin-more.jsx` → `AdminListings` | All listings, Hills + seller, lifecycle tabs | §11 |
| `admin-more.jsx` → `AdminListingReview` | Review with buyer preview, documents, audit trail | §11 |
| `admin-more.jsx` → `AdminCreateHillsListing` | Five-section Hills-owned listing wizard | §11 |
| `admin-more.jsx` → `AdminOrders` | All orders, payment and fulfilment tracked separately | §11, §12 |
| `admin-more.jsx` → `AdminOrderDetail` | Commercial summary, payment timeline, documents, settlement | §11, §12 |
| `finance.jsx` | Incoming payments, verification queue, seller settlements | §11, §12 |
| `admin-more.jsx` → `AdminShipments` | Shipment queue with exceptions tab | §13 |
| `admin-more.jsx` → `AdminShipmentDetail` | Status control, logistics fields, documents, exception log | §13 |
| `admin-more.jsx` → `AdminCatalog` | Origins, regions, varieties, warehouses, taxonomy | §11 |
| `admin-more.jsx` → `AdminContent` | Pages, articles, media, announcement banner | §11 |
| `admin-more.jsx` → `AdminAppearance` | Logo assets, hero media, contact links, locked brand tokens | §11 |
| `admin-more.jsx` → `AdminAudit` | Activity & audit log with entity filters | §11 |
| `admin-more.jsx` → `AdminSettings` | Profile, security, notification routing, workspace | §14 |

Every workspace in the §11 inventory is present. Runs dark by default — the screenshot shows
the admin in dark mode. The theme toggle in the topbar switches `data-theme` on `<html>`;
every token re-maps from there.

Site Appearance deliberately refuses to edit colour or type tokens: the guide forbids
changing core brand rules from the admin.
