# Platform Foundation — Agent Handoff

This is the starting point for extending Feature 001 without prior chat context. Feature 001 is
foundation infrastructure only; its scope and exclusions are owned by the [specification](./spec.md)
and the repository [Constitution](../../.specify/memory/constitution.md).

## Authoritative map

| Concern | Read this | Working proof |
|---|---|---|
| Protected route surfaces and defence in depth | [Route Surface Contract](./contracts/route-surface-contract.md) | [`/dashboard` page](../../src/app/dashboard/page.tsx), [`/dashboard-admin` page](../../src/app/dashboard-admin/page.tsx), and [`StateScreen`](../../components/layout/state-screen.tsx) |
| Request identity and Supabase runtime clients | [research.md §3–§4](./research.md) | [`getRequestIdentity`](../../lib/auth/dal.ts), [server client](../../lib/supabase/server.ts), and [browser client](../../lib/supabase/client.ts) |
| Sensitive mutations | [Server Action Contract](./contracts/server-action-contract.md) | [`updateMyProfile`](../../src/app/dashboard/settings/actions.ts) |
| Next.js-native caching | [Cache Policy Contract](./contracts/cache-policy-contract.md) | [`foundation-status`](../../src/app/foundation-status/page.tsx) |
| Environment and secret boundaries | [`.env.example`](../../.env.example) and [research.md §14](./research.md) | [`seed-test-fixtures.ts`](../../scripts/seed-test-fixtures.ts) is the only approved service-role consumer |
| Authorization fixtures and tests | [Test Fixture Contract](./contracts/test-fixture-contract.md) | [`request-identity.test.ts`](../../tests/auth/request-identity.test.ts) and [`update-my-profile.test.ts`](../../tests/auth/update-my-profile.test.ts) |
| Existing database capabilities and blockers | [Database Capability Map](../../docs/architecture/DATABASE-CAPABILITY-MAP.md) | The approved reports under [`docs/database/`](../../docs/database/) remain authoritative |
| Feature order and remaining product work | [Implementation Roadmap](../../docs/architecture/IMPLEMENTATION-ROADMAP.md) | Follow the dependency graph and do not work around recorded blockers |

## Walkthrough: add a protected route

Follow the [Route Surface Contract](./contracts/route-surface-contract.md), then:

1. Create the route segment under the correct existing surface: `/dashboard` for members or
   `/dashboard-admin` for operations staff.
2. Add or confirm the surface layout guard resolves `getRequestIdentity()` server-side.
3. In the protected page/Server Component, resolve identity again and check the surface-specific
   organization, capability, or role **before** any protected read or output is produced.
4. On denial, return the shared [`StateScreen`](../../components/layout/state-screen.tsx) behavior.
5. Treat [`src/proxy.ts`](../../src/proxy.ts) as optimistic request shaping only; it is never an
   authorization boundary.
6. Add a negative authorization test alongside the Phase 9 examples under [`tests/auth/`](../../tests/auth/).
7. Verify direct navigation cannot read or serialize protected content for a denied identity.

A parent layout guard protects the visible shell but cannot be the only data boundary because Next.js
may execute child segments in parallel. Every protected page/Server Component, Server Action, and
Route Handler must therefore authorize independently as required by the contract.

## Walkthrough: add a safe Server Action

Use the six ordered gates from the [Server Action Contract](./contracts/server-action-contract.md):

1. **Validate** boundary input with the shared Zod schema.
2. **Authenticate** with fresh server-resolved identity.
3. **Authorize** the required organization capability, role, and state.
4. **Use controlled data access** through the request-scoped server client and an approved database
   function/RPC where one exists.
5. **Map errors safely** to `ServerActionResult<T>`.
6. **Revalidate** only the affected path or cache tag after success.

Copy the structure of [`updateMyProfile`](../../src/app/dashboard/settings/actions.ts), then add both
negative and successful mutation tests. Never return raw Postgres errors, trust client-side
authorization, use service-role credentials in runtime code, or skip authorization because the UI
hides a button.

## Fixtures and verification

The [fixture contract](./contracts/test-fixture-contract.md) owns the documented identities and
cleanup boundary:

```bash
npm run test:seed
npm run test:seed:teardown
```

Run the Foundation verification workflow described in [quickstart.md](./quickstart.md) and exercised
by the Phase 9 tests:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run lint` intentionally exposes the unchanged T001-captured `docs/claude-design` baseline
(124 errors / 148 warnings); Phase 11 requires that exact count, a byte-identical design-source
tree, and zero findings across Feature 001 files. Typecheck, tests, and build must exit 0.

Before extending a domain, consult the [roadmap](../../docs/architecture/IMPLEMENTATION-ROADMAP.md)
and the [database capability map](../../docs/architecture/DATABASE-CAPABILITY-MAP.md). A recorded
database blocker requires the governed database-change process; it is not permission for a shadow
table, service-role bypass, or client-only workaround.

## Closure boundary

Feature 001 closes the platform foundation only. It does **not** authorize production trading.
Legal readiness, KYB policy, agreements, warehouse reconciliation, finance/tax controls,
market-data licensing, security review, backup/restore validation, and end-to-end acceptance
testing remain outstanding product gates.
