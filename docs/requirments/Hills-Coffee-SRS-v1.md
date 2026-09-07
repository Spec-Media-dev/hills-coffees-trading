# Hills Coffee — Website, Storage & Authorized B2B Trading Platform

## Software Requirements Specification (SRS) — Developer-Readable Baseline

**Source document:** `Hills Coffee Web Storage Trading Platform SRS v1.docx`  
**Source version:** 1.0  
**Source date:** 2026-08-29  
**Source status:** Approved baseline for Sprint 0; legal, tax, warehouse, and market-data assumptions remain gated.  
**Scope:** Public SEO website + secure member application + operations/admin console.  
**Prepared for:** Hills Coffee product, design, content, engineering, compliance, finance, and warehouse teams.  
**Source baseline:** `HillsCoffee_SEO_Development_Specification.docx` and the 20-slide architecture presentation.

> **Purpose of this Markdown file**  
> This is a detailed, implementation-friendly restatement of the approved Hills Coffee SRS. It is designed for developers and coding agents to understand the full business model, user journeys, permissions, state machines, data requirements, security boundaries, operational controls, release gates, and acceptance criteria without having to parse the Word document. It does not replace legal, tax, warehouse, finance, market-data, or other approvals explicitly marked as gated by the SRS.

---

# 0. Critical Product Boundary

The trading feature is a **private, permissioned B2B marketplace** for **physical Hills-sourced green coffee inventory** held in **Hills-approved custody**.

It is **not**:

- A public securities exchange.
- A futures exchange.
- A commodities exchange.
- An anonymous marketplace.
- A leverage or margin platform.
- A short-selling platform.
- A derivatives platform.
- An investment-advice product.

The system must preserve a clear relationship between:

1. The digital record of ownership and availability.
2. The physical coffee lot in an approved warehouse.
3. The verified organization that legally owns or buys the stock.
4. The settlement state.
5. The delivery/custody state.
6. The complete audit trail.

No production trading may launch until the required legal, tax, finance, warehouse, security, market-data, and operational approvals are completed.

---

# 1. Executive Decision and Platform Scope

Hills Coffee is one connected platform with **three product surfaces** that share one product, identity, inventory, and authorization model.

| Surface | Audience | Primary outcome |
|---|---|---|
| **Public website** | Search visitors and prospects | Discover products/origins, learn, view reference prices, submit RFQ, and apply for membership. |
| **Member application** | Verified companies and approved users | Buy, hold inventory in custody, schedule delivery, list eligible stock, and buy from other approved members. |
| **Operations console** | Hills sales, compliance, warehouse, finance, and administrators | Approve members, reconcile stock, control listings, settlements, deliveries, documents, and audit activity. |

## 1.1 Product delivery principles

- The MVP is **web-first** and responsive.
- Native mobile applications are later-phase unless separately approved.
- The approved SEO architecture remains authoritative for public routes, templates, internal linking, metadata, structured data, sitemaps, robots rules, redirects, and page ownership.
- Design and content work must progress alongside engineering.
- Designers are expected to provide desktop/mobile templates and all important states.
- Content owners are expected to provide product/origin/quality information, documents, images, guides, FAQs, legal copy, email copy, and templates.
- Production trading is blocked until the transaction, custody/title, marketplace, jurisdiction, tax, and licensing model receives legal approval.

---

# 2. Goals, Non-Goals, and Go-Live Gates

## 2.1 Product goals

The platform should:

1. Convert organic B2B traffic into RFQs, purchases, and verified memberships.
2. Give customers a reliable custody position for coffee purchased from Hills.
3. Allow verified owners to resell eligible Hills-held lots to other verified Hills clients.
4. Show transparent benchmark/reference pricing with source, delay, unit, currency, and timestamp.
5. Maintain an auditable bridge between digital ownership and physical warehouse stock.

## 2.2 Explicit MVP non-goals

The MVP must not become:

- Public or anonymous trading.
- Futures trading.
- Leveraged or margin trading.
- Short selling.
- Derivatives trading.
- Investment advice.
- Trading of third-party/off-platform stock without validated chain of custody.
- A system that claims a universal live price for specialty coffee.
- An unapproved replacement for ERP, WMS, bank, or legal records.

## 2.3 Production go-live gates

Production trading requires all of the following before launch:

- Legal approval.
- Approved KYB policy.
- Signed member terms.
- Signed marketplace terms.
- Signed storage/custody terms.
- Warehouse reconciliation.
- Finance approval.
- Tax approval.
- Market-data licence/redistribution approval.
- Security review.
- Backup/restore test.
- End-to-end acceptance test.

If any required gate remains unresolved, production trading remains blocked.

---

# 3. Roles and Authorization

Authorization is organization-based first, then user-based inside the organization.

## 3.1 Business roles

| Role | Permissions | Restrictions |
|---|---|---|
| **Visitor** | Browse public pages, reference prices, RFQ, and membership application. | No private inventory or trading. |
| **Applicant** | Upload company/legal documents and track application. | No trading until approved. |
| **Authorized buyer** | Buy from Hills or approved listings; schedule delivery. | Organization and user permissions must be active. |
| **Authorized seller** | List eligible owned inventory held in custody. | Cannot list reserved, delivered, blocked, or unverified stock. |
| **Compliance officer** | Review KYB, documents, screening, approvals, and suspensions. | Sensitive actions logged; dual approval where configured. |
| **Warehouse operator** | Receive, allocate, reserve, release, reconcile, and manage physical lot activity. | Cannot change commercial settlement. |
| **Finance operator** | Confirm invoices, payments, fees, refunds, and settlement. | Cannot alter physical quantity. |
| **Administrator / auditor** | System configuration or read-only audit access. | Least privilege; no shared accounts. |

## 3.2 AUTH-01 — Organization-level authorization [MUST]

Trading access is granted to a **legal organization** only after KYB approval.

After organization approval:

- Named users are attached to that organization.
- Users receive role-based permissions.
- MFA is required.
- Authorization must use organization context and user role together.

A user account alone is not sufficient authority to trade.

