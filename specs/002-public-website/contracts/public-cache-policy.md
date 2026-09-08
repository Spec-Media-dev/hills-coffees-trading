# Contract: Public Cache Ownership & Tag Policy

Governs FR-010, FR-011, SC-002; Constitution Principle XI.

## 0. Ownership — this document is subordinate

**`specs/001-platform-foundation/contracts/cache-policy-contract.md` is the PLATFORM-WIDE
AUTHORITY** on caching for features 001–012. It defines the approved and excluded APIs, the
category rules (what may and may not be cached), and the platform tag table that *"every later
feature adds a row to"*.

This Feature 002 document is an **extension and a per-feature register**, not a second cache
architecture. Specifically:

| | 001's cache-policy-contract.md | This document |
|---|---|---|
| Approved/excluded cache APIs | **Defines them** | Restates them; may not diverge |
| Cacheable/never-cacheable categories | **Defines them** | Applies them to public reads |
| Platform tag table | **Authoritative index** — 002's tags are added there (task T030) | Detailed per-tag ownership, TTL and fallback for 002's tags |
| Conflict resolution | **Wins** | Yields, and is corrected |

If anything here appears to contradict 001's contract, **001's contract governs and this file is the
thing to fix.** Feature 002 introduces no new caching mechanism, no new cache API, and no alternative
policy — only concrete tag entries and the verification method for them (§5).

---

## 1. The approved cache API (pinned by Feature 001, verified in implementation)

Feature 001 is implemented and verified; its cache decision is binding on 002.

**USE:**

```ts
import { unstable_cache, revalidateTag } from "next/cache";

export const getX = unstable_cache(
  async () => { /* public read */ },
  ["key-parts"],              // key parts
  { tags: ["tag-name"], revalidate: 3600 }   // tags + TTL live in the options object
);

// on-demand invalidation
revalidateTag("tag-name", { expire: 0 });
```

**DO NOT USE:**

| Excluded | Why |
|---|---|
| `"use cache"` directive | Cache Components model — requires `cacheComponents: true` |
| `cacheTag()` function | same |
| `cacheLife()` function | same |
| `updateTag()` | same |
| `cacheComponents: true` in `next.config.ts` | repo-wide architectural adoption, not approved |
| Redis / Upstash / any external cache or store | Constitution Principle XI (locked) |

Adopting Cache Components would affect every route in 001–012 and requires its own approved
architecture decision. `next.config.ts` gains **only** `trailingSlash: true` from this feature
(see `public-route-lifecycle.md` §5) — never a cache flag.

### `revalidateTag`'s second argument

The installed Next.js version (16.3.4) makes `revalidateTag`'s second parameter **mandatory**;
calling it with one argument still works but is deprecated and emits a runtime warning. Feature 001
uses `{ expire: 0 }` — the plain numeric inline-object form of `CacheLifeConfig`, requesting
immediate expiration. It is **not** a named `cacheLife` profile string and does not imply Cache
Components. Feature 002 uses the identical form.

---

## 2. Public caches are never user-varying

Every cache entry on this surface is **public-shared**. A public cache key MUST NEVER incorporate,
and a cached value MUST NEVER vary by:

- user identity · session · organization · authentication state · role/capability
- any request cookie or `Authorization` header
- any value derived from `getRequestIdentity()`

**Public pages must not call `getRequestIdentity()` at all** (SEC-002). If a genuinely personalised
element is ever needed on a public page, it must be an explicitly **non-cached** island — never a
variation of a shared entry. Serving one visitor's cached page to another is the single most
damaging failure mode available on this surface.

---

## 3. Tag register

Every tag this feature introduces, with its owner and current fallback. **Ownership is stated
truthfully: no feature's mutations exist yet.**

| Tag | Covers | `revalidate` (TTL ceiling) | Invalidating mutation — owner | Status today | Fallback behaviour today |
|---|---|---|---|---|---|
| `public-coffees` | coffee index list DTO | 3600s | catalogue mutations — **Feature 010 (NOT IMPLEMENTED)** | TTL only | Content changes appear within the TTL; no on-demand invalidation exists yet |
| `public-coffee:{slug}` | one coffee detail DTO | 3600s | catalogue mutations — **Feature 010 (NOT IMPLEMENTED)** | TTL only | as above |
| `public-origins` | origin index list DTO | 3600s | catalogue mutations — **Feature 010 (NOT IMPLEMENTED)** | TTL only | as above |
| `public-origin:{slug}` | one origin detail DTO | 3600s | catalogue mutations — **Feature 010 (NOT IMPLEMENTED)** | TTL only | as above |
| `public-taxonomy` | types / varieties / processing / packaging / tags | 86400s | catalogue mutations — **Feature 010 (NOT IMPLEMENTED)** | TTL only | slow-changing reference data |

