# Contract: Surfaces, Privacy, Client Ownership and Buyer States

## Route and Rendering Ownership

| Surface/routes | Server responsibility | Narrow client responsibility |
| --- | --- | --- |
| `/` | Existing root homepage; dynamic public Recent/Featured from safe cached Coffee DTOs, auth-aware navigation outside shared cache | Existing motion; reference-only Compare control where needed |
| `/coffee`, `/coffee/[slug]` | Published public browse/search/detail, metadata/JSON-LD, gallery attributes, related ≤3; separately authorize any session commercial branch | Gallery, explicit offer/quantity selector and action feedback |
| `/coffee/compare` | Validate ≤3 published slugs, public projection only | Public reference tray/remove/clear/limit/share controls |
| `/dashboard/coffee`, `/dashboard/coffee/[offerId]` | Guard current member/capability, bounded localized search, fresh safe offer projection/signed private media | Quantity/Add/Compare and selector; no privileged lookup |
| `/dashboard/cart` and selected-line review within existing cart journey | Authoritative lines/summary/estimate/destination and guarded selected checkout/recovery | Per-line edits/remove/checkout, stable intent, loading/errors and safe result navigation |
| `/dashboard/compare` | Current permitted offer re-fetch, no shared cache/indexing | Org/session-scoped references and comparison tray |
| `/dashboard/orders/[orderId]/proforma`, order/payment views | Exact authorized order/current-proforma linkage, frozen permitted bank/documents, actual state and invoice/fulfillment metadata | Existing proof controls, retry/read/recovery state; never checkout recreation |
| Existing Admin Coffee/account routes | Role/MFA authorization, normalized records/readiness and operations | Stepper/forms/upload/preview within authorized boundary |
| Help member/Admin routes | Current-org membership or Platform Admin/MFA, reference resolution, bounded ticket/message/history projection | Create/reply/status forms, focus/announcements; user body as escaped text |

`/dashboard` remains one portal with additive seller modules. Keep member/Admin metadata noindex. Anonymous public route execution never loads offer/private data then strips it; public loaders accept only public inputs and emit allowlisted fields. Authenticated commercial branch is separately guarded and excluded from public cache/metadata. Public drafts are not previewable through anonymous query flags; Admin preview uses protected reads and explicit Public preview versus Purchase preview labels.

## DTO Boundaries

**PublicCoffee**: published identity/slug, localized/fallback name/description, origin/type/process/variety public attributes, public primary/gallery assets and Featured state. No executable price/quantity, offer IDs, seller organization/economics, inventory/position/location, lot-private grade, cart/order/payment/proof/bank data. Metadata/JSON-LD uses this same allowlist and no commercial Offer schema. Related/home/search/Compare do not add hidden fields. No current private media URL may be stored in a public DTO/cache.

**BuyerOffer**: offer identity/title, localized Coffee/origin/permitted taxonomy/media, safe seller display, USD/kg, available quantity/status, eligibility reason and safe action references. No backing-position/location/internal inventory or commission/net/share fields. Own-offer buying denied; SOLD_OUT and existing visibility/stock/hold/provenance remain authoritative. Public Coffee state is not an added global eligibility guard. Seller projections remain seller-specific and gain no buyer proof/bank access.

**BuyerDocument**: actual authorized order state/current pointer, immutable item/group/totals/destination fields, permitted frozen bank snapshot/reference, deadlines, proof/review safe state, existing invoice/progress references. No internal SQL/proof diagnostic or signed proof URL without separate current authorization. Invoice metadata is not a promised downloadable PDF. Expired bank RLS denial is respected.

**Help**: authorized reference/status/category/priority/subject/original body/messages/history and permitted order reference. Staff/member identity is safe server-derived display. Do not automatically load linked proof/bank/economics. Notification/audit DTOs carry safe event metadata, never free-text conversation.

## CartSummary Synchronization

Initial server hydration is tied to authenticated user/session generation, selected org and buying capability. Load fresh canonical cart summary; absent cart is count0/cart null, existing empty is count0/existing ID. Unknown/loading/error is separate from verified0. Zero badge shows icon without numeric bubble.

