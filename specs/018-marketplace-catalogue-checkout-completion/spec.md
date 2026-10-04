# Feature Specification: Marketplace, Catalogue & Checkout Completion

**Feature Directory**: `specs/018-marketplace-catalogue-checkout-completion`

**Feature Branch**: `main` (existing branch retained; no branch-creation extension hook is configured)

**Created**: 2026-10-04

**Status**: Draft — specification quality validated; ready for clarification, not implementation

**Input**: Owner-approved revised Feature 018 direction and the 2026-10-04 `/speckit.specify` request: complete the bilingual Hills B2B catalogue-to-fulfillment journey, with unified Admin creation, public commercial privacy, Featured discovery, exact-once single-offer checkout, authoritative cart feedback, Compare and an extension of Feature 014 support.

## Clarifications

### Session 2026-10-04 — Targeted Contract Clarification

- Q: What is the exact boundary for selected-line checkout? → A: One transaction begins after fresh buyer authorization and canonical-cart resolution, locks the source cart before its selected line, validates the source-line snapshot and destination, creates exactly one dedicated child order/item, performs the established checkout for that child, writes its immutable receipt and deletes the source line. These effects commit together or all roll back. The receipt retains the source-line identity/snapshot after deletion.
- Q: How are the source line and replay payload identified? → A: The source line is its existing unique order-item identity within the selected canonical cart. A receipt binds that identity, source-cart ID, buyer organization, offer, requested quantity, destination, request ID, dedicated order/item and committed result. Same binding replays the result after fresh authorization; any changed binding fails as conflict.
- Q: When is the source line removed? → A: Only after the child checkout has produced its complete result and receipt within the same transaction. It is never removed before successful child checkout or in a separately committed operation.
- Q: How do checkout and cart mutations serialize? → A: All cart-changing operations resolve the canonical cart under the existing organization advisory lock, then lock the cart before a selected line. Checkout additionally follows the existing downstream offer-before-position order. A stale/missing/consumed line returns a safe stale/conflict/recovery result rather than moving a different line.
- Q: What happens when the final line is checked out? → A: The same source DRAFT remains an empty reusable cart. It has no child reservation/payment/proforma/destination artifact. The next Add reuses it under the established latest `(created_at, id)` rule. Reads create neither absent nor empty carts.
- Q: How is fresh single-line checkout separated from historical checkout? → A: The existing checkout entry point remains valid for the newly created one-line dedicated order and for authorized replay of already committed historical orders. After Feature 018, it must reject a fresh DRAFT containing more than one line. It must not reinterpret, reject or alter committed historical multi-line records, their replay, Finance processing or fulfillment.
- Q: How does unified Admin creation begin and resume? → A: The first confirmed identity save creates one Coffee DRAFT. Every later step writes only its own normalized records and uses a stable creation/edit intent. Resuming reloads that Coffee and explicitly selected offer; it never creates a new Coffee/offer because a page reload, failed upload or later step occurs.
- Q: What are Featured's lifecycle semantics? → A: First enable sets its ordering moment; repeated enabled saves retain it; Unfeature clears it; unpublication retains it privately but removes public discovery; republish restores public eligibility at the original Featured order; DRAFT/ARCHIVED are always excluded.
- Q: What authorizes Help Center access? → A: Current authenticated organization membership plus current application organization scope for member access, or existing Platform Admin authority for staff access. A ticket reference, raw ID, order reference or UI state is never authorization. New random HC references coexist with immutable HLP references.
- Q: What is immutable in bilingual documents? → A: Only new issuance captures nullable Arabic Coffee/origin display snapshots. Historical nulls stay null and render their frozen English fallback; later translation changes never rewrite documents. Custom offer titles, identifiers and account values are retained exactly as issued and are not synthesized/transliterated from Coffee translations.
- Q: What data may reach public discovery surfaces? → A: Public Coffee DTOs only. The prohibition covers rendered UI, RSC payloads, HTML, metadata, JSON-LD, related-item reads, Compare URLs/results and shared caches; authorized commercial data is fetched only in session-scoped member views.
- Q: What may fixture cleanup remove? → A: Only resources proven owned by the run manifest. Curated/demo records and immutable historical commerce/audit rows are retained; titles, slugs and publication state are never used as a deletion/filtering proxy.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Checkout One Offer Safely (Priority: P1)

An authorized purchaser keeps several offers in the organization cart and checks out one chosen line without committing or reserving the others. A lost response, retry or concurrent click cannot create another purchase.

**Why this priority**: Single-offer checkout is a hard owner requirement and the principal change to the existing commercial transaction boundary.

**Independent Test**: Prepare an authorized organization cart with A, B and C, check out A, and inspect the selected transaction and remaining cart. Repeat using retries, concurrency and injected failures.

**Acceptance Scenarios**:

1. **Given** a DRAFT cart with A, B and C, **When** A checks out successfully, **Then** its dedicated order contains exactly A, only A is reserved, its own proforma/payment/reference/destination are created, B and C remain unchanged, and the cart count is two.
2. **Given** A and B belong to different sellers, **When** A checks out, **Then** neither B nor its seller's shipping, commission or payment amount participates in A's transaction.
3. **Given** a committed checkout of A, **When** the same intent and payload are retried or its response is recovered, **Then** the original order is returned with no second reservation, payment or line consumption.
4. **Given** a checkout intent, **When** the same intent is reused with a changed quantity, destination, offer, cart or organization, **Then** it fails closed as a conflict and creates no new purchase.
5. **Given** simultaneous checkout requests for A, **When** they complete, **Then** at most one purchase commits; matching intent resolves to that purchase and conflicting intent is rejected.
6. **Given** checkout fails during dedicated-order creation, reservation, snapshot creation, source-line removal or receipt persistence, **When** the failure returns, **Then** no partial transaction survives and A, B and C remain recoverable in their original cart.
7. **Given** A is the cart's last line, **When** its checkout commits, **Then** the source cart retains its identity and BANK_TRANSFER_V1 DRAFT state with zero items; the next Add uses that same cart.
8. **Given** final-line checkout races with Add, update, remove or another checkout, **When** operations finish, **Then** the result matches a valid serialized order of operations, no source line is consumed twice, no new empty pending cart is accumulated, and inventory is conserved.

---

### User Story 2 - Follow Payment, Finance and Fulfillment (Priority: P1)

A purchaser understands what happened after checkout, where to transfer, whether proof was received, what Finance decided, and how to find the invoice and fulfillment progress.

**Why this priority**: The closed bank-transfer lifecycle must remain understandable and recoverable while Feature 018 changes its entry experience.

**Independent Test**: Use existing authorized HOLD, submitted-proof, rejected, paid, fulfillment and expired orders and verify each presentation and permitted next action without requiring new catalogue creation.

**Acceptance Scenarios**:

1. **Given** a committed HOLD order, **When** its proforma opens, **Then** the document referenced by current_proforma_id and its permitted frozen bank instructions appear with the correct amount, reference, reservation deadline and proof action.
2. **Given** proof has been submitted, **When** the buyer revisits, **Then** submission/review status is visible and no duplicate proof or transfer action is suggested.
3. **Given** Finance confirms, **When** the buyer views the result, **Then** the established paid, invoice, ownership, storage-allocation and fulfillment outcomes are accessible exactly once; proforma state is not falsely rewritten to PAID by presentation.
4. **Given** Finance rejects, **When** the buyer views the result, **Then** terminal rejection and a safe explanation/support action appear, release occurs once, and no confirm-only artifact or proof-resubmission action is created.
5. **Given** checkout committed but redirect/rendering failed, **When** recovery is selected, **Then** the existing order opens; the transaction is not reconstructed as a cart or checked out again.
6. **Given** a query/projection/connectivity error or inconsistent document relationship, **When** the document is read, **Then** a classified safe error appears rather than false absence, an empty document or another version chosen as fallback.
7. **Given** expired, cancelled, void or disputed orders, **When** opened, **Then** their actual states and permitted support/reconciliation actions appear without unauthorized bank access or an invitation to reuse an expired reservation.