## 3.3 AUTH-02 — Immediate suspension [MUST]

Compliance must be able to suspend:

- An organization.
- A user.
- A listing.

Suspension must:

- Immediately block new orders and listings.
- Preserve historical records.
- Preserve audit evidence.
- Allow controlled resolution of already-open obligations.

Suspension must never be implemented by deleting commercial history.

---

# 4. Member Onboarding and Legal Verification (KYB)

The platform is a permissioned B2B system; organization verification is part of the core business flow, not an optional admin feature.

## 4.1 Required organization and user evidence

| Data / evidence | Minimum handling |
|---|---|
| **Company** | Legal name, registration number, jurisdiction, trade licence, address, tax/VAT number, and business activity. |
| **Ownership/control** | UBO(s), directors, authorized signatories, and authority evidence. |
| **Users** | Work email, phone, identity evidence where legally required, role, and delegated authority. |
| **Banking** | Verified beneficiary/account details; changes require step-up verification and approval. |
| **Agreements** | Platform, purchase, storage/custody, marketplace, privacy, and delivery terms with version/time/IP evidence. |
| **Review** | Status, reviewer, reasons, expiry dates, risk notes, and periodic refresh. |

## 4.2 KYB-01 — Workflow [MUST]

Minimum KYB state flow:

`Draft → Submitted → Under Review → More Information Required → Approved / Rejected / Suspended / Expired`

Rules:

- Only **Approved** organizations can trade.
- A suspended organization cannot start new trading activity.
- Expired verification must be treated as a controlled authorization problem, not ignored.
- Review decisions require reviewer/evidence history.

## 4.3 KYB-02 — Document controls [MUST]

KYB/legal documents must be treated as private sensitive data.

Required controls:

- Private storage.
- Upload virus scanning.
- Encryption at rest.
- Encryption in transit.
- Restricted download access.
- Access logging.
- Retention policy.
- Approved deletion/redaction handling.
- Cross-organization isolation.

## 4.4 KYB-03 — Screening [MUST]

Sanctions, PEP, and adverse-media screening must follow:

- Counsel-approved policy.
- Provider capabilities.
- Defined refresh cadence.
- Human disposition of screening results.

Automated screening results do not replace human compliance judgement where the policy requires review.

---

# 5. Public Website and SEO Contract

The member/trading application must not weaken or replace the approved public SEO architecture.

## 5.1 SEO implementation contract

| Requirement | Implementation rule |
|---|---|
| **Architecture** | Preserve the five layers: commercial discovery, origin, live offers, knowledge/trust, and technical discovery. |
| **Routes** | Lowercase, hyphenated, canonical public URLs with enforced trailing slash. |
| **Navigation** | Use crawlable HTML anchors for priority destinations; filters are not a substitute for navigation. |
| **Templates** | Reuse T01–T14 contracts and approved section order/components. |
| **Rendering** | Indexable pages return meaningful server HTML, title, description, canonical, and valid metadata. |
| **Filters** | User-focused filters; index only curated permanent routes. Weak combinations are noindex/canonicalized as specified. |
| **Lifecycle** | Correct 200/301/404/410 behavior for active, renamed, ended, and removed offers/lots. |
| **Discovery** | Clean sitemaps, robots rules, structured-data `@graph`, and generated internal links. |

## 5.2 SEO-APP-01 — Public/private separation [MUST]

The following areas are private and must not be publicly indexed:

- Member routes.
- Account routes.
- Order routes.
- Inventory routes.
- Settlement routes.
- Delivery routes.
- Admin/operations routes.

They must:

- Require authorization.
- Not appear in public sitemaps.
- Not be exposed as public indexable pages.

## 5.3 SEO-APP-02 — Public offer safety [MUST]

Public commercial pages may expose only approved public commercial information.

Never expose publicly:

- Owner identity.
- Private contract price.
- Private documents.
- Exact warehouse location.
- Private quantity.
- Member-only trading information.

Public reference prices are not the same thing as private executable member listings.

---

# 6. Product, Offer, Quote, Purchase, and Fulfilment Flow

## 6.1 Main purchase journey

| Stage | Required outcome |
|---|---|
| **Discover** | Customer reaches product/origin/offer page or member catalogue and sees factual specification and availability. |
| **RFQ / quote** | Quantity, currency, unit, Incoterm, delivery/storage choice, validity, fees, and taxes are explicit. |
| **Contract** | Accepted quote references immutable commercial terms and approved agreement version. |
| **Payment** | Payment state is recorded; allocation/title rules follow finance/legal approval. |
| **Allocation** | Purchased quantity is allocated to a traceable lot/custody position. |
| **Fulfilment choice** | Immediate delivery, Hills storage, or scheduled/partial delivery. |

## 6.2 BUY-01 — No ambiguous price [MUST]

Every quote/order must store enough information to reconstruct exactly what the buyer agreed to:

- Price basis.
- Amount.
- Currency.
- Unit.
- Quantity.
- Fees.
- Tax.
- Validity.
- Timestamp.

Displayed market/reference benchmark information must **not** be treated as the executable sale price.

## 6.3 BUY-02 — Idempotent order actions [MUST]

The following must be retry-safe and idempotent:

- Payment callbacks.
- Order confirmation.
- Allocation operations.

A retry must not:

- Create a duplicate order effect.
- Reserve stock twice.
- Allocate stock twice.
- Transfer title twice.
- Duplicate payment processing.

---

# 7. Storage, Custody, Inventory, and Delivery

Storage/custody is a core product capability. The platform must know not only who bought coffee, but also where the physical lot is held and what portion is available, reserved, transferred, or delivered.

## 7.1 Fulfilment choices

| Choice | Business behavior | System controls |
|---|---|---|
| **Deliver now** | Release full eligible quantity after payment/approval. | Capacity slot, documents, dispatch, proof of delivery. |
| **Store with Hills** | Create customer custody position against an approved physical lot. | Storage agreement, fees, location, quality/weight events, statements. |
| **Scheduled delivery** | Customer requests one or more future release dates. | Cut-off, capacity, minimum quantity, partial reservations, status notifications. |

