# Implementation Plan: Sprint 2 — Notifications, Messaging, SEO & Final Integration

**Branch**: `014-notifications-messaging-seo` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

---

## 1. Summary

Sprint 2 completes the approved scope of the Hills Coffee Trading MVP following the successful production cutover of Sprint 1 (Feature 013 core commerce and stock reservations). Sprint 2 delivers four cohesive tracks without reopening or redesigning Sprint 1:
1. **In-App Notifications**: Safe database-backed read lifecycle (`mark_notification_read`, `mark_all_notifications_read`), unread badge in navigation, responsive notification feed, and transactional event creation for active order milestones (`PROFORMA_ISSUED`, `HOLD`, `EXPIRED`).
2. **Operational Support Messaging**: Utilizing existing production tables (`support_tickets`, `support_messages`) and active RLS to implement member-to-Hills support threads with order context, auditability, and zero cross-tenant leakage.
3. **SEO Completion**: Production root metadata (`metadataBase`, title templates), OpenGraph/Twitter cards, valid `schema.org` JSON-LD (`Organization`, `WebSite`, `Product`), and defense-in-depth `noindex` protection on private routes.
4. **Full-System Integration Testing & Polish**: Unified end-to-end integration test harness, M4b (9/9) and M4c (7/7) regression guards, responsive/RTL polish, and production build verification.

---

## 2. Technical Context

* **Language/Version**: TypeScript 5, Node.js 22+, React 19, Next.js 16.3.4 (App Router, Server Components, Server Actions).
* **Primary Dependencies**: `@supabase/ssr`, `@supabase/supabase-js`, `zod`, `lucide-react`, `tailwindcss` v4. (No new dependencies permitted).
* **Storage**: Supabase PostgreSQL 17 (linked remote project `mxejnutukgxyccnohglo` = `hillscoffees-trading`).
* **Testing**: Vitest (`npx vitest run`), Testing Library, custom PostgreSQL verification scripts.
* **Target Platform**: Vercel Serverless / Edge + Supabase Cloud.
* **Project Type**: Web Application (B2B Green Coffee Marketplace & Operations Console).
* **Constraints**:
  * Next.js-native caching only (Constitution Principle XI: no Redis/Upstash).
  * No external notification delivery providers (no email/SMS/WhatsApp SDKs).
  * No WebSocket Realtime infrastructure (Next.js Server Actions + lightweight client refresh on window focus).
  * Strict organization boundary enforcement at database RLS level.

---

## 3. Constitution Check

*GATE: Verified against `.specify/memory/constitution.md`.*

| Principle | Requirement | Compliance Analysis | Status |
|---|---|---|---|
| **I. Project Identity & Boundary** | Physical green-coffee B2B platform. No public exchange or anonymous trading. | Support messaging connects authenticated members directly to Hills Operations/Admin. No peer-to-peer or anonymous buyer-to-seller chat. | **PASS** |
| **II. Source of Truth** | SRS v1 > Database Schema Report > Design Guidance > Existing Code. | Reuses existing `support_tickets` and `notifications` schema defined in database baseline. | **PASS** |
| **III. Database Authority** | No casual renames. Forward migrations with rollback/postflight. | All database additions packaged in two clean forward migrations: `20260929100000_feature_014_notifications_lifecycle.sql` and `20260929110000_feature_014_support_ticket_reference.sql` with paired rollbacks and postflights. | **PASS** |
| **IV. Structure & Routing** | Root files stay in place. Group routing conventions respected. | `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` remain in place. Private routes live under `(auth)`, `dashboard`, and `dashboard-admin`. | **PASS** |
| **XI. Caching Infrastructure** | Next.js-native caching only. No Redis/Upstash. | Zero external cache dependencies. Notification badges and message threads use Next.js tag revalidation and client refetch. | **PASS** |
| **XIV. Security & Secrets** | Safe search_path, server-derived identity, no service_role in browser. | Notification RPCs use `search_path = pg_catalog, public`. Server Actions derive author/requester from `auth.uid()`. | **PASS** |
| **XV. Spec-Driven Lifecycle** | Traceable requirements, testable criteria, no unreviewed production mutation. | Fully documented spec, data model, contracts, and quickstart with explicit review gates. | **PASS** |

---

## 4. Project Structure & File Map