---

### User Story 3 - Create a Sellable Bilingual Coffee in One Place (Priority: P1)

An authorized Admin creates and edits catalogue content, translations, imagery and a real inventory-backed Hills offer inside one cohesive resumable experience. Readiness and role-specific handoffs explain what remains before publication and purchase.

**Why this priority**: Operators need a coherent path to create genuine sellable products while preserving stock authority and Compliance approval.

**Independent Test**: Use an existing eligible Hills inventory position and authorized operator/reviewer accounts; save each step, interrupt it, resume, review and publish the Coffee/offer.

**Acceptance Scenarios**:

1. **Given** an authorized Admin, **When** a bilingual Coffee and backed offer are created, **Then** identity, EN/AR content, taxonomy, media, USD/kg price, quantity, Featured, readiness, preview and review/publication are available in the same experience.
2. **Given** catalogue creation succeeded but translation, media or offer saving fails, **When** the operator resumes or retries an uncertain save, **Then** completed records are preserved and no duplicate Coffee/offer is created.
3. **Given** no eligible position exists, **When** the inventory step opens, **Then** stock cannot be fabricated and a Warehouse handoff is explained while catalogue work remains saved.
4. **Given** an offer requires review, **When** an operator without the required permission attempts approval/publication, **Then** the action is denied and the pending handoff remains visible.
5. **Given** complete content and an APPROVED eligible offer, **When** an authorized publisher completes publication, **Then** the Coffee is publicly discoverable and the offer is purchasable under existing guards.
6. **Given** a new Coffee lacks Arabic name or description, **When** publication is attempted, **Then** publication is blocked with localized field guidance.
7. **Given** an operator chooses catalogue-only publication, **When** public-content readiness passes, **Then** the Coffee is discoverable without falsely claiming commercial availability.
8. **Given** an existing Coffee has several offers, **When** editing resumes, **Then** the intended offer is selected explicitly and other offers are not silently overwritten or duplicated.

---

### User Story 4 - Maintain an Authoritative Cart (Priority: P1)

A purchaser gets clear Add feedback and a consistent organization cart count in the header, sidebar and mobile navigation. Each pending line has its own checkout action.

**Why this priority**: Users must know that Add worked and where their pending items are without confusing cart intent with reserved stock.

**Independent Test**: Add, merge, update, remove and partially check out seeded cart lines; change session/organization and invalidate a second tab.

**Acceptance Scenarios**:

1. **Given** Add succeeds, **When** the result is displayed, **Then** an EN/AR toast and accessible inline confirmation offer View cart and all cart controls reflect the authoritative distinct-line count.
2. **Given** an existing offer line, **When** a deliberate new Add for that offer succeeds, **Then** quantity merges and the distinct-line count does not increase; replay of the same Add intent does not add again.
3. **Given** Add fails, **When** the error is presented, **Then** quantity/input state remains available and no success toast or speculative count is shown.
4. **Given** three pending lines, **When** one is removed or checked out, **Then** only that line disappears and the count becomes two; Checkout all is absent.
5. **Given** sign-out, sign-in/session restore or organization switch, **When** context changes, **Then** previous private cart state is cleared and the current authorized summary is reread.
6. **Given** cross-tab invalidation, **When** another tab updates its badge, **Then** it rereads authoritative state rather than trusting a transmitted count.
7. **Given** an empty cart, **When** navigation renders, **Then** the cart icon has no numeric badge; a read failure is not shown as a verified empty cart.
8. **Given** the member logo is selected, **When** navigation occurs, **Then** the destination is the homepage; the Admin console receives no purchasing cart.

---

### User Story 5 - Configure Bank Instructions Without Rewriting History (Priority: P1)

Authorized operators complete the existing USD payment-account configuration, including default selection, while buyers continue to receive the bank instructions frozen for their issued proformas.

**Why this priority**: Bank instructions are necessary for the only supported payment method and must not drift after issuance.

**Independent Test**: Change the active/default USD account with permitted roles, then compare an existing proforma and a subsequent checkout.

**Acceptance Scenarios**:

1. **Given** an operator with the existing account-management permission, **When** an account is managed, **Then** approved account fields, active/default state and safe masking are available without broadening Finance permissions.
2. **Given** the existing default-selection permission and satisfied MFA, **When** a valid active USD account is selected, **Then** future issuance uses it and only one active USD default applies.
3. **Given** an already issued proforma, **When** its bank account is edited, retired or replaced as default, **Then** that proforma's bank snapshot/reference remains unchanged.
4. **Given** missing/invalid default configuration, **When** checkout is attempted, **Then** the buyer receives a safe configuration failure and the pending cart is preserved.

---

### User Story 6 - Complete Every Journey in English or Arabic (Priority: P1)

Members, visitors and operators can use every changed surface on desktop, tablet and mobile with keyboard, assistive technology and reduced motion in English or Arabic.

**Why this priority**: Arabic is a first-class operating language and inaccessible or incomplete translation breaks the same commercial journey.

**Independent Test**: Exercise representative public, Admin, cart, Compare, checkout, payment and support paths in EN/AR, keyboard-only, reduced-motion and narrow-width conditions.

**Acceptance Scenarios**:

1. **Given** Arabic locale, **When** any new/changed surface opens, **Then** labels, statuses, instructions, errors, loading/empty states, toasts and accessibility names are translated and layout is genuinely RTL.
2. **Given** historical English-only Coffee or document content, **When** Arabic is selected, **Then** clearly identified frozen English fallback appears rather than invented translation or current-content substitution.
3. **Given** a new bilingual proforma is issued, **When** catalogue translations change later, **Then** its captured Arabic product/origin names remain unchanged.
4. **Given** keyboard navigation or reduced motion, **When** using gallery, quantity, tray, dialog or sticky actions, **Then** focus, dismissal, action visibility and task completion remain available without motion dependency.

### User Story 7 - Discover and Select Coffee (Priority: P2)

Visitors discover published Coffee through Recently Added, Featured and the catalogue. Authorized purchasers additionally select a particular offer and quantity through useful product details and marketplace cards.

**Why this priority**: Discovery must connect public content to authorized buying without leaking commercial information.

**Independent Test**: Browse populated and empty catalogue/homepage states anonymously and with purchaser, non-purchaser and seller accounts in both languages.

**Acceptance Scenarios**:

1. **Given** published coffees, **When** the homepage opens, **Then** Recently Added and eligible Featured sections each show at most six dynamic cards linking to Coffee detail; a Coffee may appear in both.
2. **Given** no published Featured Coffee, **When** the homepage opens, **Then** Featured is omitted rather than filled with arbitrary products.
3. **Given** a Featured Coffee is unpublished, archived or unfeatured, **When** public discovery refreshes after that committed change, **Then** it is excluded as appropriate; unpublication retains its editorial selection privately.
4. **Given** an anonymous visitor, **When** browsing/searching/detail/comparison, **Then** public imagery and catalogue content are available without commercial prices, quantities, seller economics, cart or bank data in any delivered representation.
5. **Given** a visitor selects Sign in to purchase, **When** authentication/onboarding finishes, **Then** safe return intent opens the intended product but performs no Add, reservation or purchase.
6. **Given** multiple eligible offers for one Coffee, **When** an authorized purchaser opens detail, **Then** seller, permitted price/quantity and offer selection are explicit before Add.
7. **Given** a legitimate member-visible offer whose Coffee is not publicly published, **When** its authorized detail opens, **Then** existing commercial eligibility is preserved without making its Coffee publicly discoverable.
8. **Given** no results, read failure, missing imagery or unavailable purchase eligibility, **When** the relevant surface opens, **Then** the specific safe state and next action appear instead of a misleading empty marketplace.

