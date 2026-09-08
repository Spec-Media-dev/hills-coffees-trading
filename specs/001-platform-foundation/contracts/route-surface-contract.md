# Contract: Route Surface & Authorization Boundary

Governs FR-001–FR-004, FR-006–FR-007; Platform Story 1; Constitution Principles IV, V, VIII.

## Surfaces and their guard

| Surface | Root | Layout file | Guard (server-side, authoritative) | Proxy (optimistic, optional) |
|---|---|---|---|---|
| Public Website | `/` | `src/app/layout.tsx` (LOCKED — narrow edits only, see below) | none — public by definition | none |
| Foundation proof | `/foundation-status` | (root layout) | none — renders no private data | none |
| Member Portal | `/dashboard` | `src/app/dashboard/layout.tsx` (new) | `getRequestIdentity()` must return `kind: "authenticated"` with a non-null `organization`; otherwise render the shared unauthorized state | may redirect to a sign-in route if no Supabase auth cookie is present at all |
| Operations Console | `/dashboard-admin` | `src/app/dashboard-admin/layout.tsx` (new) | `getRequestIdentity()` must return `kind: "authenticated"` with a non-empty `operationalRoles`; otherwise render the shared unauthorized state | same as above |

**Independence rule** (Story 1 AS4, Edge Cases): the `/dashboard` guard checks `organization`; the
`/dashboard-admin` guard checks `operationalRoles`. Neither guard consults the other's result.
Passing one check never grants the other route tree.

**Proxy file location**: the optional optimistic layer lives at `src/proxy.ts` — beside `src/app/`,
never inside it (Next 16 resolves `proxy.ts` at the same level as `app/`).

**Where the guard runs**: at the top of each surface's root `layout.tsx`, calling
`getRequestIdentity()` (research.md §3) before rendering any child route — not in `src/proxy.ts`, not
in a client component, not in a leaf page. A denied check renders the shared unauthorized state
(contracts/state-foundation-contract.md) with an HTTP 200 + in-page message for a signed-in-but-
unauthorized user, or a redirect to a sign-in route for a fully anonymous visitor — it never
partially renders protected data before the check resolves.

## Locked root files — allowed edit categories

| File | Allowed | Forbidden |
|---|---|---|
| `src/app/page.tsx` | no planned edit | any edit that changes its content/behavior in this feature (that's 002-public-website's scope) |
| `src/app/layout.tsx` | adding a session/i18n provider wrapper around `{children}`; adding an RTL-readiness attribute (`dir` is per-surface, not hardcoded here — see below); adding foundation `<meta>`/`metadata` fields | moving the file; wrapping the route in a route group; changing route `/`; adding homepage visual/content design |
| `src/app/globals.css` | remapping existing shadcn CSS variable **values** to Hills tokens (research.md §12); adding the Hills font-face rules needed for the one proof surface | renaming/removing the existing variable names `components/ui/*` already depends on; wholesale token-file replacement |

`dir="rtl"` is never hardcoded on the locked root `<html>` in this feature (no locale routing per
Clarify) — RTL readiness is proven on the one dedicated proof surface (research.md §11), not applied
globally yet.

## No separate Buyer/Seller applications

There is exactly one `src/app/dashboard/` route tree. Seller-only children (e.g., a future
`app/dashboard/listings/`) are additive under the same tree, gated by
`identity.organization?.canSell`, evaluated at the point where seller-specific navigation/content
would render — never by a second route root (`/buyer-dashboard`, `/seller-dashboard` do not exist
and must not be created by this or any later feature).
