# Data Model: Platform Foundation (001)

This feature changes **no database schema** (Constitution Principle III; spec FR-033/Assumptions).
Every "entity" below is an **application-level TypeScript shape** the foundation normalizes from
the already-approved database (tables, RLS, and functions in
`docs/database/database-schema-report.json`). None of these are new tables, and none may be used
to justify a future schema change on their own — the database remains the source of truth; these
types are a typed mirror of a subset of it, scoped to what the foundation actually resolves.

## `RequestIdentity`

Resolved once per request by `lib/auth/dal.ts#getRequestIdentity()` (see research.md §3). Never
persisted beyond the request; never cached across requests.

```ts
type RequestIdentity =
  | { kind: "anonymous" }
  | {
      kind: "authenticated"
      userId: string // auth.uid()
      profile: { fullName: string | null; companyName: string | null } // from `profiles`, DTO-limited
      organization: OrganizationMembership | null // null if the user belongs to no organization
      operationalRoles: OperationalRole[] // [] if the user is not a platform_admins row
    }
```

**Validation rules** (all enforced by the database, not re-implemented here):
- `organization` is `null` when the user has no active `organization_members` row — this is a valid,
  expected state (e.g., a signed-in user who applied but was never attached to an org), not an
  error.
- `operationalRoles` and `organization` are independent — an operator with only a `platform_admins`
  row and no `organization_members` row has `organization: null` and a non-empty
  `operationalRoles`, and vice versa (spec FR-004/Edge Cases: admin access never implies member
  access).

## `OrganizationMembership`

Mirrors a subset of `organizations` + `organization_members`, resolved via `organization_can_buy(id)`
/ `organization_can_sell(id)` rather than reading `can_buy`/`can_sell` columns directly, so the
application never has to re-implement the "`ACTIVE` status AND approved KYB (or Hills-internal)"
rule those functions already encode.

```ts
type OrganizationMembership = {
  organizationId: string
  displayName: string
  memberRole: string // organization_members.member_role (raw, DB-owned vocabulary)
  canBuy: boolean // organization_can_buy(organizationId)
  canSell: boolean // organization_can_sell(organizationId) — additive on top of canBuy
}
```

**State transitions**: owned entirely by the database (`organizations.status`, `kyb_applications.status`).
The application never transitions this state; it only re-reads it, fresh, on every request.

## `OperationalRole`

```ts
type OperationalRole = "SUPER_ADMIN" | "ADMIN" | "COMPLIANCE" | "WAREHOUSE" | "FINANCE" | "AUDITOR"
```

Populated by calling each of the approved `is_<role>_operator()` / `is_platform_admin()` /
`is_super_admin()` / `is_auditor()` RPCs (research.md §3) and collecting the roles that return
`true`. This list can contain more than one entry (e.g., `is_platform_admin()` is `true` for both
`ADMIN` and `SUPER_ADMIN` rows) — the application surfaces every role the database attests to,
rather than picking one.

## `ServerActionResult<T>`

The one shared shape every Server Action in this foundation (and, by convention, later features)
returns — never a thrown raw error to the client.

```ts
type ServerActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
```

`error` is always a safe, human-readable string (never a raw Postgres/Supabase error message,
stack trace, or credential). `fieldErrors` is present only for validation failures and mirrors Zod's
`flatten().fieldErrors` shape.

## `MyProfileInput` (the FR-012 proof mutation's input)

```ts
const MyProfileInput = z.object({
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().max(40).optional(),
  companyName: z.string().max(200).optional(),
  avatarPath: z.string().max(500).optional(),
})
```

Maps 1:1 to `update_my_profile(p_full_name, p_phone, p_company_name, p_avatar_path)`'s parameters
(research.md §6). No field this schema does not name is ever sent to the RPC.

## `CachePolicyEntry` (documentation shape, not a runtime type)

Used only in the durable cache-policy documentation (contracts/cache-policy-contract.md) to keep
every later feature's caching decision in one consistent table shape:

```ts
type CachePolicyEntry = {
  read: string // human name of the read, e.g. "platform foundation status"
  cacheable: boolean
  scope: "public-shared" | "never-shared"
  revalidation: string // e.g. "on-demand via revalidateTag('foundation-status')"
}
```

## `TestFixtureIdentity` (test-only, never used at runtime)

Produced by `scripts/seed-test-fixtures.ts` (research.md §9), consumed only by test files under
`tests/`. Never imported by application code under `src/app/`, `components/`, or `lib/`.

```ts
type TestFixtureIdentity = {
  label: "buyer-only" | "buyer-and-seller" | "warehouse-admin"
  email: string // fixed, documented, +foundation-test convention
  organizationId?: string // absent for warehouse-admin (no organization required)
  operationalRole?: "WAREHOUSE"
}
```

## Explicitly out of scope for this data model

Inventory, listings, orders, payments, settlement, KYB review state, disputes, and any other
business-domain shape defined in the approved schema are **not** modeled here — they belong to the
feature that first needs them. This document only names the slice of the existing database this
foundation actually reads.