---

### User Story 8 - Compare Public Coffee and Authorized Offers (Priority: P2)

Users select up to three items and compare useful attributes. Authorized purchasers can compare different offers for the same Coffee using current permitted commercial values.

**Why this priority**: Comparison supports B2B product selection without creating another source of commercial authority.

**Independent Test**: Select, remove and clear public Coffee and authorized offer references, including stale selections and authorization loss.

**Acceptance Scenarios**:

1. **Given** fewer than three selections, **When** an item is marked, **Then** card state and the compare tray update with remove/clear/open actions; a fourth selection is refused with a clear localized message.
2. **Given** public comparison, **When** its URL is shared or opened anonymously, **Then** only validated public Coffee references and catalogue information are used.
3. **Given** member comparison, **When** it opens, **Then** current authorized offer projections are fetched; stale client prices, quantities or signed URLs are not trusted.
4. **Given** two offers for the same Coffee, **When** both are selected, **Then** they occupy separate comparison entries with explicit offer/seller identity.
5. **Given** sign-out, organization change or capability loss, **When** comparison resumes, **Then** prior commercial context is cleared and forbidden selections do not reveal private data.

---

### User Story 9 - Ask for Help and Follow a Ticket (Priority: P2)

A Buyer or Seller creates a support ticket, receives a reference, follows its conversation and sees Admin replies/status activity. Authorized Admin staff manage the existing support inbox.

**Why this priority**: Support is the next step for problems that the commerce flow cannot safely resolve automatically.

**Independent Test**: Create a ticket, reply as Admin and member, change status, resolve/reopen it, and attempt cross-tenant/reference spoofing using existing support records.

**Acceptance Scenarios**:

1. **Given** an authorized organization member, **When** a category, subject and message are submitted, **Then** one ticket and first message are created together with a collision-safe random HC reference and visible OPEN state.
2. **Given** an existing historical HLP reference, **When** its authorized user opens it, **Then** its original reference and conversation remain valid.
3. **Given** another organization's reference, **When** an unauthorized caller opens or replies to it, **Then** access is denied without exposing that organization's ticket data.
4. **Given** an authorized Admin replies, **When** the member revisits, **Then** the reply and appropriate activity/notification are visible with server-derived staff identity.
5. **Given** WAITING_FOR_CUSTOMER or RESOLVED, **When** the member replies, **Then** the existing reopening behavior produces IN_PROGRESS with accurate history.
6. **Given** CLOSED, **When** a member attempts a reply, **Then** it is refused and a follow-up ticket is offered; authorized Admin reopening is explicit.
7. **Given** create/reply/status retries, **When** replay completes, **Then** no duplicate ticket, message, status event or notification is created.
8. **Given** help is opened from an order, **When** an order link is included, **Then** order authorization is rechecked and no proof/bank/private financial content is embedded automatically.

---

### Edge Cases

- A price/quantity or destination changes while single-line checkout is pending: reject stale/conflicting intent or show refreshed selected-line review; never silently include another line.
- Two callers select the last cart line while a third adds the same offer: serialize correctly; a genuinely new surviving pending line has a new identity and is not mistaken for the consumed line.
- An old tab refers to a removed/consumed line: recover its authorized receipt when applicable, otherwise present a stale-line result without creating another purchase.
- More than one historical V1 DRAFT already exists: use the existing latest-created/order-ID rule deterministically; do not silently merge, delete or rewrite other historical drafts.
- A checkout child is temporarily DRAFT inside its transaction: it must never commit as an abandoned pending cart or become the next cart on a failed checkout.
- A retained cart line becomes unavailable, seller capability is revoked or stock is exhausted: keep editable/removable intent with safe availability guidance; no reservation occurs through cart display or Compare.
- A member can also sell: buying remains capability-gated and the member cannot buy its own offer.
- Featured is saved repeatedly, content is unpublished, or a slug changes: preserve selection timing, hide non-public content and invalidate affected discovery deterministically.
- A published Coffee has no purchasable offers: retain public catalogue visibility; show an honest member unavailable state.
- A gallery image or related reference is absent: show an honest fallback without claiming evidence/provenance that does not exist.
- A bank read is forbidden on an expired document: respect that restriction; never fall back to the current account.
- Current-proforma linkage is missing/corrupt or a projection errors: fail safely rather than choose a convenient version.
- A generated HC reference collides: retry bounded generation; if unsuccessful, fail atomically without orphan initial messages.
- A support status/reply race occurs: serialize against actual ticket state, preserve author identity and append accurate history only for committed changes.
- Arbitrary references, forged staff flags, HTML in support messages and unsafe auth return URLs cannot create authorization or executable content.
- A tab has stale private summary/Compare state after context loss: clear it before displaying the new context.
- A fixture cleanup attempt encounters immutable history: retain it and report exact residue instead of broad deletion or false cleanup success.

## Requirements *(mandatory)*

### Functional Requirements

#### Product behavior — Unified Admin, readiness and publication

- **FR-001**: The system MUST provide one cohesive Coffee create/edit experience containing identity, English/Arabic content, taxonomy, media, inventory-backed offer, USD/kg price, quantity, Featured, readiness, preview and review/publication.
- **FR-002**: The experience MUST preserve separate Coffee, translation, media, lot, inventory-position and offer identities; Coffee MUST NOT acquire executable price or physical stock fields.
- **FR-003**: The first confirmed identity save MUST create exactly one Coffee DRAFT. Each completed later step MUST save only its own normalized record(s); reopening that Coffee MUST restore its current records, explicitly selected offer and remaining readiness work when a translation, image or offer step fails.
- **FR-004**: Coffee and offer creation MUST be retry-safe: the same creation intent/payload MUST resolve to the same record; uncertain saves MUST remain recoverable without automatic duplicate creation.
- **FR-005**: The system MUST detect conflicting edits and changed-payload reuse rather than silently overwrite another operator's work or reinterpret an existing creation intent.
- **FR-006**: Operators MUST select real eligible backing inventory; owner, Coffee/lot, warehouse/location and quantity context MUST be verified from authoritative records, not accepted as invented client stock.
- **FR-007**: Missing eligible inventory MUST preserve catalogue work and explain the required Warehouse handoff; Feature 018 MUST NOT create physical stock through this flow.
- **FR-008**: Readiness MUST separately show catalogue, translation, media, inventory, offer, Compliance, publication and purchasability, based on current records rather than one misleading Published indicator.
- **FR-009**: The system MUST preserve DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED offer progression and existing review/publication authority; operators lacking authority MUST receive a visible handoff rather than a bypass.
- **FR-010**: The final review MUST offer explicit catalogue-only publication and coordinated publication of complete catalogue plus an APPROVED eligible offer; coordinated publication MUST not expose a partially completed result.
- **FR-011**: New Coffee publication MUST require English content and Arabic name/description, an active selected origin and a usable primary catalogue image; saved drafts MAY remain incomplete. Existing published English-only content MUST retain the defined fallback rather than be retroactively withdrawn.
- **FR-012**: Editing MUST explicitly identify the selected offer when several belong to one Coffee; preview MUST distinguish public content from authorized purchase content and MUST NOT masquerade as anonymous access to a draft.

#### Product behavior — Featured and public discovery

