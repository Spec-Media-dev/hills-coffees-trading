# Database Capability Map

**Derived from**: `docs/database/database-schema-report.json` (generated 2026-09-07T19:03:53Z, audit
`database-final-audit.json` = PASS / 0 issues). This document is a *navigational summary* of that
report for feature planning — the report itself remains authoritative (Constitution Principle III).
If this file and the report disagree, the report wins and this file is the thing to fix.

**Purpose**: every feature plan (002–012) references this instead of restating the schema, so a
future agent learns "what the database already does for me" in one place and does not reinvent
logic the database already owns.

**Hard rule**: no feature may alter tables, columns, constraints, RLS, triggers, functions, or
create Storage buckets. A genuine missing capability is recorded as a BLOCKER (see the last
section), never worked around with a convenience migration.

---

## 1. Transactional functions the application MUST call (never reimplement)

| Function | Args | Who may call | What it does atomically |
|---|---|---|---|
| `checkout_order` | `p_order_id` | order's org member (`is_org_member` + `organization_can_buy`) or platform admin | Locks the order `FOR UPDATE`; **idempotent retry** if already `HOLD`/`PAYMENT_PROOF_SUBMITTED`/`PAYMENT_UNDER_REVIEW` with an ACTIVE reservation; runs `assert_order_checkout_ready`; computes financials (commission tier + tax rule snapshots); creates `inventory_reservations` + `inventory_reservation_items`; **reserves `inventory_positions.reserved_quantity_kg` first, then mirrors into `coffee_offers.reserved_quantity_kg`**; creates proforma + items; creates/updates `payments` to `PENDING`; sets order `HOLD` with `hold_expires_at = now() + 20 minutes`. Returns JSON incl. `reservation_id`, `buyer_total`, `hold_expires_at`, `correlation_id`, `idempotent_retry`. |
| `assert_order_checkout_ready` | `p_order_id` | (internal, called by `checkout_order`) | Pre-flight validation before any reservation is taken. |
| `expire_order_hold` | `p_order_id` | — | Releases an expired hold (reservation → released, order → expired path). |
| `submit_payment_proof` | `p_order_id`, `p_file_asset_id`, `p_reference` | buyer side | Records `payment_proofs` row and advances payment/order into the proof-submitted state. |
| `admin_review_payment` | `p_payment_id`, `p_approved`, `p_reason` | `is_finance_operator()` only | **The settlement + title-transfer transaction.** Rejects → payment `REJECTED`, order back to `HOLD`. Approves → requires an ACTIVE, unexpired reservation; decrements seller `inventory_positions`; creates/【increments】buyer `inventory_positions` (title/custody at the same warehouse); inserts append-only `inventory_ownership_events`; updates `coffee_offers` fill status; inserts `storage_allocations` for buyer custody; inserts `payouts` when `seller_type_snapshot` is a member seller; marks reservation `CONSUMED`; payment `CONFIRMED`; proforma `PAID`; order `PAID`. |
| `create_support_ticket` | `p_subject`, `p_body`, `p_order_id`, `p_organization_id` | authenticated user | Creates ticket + first message. |
| `update_my_profile` | 4 profile fields | authenticated, non-blocked | Updates only the caller's own `profiles` row. |
| `update_organization_contact` | `p_organization_id`, display/email/phone | org member | Updates limited org contact fields. |
| `start_organization_onboarding` *(Feature 003, applied + live-verified 2026-09-10)* | legal/display name, `account_type` (`BUYER`/`SELLER` only), country, tax/registration, contact | any verified, non-blocked authenticated user | Atomically creates one external `PENDING_KYB` organization + the caller's own `OWNER` membership. Derives `can_buy`/`can_sell` server-side from `account_type` only (never caller input). An existing active membership (any org) returns a controlled `{ok:false, conflict:"already_member"}` — never a second organization, never a picked organization id. Per-caller advisory lock + duplicate-`tax_number` handling. |
| `create_kyb_draft` *(Feature 003)* | `p_organization_id` | org member, non-blocked | Idempotent against the pre-existing `uq_one_open_kyb_application` unique index: returns the org's existing open application if one exists, else creates a new `DRAFT`. |
| `submit_kyb_application` / `resubmit_kyb_application` *(Feature 003)* | `p_application_id` | org member, non-blocked | State-transition only (`DRAFT`→`SUBMITTED`, `RESUBMISSION_REQUIRED`→`SUBMITTED`); sets `submitted_by`/`submitted_at`. `resubmit_kyb_application` additionally refuses while any current (non-`SUPERSEDED`) document is `REJECTED`. Evidence completeness is an application-layer concern, not enforced here. |
| `attach_kyb_document` *(Feature 003)* | application/document-type/object-path/name/mime/size, optional `p_supersedes_document_id` | org member, application in `DRAFT`/`RESUBMISSION_REQUIRED` | The only sanctioned write path for `file_assets`+`kyb_documents` KYB rows. Requires the exact object to already exist in `storage.objects` (`kyb-evidence` bucket); soft-cross-checks MIME/size against the object's own recorded `metadata->>'mimetype'`/`metadata->>'size'` (confirmed live to exist and be authoritative); enforces same-application/same-`document_type` replacement lineage via a unique-indexed, trigger-validated `supersedes_document_id`. |
| `create_kyb_review` *(Feature 003)* | application/document/decision/reason | `is_compliance_operator()` only | The only sanctioned write path for `kyb_review_items`. Derives `reviewer_user_id`/`created_at` itself (never caller input); requires a reason for `REJECTED`. The table has no UPDATE/DELETE path for anyone — a trigger unconditionally refuses both (append-only, live-confirmed: a live UPDATE/DELETE attempt left the row unchanged). |
| `list_kyb_document_reviews` *(Feature 003)* | `p_application_id` | org member | Member-facing review read; substitutes the fixed label `"Hills Compliance"` for the real `reviewer_user_id`, which this function never selects. |

