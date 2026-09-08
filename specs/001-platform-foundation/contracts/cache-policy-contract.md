# Contract: Cache Policy

Governs FR-014–FR-017, FR-021 (no locale caching complications), Constitution Principle XI;
Platform Story 4. This table is the durable reference every later feature adds a row to — it is not
rewritten per feature.

## Rule

Next.js-native caching is the **only** caching mechanism. No Redis, Upstash, or other external
cache/store may be introduced (Constitution Principle XI is a locked rule — see Governance in the
constitution for what changing it would require).

**Approved APIs**: `fetch` cache options, `unstable_cache`, `revalidatePath` and `revalidateTag`
from `next/cache`.

**Excluded APIs**: `"use cache"`, `cacheLife`, `cacheTag` and `updateTag`. These belong to Next 16's
**Cache Components** model, which requires `cacheComponents: true` in `next.config.ts`. Next's own
upgrade guide warns that enabling it "is not a rename-only change: it can surface build errors for
uncached data outside of `<Suspense>` and requires adopting the Cache Components model" — a
repo-wide architectural change affecting every feature. Adopting Cache Components requires its own
approved architecture decision; until then `next.config.ts` stays unchanged and features 001–012
use `unstable_cache` + `revalidateTag`.

## Categories

| Category | Examples | Cacheable? | Scope | Notes |
|---|---|---|---|---|
| Public, slow-changing, non-authorization-sensitive | public coffee/catalog data, origins, public content, reference-price presentation (once those features exist) | Yes | public-shared | Cache key never includes a user/session identifier |
| Foundation proof read | the computed foundation-status value (timestamp + revision token) rendered at `/foundation-status`, tag `foundation-status` (research.md §5) | Yes | public-shared | Computed, not constant: repeated reads return the same value; `revalidateTag("foundation-status")` forces a recompute so the next read visibly changes. On-demand revalidation only in this feature; a numeric TTL ceiling MAY be added later |
| Authorization state | `RequestIdentity`, `OrganizationMembership`, `operationalRoles` | **Never cached** across requests | n/a | Resolved fresh every request (research.md §3) |
| Private/member data | orders, inventory positions, reservations, listings, payments, settlement, ownership, KYB, private documents | **Never shared-cached** | never-shared | Any future caching of these must be scoped per-user/per-org and re-validated by the database at transaction time regardless (FR-017) |
| Checkout/transactional reads | any UI-shown availability used to initiate a purchase | Advisory only | n/a | The database performs the authoritative check at the moment of the transactional action — a cached read is never trusted as proof of availability |

## Adding a new cache entry (for later features)

1. Confirm the data is public and non-authorization-sensitive, or is scoped so its cache key cannot
   be served across two different users/organizations.
2. Choose a cache tag naming convention consistent with existing tags (kebab-case, prefixed by the
   owning domain, e.g. `catalog-origins`, `catalog-coffees`).
3. Define the mutation(s) that must call `revalidateTag`/`revalidatePath` for that tag.
4. Add a row to the table above in the same pull request that introduces the cached read.