- **FR-013**: Featured MUST be a persistent catalogue Coffee selection represented by nullable featured_at: non-null means selected; executable commercial availability MUST remain a separate concern.
- **FR-014**: First enabling Featured MUST establish its ordering time; saving an already enabled selection MUST preserve that time, and Unfeature MUST clear it.
- **FR-015**: Featured discovery MUST include only appropriately PUBLISHED catalogue coffees, ordered by featured_at descending with a stable unique tie-breaker. Unpublication MUST retain editorial selection while hiding it publicly; republishing MUST restore eligibility at the original Featured order; DRAFT/ARCHIVED MUST never appear publicly. Each committed Featured/publication/translation/media change MUST invalidate affected public discovery safely.
- **FR-016**: Recently Added MUST show appropriately PUBLISHED catalogue coffees by creation time descending with a stable unique tie-breaker; republishing MUST NOT manufacture a new creation time.
- **FR-017**: Each homepage section MUST contain at most six dynamic cards, without hard-coded Coffee IDs, and MUST link cards to Coffee detail with View all coffees/View marketplace handoffs as appropriate.
- **FR-018**: A Coffee MAY appear in both homepage sections; Featured MUST be omitted when empty rather than replaced with arbitrary coffees, and empty Recently Added MUST provide honest discovery guidance.
- **FR-019**: Anonymous visitors MUST be able to browse, search and open all appropriately PUBLISHED catalogue coffees and public Compare using only public catalogue content/media.
- **FR-020**: Public purchase CTAs MUST say Sign in to purchase and preserve a safe same-origin product return intent through existing authentication/MFA/organization/KYB gates without automatically adding, reserving or purchasing.

#### Product behavior — Product details and marketplace

- **FR-021**: Public Coffee detail MUST present a gallery, localized name, origin, real taxonomy/process/variety, description, permitted provenance/content and Featured state without unsupported attribute claims.
- **FR-022**: Detail MUST show at most three related published coffees chosen deterministically from shared origin/type context; the current Coffee MUST be excluded and an empty related set MUST not be fabricated.
- **FR-023**: Authorized purchaser detail MUST additionally show eligible offers with permitted Hills/seller identity, USD/kg, available quantity, quantity selection, Add to cart, Add to compare and safe eligibility reasons.
- **FR-024**: Multiple offers for one Coffee MUST require explicit offer selection; adding one offer MUST not silently select a different seller or price.
- **FR-025**: `/dashboard/coffee` MUST remain the member commercial marketplace; cards MUST expose useful imagery, localized Coffee/origin, seller, price, available quantity, status and detail/Add/Compare actions without oversized media hiding the actions.
- **FR-026**: Marketplace search MUST support permitted localized Coffee names and relevant existing attributes as well as appropriate offer title search, with bounded results and explicit no-results/error states.
- **FR-027**: SOLD_OUT and existing buyer-offer eligibility MUST remain authoritative; legitimate offers MUST NOT become ineligible solely because their Coffee is not publicly published.
- **FR-028**: Missing imagery, absent offers, query failures and purchase-capability denial MUST produce distinct safe presentation and next actions; private offer media MUST not be made public to improve cards.

#### Product behavior — Add, cart, navigation and badge

- **FR-029**: Authorized purchase Add MUST confirm only committed success with a toast, accessible inline confirmation and View cart; copy MUST include EN “Added to cart”/“View cart” and AR “تمت الإضافة إلى السلة”/“عرض السلة”.
- **FR-030**: Add MUST preserve a stable intent across duplicate submission/uncertain outcomes, retain quantity/error state on failure, and avoid a success/count claim before authoritative success.
- **FR-031**: A deliberate new Add for the same offer MUST preserve existing quantity-merge behavior; retry of that same intent MUST NOT merge quantity twice.
- **FR-032**: Each pending cart line MUST show image, localized Coffee name, selected offer/seller, USD/kg, quantity, line estimate, availability, update/remove, View details and Checkout this item.
- **FR-033**: Cart presentation MUST distinguish pending intent/estimates from reservation and final financial snapshots; unavailable retained lines MUST remain removable/editable with safe guidance.
- **FR-034**: Cart navigation MUST use the authoritative count of distinct pending offer lines, including retained unavailable lines, across public/member headers, member sidebar and mobile; zero lines MUST show the icon without a numeric badge.
- **FR-035**: Confirmed add/remove/line-creation/line-removal and partial checkout MUST refresh the shared summary; quantity-only merge/update MUST NOT change line count unless a line is created or removed.
- **FR-036**: Sign-in/session restore, sign-out and organization changes MUST clear obsolete context and reread the correct summary; cross-tab/focus invalidation MUST reread authoritative state rather than accept another tab's count.
- **FR-037**: Stale in-flight summary results MUST not overwrite a newer resolved context, and unavailable/loading summary MUST not be presented as a verified empty cart.
- **FR-038**: Request-an-offer navbar prominence MUST be replaced with capability-aware Cart/purchase-onboarding control without deleting the existing contact/RFQ workflow; Admin console MUST receive no purchasing cart, and the member Hills logo MUST navigate to `/`.

#### Product behavior — Single-offer checkout and recovery

- **FR-039**: Every fresh checkout transaction MUST contain exactly one selected cart offer line; Checkout all and implicit combined-offer/seller checkout MUST not exist or remain available through an alternate entry.
- **FR-040**: Checkout MUST use the approved atomic single-line split: after fresh authorization and canonical-cart resolution, it locks the source cart before its selected line, validates the exact source-line/offer/quantity/destination binding, creates exactly one dedicated child order containing exactly one copied item, completes established Feature 015 checkout for that child, persists the receipt and consumes the source line in one transaction. The organization-owned BANK_TRANSFER_V1 DRAFT remains the pending cart.
- **FR-041**: Successful selected-line checkout MUST create/use only that transaction's reservation, destination snapshot, proforma, amount, bank reference, payment, proof, Finance decision and invoice/ownership/fulfillment lifecycle, leaving unrelated lines unchanged.
- **FR-042**: Selected-line estimates MUST exclude unrelated cart lines from every price, shipping, tax, commission and qualification calculation and MUST use the established approved financial rules.
- **FR-043**: Checkout review MUST show the selected line, authorized destination, authoritative estimate and existing configuration/eligibility requirements; the primary action MUST be Reserve this item and view proforma.
- **FR-044**: Source-line consumption MUST occur only after child checkout has produced its complete result and receipt inside that same transaction. Any failure in split/checkout/receipt/source consumption MUST roll back the dedicated order, reservation, financial artifacts, receipt and removal so that the original cart is recoverable without a stranded child DRAFT.
- **FR-045**: Exact-once/recovery MUST use the protected cart_line_checkout_receipts concept binding the existing unique source order-item identity and source cart, buyer organization, offer, quantity, destination, request/payload, dedicated order/item identity, source-line snapshot and committed result. The receipt MUST retain that binding after source-line deletion.
- **FR-046**: Same intent plus same payload MUST resolve the same committed transaction after fresh authorization; changed bound payload MUST fail closed as conflict with no new purchase.
- **FR-047**: Double-click or concurrent attempts to consume the same source line MUST commit at most one transaction; a matching later request MUST recover that transaction, and a conflicting one MUST not create a substitute.
- **FR-048**: An unknown checkout response MUST remain recoverable by its authorized intent/source-line binding even after the source line has been removed; recovery MUST not depend on the line remaining in the cart.
- **FR-049**: Committed checkout followed by redirect/render failure MUST offer Open your order for the existing order; the system MUST never reconstruct that committed transaction as pending cart or create another checkout for recovery.
- **FR-050**: Concurrent add/update/remove/checkout MUST first resolve the canonical cart under the existing organization advisory lock, then lock the cart before a selected line, validate actual state and produce a valid serialized result or safe stale/conflict/recovery failure. Checkout MUST retain the established downstream offer-before-position lock compatibility; it MUST not substitute a different line after a stale/missing/consumed selection.
- **FR-051**: Re-adding an offer after its earlier line was checked out MUST create a new pending line identity and new deliberate purchase intent; it MUST not modify or replay the earlier committed order.
- **FR-052**: The existing checkout_bank_transfer_v1 entry point MUST accept the newly created fresh one-line dedicated order and preserve authorized replay of already committed historical orders. After Feature 018 it MUST fail closed for any fresh DRAFT with more than one line, through old entry points as well as the new UI; it MUST not reinterpret, reject or alter committed historical multi-line orders, their legitimate replay, Finance processing or fulfillment.

