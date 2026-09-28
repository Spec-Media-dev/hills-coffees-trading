# Research & Architecture Decisions: Sprint 2

**Feature**: `014-notifications-messaging-seo` (Sprint 2 — Notifications, Messaging, SEO & Final Integration)  
**Date**: 2026-09-28  
**Spec**: [spec.md](./spec.md)

---

## 1. Notification Security & Mutation Architecture

### Decision
Implement notification read lifecycle via **narrow SECURITY DEFINER PostgreSQL RPCs** (`mark_notification_read(p_notification_id uuid)` and `mark_all_notifications_read()`) plus a read-only unread counter RPC (`get_unread_notification_count()`), backed by a new forward migration (`20260929100000_feature_014_notifications_lifecycle.sql`).

### Rationale
* **Field Mutation Constraint**: PostgreSQL RLS policies operate at row granularity. A standard `UPDATE` policy on `public.notifications` (`USING (user_id = auth.uid())`) allows the caller to send any column updates (e.g. altering `title`, `body`, `created_at`, or `user_id`). Constraining updates to `read_at` via table grants or triggers is brittle.
* **Narrow RPC Security**: A SECURITY DEFINER function with `search_path = pg_catalog, public` and `auth.uid()` derivation ensures:
  1. Only `read_at` is updated (`SET read_at = coalesce(read_at, clock_timestamp())`).
  2. The target row must match `user_id = auth.uid()`.
  3. No caller argument can specify or spoof the target user.
  4. Execution privileges are restricted to `authenticated` (`REVOKE ALL FROM public, anon, service_role`).
* **Unread Counter**: An indexed count query on `notifications(user_id) WHERE read_at IS NULL` provides immediate < 5ms badge counts without transferring payload data over the wire.

### Alternatives Considered
1. *Direct Table UPDATE policy with column-level REVOKE*: PostgreSQL supports column-level privileges (`GRANT UPDATE (read_at) ON notifications TO authenticated`), but Supabase PostgREST clients and RLS interact inconsistently with partial column permissions, often causing cryptic 42501 permission errors. RPC is clean, auditable, and standard across this repo (matching M4a/M4b/M4c patterns).
2. *Client-side LocalStorage Read Tracking*: Explicitly rejected. DB-BLOCK-04 in Feature 012 noted that fake client-side tracking simulates an unbacked feature. Sprint 2 provides genuine database-backed multi-device read persistence.

---

## 2. Notification Event Emission for Active Product Flows

### Decision
Add a database trigger and helper function `commerce_emit_order_notification()` firing strictly on active Sprint 1 order status transitions:
1. `PROFORMA_ISSUED` → Emits notification with title "Proforma Issued" and link to proforma.
2. `HOLD` (Stock Reservation Confirmed) → Emits notification with title "Stock Reserved (20 min)" and hold deadline.
3. `EXPIRED` → Emits notification informing the buyer that reservation expired and inventory was returned.

### Rationale
* **Zero Cancelled Scope Leakage**: No events are created for cancelled workflows (M5a payment proof, M5b finance settlement, Feature 009 shipping tracking, or M9 Stripe).
* **Transactional Reliability**: Firing directly on the order status change ensures the notification is generated in the exact transaction that commits the reservation or issuance. If the order transaction rolls back, no spurious notification is recorded.
* **Audit Allowlist Compatibility**: Uses existing `write_audit_log_orders_redacted()` trigger without interference.

### Alternatives Considered
1. *Background pg_cron Worker*: Feature 013 originally planned M7b with a cron outbox processor. However, pg_cron introduces operational dependency and polling latency. Direct transactional in-app notification insertion is immediate, zero-infrastructure, and fails/commits atomically with the order.

---

## 3. Messaging Model & Authorization Topology

### Decision
Adopt **Member Organization ↔ Hills Operations/Admin** as the canonical messaging model, reusing the existing `support_tickets` and `support_messages` database tables and active RLS policies.

### Rationale
* **Schema Alignment**: The existing database schema (`support_tickets` having `requester_organization_id`, `requester_user_id`, and `is_platform_admin()` policies) was explicitly built for member-to-admin inquiries.
* **Physical B2B Trading Model**: Hills Coffee is a private B2B Green Coffee custodian and settlement platform (Constitution Principle I). Buyers and sellers trade physical inventory held in Hills custody; Hills operates as the counterparty, quality guarantor, and logistics operator. Peer-to-peer unstructured chat between buyers and sellers is unnecessary and invites disintermediation or unregulated negotiation.
* **Zero Schema Duplication**: No new tables (`conversations`, `direct_messages`, `chat_rooms`) are needed. All thread-based messaging is captured by `support_tickets` and `support_messages`.
* **Server-Authoritative Identity**: In Server Actions (`createSupportTicket`, `sendSupportMessage`), `author_user_id` and `requester_user_id` are derived strictly from `getRequestIdentity()` (`auth.uid()`). Any client input attempting to supply author or requester IDs is discarded.