**Not registered, deliberately:**

- **No content tag.** `/knowledge/*` and `/legal/*` are blocked by CONTENT-01; registering a tag for
  a source that does not exist would imply a capability the platform lacks.
- **No reference-price tag.** Feature 002 does not query price tables
  (`reference-price-presentation.md` §1); when Feature 011 implements pricing it registers and owns
  its own tag.

### Honest statement of current invalidation

Until Feature 010 exists, **no on-demand invalidation of these tags happens anywhere.** The TTL
ceiling is the only refresh mechanism. That is why every tag above carries a finite `revalidate`
rather than relying on tag invalidation alone: a catalogue change must eventually become visible
even with no mutation owner in existence. Feature 010 later calls
`revalidateTag(tag, { expire: 0 })` on catalogue writes; adding that is 010's task, and 002 must not
claim it already happens.

---

## 4. Protected surfaces do not share this mechanism

No route under `/dashboard` or `/dashboard-admin` may use `unstable_cache` or any tag in §3.
Authorization state and member/organization data are resolved fresh per request (001 research §3;
platform cache contract "Authorization state — never cached").

Verified structurally: `grep -rln "unstable_cache" src/app/dashboard src/app/dashboard-admin`
returns nothing.

---

## 5. The revalidation proof mechanism (H1)

A cache proof that never observes a *changed* value after revalidation has not proven revalidation
works. Feature 001 established the read → same → revalidate → different pattern at
`/foundation-status`. This section defines how 002 reproduces it **safely**, because 002's tags
cover real catalogue data rather than a throwaway computed token.

### 5.1 Absolute prohibition — no public cache-purge endpoint

**An anonymous or publicly-reachable cache-purge/revalidation route MUST NOT be created.**

Feature 001's proof was triggered by a button on an unauthenticated page. That was acceptable there
because the tag covered a self-computed token with no database cost. **It must not be copied here.**
An anonymous purge on a catalogue tag lets any caller evict a shared cache entry at will and force
repeated database reads — a denial-of-service and cost-amplification vector on the platform's only
anonymous surface.

Also prohibited, restating Principle XI and §1: Redis, Upstash, any external cache or store,
`"use cache"`, `cacheTag()`, `cacheLife()`, `updateTag()`, `cacheComponents: true`.

The mechanism stays entirely on **Next.js native cache + `unstable_cache` + tags +
`revalidateTag`**.

### 5.2 Observing the change without mutating catalogue data

`revalidateTag` requires Next.js's request/work-store context — Feature 001 proved a bare Node
script cannot call it ("static generation store missing"). And a cached *catalogue* read will not
visibly change unless the underlying row changes, which would otherwise force this proof to depend
on a catalogue fixture.

Both problems are solved by making each cached entry carry its own **computation stamp**:

- Every `lib/public/*` cached function records, **inside the cache entry**, the instant it computed
  (`computedAt`) plus a per-computation token.
- This stamp is **diagnostic provenance, not page content**: it is exposed only through a
  **test-only accessor** and is never rendered, never placed in metadata, JSON-LD, or the sitemap,
  and never shown to a visitor.
- A cache **hit** returns the stored stamp unchanged; a **recompute after `revalidateTag`** produces
  a new one. The change is therefore observable with **no catalogue mutation and no seeded catalogue
  row required**.

This is honest: the stamp genuinely records when that cache entry was built. It is not a fabricated
value and it is not a substitute for real data.

### 5.3 The cache-proof route — complete specification

`revalidateTag` requires Next.js's request/work-store context, and the stamp must be read from the
**same running server and cache instance** that serves the public pages. A Vitest process importing
`lib/public/*` gets its own module instance and its own cache — it cannot observe the server's. Both
halves of the proof therefore go through **one** guarded Route Handler.

**This is the single canonical path. Use it verbatim everywhere — tasks, robots, tests.**