#### Product behavior — Explicit empty source-cart lifecycle

- **FR-053**: After a non-final line checkout, the source cart MUST retain the same order identity, BANK_TRANSFER_V1 flow and DRAFT status with all unrelated pending lines/quantities unchanged.
- **FR-054**: After final-line checkout, the source cart MUST retain the same identity, BANK_TRANSFER_V1 flow and DRAFT status with zero items; it MUST NOT be deleted, archived, expired or transitioned to HOLD because the dedicated order committed.
- **FR-055**: The empty source cart MUST have no reservation, payment, current proforma, destination snapshot or inherited financial artifacts from the dedicated transaction; readCart MUST report that identity with zero lines and a zero distinct-line count.
- **FR-056**: The next deliberate Add MUST reuse that existing canonical DRAFT under the existing deterministic latest-created/order-ID resolution instead of creating a replacement merely because it is empty.
- **FR-057**: Reading an absent/empty cart MUST not create a cart. A new pending DRAFT MAY be created only when no eligible canonical DRAFT exists and an authorized creation/add operation requires one.
- **FR-058**: Repeated final-line checkout/add cycles and concurrent first additions MUST not accumulate replacement empty DRAFT carts. A successful checkout child MUST leave DRAFT before commit; a failed child MUST not survive. Historic multiple DRAFTs remain selected by the existing latest `(created_at, id)` rule and are never silently consolidated.
- **FR-059**: Concurrent final checkout and Add MUST either retain the new/remaining line in the original source cart or add to that same cart after consumption, according to serialization; retries MUST neither lose intent nor duplicate cart creation.
- **FR-060**: Existing multiple historical DRAFTs MUST retain the deterministic latest-created/order-ID selection; Feature 018 MUST not automatically merge/delete them or silently consume lines from a non-selected cart. Stale cart selection MUST be recoverable or refused.

#### Product behavior — Bank, documents and buyer states

- **FR-061**: Existing payment-account management MUST expose account name/holder, bank, account number/IBAN, SWIFT, USD, active/default state and safe list masking without a duplicate account model.
- **FR-062**: The existing default USD selection mechanism MUST be usable with its existing Platform Admin/MFA permission, while account CRUD retains its existing Super Admin boundary; Finance MUST not gain configuration permissions.
- **FR-063**: Future issuance MUST use the valid active USD default, while all already-issued bank snapshots/references MUST remain immutable when configuration changes; missing/invalid configuration MUST fail checkout safely.
- **FR-064**: Buyer proforma resolution MUST follow current_proforma_id and verify its exact order/ownership linkage; highest-version selection MUST not substitute for the authoritative pointer.
- **FR-065**: Document reads MUST classify auth/permission/not-found, expiry, configuration, projection/query, connectivity and persisted-integrity failures; they MUST not swallow errors into false absence or an empty document.
- **FR-066**: Active HOLD presentation MUST show the permitted frozen amount/reference/bank instructions, actual reservation deadline and proof next action; it MUST not read a current account as historical fallback.
- **FR-067**: Proof-submitted/review presentation MUST show received/review state and Get help without implying a new transfer, duplicate proof or an invented persisted status.
- **FR-068**: PAYMENT_REJECTED MUST be presented as terminal with a safe reason/support action; PAID, fulfillment and COMPLETED MUST expose existing invoice/progress outcomes without inventing downloadable PDFs.
- **FR-069**: EXPIRED, CANCELLED, VOID and DISPUTED MUST display their actual permitted next actions; expired bank access MUST not be broadened and late-transfer/reconciliation MUST follow existing authorized behavior.
- **FR-070**: New proforma issuance MUST capture immutable nullable Arabic product/origin names; subsequent translation changes MUST not rewrite them, and historical rows MUST use frozen English fallback without backfill from current content. Custom offer titles, identifiers and account values MUST remain exactly as issued and MUST NOT be synthesized or translated from current Coffee content.

#### Product behavior — Compare

- **FR-071**: Compare MUST support at most three selections with explicit card state, remove, clear, open and localized limit feedback, including separate offers for the same Coffee.
- **FR-072**: Public `/coffee/compare` MUST compare only validated published Coffee references and public attributes; safe public URLs MAY carry at most three Coffee slugs, never commercial share data.
- **FR-073**: Member `/dashboard/compare` MUST resolve current permitted offer data on opening, including seller, USD/kg, available quantity and availability; unavailable selections MUST be identified rather than replaced silently.
- **FR-074**: Public Compare selection MUST contain only published Coffee references; member commercial selection MUST contain only offer references within the current client/session context. No Compare database table or persisted trusted private prices, stock, signed URLs or economics is permitted.
- **FR-075**: Commercial Compare context MUST clear on sign-out, organization change or capability loss; comparison views/trays MUST work on mobile and with keyboard without exposing prior private context.
- **FR-076**: Public/member Compare MUST present useful real imagery, Coffee, origin, variety, process and type attributes; grade/other private lot attributes MUST appear only where existing authorized projection permits them, never through the public comparison.

#### Product behavior — Help Center

- **FR-077**: Help Center MUST extend Feature 014 support_tickets/support_messages and existing Admin operations/audit/notifications; it MUST NOT create a parallel support system.
- **FR-078**: Members MUST have `/dashboard/help`, `/dashboard/help/new` and `/dashboard/help/[ticketRef]` for recent activity, category, subject/details, reference/status, conversation, reply and resolved/closed presentation.
- **FR-079**: Authorized Admin MUST have `/dashboard-admin/support` and `/dashboard-admin/support/[ticketRef]` with reference/subject search, status/category/priority filtering, safe member/organization context, replies, status controls and history.
- **FR-080**: New ticket references MUST be server-generated `HC-` plus 16 random uppercase hexadecimal characters, collision-safe and non-sequential; historical HLP references MUST remain immutable and resolvable.
- **FR-081**: Ticket creation and its first message MUST succeed/fail together; category MUST use General, Catalogue, Cart/Checkout, Payment, Order/Fulfillment or Account/Membership with stable localized labels and General fallback for historical rows.
- **FR-082**: Existing persisted statuses MUST remain OPEN, IN_PROGRESS, WAITING_FOR_CUSTOMER, RESOLVED and CLOSED; member WAITING_FOR_CUSTOMER copy MUST say Waiting for your reply rather than introduce an alternate status.
- **FR-083**: Admin status transitions MUST be restricted to OPEN → IN_PROGRESS/WAITING_FOR_CUSTOMER/RESOLVED/CLOSED; IN_PROGRESS → WAITING_FOR_CUSTOMER/RESOLVED/CLOSED; WAITING_FOR_CUSTOMER → IN_PROGRESS/RESOLVED/CLOSED; RESOLVED → IN_PROGRESS/CLOSED; CLOSED → explicit Admin IN_PROGRESS reopening.
- **FR-084**: Member reply to WAITING_FOR_CUSTOMER/RESOLVED MUST preserve existing IN_PROGRESS reopening behavior; CLOSED MUST be read-only to members with a follow-up-ticket action.
- **FR-085**: Ticket creation, replies and status changes MUST be retry-safe and preserve append-only message/status activity and server-derived requester/author/staff/audit identity.
- **FR-086**: Optional order context MUST be independently authorized; member ticket reads/replies MUST require current authenticated organization membership and current application organization scope, while staff access MUST require existing Platform Admin authority. Ticket reference/raw ID alone MUST never authorize access, and support MUST not automatically include proofs, bank secrets or private financial payloads.
- **FR-087**: Existing transactional in-app notifications MUST support ticket receipt, staff reply and status change with localized safe copy, authorized recipients, no duplicate replay and no self-notification; free-text message bodies MUST not enter notification payloads.
- **FR-088**: Existing member/Admin messages links MUST remain authorized compatibility redirects to the corresponding preserved ticket reference; no ticket history MUST be lost in the Help Center route change.

