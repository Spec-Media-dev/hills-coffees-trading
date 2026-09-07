# Seller portal UI kit

Seller-side workspace from §10 of the Master Guide. Same account and settings foundation as
the buyer, but the working surface is listings, the orders placed on them, delivery and
settlement.

Open `index.html` — the sidebar reaches every screen.

## Screens
| File | Screen |
| --- | --- |
| `seller-chrome.jsx` | Sidebar + topbar chrome and page header |
| `seller-dashboard-screen.jsx` | KPIs, review blocker, recent sales orders, handover action |
| `listings.jsx` | Listing table with lifecycle tabs and a buyer-preview drawer |
| `create-listing.jsx` | Seven-section wizard with a permanent buyer preview |
| `seller-more.jsx` → `SellerSalesOrders` | Orders placed on your lots, gross beside net |
| `seller-more.jsx` → `SellerSalesOrderDetail` | Sold items, timeline, settlement summary, shipment |
| `settlements.jsx` | Gross / fee / net table plus payout timeline and documents |
| `seller-more.jsx` → `SellerShipments` | Deliveries tied to your sales orders |
| `seller-more.jsx` → `SellerShipmentDetail` | Handover form, documents, confirmation guard |
| `seller-more.jsx` → `SellerNotifications` | Listing review, orders, payouts, shipment actions |
| `seller-more.jsx` → `SellerKybProfile` | Verified company data, documents, banking status (read-only) |
| `../shared/account-settings.jsx` → `AccountSettings` | Profile, company, security, notifications, theme & language |

Every screen in the §10 inventory is present. Commission is shown as applied at settlement,
never folded into the listed price; banking changes are read-only pending step-up approval.