## 7.2 LOT-01 — Stable lot identity [MUST]

Each physical lot requires an immutable identity and must record, at minimum:

- Product.
- Origin.
- Crop year.
- Process.
- Grade.
- Quality/COA evidence.
- Warehouse.
- Received weight.
- Available weight.
- Lifecycle status.

Lot identity must remain stable across purchase, storage, resale, and delivery.

## 7.3 LOT-02 — Custody position [MUST]

For each organization and lot, tradable quantity is conceptually:

`purchased quantity − delivered quantity − transferred quantity − active reservations = available tradable quantity`

The result must never be negative.

This is a core inventory invariant.

## 7.4 LOT-03 — Append-only ledger [MUST]

All inventory changes must be represented as immutable events with:

- Actor.
- Reason.
- Timestamp.
- Source document.
- Correlation ID.

Corrections are made through **reversing events**, not by silently editing historical events.

The ownership/inventory ledger must therefore be auditable and append-only.

## 7.5 LOT-04 — Physical reconciliation [MUST]

Warehouse physical totals must reconcile with digital custody positions at an approved cadence.

If an unresolved variance exists:

- Affected trading must be blocked.
- Affected release/delivery must be blocked where unsafe.
- The variance must be recorded and resolved operationally.

## 7.6 DEL-01 — Delivery reservation [MUST]

An approved delivery request atomically reserves quantity.

Once reserved for delivery, that quantity becomes unavailable for:

- New listing.
- New sale.
- Another delivery reservation.

Cancellation must restore quantity exactly once where allowed.

## 7.7 DEL-02 — Delivery states [MUST]

Primary delivery flow:

`Draft → Requested → Capacity Confirmed → Reserved → Picking → Dispatched → Delivered`

Alternative states:

- Cancelled.
- Failed.
- Disputed.

Alternative/error states require:

- Reason.
- Audit evidence.
- Controlled authorization.

---

# 8. Authorized B2B Trading Community

## 8.1 Eligibility of resale inventory

For MVP, member listings may contain **only** coffee that is:

- Purchased from Hills.
- Still legally owned by the seller.
- Still held at a Hills-approved warehouse.
- Quantity verified.
- Quality verified.
- Legally transferable.
- Free of delivery reservations.
- Free of other reservations that would prevent sale.

Third-party inventory that entered outside Hills chain of custody is not eligible in MVP.

## 8.2 Listing lifecycle

| Listing state | Meaning |
|---|---|
| **Draft** | Visible only to seller. |
| **Compliance Review** | Awaiting eligibility/terms approval. |
| **Live** | Visible to authorized members. |
| **Reserved / Partially Filled** | Quantity locked by active transaction. |
| **Filled** | All listed quantity sold. |
| **Cancelled / Expired** | No longer executable. |
| **Suspended** | Blocked by compliance, dispute, or stock variance. |

## 8.3 MKT-01 — Permissioned visibility [MUST]

Only **active authorized members** may:

- See private listings.
- See seller/member-only trading data.
- Place offers.
- Accept offers.
- Execute private marketplace activity.

Public visitors must not receive private marketplace visibility simply because a record exists in the database.

## 8.4 MKT-02 — Seller ownership check [MUST]

At both **publication time** and **execution time**, the platform verifies:

- Seller ownership.
- Lot eligibility.
- Available tradable quantity.

A listing that was valid yesterday is not assumed valid today; execution must re-check current inventory state.

## 8.5 MKT-03 — Atomic reservation [MUST]

Accepting a trade must atomically reserve matched quantity.

Concurrency requirement:

> Two simultaneous buyers must never be able to reserve or sell more than the physically/digitally available quantity.

This requires transaction-level protection, locks/version checks, or equivalent concurrency guarantees.

## 8.6 MKT-04 — Settlement before title [MUST]

Title/custody ownership transfers only after the configured settlement condition is confirmed.

The system must not transfer title merely because:

- Checkout started.
- A buyer uploaded payment proof.
- A payment is still pending.
- A transaction is merely reserved.

Cash handling, escrow, and agent structures remain subject to legal and banking approval.

## 8.7 MKT-05 — Trade record [MUST]

Each completed/managed trade record must preserve:

- Seller.
- Buyer.
- Physical lot.
- Quantity.
- Price.
- Currency.
- Fees.
- Tax.
- Relevant contract/agreement evidence.
- Settlement state/evidence.
- Title-transfer event.
- Audit correlation ID.

## 8.8 MKT-06 — MVP trading mode [MUST]

MVP starts with:

- Fixed-price listing and/or
- Negotiated offer / RFQ.

MVP specifically excludes:

- Public order book.
- Anonymous matching.
- Leverage.
- Futures.
- Short selling.
- External stock.

## 8.9 MKT-07 — Disputes [MUST]

A dispute can freeze affected:

- Quantity.
- Settlement.
- Trading/release activity where applicable.

Only authorized operations roles may resolve a dispute.

Resolution requires:

- Reason.
- Evidence.
- Audit history.

---

# 9. Market and Reference Pricing

The UI and data model must clearly distinguish three different price concepts.

| Price type | Definition | Execution |
|---|---|---|
| **Reference benchmark** | External Arabica/Robusta or ICO indicator with source, delay, timestamp, currency, and unit. | Information only. |
| **Hills quote** | Price offered by Hills for a defined product/quantity/term. | Executable only within quote rules. |
| **Member listing / trade** | Seller ask, buyer offer, or completed price for a specific eligible physical lot. | Executable only inside authorized workflow. |

These must never be presented as if they were the same concept.

## 9.1 PX-01 — Source adapters [MUST]

Pricing integrations should use replaceable adapters for approved sources, for example:

- ICE Arabica Coffee C.
- ICE Robusta.
- ICO indicators.

Production display depends on valid market-data licensing and redistribution rights.

## 9.2 PX-02 — No false real-time claim [MUST]

The product may display **live** only when contractual rights permit real-time redistribution.

Otherwise, clearly label data as:

- Delayed, or
- Daily reference.