#### UX behavior — Localization, visual continuity and next actions

- **FR-089**: Every new/changed public, member and Admin surface MUST include complete EN/AR labels, statuses, copy, errors, empty/loading states, notifications, toasts and accessibility names with genuine RTL/LTR layout.
- **FR-090**: Historical missing Arabic content MUST use clearly identified English fallback with correct language/direction; user-authored support content MUST retain its original language rather than be silently translated.
- **FR-091**: Coffee/product/cards/cart/Compare/help MUST preserve Hills forest-green/cream identity, restrained gold/orange accents and existing typography while modernizing hierarchy, gallery and quantity/actions; no rebrand or new animation framework is allowed.
- **FR-092**: New/changed surfaces MUST provide meaningful skeleton/loading, empty, unavailable and error states, hover/press feedback and useful sticky actions without hiding essential actions, forcing motion or causing page-wide horizontal overflow.
- **FR-093**: Gallery, quantities, tray, drawers/dialogs and forms MUST support keyboard operation, visible focus, accessible labels/errors, appropriate announcement and focus restoration/dismissal; reduced motion MUST preserve equivalent task completion.
- **FR-094**: Every buyer state MUST expose its next permitted action according to the Buyer State/Next Action contract below, including a support path for unresolved problems and no invitation to bypass authorization or replay terminal payment workflows.

### Security Guarantees

- **SEC-001**: Anonymous delivered content, search, previews, related-item reads, homepage sections, public Compare/URLs, RSC payloads, HTML, structured metadata/JSON-LD and shared caches MUST exclude executable/commercial prices, stock, member offers, seller economics, cart/bank/payment/proof and private inventory information.
- **SEC-002**: Purchase actions MUST independently enforce authentication, current organization membership/status, KYB/buying capability, blocked-user state, applicable MFA and actual business state before mutation or replay. Sellers MAY buy only with can_buy and MUST NOT buy their own offers.
- **SEC-003**: UI visibility, selected IDs, ticket references and client state MUST never substitute for server/database authorization. RLS MUST remain enforced without broad relaxation or browser privileged credentials.
- **SEC-004**: Buyer offer projections MUST exclude backing position/location/internal inventory identity and seller economics. Seller views MUST not gain buyer proof or buyer-private financial access.
- **SEC-005**: Checkout receipt creation MUST be protected from direct application writes. Recovery MUST verify actor/request binding and current buyer-organization authority before returning any transaction or result; another organization MUST not recover it by knowing its IDs.
- **SEC-006**: Support ticket/message/history access MUST follow authorized organization membership and the current application organization scope; users without membership MUST not access another organization's tickets through direct queries, references or replies.
- **SEC-007**: Support Admin access MUST use existing Platform Admin authority/MFA rather than all operational roles; author/staff identity MUST be resolved server-side and forged fields ignored/refused.
- **SEC-008**: Sensitive document/bank/proof reads MUST preserve existing role/MFA/RLS boundaries; unavailable bank snapshots MUST not be replaced with globally accessible bank configuration.
- **SEC-009**: Private commerce, cart, support and commercial Compare data MUST not enter public/shared caches. Context change MUST invalidate prior private state before rendering another session/organization.
- **SEC-010**: Auth return intent MUST reject external/protocol-relative/unsafe destinations, and untrusted message/content/error strings MUST render safely without executable markup or private diagnostic leakage.
- **SEC-011**: New support notifications/audit metadata MUST not expose free-text messages, private bank identifiers, proof paths or another tenant's information; notifications MUST resolve linked tickets through current authorization.
- **SEC-012**: Stripe/provider execution retirement, absent deployed provider functions/secrets and Feature 017 application-role denials MUST remain intact throughout verification and any recovery.

### Data Integrity Guarantees

- **DI-001**: Selected-line checkout is one atomic transaction from dedicated-order creation through financial/reservation creation, receipt and source-line consumption; no intermediate success may survive failure.
- **DI-002**: A source line may produce at most one committed checkout receipt/order. Replay binds exact offer/quantity/destination/cart/organization/request semantics and MUST fail closed when persisted receipt/result integrity does not match.
- **DI-003**: Financial totals, shipping membership and snapshots MUST describe exactly the dedicated order's one item; client estimates or another line's values MUST not supply authoritative financial data.
- **DI-004**: Existing inventory/title conservation, null-safe position handling and offer-before-position locking compatibility MUST be preserved under checkout, Finance confirm/reject and concurrent operations.
- **DI-005**: CONFIRM MUST preserve exact-once invoice, ownership events, buyer positions/storage allocations and Feature 009 fulfillment membership; REJECT MUST release exactly once and create no confirm-only artifacts.
- **DI-006**: Existing terminal replay MUST continue validating exact authoritative review/proof, invoice, ownership and shipment contents, and corruption/opposite/extra decisions MUST fail closed.
- **DI-007**: Issued English/Arabic/bank/destination/financial snapshots, historical ticket references, ownership and audit history MUST remain immutable according to existing domain rules; current content MUST not rewrite history.
- **DI-008**: Pending cart Add/update/remove do not reserve inventory. Retaining an empty DRAFT MUST not add financial artifacts or permit it to inherit the dedicated order's state.
- **DI-009**: Support ticket plus initial message, reply identity, status history and transactional notification effects MUST be accurate and retry-safe; collision failure MUST not leave partial ticket creation.
- **DI-010**: Published/Featured results MUST reflect committed editorial state, with deterministic bounded ordering and cache invalidation after relevant content/media/translation/publication changes.

### Non-Functional Requirements

- **NFR-001 (Atomicity/idempotency)**: All acceptance cases involving retries, duplicate submissions, unknown outcomes and injected transaction failures MUST produce zero duplicate committed purchases or partial financial outcomes.
- **NFR-002 (Concurrency)**: Verification MUST cover same-line and different-line checkout, add/update/remove races, final-line races, same backing position and null-location competition; each committed result MUST match a valid serialized outcome without lost lines or overselling.
- **NFR-003 (Authorization)**: Negative tests MUST exercise anonymous, non-member, wrong-organization, blocked-user, unsatisfied-MFA, capability-denied and unauthorized operational roles, including direct read/mutation/replay attempts.
- **NFR-004 (Privacy)**: Public cache/session-switch and comparison tests MUST inspect delivered representations, not only visible text; no prohibited commercial/private values may be delivered to an unauthorized caller.
- **NFR-005 (Performance)**: On representative mobile/desktop verification conditions recorded with results, changed public discovery pages MUST target LCP ≤ 2.5 seconds, interaction delay ≤ 200 milliseconds and layout shift ≤ 0.1 at the 75th percentile; measurements MUST distinguish lab evidence from observed field percentiles.
- **NFR-006 (Bounded work)**: Homepage sections MUST remain capped at six, related items at three and Compare at three; marketplace/support results MUST use bounded pagination rather than download every record.
- **NFR-007 (Responsive)**: New/changed surfaces MUST remain usable at 360px mobile, 768px tablet and 1280px desktop widths in EN/AR without page-wide horizontal overflow; intentional comparison/document scrolling MUST be contained and accessible.
- **NFR-008 (Accessibility)**: New/changed journeys MUST meet WCAG 2.2 AA expectations for keyboard, contrast, labels, errors, focus and target sizing, verified with automated checks plus manual keyboard/assistive-technology review of critical actions.
- **NFR-009 (Motion)**: Reduced-motion preference MUST remove nonessential reveal/transition movement without losing content, state feedback, focus or purchase/support actions; no competing animation owner or added framework is permitted.
- **NFR-010 (Localization)**: EN/AR parity MUST cover all changed user-facing strings and accessible names, including administrative and notification surfaces; references/account identifiers MUST remain legible LTR within RTL content.
- **NFR-011 (Auditability)**: Creation/publication, bank changes, selected checkout, receipt/recovery and support operations MUST preserve server actor, entity, outcome and existing correlation/history semantics; message audit MUST record safe metadata instead of duplicate bodies.
- **NFR-012 (Fixture isolation)**: Test resources MUST have exact run/provenance ownership and cleanup manifests; no title/slug/publication-state prefix filtering or broad delete may substitute for isolation. Cleanup MAY remove only proven manifest-owned disposable resources, MUST retain curated/demo content and immutable history, and MUST accurately report retained residue/failure.
- **NFR-013 (Verification boundary)**: Specification completion MUST NOT claim product/live verification. Future remote verification requires explicit approval and consistent PostgreSQL/HTTP/Auth/REST/Storage target identity; local fixture mode MUST not silently substitute another approved remote target.
- **NFR-014 (Infrastructure)**: Feature 018 MUST preserve the existing infrastructure/cache boundary and avoid a separate cache service, support-delivery framework or animation dependency solely for this scope.

