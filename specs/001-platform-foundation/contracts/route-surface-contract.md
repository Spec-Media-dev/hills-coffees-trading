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
in a client component. A denied check renders the shared unauthorized state — the `StateScreen`
component (research.md §15, implemented at `components/layout/state-screen.tsx`) — with an HTTP 200 +
in-page message for a signed-in-but-unauthorized user, or a redirect to a sign-in route for a fully
anonymous visitor.

**The layout guard is necessary but NOT sufficient — see "Defence in depth" below.**

## Defence in depth: a layout guard alone does NOT protect data

**Discovered during 001 Phase 4 implementation, verified against the running production build. Every
later feature (002–012) must follow this rule.**

Next.js renders route segments **in parallel**. A parent `layout.tsx` that returns `StateScreen`
instead of `{children}` therefore does **not** prevent the child page from executing: the page
component still runs, its data fetching still happens, and its rendered output is still serialized
into the **RSC flight payload** embedded in the HTML response — even though it is not visible in the
DOM. A layout-only guard produces a page that *looks* denied while having already run, and
potentially transmitted, protected data.

This was observed concretely: with a forged auth cookie, `/dashboard` correctly rendered the
`unauthorized` state, yet the placeholder page's content was still present inside the response's
`self.__next_f.push(...)` script payload. The fix was to make each protected page independently
re-authorize before producing any protected output.

### The rule

| Layer | Role | Authoritative? |
|---|---|---|
| `src/proxy.ts` | Optimistic request shaping (cookie **presence** only). No DB call, no `getUser()`, no RPC, no service-role key. Removing it changes UX only. | **No — never** |
| Surface root `layout.tsx` | Surface-level denial: renders the shell or `StateScreen`. Stops the *visible* surface. | Yes, for the shell — **but it does not stop child execution** |
| Every protected page / Server Component that reads protected data | MUST call `getRequestIdentity()` (or a helper built on it) and deny **before** the protected read | **Yes — this is the real boundary** |
| Every Server Action | MUST authenticate + authorize independently (contracts/server-action-contract.md, steps 2–3) | **Yes** |
| Every Route Handler | MUST authenticate + authorize independently, same as a Server Action | **Yes** |
| Database RLS + `SECURITY DEFINER` functions | Final backstop; the application never re-derives these rules | **Yes** |

Concretely, for any new protected page:

```tsx
export default async function SomeProtectedPage() {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || /* surface predicate */) {
    return <StateScreen kind="unauthorized" />;
  }
  // ...only now may protected data be read
}
```

The page's predicate must match its surface's guard: `/dashboard` pages check `organization`;
`/dashboard-admin` pages check `operationalRoles`. Neither ever checks the other's (independence
rule above). This satisfies FR-006 ("every protected route and Server Action MUST independently
re-verify authorization on the server for that specific request") and Constitution Principle VIII.

Reference implementations shipped in 001: `src/app/dashboard/page.tsx` and
`src/app/dashboard-admin/page.tsx`.

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