Always display:

- Observation timestamp.
- Time zone.
- Delay/freshness context.

## 9.3 PX-03 — Units and currency [MUST]

Store the source observation unchanged:

- Raw source value.
- Raw unit.
- Raw currency.

Conversions must be auditable, for example:

- cents/lb.
- USD/MT.
- USD/kg.

FX conversions require:

- FX source.
- FX timestamp.
- Defined rounding rules.

## 9.4 PX-04 — Specialty pricing [MUST]

Specialty coffee does not have one universal exchange price.

The system should model specialty pricing as either:

- Benchmark + origin differential + quality differential + certification differential + crop differential + commercial differential, or
- A direct Hills/member quote.

The user should be able to understand the price basis.

## 9.5 PX-05 — Freshness/failure [MUST]

If a feed is stale/unavailable:

- Show the last successful timestamp.
- Show stale status.
- Do not silently show cached data as current.
- Do not fabricate a replacement value.

## 9.6 PX-06 — Disclosures [MUST]

Each market/reference price view should state:

- Source.
- Delay.
- Unit.
- Currency.
- Timestamp.
- That it is reference information and not an offer or investment advice.

---

# 10. Core Data Model

The SRS defines the following conceptual entities and relationships.

| Entity | Key fields / relationships |
|---|---|
| **Organization / User** | KYB status, roles, permissions, signatories, agreement versions. |
| **Product / Origin / Grade** | Species, origin, crop, process, quality, specialty/commercial classification, certificates. |
| **Offer / Quote / Order** | Terms, line items, validity, acceptance, payment, fulfilment choice. |
| **PhysicalLot** | Immutable lot ID, warehouse, quality, received/available weight, lifecycle. |
| **CustodyPosition / InventoryEvent** | Owner-lot balance and append-only quantity/title/reservation ledger. |
| **DeliveryRequest** | Requested date/quantity, reservations, capacity, logistics, proof. |
| **Listing / Offer / Trade** | Eligibility snapshot, price, quantity, parties, settlement, title transfer. |
| **PriceSource / Observation / Differential** | Licence, symbol/category, raw value, unit, currency, time, delay, conversions. |
| **Document / AuditEvent / Notification** | Private evidence, immutable action log, delivery status. |

## 10.1 DATA-01 — Single source of truth [MUST]

Public website, member application, and operations/admin tools must consume the same canonical entity model and stable identifiers.

Do not create separate conflicting truths for:

- Product.
- Lot.
- Ownership.
- Inventory.
- Listing.
- Order.
- Settlement.

CMS content may describe products, but it must not create a separate inventory truth that can diverge from the application database.

## 10.2 DATA-02 — Precision [MUST]

Use fixed decimal types for:

- Quantities.
- Money.
- FX.
- Price conversions.

Rounding rules must be centrally defined.

Do not use binary floating point for ledger calculations.

---

# 11. State Machines and Transaction Integrity

## 11.1 Minimum state sets

| Object | Minimum states |
|---|---|
| **KYB** | Draft, Submitted, Review, More Info, Approved, Rejected, Suspended, Expired |
| **Order** | Draft, Quoted, Accepted, Payment Pending, Paid, Allocated, Fulfilled, Cancelled, Refunded, Disputed |
| **Lot** | Expected, Received, QC Hold, Available, Reserved, Depleted, Quarantined, Closed |
| **Listing** | Draft, Review, Live, Reserved, Part-filled, Filled, Cancelled, Expired, Suspended |
| **Trade** | Initiated, Reserved, Contracted, Settlement Pending, Settled, Title Transferred, Completed, Cancelled, Disputed |
| **Delivery** | Draft, Requested, Confirmed, Reserved, Picking, Dispatched, Delivered, Cancelled, Failed, Disputed |

These are conceptual minimums. Implementation naming may differ only if the same business meaning and transition controls are preserved.

## 11.2 TXN-01 — Atomicity [MUST]

The following operations require consistent transactional protection:

- Reservation.
- Settlement confirmation.
- Title transfer.

Required controls include, as appropriate:

- Transactions.
- Locks.
- Version checks.
- Unique idempotency keys.

The system must prevent partial multi-step states such as title moved without stock update or stock reserved without the corresponding transaction record.

## 11.3 TXN-02 — Invariant monitoring [MUST]

The platform should alert and/or block when detecting:

- Negative availability.
- Owner mismatch.
- Duplicate title event.
- Quantity imbalance.
- Stale KYB.
- Expired document.
- Unbalanced physical/digital reconciliation.

These are business-integrity failures, not merely reporting warnings.

---

# 12. Interfaces and Integrations

| Integration | MVP approach | Failure behavior |
|---|---|---|
| **CMS** | Structured public templates, guides, people, approved commercial copy. | Last published content remains; editorial errors never alter custody ledger. |
| **Payment/banking** | Manual confirmation or approved gateway; exact scope decided in Sprint 0. | Pending/failed settlement cannot transfer title. |
| **ERP/accounting** | Invoices, tax, credit notes, fees, reconciliation export/API. | Queue/retry and expose reconciliation status. |
| **Warehouse/WMS** | Lot receipt, QC, location, weights, reservations, releases, dispatch. | Affected lot trading/release blocked if synchronization is unsafe. |
| **Market data / FX** | Licensed adapters with cache, timestamp, entitlement. | Stale banner; no fabricated value. |
| **Email/SMS/WhatsApp** | Transactional notifications; WhatsApp only through approved business provider. | In-app event remains source; retry and log delivery. |

## 12.1 API-01 — Versioned contracts [MUST]

APIs must provide:

- Versioned contracts.
- Authenticated organization context.
- Authorization checks.
- Input validation.
- Idempotency.
- Correlation IDs.

Authorization must be enforced server-side, not inferred only from UI visibility.

## 12.2 API-02 — Webhook safety [MUST]

Webhook handling must:

- Verify signatures.
- Reject replay.
- Store external/provider event IDs.
- Process asynchronously where appropriate.
- Retry failed processing.
- Support dead-letter handling.

