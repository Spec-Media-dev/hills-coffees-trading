# Quickstart & Verification Guide: Sprint 2

**Feature**: `014-notifications-messaging-seo` (Sprint 2 — Notifications, Messaging, SEO & Final Integration)  
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## 1. Prerequisites & Environment Setup

Verify the workspace is on the Sprint 2 branch with clean status:

```bash
git status
```

Verify linked Supabase project is `mxejnutukgxyccnohglo` (`hillscoffees-trading`):

```bash
cat supabase/.temp/project-ref
```

---

## 2. Database Migration Validation (Local First)

Run the static tests verifying the forward notification migration:

```bash
npx vitest run tests/commerce/migrations/f014-notifications.test.ts
```

Expected output:
* `mark_notification_read` updates only `read_at` on own rows.
* Attempts to mutate other columns or another user's rows fail.
* `get_unread_notification_count` returns exact unread integer.
* Order notification triggers fire strictly on `PROFORMA_ISSUED`, `HOLD`, and `EXPIRED`.

---

## 3. In-App Notifications Verification

Run the notification lifecycle unit and action test suite:

```bash
npx vitest run tests/notifications/notifications-lifecycle.test.ts
```

Expected verifications:
1. `listOwnNotifications` retrieves rows with `readAt` field and correct ordering.
2. `markNotificationReadAction` marks single notification read and updates count.
3. `markAllNotificationsReadAction` marks all user notifications read.
4. Unread badge displays correct count and hides when count is 0.

---

## 4. Operational Messaging & Support Verification

Run the messaging security and boundary tests:

```bash
npx vitest run tests/support/support-messaging.test.ts
```

Expected verifications:
1. `createSupportTicketAction` creates ticket and initial message with `author_user_id = auth.uid()`.
2. `sendSupportMessageAction` appends reply and bumps `updated_at`.
3. Member of Org A is strictly forbidden from querying or writing to Org B's tickets (RLS assertion).
4. Non-admin cannot call `adminUpdateTicketStatusAction`.
5. Sending a message on a `CLOSED` ticket is rejected.

---

## 5. SEO & Indexing Boundary Verification

Run the SEO and boundary test suite:

```bash
npx vitest run tests/public/seo-boundary.test.ts tests/public/seo-structured-data.test.ts
```

Expected verifications:
1. Root layout exports valid `metadataBase` and title template.
2. Public routes (`/`, `/coffee/`, `/origins/`, `/about/`, `/contact/`) have canonical URLs ending with `/`.
3. Homepage renders valid JSON-LD `Organization` and `WebSite`.
4. Coffee detail page renders valid JSON-LD `Product`.
5. Private routes (`/dashboard/*`, `/dashboard-admin/*`, `/(auth)/*`) render `<meta name="robots" content="noindex, nofollow">`.
6. `robots.txt` disallows `/dashboard`, `/dashboard-admin`, `/foundation-status`, `/internal-test/`.

---

## 6. End-to-End System Integration Suite

Run the full system regression and integration suite:

```bash
npx vitest run tests/integration/full-system.test.ts
```

Verify M4b issuance regression and M4c reservation regression:

```bash
# M4b 9/9 postflight
npx supabase db query --linked -f supabase/maintenance/20260926_feature_013_quote_and_proforma_issuance_postflight.sql

# M4c 7/7 postflight
npx supabase db query --linked -f supabase/maintenance/20260928_feature_013_stock_reservation_postflight.sql
```

---

## 7. Production Code Quality Gates

```bash
# TypeScript compiler check
npm run typecheck

# Linter check
npm run lint

# Production build validation
npm run build

# Git whitespace / patch check
git diff --check
```

All commands must exit with code 0 and zero warnings/errors.
