# Feature Specification: Sprint 2 — Notifications, Messaging, SEO & Final Integration

**Feature Branch**: `014-notifications-messaging-seo`  
**Created**: 2026-09-28  
**Status**: Draft  
**Input**: User description: "SPRINT 2 — HILLS COFFEE TRADING Notifications, Messaging, SEO & Final Integration"

---

## Executive Summary & Scope Boundary

Sprint 1 successfully completed, verified, and applied the core commerce and reservation foundation to Production (`hillscoffees-trading`, project ref `mxejnutukgxyccnohglo`):
* Cart management and destination resolution (M4a)
* Deterministic multi-seller quote calculation and frozen proforma issuance (M4b, postflight 9/9)
* Atomic 20-minute stock reservation, opportunistic reclaim, and self-releasing lifecycle (M4c / `20260928120000_feature_013_stock_reservation.sql`, postflight 7/7)
* `BANK_TRANSFER_V1` order routing and timeline
* Platform commerce settings console

**Sprint 2 is the bounded completion sprint** delivering the remaining user-facing engagement, communication, discoverability, and quality gates for the approved MVP:
1. **In-App Notifications**: Unread badges, notification feed, mark-as-read lifecycle, and automated event emission for in-scope commercial events.
2. **Operational Messaging**: Secure ticket/thread-based communication between Member Organizations and Hills Operations/Admin (using the existing `support_tickets` and `support_messages` schema).
3. **Complete SEO & Boundary Hardening**: Production-ready metadata (replacing root boilerplate), OpenGraph, Twitter cards, JSON-LD structured data (`schema.org`), bilingual alternates, and strict noindex protection for private surfaces.
4. **Full-System Integration Testing**: End-to-end multi-surface test harness validating the live product without cancelled scope.
5. **Targeted Design & Accessibility Polish**: Mobile responsive trays, RTL alignment, touch target compliance, and loading/empty states.

### Explicitly Out of Scope (Cancelled Scope Remains Cancelled)
The following features were cancelled by owner directive in Sprint 1 and **MUST NOT** be reopened, designed, or implemented in Sprint 2:
* M5a bank-transfer proof upload and storage workflows
* M5b finance settlement and payment review queues
* Feature 009 external logistics/delivery provider integration
* M9 Stripe retirement or card payment integrations
* Automated escrow or settlement engine
* Native mobile applications
* Unrelated public website redesigns or new trading financial instruments

---

## Existing Architecture & Baseline Analysis

Before introducing any new code, the repository was audited to separate existing, partial, and missing components:

| Domain | Already Implemented (Production Baseline) | Partially Implemented | Missing (Sprint 2 Scope) |
|---|---|---|---|
| **Notifications** | `notifications` table (`id`, `user_id`, `org_id`, `read_at`), `notification_preferences` table & UI, `notification_events` table, `emit_notification_event()` DB function, dashboard nav link, honest list page. | `lib/notifications/read.ts` reads own notifications but omits `read_at` selection and unread counts. `lib/notifications/limitations.ts` enforces DB-BLOCK-04 (no update policy). | Forward migration adding `UPDATE` policy / RPC for `read_at`, unread count badge in header, "mark as read" / "mark all as read" actions, event emitters on active order flows. |
| **Messaging** | `support_tickets` and `support_messages` tables exist with complete RLS (`tickets_view_own_or_admin`, `tickets_insert_own`, `messages_ticket_access`, `messages_insert_access`). Public `/contact/` inquiry form. | Database schema and access control exist 100%; zero frontend integration in `src/app/dashboard` or `src/app/dashboard-admin`. | Member conversation list and thread detail (`/dashboard/messages`), Admin support console (`/dashboard-admin/messages`), Server Actions for sending messages and creating tickets. |
| **SEO** | `src/app/robots.ts` disallowing private routes, `src/app/sitemap.ts` generating public index, `src/app/(auth)/layout.tsx` noindex, page-level canonical URLs. | Root `src/app/layout.tsx` metadata is placeholder ("Create Next App"). Incomplete OpenGraph/Twitter cards on public pages. | Root `metadataBase`, title template, complete OpenGraph/Twitter social cards, JSON-LD (`Organization`, `WebSite`, `Product`), bilingual hreflang alternates, automated SEO boundary tests. |
| **Testing** | 800+ static and unit tests for commerce, database invariants, and UI components. | Fragmented suite runs; no single full-system integration runner covering the complete Sprint 1 + Sprint 2 user journey. | Unified end-to-end integration test suite, cross-surface smoke runner, accessibility and RTL regression assertions. |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Member In-App Notification Center (Priority: P1)