A provider retry must not duplicate a commercial effect.

---

# 13. Security, Privacy, and Resilience

## 13.1 Account ownership

Production infrastructure and service accounts must be company-owned, including:

- GitHub.
- Cloud/hosting.
- Database.
- Storage.
- Domain.
- DNS.
- Analytics.
- Market-data accounts.
- Administrator accounts.

No developer-owned account should be required to keep production operational.

## 13.2 Authentication and privileged access

Required principles:

- MFA for members and staff.
- Stronger controls for compliance, finance, warehouse, and admin roles.
- Session revocation.
- Device revocation where supported/required.
- Rate limiting.
- Least privilege.
- No shared admin accounts.

## 13.3 Tenant and organization isolation

Required controls:

- Row-level organization isolation.
- Server-side authorization on every protected object.
- Public and private storage buckets separated.
- No cross-organization access to private documents or trading data.

## 13.4 Encryption and secrets

- Encryption in transit.
- Encryption at rest.
- Secrets stored in a managed secret store.
- No secrets committed to source repository.
- No secrets written into logs.
- No secrets exposed in client bundles.

## 13.5 Audit trail

Maintain immutable/auditable records for important actions including:

- Approvals.
- Banking detail changes.
- Quantity changes.
- Title changes.
- Data exports.
- Privileged access.

## 13.6 Backup and disaster recovery

Required resilience controls:

- Encrypted backups.
- Point-in-time recovery appropriate to the platform.
- Off-platform backup copy.
- Documented RPO/RTO.
- Quarterly restore tests.

## 13.7 Security testing

Testing scope includes:

- Dependency scanning.
- SAST.
- Access-control tests.
- Tenant-isolation tests.
- Upload abuse.
- Injection.
- CSRF.
- XSS.
- Business-logic concurrency.

## 13.8 Non-functional baseline targets

| Target | Baseline |
|---|---|
| **Availability** | Public site 99.9% monthly target; trading maintenance windows disclosed. Final SLA in Sprint 0. |
| **Performance** | Public Core Web Vitals targeted; member actions provide response/progress and do not duplicate on retry. |
| **RPO / RTO** | Proposed ledger RPO ≤ 15 minutes, RTO ≤ 4 hours; validate against provider and business risk. |
| **Accessibility** | WCAG 2.2 AA target for public and member-critical journeys. |
| **Observability** | Structured logs, traces, metrics, security alerts, feed freshness, queue depth, reconciliation dashboards. |

---

# 14. Admin and Operational Controls

The operations console is not a single unrestricted admin panel. Responsibilities are separated by function.

| Console area | Required capabilities |
|---|---|
| **Compliance** | KYB queue, document expiry, risk flags, approvals, suspensions, evidence export. |
| **Catalogue/CMS** | Products, origins, grades, offers, differentials, content, media approval. |
| **Warehouse** | Lots, receipt/QC, owner positions, holds, reservations, releases, variances, reconciliation. |
| **Trading** | Listing review, trade monitor, dispute freeze, settlement/title status, fee configuration. |
| **Finance** | Invoices, tax, storage/trading fees, payment/settlement reconciliation, statements. |
| **System** | Users/roles, configuration, integrations, feature flags, audit, incident controls. |

## 14.1 OPS-01 — Dual control [MUST]

Maker-checker approval should be configurable for high-risk operations such as:

- Member approval.
- Bank-detail change.
- Manual settlement.
- Stock adjustment.
- Title reversal.
- Privileged access.

The person initiating a high-risk action should not always be able to approve the same action where dual control is required.

## 14.2 OPS-02 — No destructive deletion [MUST]

The UI must not hard-delete:

- Commercial records.
- Inventory records.
- Title records.
- Payment records.
- Audit records.

Use instead:

- Status transitions.
- Retention rules.
- Legally approved redaction/anonymization.

Historical accountability must be preserved.

---

# 15. UX, Design, Content, and Operational Deliverables

Before implementation sign-off, required owners must provide the following.

| Owner | Deliverables before implementation sign-off |
|---|---|
| **Product/UX** | Complete web-first journeys: discovery, RFQ, application/KYB, purchase, storage choice, inventory, listing, trade, settlement, delivery, dispute. |
| **Design** | Desktop/mobile templates plus loading, empty, error, validation, stale price, unauthorized, suspended, sold/reserved, partial fill, offline/retry states. |
| **Content** | Products, origins, crop/process/grade definitions, commercial pages, guides, FAQs, legal copy, emails, images, document templates. |
| **Hills operations** | Warehouse rules, fees, capacity/cut-offs, reconciliation, delivery zones, quality evidence, escalation owners. |
| **Legal/finance** | Terms, title/risk transfer, licences, tax/VAT, invoicing, settlement, refunds, disputes, privacy, retention. |

## 15.1 Design-state completeness

Design work is not complete if it contains only the happy path.

Critical states include:

- Loading.
- Empty.
- Error.
- Validation error.
- Stale market price.
- Unauthorized.
- Suspended.
- Sold.
- Reserved.
- Partial fill.
- Offline/retry.

---

# 16. MVP and Phased Roadmap

| Phase | Included | Excluded / later |
|---|---|---|
| **Sprint 0 — 2–3 weeks** | Legal/product decisions; architecture; data model; threat model; UX flows; market-data/hosting comparison; migration/data audit; prototypes. | No production trade. |
| **MVP — 12–18 weeks after Sprint 0** | Public SEO site; CMS; responsive member app; manual KYB approval; Hills purchases; custody; scheduled delivery; fixed-price/RFQ resale; manual settlement confirmation; admin; delayed/daily benchmarks. | Native apps, order book, external inventory, automated escrow, advanced analytics. |
| **Phase 2 — 8–14+ weeks** | Licensed real-time feeds, automated payment/settlement, deeper WMS/ERP, alerts, richer trading, optional native apps. | Subject to adoption, licences, legal approval. |

## 16.1 Estimate dependency rule

Timeline begins only when the project has the required inputs and owners, including:

- Designs.
- Business rules.
- Content.
- Integration access.
- Data access.
- Named approvers.