### Owner UX Quality Requirements

- **UX-001 (Premium Hills quality)**: Every new or materially changed Feature 018 surface MUST feel intentionally designed and premium through composition, spacing, hierarchy, typography, depth, interaction, responsive composition and complete loading/empty/error/success states. Preserve the Hills identity and palette; this is not a visual rebrand or permission for generic dashboard/card/form styling.
- **UX-002 (Public motion)**: Homepage, Recently Added, Featured Coffees, Coffee cards, Product Detail, Marketplace, Cart and Compare MUST receive deliberate motion design during their owning Phase B work. Homepage motion is the strongest treatment in this feature. Reuse installed Motion/GSAP/project primitives and use the installed `motion-design` skill during implementation; add no animation framework. Mobile receives intentional touch-appropriate variants, not a disabled experience. Respect reduced motion without losing task completion.
- **UX-003 (Operational motion)**: Admin, checkout, bank, proforma and Help MUST use restrained functional motion that improves feedback and state comprehension without distracting operational work.
- **UX-004 (Responsive composition)**: Each changed surface MUST be intentionally designed and verified at 360px, 768px and 1280px. Cards, navigation, drawers, forms, stepper, tables/lists, galleries, sticky actions, cart, Compare, product detail, Help and Admin MUST avoid clipping, page-wide overflow and inaccessible actions; mobile is not a scaled desktop layout.
- **UX-005 (Bilingual directionality)**: Every changed user-facing surface MUST support English/Arabic and LTR/RTL. Layout, icons/chevrons, alignment, form fields, numbers/prices, identifiers, tables, dialogs, toasts, loading and validation/error states must remain correct. Identifiers and technical references require readable directional isolation.
- **UX-006 (Light and dark modes)**: Every changed/new user-facing surface MUST use the existing project theme mechanism/tokens in both light and dark modes. Contrast, borders, surfaces, text, overlays, dialogs, dropdowns, inputs, skeletons/indicators, focus states and toasts must remain usable and Hills-consistent. No Feature 018 component may hard-code a light-only color or introduce a second theme system.
- **UX-007 (Mutation feedback)**: Relevant Add/update/remove/checkout/Compare, Admin save/publish/Featured, bank/default and Help create/reply/status actions MUST use the existing toast system with localized EN/AR success and error feedback. Field validation remains inline and accessibly associated; unexpected failure preserves recoverable input, provides a useful retry/next action and does not create duplicate retry/render toast spam.
- **UX-008 (Async states)**: Every changed async surface MUST provide intentional localized, theme-aware loading/progress/skeleton, empty, classified error, retry and success states. Generic “Something went wrong” is unacceptable where a classified actionable state is available.
- **UX-009 (Phase ownership)**: Phase A applies these requirements to Admin/bank where applicable. Phase B owns the strongest public/mobile motion and member-experience quality. Phase C verifies cross-journey RTL/LTR, light/dark, mobile, accessibility, reduced motion, motion polish and regressions; it does not allow an owning phase to defer quality work.

### Compatibility Requirements

- **COMP-001**: BANK_TRANSFER_V1 remains the only active payment flow; Feature 017-retired provider runtime MUST not be restored by UI, verification, rollback or compatibility helpers.
- **COMP-002**: Features 013/015 quote, snapshot, payment-proof and reservation semantics MUST be reused for the dedicated order rather than duplicated or replaced by client logic.
- **COMP-003**: Historical committed multi-line orders, snapshots, seller projections, Finance replay and Feature 009 multi-group fulfillment MUST remain valid; rejecting fresh combined checkout MUST not invalidate history.
- **COMP-004**: Existing offer review/SOLD_OUT guards, seller resale provenance, stock holds/variances and authorized purchase eligibility MUST remain intact; Coffee public publication MUST not become a new global offer-eligibility condition.
- **COMP-005**: Feature 016 confirmed V1 proforma remains CONFIRMED under its actual contract; presentation MUST not introduce a required PAID proforma mutation or an invented Finance intermediate transition.
- **COMP-006**: Feature 014 support records/statuses/reference history and existing authorized message URLs MUST remain usable after the Help Center expansion.
- **COMP-007**: Existing bank CRUD/default-selection permissions and issued bank snapshots MUST be preserved; no automatic Finance management grant or buyer expired-snapshot grant is permitted.
- **COMP-008**: Fixture cleanup MUST not delete historical financial, ownership, fulfillment, proof or audit records. Test/display isolation MUST not hide legitimate records based on fixture-looking titles or unpublished Coffee alone.
- **COMP-009**: Future forward/rollback/reapply verification MUST preserve current historical migrations and Feature-017-aware ACL expectations; recovery MUST restore the expected safe applied state or explicitly report failed recovery, not falsely report completion.

### Buyer State / Next Action Contract

| Actual state/context | Required next action/presentation |
| --- | --- |
| Anonymous | Sign in to purchase; safe return to selected product |
| Unsatisfied MFA | Complete verification |
| Missing/ambiguous organization | Create/select organization through existing path |
| Missing KYB/buying capability | Complete membership requirements; no Add/checkout |
| Eligible selected offer | Set quantity and Add to cart |
| Pending DRAFT cart line | Checkout this item, update/remove, View details |
| Missing destination | Add/select an authorized destination |
| Checkout failed before commit | Retry selected item or edit cart; retained inputs |
| Checkout result uncertain | Check checkout result; no new purchase intent |
| Committed order with failed navigation/render | Open your order |
| HOLD with valid ACTIVE reservation | Frozen bank instructions, deadline and upload proof |
| PAYMENT_PROOF_SUBMITTED / PAYMENT_UNDER_REVIEW where actually persisted | Proof received/review status, Get help; REVIEW_HOLD is reservation state, not invented order status |
| PAYMENT_REJECTED | Terminal rejection, permitted safe explanation and Get help; no resubmit |
| PAID | View invoice and fulfillment |
| FULFILLMENT_IN_PROGRESS / PARTIALLY_DELIVERED | Track existing fulfillment/progress |
| COMPLETED | View completed order/invoice |
| EXPIRED | Browse current eligible offers; existing authorized late-transfer/support path |
| CANCELLED / VOID / DISPUTED | Actual status and permitted support/dispute path; no new reservation or transfer prompt |

### Empty-Cart Contract Decision and Repository Evidence

**Decision**: Keep and reuse the source DRAFT, including after the last line checks out. Do not create another pending cart just because the current one is empty. The dedicated order ALWAYS differs from the pending cart, including when checking out its final line.

Repository-derived basis (read-only inspection on 2026-10-04):