On committed Add/update/remove/checkout, use returned operation outcome and fresh server summary. Quantity merges do not increment distinct-line count. Failed Add preserves input and displays no success; confirmed Add uses EN “Added to cart”/“View cart” and AR “تمت الإضافة إلى السلة”/“عرض السلة”, accessible inline status and toast. Retained unavailable lines still count and remain removable/editable.

Client provider tracks context epoch plus read/mutation sequence. On sign-out/org switch/capability loss clear old private results immediately, increment epoch, abort/discard old requests and rehydrate current authorized state. Later responses require matching context/sequence before application. Cross-tab BroadcastChannel/storage messages send only invalidation, not trusted count/private payload; receiving tab rereads server. Focus/visibility return triggers bounded refresh. Coalesce invalidations and prevent old read overriding a newer mutation. Do not persist line quantities/counts as authority.

Public header shows Cart for authorized purchasers or appropriate sign-in/membership control; preserve contact/RFQ route and workflow. Member header/sidebar/mobile share the same context-aware control, logo points `/`. Admin has no purchasing cart.

## Compare Stores and Presentation

Public namespace stores up to three validated Coffee slugs; public route/share URL may carry only these bounded slugs. Server re-fetch requires PUBLISHED/public DTO. Member namespace stores up to three offer IDs scoped to current session/org/capability; never share them in public URLs. Distinct offers of the same Coffee count as distinct member selections. Session storage contains references, not prices, stock, signed images or economics. Every open/refresh re-fetches authoritative permissions/current data; missing/unavailable selection remains explained/removable, not silently substituted.

Clear private reference/results on sign-out/org switch/capability loss. Late results are rejected with the same epoch discipline. Limit feedback, tray/remove/clear/open/card-selected state and useful actual attributes are localized. Mobile comparison scroll is contained and labeled; page cannot overflow. Keyboard users can reach actions, dismiss tray/dialog and recover focus.

## Cache and Revalidation Matrix

| Data | Mechanism | Mutation invalidation |
| --- | --- | --- |
| Published catalogue/home/related/public Compare | Existing native public caches; explicit DTO/locale/query keys, no auth/cookies | Expire `public-coffees`, relevant `public-coffee:<slug>` and origin/taxonomy tags after committed content/translation/media/Featured/publication change; invalidate old/new slug as needed |
| Identity/capabilities/CartSummary/private offers/Compare | Session-scoped fresh reads, no shared cache | Operation result plus authoritative refresh; context epoch clear |
| Orders/proforma/bank/proof/invoice/fulfillment | Fresh authorized reads; frozen content can be reused within authorized request only | Refetch actual state after relevant operation/recovery; never substitute public cache |
| Help/notifications/Admin operational state | Fresh scoped bounded reads | Successful operation route refresh/revalidation with authorization intact |

Use existing immediate tag invalidation where stale unpublished/Featured content must disappear; no new Redis/cache service/cacheComponents flag. No private DTO stored in `unstable_cache`, shared module state or public static page output. UI invalidation follows committed operations; a failed cache invalidation must be reported/retried without rolling back a known committed business outcome. Privacy tests inspect anonymous HTML, RSC/flight, metadata/JSON-LD, cache reuse after authenticated requests and session/org transitions, not only visible text.

## Buyer Read and Recovery State Machine

The DAL must return typed success/absence/denial/error, not catch all failures into null. Resolve authorized order then exact `current_proforma_id`, verify document belongs to same order/buyer and expected V1 contract. Null/inconsistent pointer is explicit integrity or appropriate lifecycle absence, never highest-version fallback. Handle expiry refresh errors explicitly before presenting active instructions. Persisted states and safe proof/review data determine actions; no synthetic database statuses.

