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

## Teardown

`npm run test:seed -- --teardown` (or an equivalent documented flag) deletes exactly these rows by
their fixed email/id convention. Nothing else in the database is touched.

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