| # | Item | Value |
|---|---|---|
| 1 | **Route file** | `src/app/internal-test/cache-proof/route.ts` |
| 2 | **URL** | `/internal-test/cache-proof/` (trailing slash — `trailingSlash: true` is enabled; call it slashed to avoid a 308 hop) |
| 3 | **Methods** | `GET` (read stamp) and `POST` (revalidate) **only**. No other verb is exported |
| 4 | **Enable flag (server-only)** | `CACHE_PROOF_ENABLED` — the route exists **only** when this is exactly `"true"`. Never `NEXT_PUBLIC_*`. **`NODE_ENV` is NOT the gate** (see §5.3.2) |
| 4b | **Secret env var (server-only)** | `CACHE_PROOF_SECRET` — never `NEXT_PUBLIC_*`, never in a client bundle |
| 5 | **Secret header** | `x-cache-proof-secret` |
| 6 | **Request body** | `POST`: `{ "tag": "<allowlisted tag>" }` (JSON). `GET`: no body; tag supplied as `?tag=<allowlisted tag>` |
| 7 | **Responses** | see table below |
| 8 | **Tag allowlist** | fixed; see below |
| 9 | **Invalid tag** | `400` `{ "ok": false, "error": "tag_not_allowed" }` — generic, no tag enumeration. Safe to be informative here because the caller has already proven the secret |
| 10 | **Missing/wrong secret** | **`404`** with an empty body — never `401`/`403`, so the route never advertises its own existence |
| 11 | **Not enabled** | **`404`** with an empty body whenever `CACHE_PROOF_ENABLED !== "true"` — checked **first**, before the header, the body or the secret is read. A deployed production environment simply never sets the flag, so the route is absent there by default |

**The namespace deliberately does not start with `_`.** Next.js treats `_folder` as a *private
folder excluded from routing* — Feature 001 recorded that exact trap for `/foundation-status`. An
underscore-prefixed proof route would silently never exist.

#### 5.3.2 Why an explicit flag, not `NODE_ENV`

The proof must run against a **real production build** — `next build` + `next start` — because that
is the cache behaviour that ships. But `next start` *is* production mode: gating the route on
`NODE_ENV !== "production"` would make the route unreachable in exactly the mode the proof claims to
verify. The two requirements are contradictory, so the gate is an **explicit opt-in flag** instead:

| Environment | `CACHE_PROOF_ENABLED` | `NODE_ENV` | Route |
|---|---|---|---|
| Deployed production | absent / `false` | `production` | **`404`** — proof capability unavailable |
| Local production-build verification | `true` (set by the operator for the run) | `production` | available, **and still** requires a matching secret |
| Local dev | absent / `false` | `development` | **`404`** |

Both conditions are required: `CACHE_PROOF_ENABLED === "true"` **AND** a matching
`x-cache-proof-secret`. Either one missing → `404`. The flag alone grants nothing.

**Local verification procedure** (this is how T031 is executed):

1. `npm run build`
2. start the built app locally with `CACHE_PROOF_ENABLED=true` and `CACHE_PROOF_SECRET=<value>` in
   the server environment (e.g. `CACHE_PROOF_ENABLED=true CACHE_PROOF_SECRET=… npx next start -p <port>`)
3. run the A–D protocol (§5.3.1) against **that** running instance
4. stop the server

Deployed production is unaffected: it never sets the flag, and nothing in the build output reveals
the secret. Neither variable is `NEXT_PUBLIC_*`, so neither reaches a client bundle.

#### Tag allowlist (no arbitrary tag input)

Only the five tags registered in §3 are accepted — three exact matches plus two strictly-patterned
parameterized forms so a detail entry can be revalidated without opening the input up:

| Accepted | Form |
|---|---|
| `public-coffees` | exact |
| `public-origins` | exact |
| `public-taxonomy` | exact |
| `public-coffee:<slug>` | pattern `^public-coffee:[a-z0-9-]{1,100}$` |
| `public-origin:<slug>` | pattern `^public-origin:[a-z0-9-]{1,100}$` |

Anything else → `400 tag_not_allowed`. The handler passes the validated tag to
`revalidateTag(tag, { expire: 0 })` and does nothing else — **no arbitrary function execution, no
dynamic import, no eval, no user-supplied path**.

#### Response shapes

| Case | Status | Body |
|---|---|---|
| `GET` success | `200` | `{ "ok": true, "tag": "<tag>", "stamp": { "computedAt": "<ISO-8601>", "token": "<opaque>" } }` |
| `POST` success | `200` | `{ "ok": true, "tag": "<tag>", "revalidatedAt": "<ISO-8601>" }` |
| Tag not allowlisted | `400` | `{ "ok": false, "error": "tag_not_allowed" }` |
| Malformed body / missing tag | `400` | `{ "ok": false, "error": "bad_request" }` |
| Missing or wrong secret | `404` | *(empty)* |
| Proof flag not enabled — `CACHE_PROOF_ENABLED !== "true"`, **including deployed production**, which simply never sets it | `404` | *(empty)* |

**The gate is the flag, not the environment.** `NODE_ENV === "production"` alone does **not** disable
this route: a locally-started production build (`npm run build` + `next start`) with
`CACHE_PROOF_ENABLED=true` and the correct secret serves the proof normally — that is the approved
verification model (§5.3.2). Deployed production returns `404` because it leaves the flag absent or
`false`, not because it is production.