```text
specs/014-notifications-messaging-seo/
├── spec.md                       # Approved specification
├── plan.md                       # Implementation plan (this document)
├── research.md                   # Architecture & research decisions
├── data-model.md                 # Entity schema & state transitions
├── quickstart.md                 # Developer & verification guide
├── checklists/
│   └── requirements.md           # Specification quality checklist
└── contracts/
    ├── notifications.md          # Notification RPC & Action contracts
    ├── messaging.md              # Support messaging Action contracts
    └── seo-metadata.md           # SEO metadata & JSON-LD contracts

supabase/
├── migrations/
│   ├── 20260929100000_feature_014_notifications_lifecycle.sql   # Forward migration 1 (Notifications)
│   └── 20260929110000_feature_014_support_ticket_reference.sql  # Forward migration 2 (Ticket Reference)
├── rollback/
│   ├── 20260929100000_feature_014_notifications_lifecycle.rollback.sql
│   └── 20260929110000_feature_014_support_ticket_reference.rollback.sql
└── maintenance/
    ├── 20260929_feature_014_notifications_lifecycle_postflight.sql
    └── 20260929_feature_014_support_ticket_reference_postflight.sql

src/
├── app/
│   ├── layout.tsx                # Update root metadataBase, title template, OG/Twitter
│   ├── (public)/                 # Public routes: inject JSON-LD, canonicals
│   ├── dashboard/
│   │   ├── layout.tsx            # Header unread notification badge integration
│   │   ├── notifications/        # Updated feed, mark-as-read actions, unread styling
│   │   └── messages/             # NEW: Member support tickets & thread conversation UI
│   └── dashboard-admin/
│       └── (system)/messages/    # NEW: Admin support console & response interface
├── components/
│   ├── notifications/            # Unread badge, notification card, mark-read controls
│   ├── messaging/                # Ticket list, message thread, compose box, status pill
│   └── seo/                      # JSON-LD Organization, WebSite, and Product components
└── lib/
    ├── notifications/            # Read/write actions, unread counter, DTO mappers
    └── messaging/                # Ticket and message data access, Server Actions

tests/
├── commerce/migrations/
│   └── f014-notifications.test.ts # Static tests for notification migration
├── notifications/
│   └── notifications-lifecycle.test.ts # Notification action & component tests
├── support/
│   └── support-messaging.test.ts  # Messaging security, RLS & action tests
├── public/
│   ├── seo-boundary.test.ts       # Existing SEO boundary test (extended)
│   └── seo-structured-data.test.ts # NEW: JSON-LD and metadata completeness test
└── integration/
    └── full-system.test.ts        # End-to-end full system integration test suite
```

---

## 5. Phased Implementation & Task Order

Implementation is ordered strictly by dependency, minimizing friction while maintaining rigorous security verification:

### Phase A: Existing-State Verification & Security Baseline
* Inspect production database objects: confirm `notifications`, `support_tickets`, `support_messages` columns and active RLS policies.
* Re-run baseline suites: verify typecheck, lint, and commerce tests pass before writing new code.
* Pinned baseline evidence recorded.

### Phase B: Notification Backend Lifecycle & Migration
* **[CODEX REVIEW RECOMMENDED]**: Author forward migration `20260929100000_feature_014_notifications_lifecycle.sql`:
  * SECURITY DEFINER `mark_notification_read(p_notification_id uuid)`
  * SECURITY DEFINER `mark_all_notifications_read()`
  * SECURITY DEFINER `get_unread_notification_count()`
  * Partial index `idx_notifications_unread` on `(user_id) WHERE read_at IS NULL`
  * Order status change trigger `trg_notify_order_status_change` firing on `PROFORMA_ISSUED`, `HOLD`, `EXPIRED`
* Author paired rollback and postflight scripts (`postflight: 5/5 checks`).
* Implement static migration tests `tests/commerce/migrations/f014-notifications.test.ts` proving mutation is strictly constrained to `read_at` on own rows.
* Implement Server Actions in `src/app/dashboard/notifications/actions.ts` and data access in `lib/notifications/read.ts`.

### Phase C: Notification UI & Navigation Badge
* Update `src/app/dashboard/layout.tsx` to retrieve unread notification count and render visual badge on notification nav icon.
* Update `src/app/dashboard/notifications/page.tsx` and components:
  * Distinct styling for unread vs read notifications.
  * Individual "Mark as read" button per unread item.
  * Global "Mark all as read" button in page header.
  * Update `lib/notifications/limitations.ts` to reflect the active database-backed read capability.
  * Bilingual EN/AR strings in `lib/app/copy/{en,ar}.ts`.

### Phase D: Operational Messaging Backend & Security
* **[CODEX REVIEW RECOMMENDED]**: Author forward migration `20260929110000_feature_014_support_ticket_reference.sql`, paired rollback, and postflight:
  * Hardens `public.next_support_ticket_code()` with `search_path = pg_catalog, public` returning `HLP-YYYYMMDD-XXXXXXX`.
  * Updates trigger function `public.validate_support_ticket()` to enforce server-side code generation on INSERT and reject any modification of `ticket_code`, `requester_user_id`, or `requester_organization_id` on UPDATE.
  * Ensures unique constraint and index on `support_tickets(ticket_code)`.
* **[CODEX REVIEW RECOMMENDED]**: Author Server Actions in `src/app/dashboard/messages/actions.ts`:
  * `createSupportTicketAction`: Derives `requester_user_id = auth.uid()` and `requester_organization_id`, inserts ticket and initial message in transaction, returns generated `ticketCode`.
  * `sendSupportMessageAction`: Validates ticket open state, derives `author_user_id = auth.uid()`, appends message, updates ticket `updated_at`.
* Author Admin Server Actions in `src/app/dashboard-admin/(system)/messages/actions.ts`:
  * `adminUpdateTicketStatusAction`: Updates status/priority, restricted to `isPlatformAdmin`.