A smaller team or unresolved legal/warehouse decisions extends delivery time.

---

# 17. Acceptance Criteria and Release Blockers

The following are release-blocking acceptance criteria.

| ID | Release-blocking test |
|---|---|
| **AC-01** | Unauthorized or suspended organizations cannot view private listings or execute any trade. |
| **AC-02** | Two concurrent attempts cannot reserve/sell more than the available lot quantity. |
| **AC-03** | No title transfer occurs before configured settlement confirmation; every transfer balances the ledger. |
| **AC-04** | Delivery reservation immediately reduces tradable quantity; cancellation restores it exactly once. |
| **AC-05** | Warehouse physical totals reconcile to all custody positions, reservations, releases, and holds. |
| **AC-06** | Every price shows type, source, timestamp, delay, unit, and currency; stale/failing feeds are explicit. |
| **AC-07** | Public indexable routes return valid raw HTML metadata/canonical/schema; private routes are excluded from indexation. |
| **AC-08** | KYB/legal documents are private, access logged, and inaccessible across organizations. |
| **AC-09** | Backup restore, rollback, incident, and key revocation procedures are tested in staging. |
| **AC-10** | Legal, finance, warehouse, security, product, and business owners sign the production checklist. |

A build is not production-ready merely because the UI works. These acceptance criteria are part of the definition of release readiness.

---

# 18. Sprint 0 Decision Register

The following business/technical decisions require explicit owner evidence.

| Decision required | Owner / evidence |
|---|---|
| Operating entity, jurisdictions, customer eligibility, required marketplace/commodity/storage licences. | Legal counsel / written opinion. |
| When title and risk transfer for Hills sale, storage, member resale, delivery. | Legal + finance + insurer. |
| Warehouse/custodian identity; insurance, shrinkage, quality loss, claims rules. | Operations + legal + insurer. |
| Settlement model: bank transfer, gateway, escrow/agent; refunds and chargebacks. | Finance + legal + banking provider. |
| Storage, handling, delivery, marketplace, tax/VAT fee schedule. | Finance + operations. |
| Market-data sources, latency, redistribution rights, units, FX, specialty differentials. | Product + legal + data vendor. |
| Hosting/database/storage option and production cost at 12-/36-month scenarios. | Engineering/DevOps. |
| WMS/ERP/accounting integration and initial migration/reconciliation source. | Engineering + operations + finance. |
| MVP countries, currencies, Incoterms, delivery areas, service levels. | Business + operations. |

These are not implementation assumptions that engineering should silently invent.

---

# 19. Required Developer Response Before Full Build

Before full implementation, the engineering team is expected to produce:

1. **Architecture diagram and written decision records** covering:
   - Frontend.
   - Backend.
   - Database.
   - Ledger.
   - CMS.
   - Storage.
   - Queues.
   - Integrations.
   - Hosting.
   - Disaster recovery.

2. **Data model and state machines** proving:
   - Stock conservation.
   - Reservation integrity.
   - Settlement integrity.
   - Title-transfer integrity.

3. **Sprint plan** containing:
   - Team roles.
   - Dependencies.
   - Assumptions.
   - Risks.
   - Fixed acceptance criteria.

4. **Hosting comparison** during Sprint 0, including Vercel vs Cloudflare or approved alternative, testing:
   - SSR/ISR.
   - Queues.
   - Cron.
   - Observability.
   - Regions.
   - Limits.
   - Total cost.

5. **Supabase or alternative production sizing**, covering:
   - Database.
   - Private documents/media.
   - Egress.
   - Backups/PITR.
   - Environments.
   - 12-month cost.
   - 36-month cost.
   - Free tier is for development only.

6. **Market-data provider/licensing proposal** defining exactly what live, delayed, and daily mean.

7. **Security/threat model**, including:
   - Access matrix.
   - Backup/restore test.
   - Company-owned account handover plan.

8. **Content/design dependency list**.

9. **Staging demonstration** covering one full journey:

   `purchase → custody → resale → settlement → title transfer → delivery`

---

# 20. Traceability to the Approved SEO Architecture

| Architecture slide/theme | SRS implementation |
|---|---|
| **1–3: introduction, relationship-first model, five layers** | Sections 1, 5, and 10 preserve the shared entity graph and site layers. |
| **4–6: URLs, HTML links, page ownership** | Section 5 and original SEO specification remain binding. |
| **7–11: B2B journey, CMS entities, T01–T14, supplier/origin pages** | Sections 5, 6, 10, and 15 connect discovery to RFQ/member conversion. |
| **12–15: inventory lifecycle, knowledge, internal links, filters** | Sections 5, 7, and 8 add custody/trading without exposing private faceted routes. |
| **16–19: HTML metadata, schema, sitemap/robots, redirects** | Section 5 plus original technical SEO acceptance gates. |
| **20: build sequence and QA** | Sections 16–19 define executable build and release gates. |

The trading application therefore extends the original SEO/public architecture rather than replacing it.

---

# Appendix A — Reference Data Notes

## A.1 Arabica benchmark

ICE Coffee C is a common Arabica futures benchmark.

Reference supplied by the source SRS:

- `https://www.ice.com/products/15/Coffee-C-Futures`

Redistribution/display rights must be contracted with the applicable data provider/exchange.

## A.2 Robusta benchmark

ICE Robusta Coffee is a Robusta benchmark.

Reference supplied by the source SRS:

- `https://www.ice.com/products/37089079/Robusta-Coffee-Futures`

## A.3 ICO indicators

International Coffee Organization indicator prices can be used as daily reference indicators by coffee group.

They do **not** replace a product-specific executable offer.

Reference supplied by the source SRS:

- `https://ico.org/what-we-do/world-coffee-statistics-database/`

## A.4 Specialty coffee price basis

A specialty lot price depends on physical attributes and commercial terms.

The system should preserve the benchmark and differentials separately so users can understand the basis of the price.

---

# Appendix B — Consolidated MUST Requirement Index

This section gives developers and agents one place to find every explicitly labelled MUST requirement in the source SRS.

