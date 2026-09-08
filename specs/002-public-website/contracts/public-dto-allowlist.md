# Contract: Public DTO Allowlist

Governs FR-003, FR-022, SEC-002, SEC-005, SC-002; SRS SEO-APP-01 / SEO-APP-02; Constitution
Principle VII (Public vs. Private Data Boundary).

**The rule this contract exists to enforce**: a public page may only render fields that appear in a
table below. Everything else is private by default — including fields that RLS happens to allow an
anonymous client to read.

> **RLS readability is not publication authority.** Several columns are anonymously readable and
> still must never reach a public page (owner organization, exact warehouse address, internal staff
> ids). The allowlist, not RLS, is the publication boundary.

---

## 1. Selection discipline (how, not just what)

**Every public read MUST use an explicit column allowlist in the Supabase `select()` call.**

```ts
// CORRECT — the boundary is the query itself
.from("coffees").select("name, slug, description")

// FORBIDDEN — selects private columns then filters in TypeScript
.from("coffees").select("*")            // then delete row.created_by
.from("coffees").select()               // implicit all-columns
```

Why the discipline matters and not just the end result: a broad select puts private values into the
server's memory, into any intermediate log, and — the moment a DTO shape changes or a spread
(`...row`) is introduced — into the RSC flight payload. Allowlisting at the query makes leakage a
*compile-and-review* problem instead of a runtime one.

Corollaries:

- No `select("*")`, and no implicit-all `select()`, anywhere under `lib/public/`.
- No object spread of a raw database row into a DTO.
- Nested/joined selects allowlist their own columns too.
- Every public read function returns a **named DTO type**; pages consume the DTO, never a raw row.

---

## 2. Allowlisted public fields

### `coffees` (gate: `status = 'PUBLISHED'`)

| Column | Public? | Note |
|---|---|---|
| `name` | ✅ | |
| `slug` | ✅ | route identity |
| `description` | ✅ | |
| `status` | ⚠️ gate only | used to filter; never rendered |
| `id` | ⚠️ internal only | may be used to join server-side; **never** emitted to the client |
| `origin_id`, `coffee_type_id`, `variety_id`, `processing_method_id`, `packaging_type_id` | ⚠️ internal only | resolve to the related record's `name`/`slug`; never emit raw FKs |
| `created_by`, `updated_by` | ❌ | Hills staff identity |
| `created_at` | ❌ | internal bookkeeping |
| `updated_at` | ⚠️ server-only | permitted **solely** as `sitemap.xml` `lastmod`; never rendered in a page or DTO |

### `origins` (gate: `status = 'ACTIVE'`) · `regions`

| Column | Public? |
|---|---|
| `origins.name`, `origins.slug`, `origins.description`, `origins.country_code` | ✅ |
| `regions.name`, `regions.slug`, `regions.country_code` | ✅ |
| `origins.parent_origin_id`, `origins.region_id` | ⚠️ internal only — resolve to the parent/region `name`+`slug` |
| `origins.status` | ⚠️ gate only |
| `created_by`, `created_at`, `updated_at` | ❌ (`updated_at` server-only for sitemap `lastmod`) |

### Taxonomy — `coffee_types`, `coffee_varieties`, `processing_methods`, `packaging_types`, `tags`

| Column | Public? |
|---|---|
| `name`, `slug` | ✅ |
| `id`, `coffee_type_id` | ⚠️ internal only |
| `created_by`, `created_at` | ❌ |

### `coffee_certifications` (gate: parent coffee `PUBLISHED`)

| Column | Public? | Note |
|---|---|---|
| `name` | ✅ | |
| `expires_at` | ✅ | supports honest "valid until" presentation |
| `certificate_number` | ⚠️ **content/compliance decision** | RLS permits it, but publishing a certificate identifier is a disclosure decision, not a developer decision. Default: **do not render** until Content/Compliance approves |
| `file_asset_id` | ❌ | internal id; the file itself is blocked by **MEDIA-01** |
| `coffee_id`, `id`, `created_at` | ❌ / internal only |

Design-guidance rule #4 applies: only display certifications Hills can evidence and is authorised to
disclose.

### `coffee_media` (gate: parent coffee `PUBLISHED`)

| Column | Public? | Note |
|---|---|---|
| `sort_order`, `is_primary` | ✅ | ordering/selection metadata only |
| `file_asset_id` | ❌ | internal id — and no public delivery path exists (**MEDIA-01**) |
| `id`, `coffee_id`, `created_at` | ❌ / internal only |

Until MEDIA-01 is resolved, media slots render **stable labelled placeholders** with correct
dimensions/aspect ratio. No file URL is constructed, guessed, or proxied.

### `coffee_translations` / `origin_translations`

