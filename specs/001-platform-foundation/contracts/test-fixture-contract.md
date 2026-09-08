# Contract: Test Fixtures & Authorization Test Coverage

Governs FR-029, FR-029a; Platform Story 2, Platform Story 6. Resolves Clarify Q2
("001 owns a documented seed/fixture mechanism").

## What `scripts/seed-test-fixtures.ts` creates

Run manually (`npm run test:seed`) against the same Supabase project used for development — never
against a production-labeled project. Idempotent: re-running it does not create duplicates (keyed
by fixed, documented email addresses).

| Fixture | Auth user? | Organization | `can_buy` / `can_sell` | `platform_admins` row |
|---|---|---|---|---|
| `buyer-only` | yes | yes, `ACTIVE`, KYB `APPROVED` | true / false | no |
| `buyer-and-seller` | yes | yes, `ACTIVE`, KYB `APPROVED` | true / true | no |
| `warehouse-admin` | yes | no | n/a | `role='WAREHOUSE'`, `is_active=true` |

No fixture creates inventory, listings, orders, payments, settlement, or dispute rows — those
tables are untouched by this script.

## As implemented (T028/T029, verified 2026-09-08)

Fixed identifiers, so creation and teardown address exactly these rows and nothing else. Auth user
ids are assigned by Supabase and therefore change across a teardown/recreate cycle; everything else
below is stable.

| Fixture | Email | Organization id | KYB application id |
|---|---|---|---|
| `buyer-only` | `buyer-only+foundation-test@example.com` | `f0000000-0000-4000-8000-000000000001` | `f0000000-0000-4000-8000-000000000011` |
| `buyer-and-seller` | `buyer-and-seller+foundation-test@example.com` | `f0000000-0000-4000-8000-000000000002` | `f0000000-0000-4000-8000-000000000012` |
| `warehouse-admin` | `warehouse-admin+foundation-test@example.com` | *(none)* | *(none)* |

`example.com` is RFC 2606 reserved, so no fixture address can reach a real mailbox. The shared
password comes from `TEST_FIXTURE_PASSWORD` in `.env.local` — never hardcoded in source, never
printed by the script, never committed.

Each organization is created `status='ACTIVE'`, `is_hills_internal=false`, with an `APPROVED`
`kyb_applications` row, because `organization_can_buy()`/`organization_can_sell()` require exactly
that for a non-internal organization. The fixture's declared capability is therefore the capability
the database's own SECURITY DEFINER functions actually attest — not an application-side assumption.

## Teardown

`npm run test:seed:teardown` (which runs `scripts/seed-test-fixtures.ts --teardown`) deletes exactly
these rows by their fixed email/id convention, in foreign-key-safe order: `platform_admins` →
`organization_members` → `kyb_applications` → `organizations` → Auth users (which cascades
`profiles`). Nothing else in the database is touched.

**One deliberate exception**: rows written by the approved baseline's own triggers — `audit_logs`
(via `write_audit_log`) and `account_status_history` — are **not** deleted. They are the platform's
append-only audit trail, and removing audit history is exactly what the Constitution's auditability
principle forbids. They carry a `NULL` actor (the service-role connection has no `auth.uid()`), so
they hold no fixture credential material. Verified: a seed → re-seed → teardown → re-seed cycle
returns every fixture table to its exact pre-seed count, while `audit_logs` grows monotonically.

## Security boundary

`scripts/seed-test-fixtures.ts` is the **only** place in this repository that constructs a Supabase
client from `SUPABASE_SERVICE_ROLE_KEY`. It is never imported by anything under `src/app/`,
`components/`, or `lib/`. It is excluded from the production build (lives under `scripts/`, not
`src/`).

## What FR-029 requires this to prove

At minimum, one automated test per row below, each calling the real exported server function
directly (research.md §8 — not rendered through a browser):

| Scenario | Function under test | Expected result |
|---|---|---|
| No session at all | `getRequestIdentity()` | returns `{ kind: "anonymous" }`; a protected layout's guard denies access |
| `buyer-only` requesting a seller-only capability | `getRequestIdentity()` | `organization.canSell === false` |
| `buyer-and-seller` requesting the same | `getRequestIdentity()` | `organization.canSell === true` |
| `warehouse-admin` requesting a FINANCE-only action | `getRequestIdentity()` | `operationalRoles` contains `"WAREHOUSE"` but not `"FINANCE"` |
| Unauthenticated call to `updateMyProfile` | `updateMyProfile()` | returns `{ ok: false, ... }`, no RPC call made |

Later features add their own rows to this table as they add their own authorization-sensitive
functions; they do not need to re-seed these same three fixtures if they are still valid for their
scenario.
