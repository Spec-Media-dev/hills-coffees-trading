# Contract — Application surfaces (routes, Server Actions, modules, components)

Rules for every surface:
- Server Components by default (Constitution XII). Client islands only where marked **(client)**.
- Every Server Action does, in order: Zod parse → `getRequestIdentity()` (authenticated, not blocked, MFA
  satisfied, acting org, capability) → one `lib/*` domain call → one RPC → a typed `ActionFeedbackResult`.
- Server Actions never compute money and never send an object path, bank identifier or raw database message to the
  client.
- Private routes are `noindex` and dynamic, with no shared caching (Constitution XI). After a mutation, only the
  affected private paths are revalidated with the installed Next 16 APIs (`revalidatePath` / `refresh` per
  `node_modules/next/dist/docs/`).
- New UI copy lives in `lib/app/copy/{en,ar}.ts` (member/admin). No new public copy except nav. Status values render
  through typed label maps (LOC-002). Money, codes, IBAN and references render `dir="ltr"` inside RTL (LOC-003).

## 1. Member portal (`/dashboard`, one portal for buyers and sellers)

| Route | Kind | Purpose / behaviour | New or changed |
|---|---|---|---|
| `/dashboard/coffee` | page | Marketplace list via `search_member_listings`, with filters (origin, process, location, type, availability, certification, tag), sort and paging in the URL. Cards keep the Feature 006 primary-image rule and gain an offer code + "from $X/kg" tier hint. **Add to cart** (client form) on the card and detail page. | changed |
| `/dashboard/coffee/[offerId]` | page | Detail + gallery (unchanged media rule), tier table, quantity input with a live tier/estimate preview from `estimate_cart`. The disclaimer "Estimate — final price on proforma" is always shown (UX-002). | changed |
| `/dashboard/cart` | page | Active cart grouped by seller × warehouse, qty edit/remove (existing RPCs), current estimated unit prices, "no stock is reserved" notice, → Checkout. Empty and ineligible-line states. | **new** |
| `/dashboard/destinations` | page | Organization delivery destinations: list, create, edit, set default, retire (settings sub-area). | **new** |
| `/dashboard/checkout` | page | Choose destination (required), optional promo code, full estimate (lines, discounts, group shipping, VAT, total) from `estimate_cart`, validity notice ("valid for N hours once issued") → **Issue proforma**. | **new** |
| `/dashboard/orders/[orderId]/proforma` | page | The issued proforma (versioned; code; frozen lines, discounts, shipping per group, VAT, buyer total, destination, deadline countdown). Actions: **Confirm & reserve for 20 minutes** (explicit confirm dialog), Cancel. When expired: "Issue replacement with current terms". | **new** |
| `/dashboard/orders/[orderId]/payment` | page | Replaces `/dashboard/payments/[orderId]` (which redirects here). Reservation countdown **(client)** (reuses `hold-countdown.tsx`), exact bank instructions from `proforma_bank_instructions`, exact amount + payment reference, proof requirements, proof form **(client)**. After proof: "Under finance review — your stock stays reserved". Late state: "Report a late transfer" (reconciliation). | **new** (replaces the Stripe collector page) |
| `/dashboard/orders/[orderId]` | page | Order timeline (UX-001): cart → proforma → awaiting transfer → review → paid → fulfillment (per group, own-lines-only for sellers) → completed; links to proforma, payment, invoice. | changed |
| `/dashboard/orders/[orderId]/invoice` | page | Final tax invoice (printable) from the `tax_invoices.snapshot`; attached signed PDF via a server-minted URL. Visible only after `PAID`. | **new** |
| `/dashboard/orders` | page | List with localized statuses and filters (buyer view); seller rows link to the seller view. | changed |
| `/dashboard/sales` | page | Seller: own order lines and economics (`v_seller_order_lines`): gross, seller-funded discount, Hills-funded discount (shown as "Hills promotion — does not reduce your payout"), commission tier and rate from own quantity, commission, net, group fulfillment status. Never the buyer total, proof or bank data. | changed |
| `/dashboard/payouts` | page | Seller: own payouts with `ACCRUED`/`PENDING_PAYOUT`/`PAID` explained, reference once paid. | changed |
| `/dashboard/promotions` | page | Seller: own promotions (list/create/edit/schedule/pause) targeting own listings only. | **new** |
| `/dashboard/listings/[offerId]` | page | + price tier editor **(client form)** where the Feature 006 state allows editing. | changed |
| `/dashboard/notifications` | page | Real notification list (EN/AR rendered from template + params), unread badge, mark read / mark all. The `NOTIFICATION_LIMITATIONS` flags flip with the DB capability test. | changed |
| `/dashboard/notifications/preferences` | page | Existing; + in-app always-on explanation; external channels shown as unavailable until an adapter exists. | changed |
| `/dashboard/orders/[orderId]/checkout`, `/dashboard/orders/[orderId]/shipment` | page | Legacy Feature 007 planner/checkout: serve only `LEGACY` orders; `BANK_TRANSFER_V1` orders redirect to the new routes. Removed after legacy orders drain. | changed → retired |