### 3.1 Support Ticket Reference Convention & Immutability Architecture

#### Decision
Adopt the existing database-level reference code convention:
* **Prefix & Sequence**: Sequence `public.support_ticket_code_seq` generating `'HLP-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || lpad(nextval('public.support_ticket_code_seq')::text, 7, '0')` via `public.next_support_ticket_code()`.
* **Example Code**: `HLP-20260928-0000001` (matching `ORD-YYYYMMDD-XXXXXXX` and `PI-YYYYMMDD-XXXXXXX`).
* **Immutability & Hardening**: Author a clean forward migration `20260929110000_feature_014_support_ticket_reference.sql` that updates trigger function `public.validate_support_ticket()`:
  1. On `INSERT`: Force `new.ticket_code := public.next_support_ticket_code();` (overriding and ignoring any client-supplied input).
  2. On `UPDATE`: Reject any modification with `RAISE EXCEPTION 'ticket_code_immutable'` if `new.ticket_code IS DISTINCT FROM old.ticket_code`.
  3. Enforce immutability of `requester_user_id` and `requester_organization_id` on update.

#### Rationale
* **Consistency with Orders and Proformas**: The repository already uses `ORD-YYYYMMDD-0000001` for orders and `PI-YYYYMMDD-0000001` for proforma invoices. Using `HLP-YYYYMMDD-0000001` adheres directly to the existing convention without inventing ad-hoc formats.
* **Concurrency Safety**: PostgreSQL sequences (`nextval`) are atomic and non-blocking, operating outside row locks to guarantee concurrency-safe, monotonic generation even under high throughput.
* **Zero PII / Org Leakage**: The reference contains only a date and a sequential integer, ensuring zero leakage of user, tenant, or order details in the ticket identifier.
* **UI Clarity**: Members and administrators communicate using `ticket_code` across lists, detail headers, and support confirmations, entirely shielding internal database UUIDs from customer view.

---

## 4. Public SEO Architecture & Routing Constraints

### Decision
1. Fix root `src/app/layout.tsx` metadata by declaring `metadataBase: new URL("https://hillscoffee.com")`, title template `%s | Hills Coffee`, global description, and default OpenGraph/Twitter card configurations.
2. Invert root metadata defaults on all private routes (`/dashboard/**`, `/dashboard-admin/**`, `/auth/**`, `/sign-in`, `/sign-up`, `/continue`) with explicit `robots: { index: false, follow: false }`.
3. Retain single canonical URLs without prefixing `/en` or `/ar`, because the application uses client/cookie bilingual chrome switching on static canonical routes (`I18N-ROUTE-01`).
4. Inject JSON-LD structured data:
   * Homepage (`/`): `Organization` (Dubai headquarters, official brand) + `WebSite`.
   * Public Coffee Detail (`/coffee/[slug]/`): `Product` (botanical variety, origin country, process, cup profile) with honest non-executable information (no unauthenticated price quoting).

### Rationale
* **Routing Consistency**: Constitution Principle IV locks root routing files in place. `src/proxy.ts` and `components/locale/bilingual.tsx` demonstrate that language is rendered into dual spans in server HTML without URL path prefixes. Inventing `/en/` or `/ar/` would create 404 routes or break Next.js incremental cache.
* **Search Engine Protection**: Google and regional search engines strictly penalize private authenticated shells being indexed. Defense-in-depth requires both `robots.txt` disallows AND page-level `noindex` meta headers.

### Alternatives Considered
1. *Subpath routing (`/en/coffee`, `/ar/coffee`)*: Explicitly forbidden by prompt and `I18N-ROUTE-01`. Would require rewriting the entire Next.js router, middleware, and canonical cache architecture.

---

## 5. Integration Test Architecture

### Decision
Build a unified, deterministic integration test suite in `tests/integration/full-system.test.ts` executing end-to-end multi-surface assertions across the approved Sprint 1 + Sprint 2 lifecycle:
1. Public catalogue resolution and SEO metadata integrity.
2. Unauthenticated auth boundary defense (redirecting to `/sign-in/`).
3. Member cart & estimate calculation.
4. Proforma issuance and freeze verification (M4b).
5. 20-minute stock reservation and expiry lifecycle (M4c).
6. Support ticket creation, message posting, and cross-tenant access rejection.
7. In-app notification creation, unread badge calculation, and mark-as-read RPC execution.
8. Admin commerce settings controls and operational boundaries.

### Rationale
* Deterministic Vitest integration runs eliminate fragile browser timeout flakes while asserting real database and component contracts.
* Regression suites for M4b (9/9) and M4c (7/7) will be incorporated directly into the test runner.