**Every response — including the 404s — carries `X-Robots-Tag: noindex, nofollow`.**

#### Security invariants

- **Disabled by default everywhere.** The route requires an explicit `CACHE_PROOF_ENABLED="true"`; a deployed production environment never sets it. Missing flag, `false` flag, missing secret and wrong secret are all indistinguishable from "route does not exist" (empty `404`).
- **No service-role key is involved** anywhere in this route. It reads public cache entries only.
- **No user, session, organization or private data** is read or returned. The route never calls
  `getRequestIdentity()`.
- Returns **only** the stamp — never a DTO, never catalogue content, never a row.
- Fixed tag allowlist; no arbitrary tag, path or function input.
- Linked from nowhere; absent from `sitemap.xml`; disallowed in `robots.txt`
  (`Disallow: /internal-test/`); non-indexable metadata.

#### Fallback if this surface is still judged too broad

Defer the tag-invalidation half to Feature 010 (which owns catalogue mutations and will call
`revalidateTag` from an operator-authorized path) and verify only TTL-bounded behaviour here. What
is **not** acceptable is an unguarded public purge route, or claiming the proof passed without
observing a changed value.

### 5.3.1 The observable protocol (A–D), against one running server

All four steps hit the **same** locally-started production build (§5.3.2), so the cache observed is
the cache the public pages actually use in production mode. Every call carries the
`x-cache-proof-secret` header and requires `CACHE_PROOF_ENABLED=true` on that server:

| Step | Call | Expected |
|---|---|---|
| **A** | `GET /internal-test/cache-proof/?tag=public-coffees` with the secret header | `200`, stamp **S1** |
| **B** | repeat the identical `GET` | `200`, stamp **S1** — byte-identical (cache hit; no recompute) |
| **C** | `POST /internal-test/cache-proof/` with `{ "tag": "public-coffees" }` and the secret header | `200`, `revalidatedAt` present |
| **D** | repeat the `GET` | `200`, stamp **S2** — `S2 ≠ S1` (the entry recomputed) |

No wall-clock waiting, no catalogue mutation, no assumption. A run where **B** differs from **A**, or
**D** equals **A**, is a failed proof and must be investigated rather than retried.

**Stamp containment (must be verified, not assumed)**: the `computedAt`/`token` pair is returned
**only** by this guarded route. It must appear in **none** of: public page HTML, the RSC/Flight
payload, `generateMetadata` output, JSON-LD, or `sitemap.xml`.

### 5.4 Verification checklist

| Check | Expectation |
|---|---|
| Real cache behaviour | The A–D protocol in §5.3.1 executed against one **locally-started production build** (`npm run build` → `next start` with `CACHE_PROOF_ENABLED=true`, §5.3.2): A=B (identical stamp), D≠A (recomputed). Proven, not asserted |
| Route safety | `/internal-test/cache-proof/` returns an empty `404` when `CACHE_PROOF_ENABLED` is absent **or** `"false"` (including a normal production build), and when `x-cache-proof-secret` is missing **or** wrong — even with the flag on; `400 tag_not_allowed` for any tag outside the §5.3 allowlist; `X-Robots-Tag: noindex, nofollow` on every response including 404s; neither `CACHE_PROOF_ENABLED` nor `CACHE_PROOF_SECRET` appears in any client bundle; no service-role key and no identity call in the handler |
| Discovery exclusion | `/internal-test/` is `Disallow`ed in `robots.txt`, absent from `sitemap.xml`, non-indexable, and linked from nowhere |
| Stamp containment | The `computedAt`/`token` pair appears in no public page HTML, RSC payload, metadata, JSON-LD or sitemap — only in this route's response |
| No public purge | `grep -rn "revalidateTag" src/app/\(public\) src/app/page.tsx` returns nothing — no public page or public Server Action revalidates a tag |
| Stamp is not content | The `computedAt`/token appears in no rendered page, metadata, JSON-LD or sitemap output |
| No user variance | No public read references identity; no cache key contains a user/session/org value; `getRequestIdentity` appears nowhere under the public surface |
| API discipline | `grep -rn "use cache\|cacheLife(\|cacheTag(\|updateTag(\|cacheComponents" src lib next.config.ts` returns nothing |
| No external cache | `grep -rniE "redis\|upstash" src lib package.json` returns nothing |
| Protected isolation | `grep -rln "unstable_cache" src/app/dashboard src/app/dashboard-admin` returns nothing |
| Tag declaration | Every exported public read declares a tag and a `revalidate` ceiling; every tag appears in §3 |