## Authorization

- **AUTH-01 — Organization-level authorization:** KYB-approved legal organization first, named user roles and MFA second.
- **AUTH-02 — Immediate suspension:** suspension immediately blocks new activity while preserving records and controlled open-obligation resolution.

## KYB

- **KYB-01 — Workflow:** Draft → Submitted → Under Review → More Information Required → Approved / Rejected / Suspended / Expired; only Approved organizations trade.
- **KYB-02 — Document controls:** private storage, scanning, encryption, restricted access, logging, retention/deletion policy.
- **KYB-03 — Screening:** sanctions/PEP/adverse-media policy and human disposition.

## Public / SEO application boundary

- **SEO-APP-01 — Public/private separation:** private application routes require authorization and are excluded from public indexation/sitemaps.
- **SEO-APP-02 — Public offer safety:** public pages never expose member identity, private contract price/documents, exact warehouse location, or private quantity.

## Buying

- **BUY-01 — No ambiguous price:** order/quote stores complete price basis and commercial context; benchmark is not executable sale price.
- **BUY-02 — Idempotent order actions:** callbacks, confirmation, and allocation are retry-safe.

## Lots / custody / delivery

- **LOT-01 — Stable lot identity:** immutable physical lot identity with origin/quality/warehouse/weight/status data.
- **LOT-02 — Custody position:** available tradable quantity follows conservation formula and never goes negative.
- **LOT-03 — Append-only ledger:** immutable inventory events; corrections use reversing events.
- **LOT-04 — Physical reconciliation:** unresolved variance blocks affected trading/release.
- **DEL-01 — Reservation:** delivery request atomically reserves quantity.
- **DEL-02 — Delivery states:** controlled delivery lifecycle with audited alternate states.

## Marketplace

- **MKT-01 — Permissioned visibility:** only active authorized members see private listings/trading data and execute marketplace actions.
- **MKT-02 — Seller ownership check:** ownership/eligibility/availability verified at publish and execution.
- **MKT-03 — Atomic reservation:** concurrent requests cannot double-sell stock.
- **MKT-04 — Settlement before title:** title transfers only after configured settlement confirmation.
- **MKT-05 — Trade record:** preserve parties, lot, quantity, price, fees/tax, contracts, settlement, title transfer, correlation ID.
- **MKT-06 — MVP trading mode:** fixed-price and/or negotiated/RFQ; no order book, anonymous matching, leverage, futures, shorts, or external stock.
- **MKT-07 — Disputes:** authorized operations may freeze/resolve with reason and evidence.

## Pricing

- **PX-01 — Source adapters:** replaceable approved market-data adapters; licensing required.
- **PX-02 — No false real-time claim:** use live only when licensed; otherwise delayed/daily with timestamp/time zone.
- **PX-03 — Units/currency:** preserve raw source observation; conversions are audited with FX source/time.
- **PX-04 — Specialty pricing:** benchmark + differentials or direct quote; no universal specialty price assumption.
- **PX-05 — Freshness/failure:** stale status and last-success timestamp; never silently fake freshness.
- **PX-06 — Disclosures:** source/delay/unit/currency/reference-only disclosure.

## Data / transaction integrity

- **DATA-01 — Single source of truth:** canonical entities and stable IDs shared by public/member/admin surfaces.
- **DATA-02 — Precision:** fixed decimals and central rounding; no binary floating point for ledgers.
- **TXN-01 — Atomicity:** reservation, settlement, title transfer protected by transactions/locks/version checks/idempotency.
- **TXN-02 — Invariant monitoring:** detect/block negative availability, owner mismatch, duplicate title events, imbalances, stale KYB/docs, reconciliation failures.

## APIs / webhooks

- **API-01 — Versioned contracts:** authenticated organization context, authorization, validation, idempotency, correlation IDs.
- **API-02 — Webhook safety:** signatures, replay protection, event IDs, asynchronous retry/dead-letter processing.

## Operations

- **OPS-01 — Dual control:** maker-checker for high-risk actions where configured.
- **OPS-02 — No destructive deletion:** preserve commercial/inventory/title/payment/audit records; use state/retention/redaction instead.

---

# Appendix C — End-to-End Business Journeys

These journeys reorganize requirements already present in the SRS into developer-readable sequences.

## C.1 Public discovery → membership

1. Visitor lands on an indexable product/origin/knowledge/reference-price page.
2. Public route returns meaningful server-rendered HTML and valid metadata.
3. Visitor can browse approved public data without receiving private trading information.
4. Visitor may submit RFQ or membership application.
5. Applicant creates/uses an account to submit company/legal evidence.
6. Applicant remains unable to trade until organization approval.
7. Compliance reviews KYB, documents, screening, authority, banking, and required agreements.
8. Approved organization receives authorized member access.

## C.2 Hills purchase → custody

1. Authorized buyer selects or receives an executable Hills quote.
2. Commercial terms clearly state quantity, unit, currency, price, validity, fees/tax, Incoterm, and fulfilment choice.
3. Contract/acceptance references an approved agreement version.
4. Payment/settlement enters controlled state.
5. No title transfer occurs until the configured settlement condition is confirmed.
6. Confirmed purchase allocates quantity to a traceable physical lot.
7. Buyer receives an owner/custody position.
8. Inventory/title event is recorded in append-only audit/ledger form.
9. Buyer chooses delivery now, Hills storage, or scheduled/partial delivery.

## C.3 Custody → member resale listing

1. Authorized seller selects inventory already purchased from Hills.
2. System verifies current ownership.
3. System verifies warehouse/custody eligibility.
4. System verifies quality/quantity.
5. System verifies quantity is not reserved for delivery or another transaction.
6. Seller creates draft listing.
7. Compliance/eligibility review occurs where required.
8. Live listing becomes visible only to active authorized members.

## C.4 Member listing → trade → title transfer