**Settlement rule this encodes**: title moves **only** inside `admin_review_payment(..., true)` —
never at checkout, never on payment-proof upload (SRS MKT-04 / Appendix D #5).

## 2. Authorization functions (all `SECURITY DEFINER`, all `auth.uid()`-scoped)

`current_user_id()` · `is_blocked_user()` · `is_org_member(org)` · `is_authorized_member()` ·
`organization_can_buy(org)` · `organization_can_sell(org)` · `is_platform_admin()` (ADMIN or
SUPER_ADMIN) · `is_super_admin()` · `is_compliance_operator()` · `is_warehouse_operator()` ·
`is_finance_operator()` · `is_auditor()` · `can_view_order(order)`.

`organization_can_buy/sell` already encode "organization `ACTIVE` **and** (Hills-internal **or** has
an `APPROVED` `kyb_applications` row)" **and** the respective `can_buy`/`can_sell` flag. The
application must never re-derive that rule (001 FR-008).

Role functions are hierarchical: `is_warehouse_operator()` is true for `WAREHOUSE`, `ADMIN`, and
`SUPER_ADMIN` (same shape for compliance/finance/auditor).

**Feature 003 addition**: `kyb_storage_object_authorized(object_name, require_editable)` —
`SECURITY DEFINER`, used only inside the `kyb-evidence` Storage policies. Checks
`is_blocked_user()` **before** the admin/compliance short-circuit (a blocked identity is denied even
if it also holds a `platform_admins` row), then parses and cross-verifies the object path's
organization/application ids against the real `kyb_applications` row.

## 3. Enforced state vocabularies (CHECK constraints — use these words verbatim)