* Implement security tests `tests/support/support-messaging.test.ts` asserting:
  * `ticket_code` uniqueness, server-side generation (`HLP-YYYYMMDD-XXXXXXX`), and strict immutability on UPDATE.
  * User cannot spoof `author_user_id` or `ticket_code`.
  * Member of Org A receives error and 0 rows when requesting Org B's tickets.
  * Non-admins cannot invoke admin ticket management.

### Phase E: Operational Messaging Member & Admin UI
* Member Portal:
  * `/dashboard/messages/page.tsx`: Conversation list with status filter, ticket codes, and "New Inquiry" modal/page.
  * `/dashboard/messages/[ticketId]/page.tsx`: Full conversation thread view with message bubbles, staff distinction, order link pill, and reply box.
  * Link to create ticket directly from order detail (`/dashboard/orders/[orderId]/`).
* Admin Console:
  * `/dashboard-admin/(system)/messages/page.tsx`: Operational queue showing tickets with status/priority filters and assignment.
  * `/dashboard-admin/(system)/messages/[ticketId]/page.tsx`: Thread viewer with reply input and status transition controls (`OPEN` -> `IN_PROGRESS` -> `RESOLVED` -> `CLOSED`).
* Add navigation links to Member and Admin navigation sidebars.
* Bilingual EN/AR copy in `lib/app/copy/{en,ar}.ts`.

### Phase F: SEO Completion, Metadata & JSON-LD
* Root Metadata: Update `src/app/layout.tsx` with production `metadataBase`, title template, description, OpenGraph default image, and Twitter cards.
* Structured Data:
  * Implement `src/components/seo/json-ld-organization.tsx` on homepage (`/`).
  * Implement `src/components/seo/json-ld-coffee.tsx` on coffee detail page (`/coffee/[slug]/`).
* Boundary Defense:
  * Verify `robots: { index: false, follow: false }` on `/dashboard/layout.tsx`, `/dashboard-admin/layout.tsx`, `/(auth)/layout.tsx`, and all auth utility routes.
* SEO Tests:
  * Extend `tests/public/seo-boundary.test.ts` and add `tests/public/seo-structured-data.test.ts` asserting canonical URLs, robots headers, and JSON-LD schema validity.

### Phase G: Full-System Integration Testing
* **[CODEX REVIEW RECOMMENDED]**: Author `tests/integration/full-system.test.ts`:
  * Public Catalogue → Auth Boundary → Cart Add/Update → Quote Estimate → Proforma Issuance → Stock Reservation Confirmation → Countdown Validation → Support Ticket Inquiry → Notification Feed → Admin Controls.
* Incorporate M4b regression (9/9) and M4c reservation regression (7/7) into the integration runner.

### Phase H: Responsive, RTL & Accessibility Polish Pass
* Audit mobile viewports (< 640px) on messaging and notification feeds: ensure touch targets ≥ 44px and responsive drawer/sheet layouts.
* Audit Right-to-Left (RTL) Arabic layout: message bubble alignment, input directionality, icon mirroring.
* Add branded empty states and skeleton loading screens.

### Phase I: Independent Final Review & Preflight
* Complete static test pass across entire repository (`vitest run`).
* Run `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.
* Review migration file hashes, rollback scripts, and postflight queries.

### Phase J: Production Cutover Gate (Migration Apply & Verification)
* Dry-run migration against linked Production project:
  `npx supabase db push --linked --dry-run`
* Operator applies migration `20260929100000_feature_014_notifications_lifecycle.sql`.
* Run postflight verification: require 5/5 PASS.
* Re-run M4b regression (9/9 PASS) and M4c reservation regression (7/7 PASS).

### Phase K: Final Production Smoke Test & Sprint 2 Closure
* Verify live routes on Vercel (`https://hills-coffees-trading.vercel.app`):
  * Public homepage, coffee detail, sitemap.xml, robots.txt.
  * Member notification feed and unread badge.
  * Member support ticket creation and thread view.
  * Admin support console.
* Record final closure in tasks ledger.
* Declare Sprint 2: COMPLETE.

---

## 6. High-Risk Tasks Recommended for Codex Review

Per instructions, the following genuinely security-sensitive tasks are designated **CODEX REVIEW RECOMMENDED**:
1. **Task B1 (Notification RPCs & Migration)**: Verification of SECURITY DEFINER functions, `search_path`, parameter constraints, and ensuring no arbitrary column updates can occur (`20260929100000`).
2. **Task D1 (Support Ticket Reference Forward Migration)**: Verification of sequence generation, trigger immutability, and uniqueness for `ticket_code` (`20260929110000`).
3. **Task D3 (Messaging Server Actions & Cross-Tenant Guards)**: Verification that `author_user_id` and `requester_organization_id` cannot be forged, and that multi-tenant RLS prevents any cross-organization message leakage.
4. **Task G1 (Full-System Integration Test Runner)**: Comprehensive cross-surface test design ensuring no regressions in core financial and inventory invariants.
5. **Task J1 (Final Production Migration & Postflight Gate)**: Pre-apply review of SQL bytes, grants, rollback integrity, and production cutover verification for both forward migrations.