Readable, but Feature 002 is **English-first with no locale routing** (001 Clarify). These tables are
not used as a content source in this feature; base `name`/`description` are used. Recorded here so a
later agent does not mistake them for the missing CMS.

---

## 3. Never public — explicit denylist

Never queried, never joined to, never rendered, never placed in metadata, JSON-LD, or a sitemap:

| Category | Specifics |
|---|---|
| Owner / member identity | `owner_organization_id`, `seller_organization_id`, `source_organization_id`, `organizations.*`, `organization_members.*`, `profiles.*`, `created_by`/`updated_by` on any table |
| KYB | `kyb_applications.*`, `kyb_documents.*`, `kyb_reviews.*` |
| Private offers & trading | `coffee_offers.*` (including `unit_price_per_kg`, `is_visible`, MOQ, quantities), `offer_sensory_notes.*`, `offer_tags`, `offer_documents`, `listing_reviews.*` |
| Quantities & availability | `total_quantity_kg`, `reserved_quantity_kg`, `available_*`, `inventory_positions.*`, `inventory_reservations.*`, `inventory_reservation_items.*`, `inventory_ownership_events.*`, `storage_allocations.*` |
| Orders & money | `orders.*`, `order_items.*`, `order_financials.*` (**including every commission snapshot field**), `payments.*`, `payment_proofs.*`, `payment_reviews.*`, `proforma_invoices.*`, `tax_invoices.*`, `payouts.*` |
| Commission configuration | `commission_policies.*`, `commission_tiers.*` — **private commercial configuration**; see `docs/database/commission-capability.md`. Feature 002 owns no part of commission |
| Tax / shipping / bank config | `tax_rules.*`, `shipping_rules.*`, `payment_accounts.*` |
| Lots & quality | `coffee_lots.*` (`crop_year`, `quality_grade`, `cup_score`, `lot_code`) — member-only, and DB-OPEN-05 makes the policy suspect |
| Warehouses | `warehouses.*` entirely — anonymously readable but carries owner org, `address`, `city`, `code`. **Feature 002 does not query this table.** Generic custody/logistics claims are written as reviewed page copy, not derived from warehouse rows |
| Documents | `coffee_documents.*`, `file_assets.*`, `dispute_evidence.*` |
| Accountability | `audit_logs.*`, `disputes.*`, `notifications.*`, `support_tickets.*`, `support_messages.*`, `agreement_acceptances.*`, `*_status_history` |

**Public catalogue semantics** (SRS MKT-06; spec §Public catalogue semantics): public coffee pages
are *discovery* pages describing what Hills sources. They must not expose or imply member listings,
tradeable availability, MOQ, seller quantity, reserved quantity, seller identity, an executable
member price, or a private commission rate. Availability language must not imply a live order book.

---

## 4. What a public coffee page can actually show

Stated explicitly because the database constrains this more tightly than the design guidance implies:

**Available**: name, description, origin (+ region, country), coffee type, variety, processing
method, packaging type, tags, certifications (name/expiry), media placeholders.

**NOT available publicly**: grade, cup score, crop year (`coffee_lots` — member-only), any quantity,
any price, any seller. A public page must not imply these exist for a visitor.

Feature 002's acceptance criteria are written against the *available* set. If richer public
specification data is required later, that is a database-capability decision, not a query change.

---

## 5. Verification (how this contract is proven, not asserted)

1. **Canary test (primary)** — assert that no canary value appears in **any** of: raw public DTO
   output · SSR HTML · the RSC/Flight payload · `generateMetadata` output · JSON-LD · `sitemap.xml` ·
   the fully rendered public page.

   **Canaries Feature 002 may legitimately obtain** (seeded by task T006a, or already present):
   - the `description` sentinel on each non-public coffee (`DRAFT`, `ARCHIVED`) and non-public origin
     (`INACTIVE`, `ARCHIVED`) — proves status gating;
   - `coffee_certifications.certificate_number` — proves field-level allowlisting of a column RLS
     *does* expose but this contract withholds by default (§2);
   - the owner-organization display name **already seeded by Feature 001's fixtures** — no new row.

   **Not seeded by Feature 002**: contract price, reserved quantity, warehouse address and commission
   percentage would require creating `coffee_offers` / `coffee_lots` / `warehouses` / order-financial
   or commission rows, which this feature is forbidden to create. Their field *names* stay covered by
   check 2 below, and value-level canaries for them belong to the features that own those tables
   (006/007/008). A canary must never be obtained by manufacturing private business data.
2. **Structural test (secondary)** — assert no private field *name* from §3 appears in any
   `lib/public/*` export type or serialized output.
3. **Query-shape test** — assert no `select("*")` / implicit-all select exists under `lib/public/`,
   and that no denylisted table name appears in that directory.

Test 2 alone is insufficient: renaming a field in a DTO would defeat it. The canary test is what
actually proves the boundary, because it follows the *value*, not the label.