- `readCart` chooses the latest BANK_TRANSFER_V1 DRAFT by `created_at DESC, id DESC`; an existing order with no items is returned as `{ orderId, lines: [] }`. Reads do not create orders.
- `commerce_resolve_cart` serializes resolution using an organization advisory lock, applies that same ordering without an item-count condition and inserts a DRAFT only when none exists.
- The current `add_cart_line` reauthorizes before request replay, resolves that DRAFT, locks its parent and merges by `(order_id, offer_id)`; it does not reserve stock.
- Existing DRAFT item removal permits deletion without requiring another remaining item; non-DRAFT mutation is refused. Empty DRAFT creation is already an intentional normal state.
- Inspected V1 order state/flow constraints do not require a DRAFT to contain a line; checkout itself requires items. No one-DRAFT uniqueness invariant was found that would require retiring the source on final consumption.
- The checkout child is created and leaves DRAFT inside one atomic transaction, so it is neither a committed replacement cart on success nor a surviving DRAFT on failure.

This establishes the preferred lifecycle against current repository contracts without claiming a new remote schema inspection. Implementation planning must verify actual installed definitions/constraints before SQL changes; unexpected drift is a verification blocker, not permission to change this product contract silently.

### Key Entities *(include if feature involves data)*

- **Catalogue Coffee / translations**: Public identity, content, taxonomy/media relations and editorial Featured time; distinct from executable pricing and stock.
- **Lot / inventory position**: Authoritative physical backing and custody context; no invented stock and no buyer exposure of internal position/location identifiers.
- **Coffee offer**: Selected Hills/member seller, executable USD/kg price, quantity, backing provenance and established review/publication state.
- **Pending organization cart / line**: Existing BANK_TRANSFER_V1 DRAFT and its merged offer intents; reusable when empty and not reserved merely by Add.
- **Dedicated transaction order**: One selected offer line, its own destination/reservation/financial/payment lifecycle and existing buyer/seller views.
- **Checkout receipt**: Protected immutable source-intent-to-order binding for exact-once consumption, conflict detection and authorized recovery, retained after source-line removal.
- **Proforma / immutable snapshots**: Exact current order document, frozen English/nullable Arabic content, destination, bank reference and financial values; not today's catalogue/configuration.
- **Payment / proof / authoritative Finance review**: Existing private bank-transfer states and confirm/reject decision; seller proof access remains forbidden.
- **Invoice / ownership / allocations / fulfillment**: Existing settlement-confirmed title and Feature 009 delivery handoff, exact-once and historically preserved.
- **Compare selection**: Up to three safe public Coffee/member offer references in session context; no new authoritative commercial store.
- **Support ticket / messages / status history**: Existing organization-bound thread with preserved statuses, category, historical HLP/new random HC reference and append-only safe activity.
- **Audit / notification**: Existing server actor/correlation records and transactional in-app updates; no private message or financial-secret payload fan-out.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In every A/B/C checkout acceptance case, the selected purchase contains one offer line and unrelated pending quantities are unchanged; zero unrelated stock is reserved or charged.
- **SC-002**: Duplicate, retry, concurrent and uncertain-response acceptance cases produce at most one purchase per consumed line and zero duplicate payment, invoice, ownership or fulfillment artifacts.
- **SC-003**: Every injected pre-commit failure preserves the complete original pending cart and leaves zero partial selected-purchase artifacts.
- **SC-004**: Twenty successive last-line checkout/new-Add cycles reuse the same pending cart identity, and concurrent first additions create at most one new canonical pending cart when none existed.
- **SC-005**: All nine user stories' acceptance scenarios complete in English and Arabic with their stated authorization and failure outcomes; implementation results are recorded separately from this specification review.
- **SC-006**: Public discovery and public comparison negative checks reveal zero commercial prices/stock, seller economics, cart, bank, proof or private financial values in delivered content.
- **SC-007**: Every confirmed cart mutation presents matching distinct-line counts across header/sidebar/mobile; cross-tab invalidation and context changes converge to a fresh authorized summary with no prior tenant state.
- **SC-008**: An operator can create and resume a complete bilingual Coffee/offer through one experience, including an injected save interruption, with zero duplicate records or manual discovery of unrelated setup screens.
- **SC-009**: Featured/recent sections never exceed six cards, related results never exceed three, Compare never exceeds three, and all unpublished/unfeatured exclusion scenarios pass deterministically.
- **SC-010**: All cross-tenant support/reference-spoofing tests deny access; valid create/reply/status retries yield one committed activity and accurate server-derived author/audit identity.
- **SC-011**: All changed journeys are usable at 360px, 768px and 1280px in both directions with no page-wide overflow, critical keyboard blocker, missing accessible action or motion-dependent task.
- **SC-012**: Performance verification reports results against the stated loading/interaction/layout budgets on documented representative conditions, with no performance claim inferred merely from a successful build.
- **SC-013**: Existing issued English/Arabic/bank snapshots and historical ticket references remain unchanged after catalogue/account updates; all closed-feature security/integrity compatibility checks pass.

## Assumptions

### Settled Owner Decisions and Defaults

- The approved revised plan and current specify request supersede earlier conversation recommendations of scattered setup screens or combined checkout. This spec does not reopen those decisions.
- One cohesive Admin experience does not confer universal Admin authority or combine Coffee, Offer and Inventory into one record.
- Public discovery remains catalogue-only; commercial information is member-only and purchase requires the full existing approved membership/capability path.
- Atomic split (Option B), protected receipts, reusable empty source DRAFT, Featured at Coffee level, six homepage cards, three related coffees and three Compare selections are explicit contracts.
- Recently Added means catalogue creation order among published records, not fabricated republishing time; Featured is an editorial choice, not proof of sellability.
- New publication readiness includes complete EN/AR content, active origin and usable primary catalogue media for the unified workflow; existing published historical content retains stated fallback.
- Support reuses existing statuses and Platform Admin authority. Category defaults to General for existing tickets; reference format for new tickets is HC plus 16 uppercase random hex characters. There is no assignment engine or attachment scope.
- The established Finance reject is terminal; the active confirmed V1 proforma remains CONFIRMED. Historical documents do not receive current translation/account backfills.
- The standard responsive, accessibility and performance targets are acceptance defaults, not claims of results already measured.

### Dependencies and Stage Boundary

- Existing authorization/MFA/org/KYB, offer/inventory, bank configuration, Features 009/013/014/015/016 and applied Feature 017 retirement are dependencies; their actual installed contracts must be checked before implementation changes.
- Current repository artifacts are authoritative for this specification's technical lifecycle decision; no Supabase inspection/mutation, migration execution or remote verification occurred during specification.
- The attachment's Arabic placeholder text is encoded using the valid Arabic success wording approved in the revised plan, not copied as question marks.
- The spec follows the local Spec Kit spec-template section order. No configured extension hooks or preset directories were found; no branch switch is required. Active-feature metadata selects this specification independently of the existing main branch.
- This stage creates specification, quality checklist and active-feature metadata only. Clarification, implementation planning, task generation, product implementation, database changes and live approval are separate stages.
- Historical support links remain authorized redirects. Public discovery routes remain `/`, `/coffee` and `/coffee/[slug]`; the approved member checkout/detail/help/Compare destinations do not create a separate Buyer or Seller portal.

### Out of Scope

- Stripe/provider restoration or new payment providers.
- Refunds, rejected-proof resubmission or financial-lifecycle redesign.
- New physical stock intake or unrestricted inventory editing.
- Promotions, FX, new MOQ/bag-size rules or additional tax jurisdictions.
- Compare database persistence or public commercial share links.
- Support attachments, private notes, assignment engine or external support messaging.
- New RFQ persistence/CRM integration; existing contact/RFQ workflow is retained.
- Destructive historical cleanup, broad RLS relaxation or seller access to buyer proof.
- Visual rebrand, added animation framework, relocated root application architecture or invented downloadable PDFs.

### Clarification Status

No unresolved clarification markers remain. Product decisions are encoded above; actual-schema drift or future verification failure must be reported during the corresponding later stage rather than silently alter this specification.