| Context | Presentation / permitted next action |
| --- | --- |
| Anonymous | Sign in to purchase; allowlisted same-origin product return only, no automatic Add/reserve |
| Missing MFA/org/KYB/can_buy | Existing verification/org/membership action; deny mutations and replay until satisfied |
| Eligible offer | Explicit offer, quantity, Add; never buy own offer |
| Pending cart | Per-line checkout/update/remove/details; estimate and not-reserved copy; no Checkout all |
| Missing destination | Existing Add/select authorized destination flow |
| Precommit failure | Retain inputs/source; retry same intent or deliberate edit/new intent only after outcome known |
| Unknown outcome | Check original checkout result; do not create new purchase intent while uncertain |
| Known committed/render failure | Open your order by recovered child ID; no re-adding consumed line |
| HOLD + valid ACTIVE reservation | Frozen permitted bank/reference/amount/deadline and existing proof upload |
| Actual submitted/under-review state | Proof received/review and Get help; REVIEW_HOLD is reservation state, not an invented order status |
| PAYMENT_REJECTED | Terminal safe reason/Get help; no resubmit/confirm-only artifact |
| PAID | Existing invoice/progress; V1 proforma remains CONFIRMED |
| FULFILLMENT_IN_PROGRESS/PARTIALLY_DELIVERED | Track existing shipment/progress |
| COMPLETED | Existing completed order/invoice |
| EXPIRED | Current eligible offers and existing authorized late-transfer/support path; no widened bank access |
| CANCELLED/VOID/DISPUTED | Actual status and existing support/dispute path; no fresh reservation/transfer prompt |

Classify auth/permission/not-found, expired, configuration, query/projection/type mismatch, connectivity and persisted-integrity errors. Safe localized message + retry/support/correlation; log no private payload. A receipt COMMITTED result remains known even if document read fails. Render frozen Arabic/English fallback only; preserve custom offer title/identifiers LTR. Never infer document correctness from matching highest version.

## UI and Accessibility Reference Lock

Use owner screenshots, `docs/claude-design/`, design guidance and existing Hills components as references. Preserve forest/cream, restrained gold/orange, established English/Arabic typography. Cards prioritize name/origin/permitted commercial context and visible actions; constrain media so Add/Compare/details are reachable. Shared gallery presents actual images/fallback, no unsupported tasting/grade claims.

Server components own page/data composition. Client islands own `CoffeeGallery`, `OfferSelector`, `QuantityControl`, `CartControl`, `CompareTray`, Admin stepper and support forms. Reuse Base UI dialogs/menus, current Sonner, existing Motion reveal/presence/hover components. Follow `components/motion/ANIMATION-OWNERSHIP.md`: one engine per interaction/property, no new framework, no forced Lenis setup. Reduced motion removes nonessential movement but retains feedback/focus/actions.

All changed controls/status/errors/notifications/empty/loading/accessibility strings have EN/AR dictionary keys. Original support content retains its language; frozen missing Arabic uses identified English fallback. Use logical CSS/RTL, LTR isolates for account/reference/quantity identifiers, semantic headings/table headers, labeled quantity/buttons, inline field errors/live regions, accessible skeleton status, focus trap/restoration and keyboard dismissal. Sticky actions cannot cover content or hide on focus. Validate 360/768/1280 widths; intentional table/document scrolling stays contained and keyboard accessible.

## Security Matrix and Negative Tests

| Boundary | Enforcement / required denial |
| --- | --- |
| Checkout/cart/receipt | Fresh buyer helper, org membership/status/KYB/can_buy/MFA/blocked checks, exact binding; cross-org/actor/root-key replay denied |
| Admin/backing/review | Existing role/MFA and actual transition/provenance; forged position/status/revision denied |
| Bank | Existing Super Admin CRUD / Platform Admin default/MFA; Finance configuration denial |
| Proof/Storage | Existing F015 upload/read RLS and F016 Finance projection; seller/anonymous/wrong org/blocked denied; signed access created only after authorization |
| Help | Current org DAL plus membership-backed RLS; Platform Admin/MFA staff; reference/UUID/order/staff spoof denied |
| Public/cache/Compare | Allowlist DTOs and separate loaders; anonymous delivered payload contains no commercial/private fields |
| Return/error/content | Local allowlisted product paths only, reject external/protocol-relative/traversal/action-bearing intent; escape user content and safe errors |
| Provider retirement | Feature017 signatures/ACL denials, no Edge provider deployment/secrets; migration/rollback helpers never restore execution |

Test direct RPC/table/API paths as well as UI. No client service-role credential, untrusted actor/recipient, RLS disablement or broad bank/proof policy is allowed. Existing ability to view an order never automatically grants all linked financial/document fields.
