# Buyer portal UI kit

Buyer-side workspace from §09 of the Master Guide. The interface answers four questions
fast: what did I buy, what do I owe, where is it, and what does it need from me.

Open `index.html` — the sidebar reaches every screen.

## Screens
| File | Screen |
| --- | --- |
| `buyer-chrome.jsx` | Sidebar + topbar chrome and page header |
| `buyer-dashboard-screen.jsx` | KPIs, KYB state, recent orders, active shipment |
| `buyer-more.jsx` → `BuyerMarketplace` | Marketplace with prices unlocked, facets and filter drawer |
| `cart-checkout.jsx` | Cart → order review → proforma/payment, with fulfilment choice |
| `buyer-more.jsx` → `BuyerOrders` | Order list with status tabs, search and export |
| `order-detail.jsx` | Line items, timeline, invoice + payment instructions, proof upload |
| `buyer-more.jsx` → `BuyerInvoices` | Invoices, shipping documents, company documents |
| `shipments.jsx` | Shipment list, detail, timeline and shipping documents |
| `buyer-more.jsx` → `BuyerNotifications` | KYB, payment, shipment and order notifications |
| `buyer-more.jsx` → `BuyerKybProfile` | Company data, documents on file, replace-document flow |
| `../shared/account-settings.jsx` → `AccountSettings` | Profile, company, security, notifications, theme & language |

Every screen in the §09 inventory is present. Fees, VAT and proof-of-payment requirements
are pending commercial decisions; they appear as switchable states rather than hard-coded
copy.