1. Authorized buyer sees private eligible listing.
2. Buyer submits/accepts an allowed fixed-price or negotiated/RFQ transaction.
3. System re-checks seller ownership and available quantity.
4. Transaction atomically reserves matched quantity.
5. Concurrency controls prevent double-selling.
6. Trade/contract record stores all immutable commercial terms and agreement references.
7. Settlement remains pending until finance confirms configured condition.
8. Title/custody does not move while settlement is pending.
9. On settlement confirmation, title transfers once.
10. Seller inventory decreases and buyer custody increases consistently.
11. Ownership/title event records correlation ID and evidence.
12. Partially filled listing remains available only for eligible remaining quantity; filled listing closes.

## C.5 Custody → scheduled delivery

1. Authorized buyer requests delivery quantity/date.
2. Warehouse/capacity rules are checked.
3. Approved request atomically reserves inventory.
4. Reserved quantity immediately stops being tradable.
5. Warehouse progresses request through capacity/reserved/picking/dispatch/delivery states.
6. Delivery proof and status are recorded.
7. Delivered quantity reduces customer custody position.
8. Cancellation restores reservation exactly once where allowed.
9. Failed/disputed states require reason and audit evidence.

## C.6 Dispute journey

1. A valid participant or authorized operations user opens dispute according to policy.
2. Affected quantity and/or settlement can be frozen.
3. Evidence is attached privately.
4. Relevant operations roles review the case.
5. Resolution requires authorized reason/evidence.
6. Inventory/title/payment corrections are represented through controlled events rather than destructive history edits.

---

# Appendix D — Implementation Guardrails for Developers and Coding Agents

The following guardrails are direct consequences of the approved SRS and should be treated as constraints during implementation.

1. **Do not turn private marketplace listings into anonymous/public trading data.**
2. **Do not treat login as trading authorization.** Organization approval, membership, active status, and role matter.
3. **Do not allow seller-submitted arbitrary external inventory in MVP.** Resale inventory must preserve Hills chain of custody.
4. **Do not calculate inventory by trusting UI state.** Inventory conservation must be enforced at transaction/data level.
5. **Do not transfer title at checkout or payment-proof upload.** Transfer waits for configured settlement confirmation.
6. **Do not make ownership ledger records editable history.** Corrections use new/reversing events.
7. **Do not use floating point for money/quantity ledger calculations.**
8. **Do not conflate reference market price, Hills quote, and member listing price.**
9. **Do not display stale market data as current/live.**
10. **Do not allow public SEO crawling of account/member/order/inventory/admin areas.**
11. **Do not hard-delete commercial, inventory, payment, title, or audit history through application UI.**
12. **Do not give one generic admin role unrestricted operational power if role separation is required.**
13. **Do not design only happy-path screens.** Loading, error, empty, unauthorized, suspended, stale, partial-fill, and retry states are required design inputs.
14. **Do not assume legal/tax/warehouse/market-data decisions that Sprint 0 marks as gated.** Record the decision dependency instead.
15. **Do not use a production dependency owned by an individual developer.** Production services/accounts must be company-owned.
16. **Do not allow retries to duplicate commercial effects.** Use idempotency and provider event IDs.
17. **Do not allow a warehouse mismatch or unresolved reconciliation variance to continue trading as normal.**
18. **Do not expose private documents across organizations.**
19. **Do not weaken the approved SEO public architecture while adding the application.**
20. **Do not consider the project production-ready until AC-01 through AC-10 and owner sign-offs are satisfied.**

---

# Appendix E — Developer Definition of Ready

Before implementing a major flow, confirm the following inputs exist or are explicitly marked pending/gated:

- [ ] Relevant SRS requirements identified.
- [ ] User/organization role and permission matrix understood.
- [ ] Required UI states designed.
- [ ] Data entities and IDs defined.
- [ ] State machine defined.
- [ ] Transaction boundaries defined.
- [ ] Idempotency behavior defined.
- [ ] Audit/correlation behavior defined.
- [ ] Private/public data boundary defined.
- [ ] Relevant legal/finance/warehouse decision known or flagged as gated.
- [ ] Error and retry behavior defined.
- [ ] Acceptance criteria mapped.

---

# Appendix F — Production Definition of Done

A production release is not complete until all applicable items below are satisfied:

- [ ] Legal approval complete.
- [ ] KYB policy approved.
- [ ] Required signed member/marketplace/custody terms available.
- [ ] Warehouse reconciliation process approved and tested.
- [ ] Finance and tax treatment approved.
- [ ] Market-data licensing/redistribution approved.
- [ ] Security review completed.
- [ ] Backup and restore tested.
- [ ] End-to-end staging journey demonstrated.
- [ ] AC-01 through AC-10 passed.
- [ ] Company-owned production accounts confirmed.
- [ ] Role/authorization matrix tested.
- [ ] Cross-organization data isolation tested.
- [ ] Concurrency/double-sell protection tested.
- [ ] Settlement-before-title behavior tested.
- [ ] Delivery reservation/restore behavior tested.
- [ ] Physical/digital warehouse reconciliation tested.
- [ ] Price source/freshness/disclosure behavior tested.
- [ ] Private KYB/legal-document access tested.
- [ ] Incident/key-revocation/rollback procedures tested.
- [ ] Required business-owner sign-offs collected.

---

# Legal Note

This SRS defines **product and engineering controls**, not legal advice.

Applicable obligations for every operating jurisdiction must be determined by counsel and relevant owners, including where applicable:

- Commodity trading.
- Warehousing/custody.
- Consumer/B2B rules.
- AML/sanctions.
- Privacy.
- E-commerce.
- Tax.
- Market-data licensing and redistribution.

---

# Source Authority and Conflict Rule

Use this Markdown file as the **developer-readable requirements reference** inside the repository.

When interpreting the project, use the following source hierarchy:

1. **Approved source SRS / approved business decisions** — defines business intent and release obligations.
2. **Approved database baseline** — defines current implemented data integrity, authorization, and transaction model.
3. **Approved design system / screens** — defines visual and interaction direction.
4. **Implementation code** — must conform to the approved requirements, database constraints, and design direction.

If a source conflict is discovered, do not silently choose one. Record the conflict and require an explicit product/business decision before changing a business-critical rule.