Navigation (`lib/dashboard/registry.tsx`): add **Cart**, **Destinations** (settings group) and **Promotions** (seller
capability). Payments moves under the order. The existing capability gating is unchanged (buyer: can-buy; seller
modules: can-sell).

### Member Server Actions
Single-caller modules, each the only caller of its RPC; enforced by static tests like Feature 007's.

| Action file | Actions → lib → RPC |
|---|---|
| `src/app/dashboard/cart/actions.ts` | `addToCart`, `updateCartLine`, `removeCartLine` → `lib/commerce/cart.ts` → `add_cart_line` / `update_order_item_quantity` / `remove_order_item` |
| `src/app/dashboard/destinations/actions.ts` | `saveDestination`, `retireDestination` → `lib/commerce/destinations.ts` |
| `src/app/dashboard/checkout/actions.ts` | `issueProforma` → `lib/commerce/proforma.ts` → `issue_proforma` |
| `src/app/dashboard/orders/[orderId]/proforma/actions.ts` | `confirmProforma`, `cancelOrder`, `issueReplacement` → `lib/commerce/proforma.ts` / `reservation.ts` |
| `src/app/dashboard/orders/[orderId]/payment/actions.ts` | `createProofUpload` (server: validate, build path, create a signed **upload** URL for the private bucket), `submitProof`, `reportLateTransfer`, `viewProof` → `lib/commerce/payment-proof.ts` |
| `src/app/dashboard/notifications/actions.ts` | `markRead`, `markAllRead` → `lib/notifications/read-state.ts` |
| `src/app/dashboard/promotions/actions.ts` | `saveSellerPromotion`, `setPromotionStatus` → `lib/promotions/seller.ts` |
| `src/app/dashboard/listings/[offerId]/actions.ts` | + `saveOfferPriceTiers` → `lib/listings/tiers.ts` |

Proof upload sequence (SEC-005, ST-005):
1. `createProofUpload` checks the state server-side and returns a signed upload token for `org/{org}/order/{order}/payment/{payment}/{uuid}.{ext}`.
2. The browser uploads the bytes. This changes nothing.
3. `submitProof` calls `submit_payment_proof`, which is the authoritative, timed step.
4. If the reservation expired in between, the UI shows the late-transfer path. The uploaded object is still retained and can be attached to the late report.

## 2. Operations/Admin console (`/dashboard-admin`)

Area registry (`lib/admin/areas.ts`) changes:
- `payments`, `payouts`, `invoices` become `availability: "live"`.
- New areas:
  - `reconciliation` (finance);
  - `adjustments` (finance, embedded in the order detail);
  - `commerceSettings` (system, platform admin);
  - `promotions` (catalogue, platform admin);
  - `campaigns` (system, platform admin);
  - `outbox` (system, platform admin; read-only diagnostics).
- Every page calls `checkAreaAccess(key)` and each RPC re-checks the role (Constitution VIII). Finance pages also require the step-up redirect (existing layout behaviour).