| Object | States |
|---|---|
| `organizations.status` | `PENDING_KYB`, `UNDER_REVIEW`, `ACTIVE`, `SUSPENDED`, `REJECTED`, `CLOSED` |
| `kyb_applications.status` | `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `RESUBMISSION_REQUIRED`, `SUSPENDED` |
| `kyb_reviews.decision` | `APPROVED`, `REJECTED`, `RESUBMISSION_REQUIRED`, `SUSPENDED` |
| `coffee_offers.status` | `DRAFT`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `PUBLISHED`, `PARTIALLY_FILLED`, `SUSPENDED`, `SOLD_OUT`, `ARCHIVED` (+ CHECK: `is_visible` ⇔ status ∈ {`PUBLISHED`,`PARTIALLY_FILLED`}) |
| `listing_reviews.decision` | `APPROVED`, `REJECTED`, `SUSPENDED` |
| `orders.status` | `DRAFT`, `CONFIRMED`, `HOLD`, `PAYMENT_PROOF_SUBMITTED`, `PAYMENT_UNDER_REVIEW`, `PAID`, `FULFILLMENT_IN_PROGRESS`, `PARTIALLY_DELIVERED`, `COMPLETED`, `EXPIRED`, `VOID`, `DISPUTED` |
| `payments.status` | `PENDING`, `PROOF_SUBMITTED`, `UNDER_REVIEW`, `CONFIRMED`, `REJECTED`, `EXPIRED`, `VOID` |
| `payments.payment_method` | `BANK_TRANSFER`, `PROVIDER` |
| `payment_reviews.decision` | `CONFIRMED`, `REJECTED` |
| `payouts.status` | `PENDING_PAYOUT`, `PROCESSING`, `PAID`, `VOID` |
| `proforma_invoices.status` | `ISSUED`, `PAID`, `VOID` |
| `order_shipments.status` | `DRAFT`, `REQUESTED`, `CAPACITY_CONFIRMED`, `READY`, `RESERVED`, `PICKING`, `BOOKED`, `DISPATCHED`, `PARTIALLY_DELIVERED`, `DELIVERED`, `CANCELLED`, `FAILED`, `DISPUTED` |
| `inventory_reservations.status` | `ACTIVE`, `CONSUMED`, `RELEASED`, `EXPIRED` |
| `inventory_ownership_events.event_type` | `INITIAL_ALLOCATION`, `SALE`, `RESALE`, `ADJUSTMENT`, `VOID` |
| `storage_allocations.status` | `STORED`, `RELEASED`, `DELIVERED` |
| `disputes.status` | `OPEN`, `UNDER_REVIEW`, `FROZEN`, `RESOLVED`, `REJECTED`, `CLOSED` |
| `coffee_lots.status` | `AVAILABLE`, `SOLD_OUT`, `ARCHIVED` |
| `coffees.status` | `DRAFT`, `PUBLISHED`, `ARCHIVED` |
| `origins.status` | `ACTIVE`, `INACTIVE`, `ARCHIVED` |
| `platform_admins.role` | `ADMIN`, `SUPER_ADMIN`, `COMPLIANCE`, `WAREHOUSE`, `FINANCE`, `AUDITOR` |
| `organization_members.member_role` | `OWNER`, `MEMBER` |
| `price_sources.delay_type` | `REAL_TIME`, `DELAYED`, `DAILY`, `MANUAL` |
| `price_sources.licence_status` | `PENDING`, `APPROVED`, `RESTRICTED`, `DISABLED` |
| `price_differentials.differential_type` | `ORIGIN`, `QUALITY`, `CERTIFICATION`, `CROP`, `COMMERCIAL`, `OTHER` |

Transitions are policed by triggers: `validate_order_transition`, `validate_offer_transition`,
`validate_shipment_transition`, `validate_order_item_offer`, `validate_shipment_item`,
`validate_inventory_location`, `validate_support_ticket`, plus history/audit triggers
(`record_order_status_history`, `record_listing_status_history`, `record_account_status_history`,
`write_audit_log`) and `prevent_ownership_event_mutation` (ownership ledger is append-only).

## 4. Publicly readable tables (RLS allows anonymous SELECT)

`coffees` (status `PUBLISHED` only) · `coffee_media`/`coffee_translations`/`coffee_tags`/
**`coffee_certifications`** (only for published coffees) · `origins` (`ACTIVE`) ·
`origin_translations` · `regions` · `coffee_types` · `coffee_varieties` · `processing_methods` ·
**`packaging_types`** · `tags` · `warehouses` (`is_active`) · `price_sources` (`is_active` **and**
`licence_status = 'APPROVED'`) · `price_observations` (only from such sources) ·
`price_differentials` (`is_active`).

Everything else requires authentication and, in most cases, organization membership or an
operational role.

> ### RLS permits it — but check which role can actually evaluate the policy (**DB-BLOCK-10**, resolved)
>
> The list above describes the **RLS predicates**. It does not automatically describe what an
> anonymous client gets. Measured live against the running database on 2026-09-09, **after** the
> DB-BLOCK-10 migration:
>
> | Anonymous `SELECT` | Tables |
> |---|---|
> | **Succeeds** (13) | `coffees` (`PUBLISHED`), `origins` (`ACTIVE`), `coffee_tags`, `coffee_certifications`, `coffee_media`, `coffee_translations`, `origin_translations`, `regions`, `coffee_types`, `coffee_varieties`, `processing_methods`, `packaging_types`, `tags` |
> | **Still fails `42501`** (4) | `warehouses`, `price_sources`, `price_observations`, `price_differentials` — deliberately **out of the migration's scope**; Feature 002 queries none of them. Feature 011 must resolve the price tables the same way before it can publish reference prices |
>
> Status gating is intact: `DRAFT`/`ARCHIVED` coffees and `INACTIVE`/`ARCHIVED` origins remain
> invisible anonymously, `anon` still cannot execute `is_platform_admin()`, cannot read any private
> table, and cannot insert, update or delete on any catalogue table.
>
> **The original cause, kept because the trap is easy to reintroduce.**
> `is_platform_admin()` is granted `EXECUTE` to `authenticated` and `service_role` only,
> never to `anon`. Every catalogue table also carries a `catalog_admin_*` policy declared
> `FOR ALL TO public USING (is_platform_admin())`, and `TO public` includes `anon`. PostgreSQL OR-s
> permissive policies and checks function `EXECUTE` when the expression is evaluated: where the
> sibling `public_read_*` predicate is a literal `true` the planner folds the OR away and the
> function is never called; where it is anything else — `status = 'PUBLISHED'`,
> `status = 'ACTIVE'`, or an `EXISTS` subquery — the admin branch is evaluated and the whole
> statement aborts with `42501 permission denied for function is_platform_admin`. **A permissive
> policy the caller cannot evaluate does not degrade to "false"; it raises an error.**
> `coffee_translations` and `origin_translations` carry no admin policy of their own — they inherit
> the fault through an `EXISTS` subquery that reads `coffees` / `origins` under RLS.
>
> The approved audit did not catch this: its three `anon` checks are all *negative*
> ("anon must **not** …"), and none asserts the positive capability that anonymous visitors can read
> published catalogue rows.
>
> **Status: RESOLVED for Feature 002's surface (2026-09-09).**
> `supabase/migrations/20260909000000_db_block_10_scope_catalog_admin_policies.sql` re-scoped the
> five `catalog_admin_*` policies on `coffees`, `origins`, `coffee_tags`, `coffee_certifications`
> and `coffee_media` from `TO public` to `TO authenticated`. A policy whose `TO` clause excludes the
> current role is never applied, so the helper is never invoked and anonymous reads fall through to
> `public_read_*` alone — the intended boundary. No `EXECUTE` grant was added to `anon`, so least
> privilege is preserved and the audit's "Anon sensitive function execute" check still passes. The
> two translation tables were released by the same change, with no statement of their own. A paired
> `.rollback.sql` restores `TO public`. See §9 → **DB-BLOCK-10**.
>
> **The lesson to carry forward:** when adding a `TO public` policy that calls a helper, confirm the
> `anon` role can execute that helper — or scope the policy to `authenticated`. Verify by *reading
> as `anon`*, never by reading the policy text.

**Two cautions for public surfaces** (both enforced by Feature 002's
`contracts/public-dto-allowlist.md`):

- **`warehouses` is anonymously readable but must not be published.** The row carries
  `owner_organization_id`, `address`, `city` and `code` — owner identity and exact location, which
  SEO-APP-02 forbids on a public surface. Being RLS-readable is not authorisation to render it.
  Feature 002 does not query this table at all.
- **Quality/grade data is NOT public.** `coffee_lots` (`crop_year`, `quality_grade`, `cup_score`)
  requires `is_authorized_member()` — and its policy is additionally suspect (DB-OPEN-05). Public
  coffee pages therefore cannot show grade, cup score or crop year; only the taxonomy
  (type/variety/processing/packaging), origin, description, tags and certifications are available.
- Every public table row still carries internal columns (`created_by`, `updated_by`,
  `created_at`/`updated_at`). These are staff identity and internal bookkeeping: never place them in
  a public DTO. Select explicit column allowlists rather than `select *`.

## 5. Member-visible private tables (organization-scoped)

`organizations` (own org) · `organization_members` (own) · `profiles` (own) · `coffee_offers`
(`is_authorized_member()` + PUBLISHED/PARTIALLY_FILLED, or own org's offers) · `orders`/`order_items`/
`order_financials`/`payments`/`proforma_invoices`/`tax_invoices` (via `can_view_order`) ·
`inventory_positions`/`storage_allocations` (own org) · `order_shipments`/`shipment_items` ·
`disputes`/`dispute_evidence` · `payouts` (seller org) · `agreement_acceptances` ·
`notifications` (own user) · `notification_preferences` (own user) · `kyb_applications`/
`kyb_documents` (own org) · `support_tickets`/`support_messages`.

## 6. Writes a member may perform directly (everything else goes through a function)

| Table | Allowed write | Guard |
|---|---|---|
| `kyb_applications` | INSERT | `is_org_member(org)` AND `submitted_by = auth.uid()` AND not blocked |
| `kyb_documents` | ALL | org member of the application's org |
| `file_assets` | ALL | uploader, org member, or admin |
| `coffee_offers` | ALL (own org) | `is_org_member(seller_organization_id)`; INSERT/UPDATE also require `created_by = auth.uid()` |
| `orders` | INSERT (`DRAFT` only) | `is_org_member` AND `organization_can_buy` AND `created_by = auth.uid()` |
| `orders` | UPDATE (`DRAFT`/`CONFIRMED` only) | org member |
| `order_items` | INSERT | parent order is `DRAFT` and caller is a member of its buyer org |
| `order_shipments` | INSERT (`DRAFT`), UPDATE (`DRAFT` → `DRAFT`/`REQUESTED`) | buyer org member |
| `shipment_items` | INSERT/UPDATE while shipment is `DRAFT` | buyer org member |
| `disputes` | INSERT | `opened_by_user_id = auth.uid()` AND `can_view_order` AND not blocked |
| `dispute_evidence` | INSERT | uploader can view the dispute's order |
| `agreement_acceptances` | INSERT | `user_id = auth.uid()` AND org member AND not blocked |
| `notification_preferences` | ALL | own user |
| `support_tickets` / `support_messages` | INSERT | `auth.uid()` is the requester/author |

## 7. Operational-role write surfaces

- **COMPLIANCE** — `kyb_applications` (ALL), `organizations` (UPDATE), `profiles` (UPDATE),
  `coffee_offers` (UPDATE), `disputes` (UPDATE), read `coffee_offers`.
- **WAREHOUSE** — `inventory_positions` (ALL), `storage_allocations` (ALL), `order_shipments` (ALL),
  `shipment_items` (ALL).
- **FINANCE** — `admin_review_payment()` (the settlement transaction), `payouts` (ALL),
  `tax_invoices` (ALL), read `payments`/`payment_proofs`/`order_financials`.
- **AUDITOR** — read-only across `coffee_offers`, `disputes`, `payments`, `order_financials`,
  `inventory_positions`, `storage_allocations`, `payment_proofs`, `agreement_acceptances`.
- **ADMIN / SUPER_ADMIN** — `is_platform_admin()` covers catalog tables (`coffees`, `coffee_lots`,
  `origins`, `regions`, taxonomy, `warehouses`, price tables), `organizations`,
  `organization_members`, `order_items`, `audit_logs` (read). `SUPER_ADMIN` alone manages
  `platform_admins`.

---

## 8. Commission capability (configuration → checkout snapshot → settlement)

**DATABASE COMMISSION CAPABILITY: IMPLEMENTED.**
**FINANCIAL WORKFLOW CONSUMER: Feature 008.**
**ADMIN MANAGEMENT UI: PLANNED — Feature 010** (not implemented; no commission admin screen exists).

Full behavioural reference: **[`docs/database/commission-capability.md`](../database/commission-capability.md)**.
Summary for planning:

| Aspect | Verified behaviour |
|---|---|
| Objects | `commission_policies`, `commission_tiers`, `order_financials`, `payouts`, `checkout_order()`, `admin_review_payment()` |
| Tier basis | **Total order quantity** (`sum(order_items.quantity_kg)`) — **not** progressive/marginal banding |
| Band match | `min_quantity_kg <= total` (inclusive) AND (`max_quantity_kg IS NULL` OR `total < max_quantity_kg`) (exclusive); NULL max = open-ended |
| Policy eligibility | `status = 'ACTIVE'` AND `effective_from <= now()` AND (`effective_until IS NULL` OR `effective_until > now()`); ties broken by latest `effective_from`, then highest matching `min_quantity_kg` |
| Commission base | `order_financials.base_subtotal` (shipping and VAT are **not** in the base) |
| Snapshot written at | **Checkout** (`checkout_order`) → `commission_policy_id`, `commission_percentage_snapshot`, `commission_amount`, `seller_net_amount`, `total_quantity_kg` |
| Settlement/payout | `admin_review_payment` reads `commission_percentage_snapshot`; it **never** re-reads current tiers. Member-seller payouts = line base − line commission, upserted per `(order_id, seller_organization_id)` |
| Mutation rights | `is_super_admin()` only, on both tables (USING and WITH CHECK). `ADMIN` is insufficient. No public/member read path |
| Historical immutability | **Required.** A later policy/tier edit affects eligible FUTURE checkouts only, and must never recalculate previous `order_financials`, commission amounts, seller net amounts, or existing `payouts` |

**Application rule**: commission is never recomputed in TypeScript, and a historical order's
commission is always read from the `order_financials` snapshot — never derived from current tiers.

---

## 9. Recorded BLOCKERS and OPEN ITEMS (do **not** resolve with a migration)

These are genuine gaps between SRS intent and the approved baseline, surfaced during 002–012
planning. Each must be decided through the Constitution's database-change process (explicit
approved requirement → migration → backward-compat review → authorization/RLS review → integrity
review → re-audit) before the dependent feature can be fully implemented.

| ID | Finding | SRS reference | DB evidence | Features blocked |
|---|---|---|---|---|
| **DB-BLOCK-01** *(RESOLVED for Feature 003's KYB-document scope, 2026-09-10)* | Zero Supabase Storage buckets existed (`storage_buckets: []`, `storage_policies: []`); `file_assets` rows could be created but had nowhere to store bytes. **Fixed** by `supabase/migrations/20260911010000_feature_003_kyb_foundation.sql`: a private `kyb-evidence` bucket (10 MiB limit, `application/pdf`/`image/jpeg`/`image/png` only), organization/application-scoped object policies, and `attach_kyb_document` as the sole metadata-write seam. **Live-verified 2026-09-10 (T010g)**: bucket config, own-org member upload under the canonical path, denial of cross-org path/anonymous/cross-org-read/member-overwrite/member-delete, Compliance read access, the real `storage.objects.metadata` shape (`{eTag, size, mimetype, cacheControl, lastModified, contentLength, httpStatusCode}` — confirms `metadata->>'mimetype'`/`metadata->>'size'` are the real, authoritative keys), and a genuine MIME-mismatch rejection (`mime_type_mismatch`) all passed against the live database. 008/009/012's own document-handling needs remain their own features' responsibility — this resolves only the KYB-evidence bucket/path/RPC this migration owns. | KYB-02 (private storage, restricted download, access logging); §13.3 (public/private buckets separated) | Live Storage API + RPC calls, 2026-09-10 | 003 (resolved) — 008, 009, 012 still need their own document-handling capability if not KYB-shaped |
| **DB-BLOCK-02** | **No destination for a public/anonymous RFQ.** `support_tickets` INSERT requires `requester_user_id = auth.uid()`, so an unauthenticated visitor cannot submit an RFQ; there is no `rfq`/`inquiry` table. | §6.1 (RFQ/quote stage), C.1 step 4 ("visitor may submit RFQ") | `support_tickets` policy `tickets_insert_own` | 002 (public RFQ form) |
| **DB-BLOCK-03** *(RESOLVED, 2026-09-10)* | `organizations` had no INSERT policy for non-admins, and `organization_members` writes were `is_platform_admin()` only, so an applicant could not create an org or attach themselves before submitting KYB. **Fixed** by the same migration: `start_organization_onboarding`, a narrowly scoped `SECURITY DEFINER` RPC — never a broad INSERT policy. **Live-verified 2026-09-10 (T010g)**: anonymous/blocked callers denied; a valid verified unattached user creates exactly one `PENDING_KYB` organization + caller `OWNER` membership with server-derived `can_buy`/`can_sell` and no caller-controlled `HILLS_INTERNAL`/`ACTIVE`/`APPROVED`/capability/role field (confirmed via a rejected unknown-parameter RPC call, not inferred from source text); a retry returns a controlled `{ok:false, conflict:"already_member"}` naming no organization (never `organizations[0]`); `organization_can_buy`/`organization_can_sell`/`is_authorized_member` all correctly return `false`/deny for the new `PENDING_KYB` organization. The email-verification branch (`email_not_verified`) could not be independently live-exercised — this Supabase project's Auth configuration refuses to issue any session for an unconfirmed account through either `signInWithPassword` or self-service `signUp`, so the scenario the branch defends against cannot occur via the real sign-in path at all in this project as currently configured; this is reported honestly as not safely runnable rather than assumed. | C.1 step 5 ("applicant creates/uses an account to submit company/legal evidence"); KYB-01 | Live RPC calls, 2026-09-10; `organizations_admin_all`/`members_admin_write` unchanged, still the admin fallback | 003 (resolved) |
| **DB-BLOCK-04** | **Notifications can be neither created nor marked read.** `notifications` exposes only a SELECT policy (`notifications_own`) — no INSERT, no UPDATE — and **no trigger anywhere in the schema creates notifications**. The notification system is therefore non-functional end to end, not merely missing a read-state path. | §12 (notifications), design-system notification screens | `notifications` policies; trigger inventory contains no notification-generating trigger | 012, 004 (notification centre) |
| **DB-OPEN-05** | `coffee_lots` member-read policy predicate reads `co.lot_id = co.id` (self-comparison inside `coffee_offers`), which appears never to be satisfiable — members may be unable to read lot detail behind a listing. Possibly an intentional narrowing, possibly a defect. | LOT-01 (stable lot identity visible across purchase/storage/resale) | policy `member_read_trade_lots` | 005, 006 (lot detail views) |
| **DB-OPEN-06** | `audit_logs` SELECT is restricted to `is_platform_admin()` (ADMIN/SUPER_ADMIN). The `AUDITOR` role — which the SRS describes as having read-only audit access — cannot read it. | §3.1 ("Administrator / auditor: system configuration or read-only audit access"), §13.5 | policy `audit_admin_read` | 010, 012 (auditor evidence views) |
| **DB-OPEN-08** | **No FX / conversion storage.** PX-03 requires unit/currency conversions (cents/lb → USD/MT → USD/kg) to be auditable with FX source, timestamp and defined rounding, but the schema has no FX/rate table and `price_observations` stores only the raw observation. Auditable conversion is therefore impossible; only raw source values may be displayed. | PX-03 | table inventory contains no FX/rate/conversion table | 011 (pricing), 002 (public price presentation) |
| **DB-OPEN-09** | **Dispute "freeze" has no mechanism, and compliance cannot apply it.** MKT-07 says a dispute can freeze affected quantity, settlement and trading. But (a) no trigger exists on `disputes`, so opening one has no automatic effect; (b) a freeze would have to come from setting the affected order/shipment to `DISPUTED`; and (c) `orders` UPDATE is restricted to the buyer (DRAFT/CONFIRMED only) or `is_platform_admin()` — so a **COMPLIANCE operator cannot set an order to `DISPUTED`** even though compliance owns dispute resolution. | MKT-07 | `disputes` trigger inventory (none); `orders_update_buyer_or_admin` policy | 012 (disputes), 010 (compliance console) |
| **DB-BLOCK-07** | **A delivery request does not reserve inventory.** The only triggers on `order_shipments` are `sync_shipment_ready` (sets `ready_at`/`orders.shipping_ready_at`), `validate_shipment_transition` and `set_updated_at` — none touches `inventory_positions.reserved_quantity_kg` — and no delivery-reservation function exists. Quantity requested for delivery therefore remains available for listing and sale, and there is no restore-on-cancellation path. **This means release-blocking AC-04 cannot pass.** | DEL-01 ("approved delivery request atomically reserves quantity"; "once reserved… unavailable for new listing, new sale, another delivery reservation"; "cancellation must restore quantity exactly once"), **AC-04** | `order_shipments` triggers; function list contains no delivery-reservation function | 009 (delivery), 005/006 (availability truth) |
| **DB-BLOCK-10** *(RESOLVED 2026-09-09)* | **The `anon` role could not read the public catalogue.** `is_platform_admin()` is granted `EXECUTE` to `authenticated`/`service_role` only, never `anon`, while every catalogue table carried `catalog_admin_* FOR ALL TO public USING (is_platform_admin())`. PostgreSQL evaluated that permissive branch alongside `public_read_*`, so an anonymous `SELECT` aborted with `42501 permission denied for function is_platform_admin` instead of the policy simply evaluating false — 11 of the 17 tables §4 lists as anonymously readable were not. **Fixed** by scoping the five Feature-002 `catalog_admin_*` policies to `authenticated` (`supabase/migrations/20260909000000_db_block_10_scope_catalog_admin_policies.sql`); no grant was added to `anon`. `warehouses` and the three `price_*` tables were out of scope and still fail — Feature 011 must resolve those before publishing reference prices. | §5.1 (public catalogue must be crawlable/anonymously readable), SEO-APP-01, AC-07 | Live 2026-09-09 post-migration: anon reads all 13 in-scope tables; status gating, admin denial and write denial all re-verified | 002 (resolved), 011 (price tables still open) |

**How a feature handles these**: plan the surrounding UI/flow, mark the blocked step explicitly in
that feature's spec/tasks as depending on the blocker, and stop at the boundary. Do not invent a
workaround (e.g. a second "shadow" table, a service-role bypass, or client-side-only state) that
weakens the approved authorization model.

### Business/Finance decisions recorded against an implemented capability

These are **not** database defects and **not** implementation blockers for the features that merely
display the data. They are commercial decisions that must be made before production trading.

| ID | Finding | Evidence | Decision owner | Blocks |
|---|---|---|---|---|
| **COMMISSION-OPEN-01** | `checkout_order` initialises the commission rate to zero and coalesces to zero when no ACTIVE, in-force policy has a tier band covering the order's total quantity. The effective fallback is therefore **0% commission** — checkout succeeds, `commission_percentage_snapshot = 0`, and the member seller is paid the full base. The schema does not enforce gapless tier coverage, so a configuration gap produces this silently. **Question for MEMBER_SELLER checkout: (A)** explicitly allow 0% when no tier matches, or **(B)** fail closed with a commission-configuration error. *Not decided here.* | `commission_tiers` has no gapless-coverage constraint; `checkout_order` commission-rate default + `coalesce(rate, 0)`; see `docs/database/commission-capability.md` §8 | **Business/Finance**, via Feature 008 | Production trading readiness. **Does not block Feature 002.** If (B) is chosen it implies a database change through the approved process |