As an authorized organization member (buyer or seller), I want to see a notification badge in the application header when new events occur on my orders, and browse an unread/read notification feed so that I stay informed of critical milestones without external email dependencies.

**Why this priority**: Directly impacts user awareness during time-sensitive commercial steps (such as proforma issuance and 20-minute reservation countdowns). Delivers a self-contained in-app loop.

**Independent Test**: Can be tested independently by emitting a notification row for a test user, verifying the badge appears in the navigation bar, clicking the notification to view details, and marking it as read.

**Acceptance Scenarios**:
1. **Given** an authenticated member with 2 unread notifications, **When** they view any dashboard page, **Then** an unread counter badge displaying "2" appears beside the Notifications icon in the header.
2. **Given** a notification list with unread items, **When** the user clicks "Mark as read" on an item, **Then** its `read_at` timestamp is set in the database, its styling shifts from unread to read, and the header badge count decrements by 1.
3. **Given** multiple unread notifications, **When** the user clicks "Mark all as read", **Then** all unread notifications for that user are updated, and the header badge clears.
4. **Given** a buyer whose proforma invoice has just been issued, **When** the order transitions to `PROFORMA_ISSUED`, **Then** an in-app notification is generated for the buyer with a direct link to `/dashboard/orders/[orderId]/proforma/`.
5. **Given** an active stock reservation nearing expiry (e.g., 5 minutes remaining) or expired, **When** the state transition occurs, **Then** an in-app notification is recorded informing the buyer.
6. **Given** an authenticated user, **When** they query notifications, **Then** they can only view and mutate rows where `user_id = auth.uid()`.

---

### User Story 2 — Member-to-Operations Support & Order Messaging (Priority: P1)

As an authorized member, I want to communicate directly with Hills Operations and Admin support regarding my account or specific orders through threaded messages, so that inquiry history is preserved, auditable, and securely isolated to my organization.

**Why this priority**: Essential for a B2B Green Coffee trading platform where high-value physical transactions require operational coordination with Hills as the custody/settlement authority.

**Independent Test**: Can be tested independently by creating a ticket from an order page, sending a message, logging in as platform admin to view the ticket and reply, and verifying the member sees the reply.