| Route | Purpose |
|---|---|
| `/dashboard-admin/payments` | Review queue (`v_finance_review_queue`): search by order code/buyer/reference; filters by state, age and reconciliation flag; sort oldest first; keyboard-operable data table (UX-007). |
| `/dashboard-admin/payments/[paymentId]` | Review detail: immutable proforma values beside the buyer's claimed values, proof viewer (server-minted URL), reservation state and deadline, review/audit history. Deliberate **Confirm** form (observed amount, currency, value date, bank reference, confirm checkbox) and **Reject** (reason), plus **Open reconciliation**. A mismatch shows exactly which field differs (UX-006). |
| `/dashboard-admin/reconciliation`, `/[caseId]` | Case queue and detail; resolve/close with resolution type and note; linked order/payment; no inventory actions. |
| `/dashboard-admin/invoices`, `/[invoiceId]` | Final invoices list/detail, attach signed PDF, printable view. Proformas are shown separately and labelled "not an invoice". |
| `/dashboard-admin/payouts`, `/[payoutId]` | Queue by status (`ACCRUED` shown as "awaiting completion", not payable); record external payment (amount prefilled read-only, reference, paid date, confirm). |
| `/dashboard-admin/orders/[orderId]` (finance/admin) | Order finance overview + manual adjustment form + admin void (pre-payment only). |
| `/dashboard-admin/commerce-settings` | Proforma validity hours, checkout kill switch, proof submission switch (with impact notices). |
| `/dashboard-admin/payment-accounts` | Existing; + "default for USD" action. |
| `/dashboard-admin/tax`, `/shipping`, `/commission` | Existing Feature 010 pages; + copy stating that changes affect only future proformas; shipping shows the country/NULL-fallback precedence. No structural change. |
| `/dashboard-admin/promotions` | Platform promotions (Hills-funded; the editor explains the cap at Hills' line commission on member listings) + read-only view of seller promotions (seller-funded). |
| `/dashboard-admin/campaigns`, `/new`, `/[campaignId]` | Bilingual campaign editor, audience, channels (in-app only until an adapter exists), schedule/cancel, delivery counts. |
| `/dashboard-admin/outbox` | Read-only outbox health (pending/failed counts, last error codes; no params), last `pg_cron` run/status per `f013_*` job, and a platform-admin "process now" diagnostic (lazy fallback). |
| `/dashboard-admin/shipments` (warehouse) | Existing; FULFILLMENT shipments show their group (seller, warehouse) and frozen destination. **No** payment or proof data (RLS-006). |
| `/dashboard-admin/taxonomy`, `/coffees/[coffeeId]` | Existing tag management (+ Arabic via `20260924120000_tag_translations.sql` once applied); certification list per coffee with official names LTR (LOC-004, FR-040). |

## 3. Domain modules

| Module | Responsibility |
|---|---|
| `lib/commerce/types.ts`, `validation.ts`, `errors.ts`, `labels.ts` | DTO allowlists, Zod input schemas, RPC error → localized feedback, status → label keys. |
| `lib/commerce/cart.ts`, `destinations.ts`, `quote.ts` (read `estimate_cart`), `proforma.ts`, `reservation.ts`, `payment-proof.ts`, `read.ts` | Thin typed wrappers, one RPC each; reads through RLS. |
| `lib/finance/review.ts` (new), `reconciliation.ts`, `payouts.ts`, `invoices.ts`, `adjustments.ts`, `read.ts` (changed) | Finance wrappers; `settlement.ts`/`funding.ts`/`stripe/*` are removed in Phase 7. |
| `lib/notifications/read.ts` (changed), `read-state.ts`, `templates.ts` (EN/AR renderers keyed by `template_key`), `campaigns.ts`, `providers/types.ts`, `providers/registry.ts`, `providers/in-app.ts`, `worker.ts` | See [notification-provider.md](./notification-provider.md). |
| `lib/promotions/{platform,seller,read}.ts`, `lib/listings/{tiers,search}.ts` | Promotions, tiers, marketplace search. |
| `lib/admin/commerce-settings.ts` | Settings read/update. |

## 4. Components (reuse first; `components/ui` primitives, Hills tokens)

- New in `components/commerce/`:
  - `add-to-cart-form` (client);
  - `cart-group`, `cart-line` (client controls reuse `draft-item-controls`);
  - `destination-form` (client), `destination-picker`;
  - `estimate-summary`, `proforma-document`, `proforma-confirm-panel` (client, confirm dialog);
  - `reservation-countdown` (client, wraps `orders/hold-countdown`);
  - `bank-instructions`, with copy-to-clipboard buttons (client);
  - `proof-upload-form` (client, RHF + Zod);
  - `order-timeline`;
  - `money` (LTR, `Intl.NumberFormat` en-US digits, USD);
  - `commerce-status-badge` (localized).
- New in `components/finance/`: `review-queue-table`, `review-detail`, `confirm-payment-form` (client), `reject-payment-form` (client), `reconciliation-*`, `payout-record-form` (client), `invoice-document`.
- `components/finance/stripe-payment-collector.tsx` and `funding-unavailable-notice.tsx` are removed in Phase 7.
- Other new component groups: `components/notifications/notification-list`, `mark-read-button` (client), `campaign-form` (client); `components/promotions/*`; `components/listings/price-tier-editor` (client), `marketplace-filters` (client URL-state form).
- Reused unchanged: `ListingCard`, `MediaGallery`, `listing-status-badge`, `order-status-badge` (vocabulary extended), `payment/payout/proforma-status-badge` (vocabulary extended), `DataTable`, `FilterBar`, `EmptyState`, `StateScreen`, `PageHeader`, `ActionBar`, `use-action-toast`.