**Acceptance Scenarios**:
1. **Given** an authorized member viewing an order detail or the support page, **When** they submit a message with a subject and body, **Then** a `support_tickets` row is created with an immutable server-generated ticket reference `ticket_code` (formatted `HLP-YYYYMMDD-XXXXXXX`, e.g., `HLP-20260928-0000001`), an optional separate `order_id` link, and the initial `support_messages` entry stored with `author_user_id = auth.uid()`.
2. **Given** an existing ticket, **When** the member or an administrator posts a reply, **Then** a new `support_messages` row is appended to the thread and the ticket's `updated_at` timestamp is refreshed.
3. **Given** a member belonging to Organization A, **When** they attempt to read or write messages for a ticket belonging to Organization B, **Then** database RLS and server action guards reject the request with an access denial.
4. **Given** a platform administrator in `/dashboard-admin/messages`, **When** they view the support queue, **Then** tickets are displayed chronologically with filter options by status (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`) and priority.
5. **Given** a member viewing their ticket list, **When** a ticket is updated or resolved by Hills, **Then** the current status is clearly presented with appropriate bilingual status badges.
6. **Given** member and administrator support interfaces (lists, detail headers, breadcrumbs, creation confirmation modals), **When** tickets are displayed, **Then** `ticket_code` is presented as the primary human-readable identifier, completely shielding internal UUIDs from standard presentation views.

---

### User Story 3 — Comprehensive Public SEO & Brand Discoverability (Priority: P2)

As a prospective green-coffee buyer or industry participant searching the web, I want to find authoritative, beautifully represented public pages for Hills Coffee with complete social cards, rich snippets, and bilingual Arabic/English discovery, while internal customer and administrative portals remain completely invisible to search engines.

**Why this priority**: Establishes Hills Coffee's digital brand authority in Dubai and the Arab region, optimizes indexation of published catalogue coffees and origins, and enforces strict boundary defense against indexing private data.

**Independent Test**: Can be tested independently by validating HTML `<head>` tags on all public routes for OpenGraph, Twitter, canonical, and JSON-LD schemas, and verifying `robots.txt` + `X-Robots-Tag: noindex` on all dashboard/admin/auth routes.

**Acceptance Scenarios**:
1. **Given** any public route (e.g., `/`, `/coffee/`, `/origins/`, `/about/`, `/contact/`, `/sourcing/`), **When** crawled by search engines, **Then** it serves valid title tags, meta descriptions, canonical URLs ending in `/`, OpenGraph tags (`og:title`, `og:description`, `og:image`, `og:url`), and Twitter card metadata (`summary_large_image`).
2. **Given** the root layout, **When** rendered, **Then** it defines `metadataBase: new URL("https://hillscoffee.com")` (or environment-configured domain) and dynamic title templating (`%s | Hills Coffee`).
3. **Given** the homepage (`/`), **When** inspected for structured data, **Then** it serves valid JSON-LD for `Organization` (naming Dubai headquarters, logo, official contact) and `WebSite`.
4. **Given** a published coffee detail page (`/coffee/[slug]/`), **When** inspected for structured data, **Then** it serves valid JSON-LD `Product` schema with origin, process, and variety details, strictly omitting unauthenticated executable transaction prices.
5. **Given** any private, authenticated, or infrastructure route (`/dashboard/*`, `/dashboard-admin/*`, `/auth/*`, `/sign-in`, `/sign-up`, `/continue`), **When** inspected, **Then** it serves `<meta name="robots" content="noindex, nofollow">` and is disallowed in `robots.txt`.
6. **Given** public bilingual pages, **When** inspected, **Then** valid language alternate links (`hreflang="en"` and `hreflang="ar"`) reference the corresponding localized views.

---

### User Story 4 — Full-System Commercial Integration Verification (Priority: P2)

As the platform engineering and compliance team, we want an automated full-system integration test suite covering the entire approved Sprint 1 + Sprint 2 user journey, so that regressions across catalogue, cart, proforma, reservation, notifications, messaging, and SEO are detected automatically before production release.

**Why this priority**: Guarantees system integrity across all interconnected modules and prevents regressions in previously verified database invariants.

**Independent Test**: Can be run via a dedicated test runner command (`npm run test:integration` or `npx vitest run tests/integration/full-system.test.ts`) reporting pass/fail across all domains.

**Acceptance Scenarios**:
1. **Given** the active codebase, **When** the integration suite runs, **Then** it tests the end-to-end flow: Public Catalogue → Auth Boundary → Cart Operations → Quote Calculation → Proforma Issuance → Stock Reservation Confirmation → Countdown Validation → Message Thread Creation → Notification Delivery → Admin Commerce Settings.
2. **Given** the database schema, **When** postflight suites run, **Then** all 7 M4c reservation checks and all 9 M4b issuance checks pass 100%.
3. **Given** the application build pipeline, **When** executing `npm run build`, `npm run lint`, and `npm run typecheck`, **Then** all commands exit with code 0 and zero lint/type errors.

---

### User Story 5 — Design System Consistency, RTL Parity & Accessibility (Priority: P3)

As a bilingual user navigating on desktop or mobile, I want consistent spacing, typography, touch targets, and natural Right-to-Left (RTL) Arabic layout behavior across messaging, notifications, and navigation, so that the experience feels premium and native in both languages.

**Why this priority**: Reinforces Hills Coffee's brand reputation and regulatory compliance with regional accessibility and localization standards.

**Independent Test**: Can be tested independently via mobile viewport (375px) and desktop (1440px) visual tests in both EN (LTR) and AR (RTL) modes.

**Acceptance Scenarios**:
1. **Given** the messaging interface in Arabic (RTL), **When** viewing conversation threads, **Then** message bubbles, timestamps, sender avatars, and input attachments mirror naturally without horizontal overflow.
2. **Given** the notification tray on mobile viewports (< 640px), **When** opened, **Then** it renders as an accessible sheet/drawer with touch targets ≥ 44px and traps focus correctly.
3. **Given** empty or loading states in notifications or messaging, **When** data is fetching or empty, **Then** branded skeleton loaders and informative empty screens (with Icon + bilingual copy) are displayed.

---

## Edge Cases

1. **Simultaneous Multi-Device Read State**: When a user marks notifications as read in one browser tab, other tabs reflect this on page refresh or notification center focus without stale cache overriding the DB state.
2. **Ticket Message Concurrency**: When multiple authorized organization members post to the same support ticket simultaneously, each message is appended in monotonic `created_at` order without race conditions or lost updates.
3. **Empty Message Body / Malicious Payload**: Message submission with empty strings or whitespace-only is rejected at the client and server layer; HTML tags in message bodies or notification titles are escaped safely (`UntrustedText`) without script execution.
4. **Soft-Deleted or Inactive Order Reference**: If a ticket references an `order_id` that is subsequently archived or cancelled, the ticket retains its `order_code_snapshot` so context is never lost.
5. **Rapid Unread Badge Polling**: Badge count retrieval is lightweight (indexed `count(*)` on `user_id` where `read_at IS NULL`) and does not perform full row scans.
6. **Crawler Route Fuzzing**: Search engines hitting non-existent dynamic slugs (`/coffee/invalid-slug/`, `/origins/fake/`) receive an immediate clean `404 Not Found` without redirect loops or 500 server crashes.
7. **Crawler Header Tampering**: Crawlers sending `Accept-Language: ar` or query params do not bypass canonical URL normalization.

---

## Requirements *(mandatory)*

### Functional Requirements

#### 1. In-App Notifications
* **FR-001**: System MUST provide an unread notification badge in the authenticated navigation bar displaying the current count of unread notifications for the signed-in user.
* **FR-002**: System MUST render a notification list page at `/dashboard/notifications/` displaying notifications ordered by `created_at DESC`, with visual distinction between unread (`read_at IS NULL`) and read states.
* **FR-003**: Users MUST be able to mark an individual notification as read via a single-click action, updating `read_at = now()`.
* **FR-004**: Users MUST be able to mark all unread notifications as read via a single action.
* **FR-005**: System MUST automatically generate an in-app notification when a proforma invoice is issued for an order (`order.proforma_issued`).
* **FR-006**: System MUST automatically generate an in-app notification when a stock reservation is confirmed (`order.reservation_confirmed`).
* **FR-007**: System MUST automatically generate an in-app notification when an active stock reservation expires (`order.reservation_expired`).
* **FR-008**: System MUST display notification titles, descriptions, and timestamps with full English and Arabic localization support.
* **FR-009**: System MUST provide responsive empty states and loading skeletons adhering to the Hills design system.

#### 2. Operational Messaging & Support
* **FR-010**: System MUST provide a member conversation dashboard at `/dashboard/messages/` listing all support tickets belonging to the member's organization.
* **FR-011**: Members MUST be able to initiate a new support conversation/ticket with subject, body, priority, and optional linked `order_id`.
* **FR-012**: System MUST generate an immutable, unique, human-readable `ticket_code` formatted `HLP-YYYYMMDD-XXXXXXX` (via sequence `public.support_ticket_code_seq` and generator `public.next_support_ticket_code()`) upon ticket creation.
* **FR-012a**: System MUST enforce database-level immutability on `ticket_code` via trigger `trg_support_ticket_validate`, rejecting any client or administrative mutation attempt on update.
* **FR-012b**: Member and admin UI surfaces (lists, thread headers, breadcrumbs, creation confirmation modals) MUST display `ticket_code` as the primary human-readable reference, completely concealing internal database UUIDs.
* **FR-013**: Members and platform administrators MUST be able to send follow-up messages within an open ticket thread.
* **FR-014**: System MUST record `author_user_id` derived strictly from the authenticated server session (`auth.uid()`), never allowing caller-supplied author IDs.
* **FR-015**: Platform administrators MUST have access to an operational support console at `/dashboard-admin/messages/` to view, filter, assign, and update ticket statuses (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`).
* **FR-016**: System MUST prevent message submission on tickets in `CLOSED` status unless reopened by an administrator.

#### 3. SEO Completion & Discoverability
* **FR-017**: Root layout MUST export a production-ready `metadata` object including `metadataBase`, site title template, global meta description, OpenGraph defaults, and Twitter card summary.
* **FR-018**: System MUST embed valid JSON-LD `Organization` and `WebSite` structured data on the homepage.
* **FR-019**: System MUST embed valid JSON-LD `Product` / `Offer` structured data on published coffee detail pages (`/coffee/[slug]/`), accurately referencing coffee origin, variety, and processing method.
* **FR-020**: System MUST output `hreflang` alternate links for English (`en`) and Arabic (`ar`) on all public marketing and catalogue routes.
* **FR-021**: All authenticated, administrative, internal, and authentication-flow routes MUST serve `<meta name="robots" content="noindex, nofollow">` and be disallowed in `/robots.txt`.
* **FR-022**: Canonical URLs on all public routes MUST resolve to fully-qualified HTTPS URLs with consistent trailing slashes.

#### 4. Full-System Integration & Quality
* **FR-023**: System MUST provide an automated integration test suite covering the full user journey from public catalogue browsing to order proforma, reservation, messaging, and notification verification.
* **FR-024**: System MUST maintain 100% pass rate on all existing M4b proforma issuance (9/9) and M4c reservation (7/7) postflight verification suites.
* **FR-025**: System MUST pass typechecking (`tsc --noEmit`), linting (`eslint .`), and Next.js production build (`next build`) with zero errors.

---

## Security & Isolation Requirements

* **SEC-001 (Notification Isolation)**: Database RLS MUST ensure `notifications` can only be queried or updated where `user_id = auth.uid()` or by platform administrators.
* **SEC-002 (Notification Mutation Guard)**: An authenticated user MUST ONLY be permitted to update the `read_at` field on their own notifications. Direct updates to `user_id`, `notification_type`, `title`, or `body` MUST be rejected.
* **SEC-003 (Ticket Organization Boundary)**: Members MUST NOT be able to view or post messages to tickets where `requester_organization_id` does not match an active organization membership of the authenticated user.
* **SEC-004 (Sender Impersonation Prevention)**: In `support_messages`, `author_user_id` MUST be populated strictly by the database default or server-validated session (`auth.uid()`). Any client attempt to inject an arbitrary `author_user_id` MUST be ignored or rejected.
* **SEC-005 (XSS & Untrusted Content)**: All user-generated text in message bodies, ticket subjects, and notification payloads MUST be rendered through escaping sanitizers or React untrusted text wrappers (`UntrustedText`) to prevent XSS.
* **SEC-006 (Zero Service-Role Browser Exposure)**: Frontend message and notification queries MUST use the user's authenticated Supabase client (`lib/supabase/server`), never bypassing RLS via `service_role`.
* **SEC-007 (Strict Indexing Defense-in-Depth)**: Private routes MUST employ dual-layer indexing protection: `robots.txt` disallow rules PLUS page-level `X-Robots-Tag: noindex, nofollow` HTTP headers / meta tags.
* **SEC-008 (Ticket Reference Immutability & Anti-Spoofing)**: `ticket_code` MUST be generated exclusively by server/database sequences upon insertion. Clients MUST NOT be able to choose, spoof, or modify `ticket_code` after creation; trigger `trg_support_ticket_validate` MUST abort updates that attempt to change `ticket_code`, `requester_user_id`, or `requester_organization_id`.

---

## Key Entities & Data Models

### 1. Notifications (`public.notifications`)
* `id` (UUID, PK): Unique notification identifier.
* `user_id` (UUID, FK to `auth.users`): Recipient user.
* `organization_id` (UUID, FK to `organizations`, nullable): Contextual member organization.
* `notification_type` (TEXT): Category code (e.g., `ORDER_PROFORMA_ISSUED`, `RESERVATION_CONFIRMED`, `RESERVATION_EXPIRING`, `RESERVATION_EXPIRED`, `SUPPORT_REPLY`).
* `title` (TEXT): Headline copy.
* `body` (TEXT): Descriptive message text.
* `entity_type` (TEXT, nullable): Referenced resource (`orders`, `support_tickets`, `disputes`).
* `entity_id` (UUID, nullable): Identifier of referenced resource.
* `read_at` (TIMESTAMPTZ, nullable): Timestamp when viewed/acknowledged. Null indicates unread.
* `created_at` (TIMESTAMPTZ): Monotonic creation time.

### 2. Support Tickets (`public.support_tickets`)
* `id` (UUID, PK): Unique ticket identifier.
* `ticket_code` (TEXT, UNIQUE): Human-readable code (e.g., `TKT-2026-0042`).
* `requester_user_id` (UUID, FK to `auth.users`): User who opened ticket.
* `requester_organization_id` (UUID, FK to `organizations`): Organization context.
* `order_id` (UUID, FK to `orders`, nullable): Optional order reference.
* `order_code_snapshot` (TEXT, nullable): Frozen order code string.
* `subject` (TEXT): Ticket title/topic.
* `status` (TEXT): `OPEN` | `IN_PROGRESS` | `RESOLVED` | `CLOSED`.
* `priority` (TEXT): `LOW` | `NORMAL` | `HIGH` | `URGENT`.
* `created_at`, `updated_at` (TIMESTAMPTZ).

### 3. Support Messages (`public.support_messages`)
* `id` (UUID, PK): Unique message identifier.
* `ticket_id` (UUID, FK to `support_tickets`): Parent conversation thread.
* `author_user_id` (UUID, FK to `auth.users`): User who authored message.
* `body` (TEXT): Text content of message.
* `attachment_file_id` (UUID, FK to `file_assets`, nullable): Optional attachment.
* `created_at` (TIMESTAMPTZ): Monotonic creation time.

---

## Success Criteria *(mandatory)*

* **SC-001 (Notification Responsiveness)**: Marking a notification as read or marking all as read updates the client UI and unread header badge in < 300ms.
* **SC-002 (Zero Cross-Org Leakage)**: 100% of automated tests assert that an authenticated member of Org A receives 0 rows and 403 Forbidden when attempting to access notifications or messaging threads belonging to Org B.
* **SC-003 (SEO Completeness)**: 100% of indexable public pages score valid on the Google Rich Results / Schema Validator test with zero syntax errors, and 100% of private routes emit `noindex`.
* **SC-004 (Core Commercial Invariants Maintained)**: All M4b proforma checks (9/9) and M4c stock reservation postflight checks (7/7) remain green with zero regressions.
* **SC-005 (Bilingual Coverage)**: 100% of user-facing UI strings for notifications, messaging, and metadata exist in both English and Arabic with zero fallback keys visible to users.
* **SC-006 (Zero Build/Lint Defect)**: `next build`, `tsc --noEmit`, and `eslint .` complete with exit code 0 and zero warnings/errors.

---

## Assumptions & Design Decisions

1. **Messaging Model**: As proven by the active database schema (`support_tickets` having `requester_organization_id` and `is_platform_admin()` RLS), communication is modeled as **Member Organization <-> Hills Operations/Admin**. Direct buyer-to-seller messaging is not part of the physical Green Coffee trading model, where Hills acts as central custody, quality, and settlement intermediary.
2. **Realtime vs Polling**: Given Sprint 2 constraints and simplicity requirements, messaging and notifications will rely on Next.js Server Actions with tag revalidation and lightweight client polling/re-fetching on window focus, avoiding complex WebSocket connection management unless Supabase Realtime channel subscription is trivially configured without extra infrastructure.
3. **No External Notification Provider**: Per SRS §12 and Sprint 2 scope, all notifications are strictly in-app notifications stored in `public.notifications`. No third-party email, SMS, or WhatsApp delivery credentials or SDKs are required or introduced.
4. **Targeted Design Scope**: No visual redesign of existing completed pages. Polish is strictly restricted to new components (messaging/notifications), empty/loading states, mobile responsive trays, and RTL alignment.

---

## Owner Decisions Required

* **OD-01 (Direct Buyer-to-Seller Messaging)**: Confirmed default is Member <-> Hills Support. If peer-to-peer (buyer directly messaging seller) is ever required, it will be considered for a future post-MVP release, as it requires substantial mediation and disintermediation governance.
* **OD-02 (Default Notification Retention)**: In-app notifications will remain in the database indefinitely until an automated cleanup cron job is authorized in a future operational maintenance release.
