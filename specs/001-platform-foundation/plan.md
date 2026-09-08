# Implementation Plan: Platform Foundation

**Branch**: `001-platform-foundation` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-platform-foundation/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

001-platform-foundation gives every later Hills Coffee feature a shared, secure, documented base to
build on: three route surfaces (`/`, `/dashboard`, `/dashboard-admin`) with independent server-side
authorization; a per-request identity/capability resolver (`lib/auth/dal.ts`) that calls the
approved database's own SECURITY DEFINER functions instead of inventing a parallel authorization
model; one real, working Server Action (`updateMyProfile`, backed by the existing
`update_my_profile` RPC) proving the validate→authenticate→authorize→controlled-data-access→safe-
error→revalidate contract every later mutation will copy; one real Next.js-native cache proof (a
placeholder, non-business read) proving caching/revalidation work without touching Redis/Upstash or
any real catalog table; a minimal, documented Vitest test setup with a disposable, service-role-only
seed script for authorization testing; and the first real application of the Hills design tokens
onto the existing shadcn primitives, built RTL-safe from day one. No database schema changes. No
business screens. `src/app/page.tsx`/`layout.tsx`/`globals.css` stay at their current paths.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode, already configured in `tsconfig.json`), Node.js
(matching the installed toolchain; no new runtime requirement)

**Primary Dependencies**: Next.js 16.3.4 (App Router), React 19.2.8, `@supabase/ssr` 0.12.6,
`@supabase/supabase-js` 2.116.0, Zod 4, React Hook Form 7 + `@hookform/resolvers`, Tailwind CSS 4 +
shadcn (`components.json` style `base-nova`) + Base UI + `class-variance-authority`, Lucide,
`i18next`/`react-i18next` (already installed, minimally configured per research.md §10) — no new
production dependency is introduced.

**Caching**: Next.js-native only — **`unstable_cache` + `revalidateTag` from `next/cache`**, no
external cache. `"use cache"` / `cacheLife` / `cacheTag` are **excluded**: they require
`cacheComponents: true` in `next.config.ts`, a repo-wide Cache Components adoption outside this
feature's scope (research.md §5, contracts/cache-policy-contract.md). `next.config.ts` is not
modified by this feature.

**Storage**: Supabase/PostgreSQL (existing, approved baseline; no schema change) — read via the
already-approved RLS policies and `SECURITY DEFINER` RPCs (`is_org_member`, `organization_can_buy`,
`organization_can_sell`, `is_platform_admin`, `is_super_admin`, `is_compliance_operator`,
`is_warehouse_operator`, `is_finance_operator`, `is_auditor`, `update_my_profile`). No Storage
buckets (there are zero in the approved baseline; none are created here).

**Testing**: Vitest + `@testing-library/react` (dev-only; research.md §8). Authorization tests call
exported server functions directly (no browser/E2E harness). `npm run lint` (existing ESLint
config), `npm run typecheck` (`tsc --noEmit`, new script), `npm test` (new), `npm run build`
(existing, also acts as the production-build/type-safety gate).

**Target Platform**: Web (Next.js App Router, server-rendered by default), deployed per the existing
project's Vercel-compatible setup; no new deployment target.

**Project Type**: Web application (single Next.js app; no separate frontend/backend split — this
repo is already one Next.js project with `src/app/`, `components/`, `lib/`).

**Performance Goals**: No new numeric target introduced by this feature (spec sets none); the
foundation must not regress Core Web Vitals on the existing `/` route (Constitution Principle
XXIX/§23) — server-first rendering, minimal `"use client"`, no global animation-library
initialization unless a concrete need exists here (research.md; none identified).

**Constraints**: No Redis/Upstash/external cache (Constitution Principle XI, locked). No
service-role usage in application runtime (Clarify-resolved FR-026). No database schema/migration
(Constitution Principle III). Root files locked to their current path/route/structural role
(FR-001). Single-locale routing, RTL-safe (Clarify-resolved FR-021).

**Scale/Scope**: Foundation-only — 3 route-surface shells, 1 identity resolver, 1 proven Server
Action, 1 proven cache read, 1 proven Hills-styled surface, 1 seed script, ~5 automated tests. Not
the full product (spec §R Out of Scope).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

| Constitution principle | Check | Status |
|---|---|---|
| II. Source-of-Truth Priority | Plan built from SRS → DB baseline → design guidance → Claude Design → code, in that order (see research.md citations) | PASS |
| III. Database Authority | No schema/RLS/function/trigger/bucket change planned anywhere in this plan | PASS |
| IV. Locked Next.js Root Architecture | `page.tsx`/`layout.tsx`/`globals.css` stay at current paths; only narrow, pre-approved edit categories planned (contracts/route-surface-contract.md) | PASS |
| V. Application Surface Separation | `/`, `/dashboard`, `/dashboard-admin` each get independent server-side guards (contracts/route-surface-contract.md); no `/buyer-dashboard`/`/seller-dashboard` planned | PASS |
| VI. Buyer/Seller Capability Model | Seller is additive inside `/dashboard`, resolved via `organization_can_sell` (research.md §3) | PASS |
| VIII. Server/Database-Side Authorization | Every guard/action check happens server-side via `getRequestIdentity()`/RLS; Proxy is optimistic-only (research.md §2) | PASS |
| IX. Supabase/PostgreSQL Transactional Authority | All authorization/mutation logic delegates to existing DB functions; no logic duplicated in the app | PASS |
| XI. Next.js-Native Caching Only | Zero Redis/Upstash dependency planned; cache proof pinned to `unstable_cache` + `revalidateTag`, with Cache Components (`"use cache"`/`cacheComponents`) explicitly excluded (research.md §5, contracts/cache-policy-contract.md) | PASS |
| XIII. Design System Fidelity | Hills tokens remapped into existing shadcn variable names (research.md §12); no full homepage/UI-kit rebuild planned | PASS |
| XIV. Security & Secrets Handling | Service-role key confined to a test-only script (research.md §4, §9); no secret in docs/logs | PASS |
| XV. Spec-Driven Development / Ambiguity Rule | This plan follows an already-clarified spec; no unresolved ambiguity carried forward | PASS |
| Multi-Agent Continuity & Handoff | contracts/, research.md, data-model.md, quickstart.md are the durable references a future agent reads (spec FR-031/032) | PASS |

No violations. **Complexity Tracking is empty** — see below.

**Post-Phase-1 re-check** (after research.md, data-model.md, contracts/, quickstart.md were
written): no new violation surfaced. The one design choice that most needed re-checking against
this table — remapping `globals.css` CSS variable values (Principle IV, "locked root files") — was
confirmed against contracts/route-surface-contract.md's explicit allowed/forbidden edit table
before being finalized in research.md §12, and stays a PASS.

## Project Structure

### Documentation (this feature)

```text
specs/001-platform-foundation/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output — app-level concepts only, no new DB tables
├── quickstart.md         # Phase 1 output — validation guide
├── contracts/            # Phase 1 output
│   ├── route-surface-contract.md
│   ├── server-action-contract.md
│   ├── cache-policy-contract.md
│   └── test-fixture-contract.md
└── tasks.md              # Phase 2 output (/speckit-tasks command — NOT created by /speckit-plan)
```

### Source Code (repository root)

This is a single Next.js App Router project (no separate frontend/backend split). The tree below
shows only what this feature adds or touches; everything else in the repository is unchanged.

```text
src/
├── proxy.ts                           # NEW — optimistic-only redirect (research.md §2), optional.
│                                      #   Sits BESIDE src/app/, never inside it — Next 16 resolves
│                                      #   proxy.ts at the same level as app/.
└── app/
    ├── page.tsx                       # LOCKED — no edit planned
    ├── layout.tsx                     # LOCKED path/route — narrow edit: i18n provider wrapper only
    ├── globals.css                    # LOCKED path/route — narrow edit: Hills token *values* (§12)
    ├── dashboard/
    │   ├── layout.tsx                 # NEW — Member Portal shell + authorization guard
    │   ├── error.tsx / loading.tsx    # NEW — shared error/loading (research.md §15)
    │   └── settings/
    │       ├── page.tsx               # NEW — minimal settings shell hosting the FR-012 proof form
    │       └── actions.ts             # NEW — `updateMyProfile` Server Action (contracts/)
    ├── dashboard-admin/
    │   ├── layout.tsx                 # NEW — Operations Console shell + independent guard
    │   └── error.tsx / loading.tsx    # NEW — shared error/loading
    └── foundation-status/             # NEW — routable, deliberately unlinked cache-proof segment
        ├── page.tsx                   #   renders the computed+cached foundation value (§5)
        └── actions.ts                 #   revalidateTag("foundation-status") → forces recompute

lib/
├── supabase/
│   ├── client.ts                  # NEW — createBrowserClient (research.md §4)
│   └── server.ts                  # NEW — createServerClient, request-scoped (research.md §4)
├── auth/
│   ├── types.ts                   # NEW — RequestIdentity / OrganizationMembership /
│   │                              #       OperationalRole types (data-model.md) [T010]
│   └── dal.ts                     # NEW — getRequestIdentity() (research.md §3) [T011]
├── foundation/
│   └── status.ts                  # NEW — computed value cached via `unstable_cache`,
│                                  #       tag `foundation-status` (research.md §5) [T020]
├── validation/
│   └── my-profile.ts              # NEW — shared Zod schema (data-model.md)
└── i18n/
    └── config.ts                  # NEW — minimal i18next init, English only (research.md §10)

components/
├── ui/                            # UNCHANGED — existing shared shadcn primitives
└── layout/
    └── state-screen.tsx           # NEW — shared unauthorized/forbidden/not-found/empty shell

scripts/
└── seed-test-fixtures.ts          # NEW — test-only, service-role-scoped (contracts/test-fixture-contract.md)

tests/
├── auth/
│   ├── request-identity.test.ts   # NEW — Story 2 / FR-029 authorization-negative + positive cases
│   └── update-my-profile.test.ts  # NEW — Story 3 authorization/validation cases
└── design/
    └── hills-tokens.test.tsx      # NEW — FR-020 rendered-component proof (RTL + reduced-motion included)

.env.example                       # NEW — documented template, no real values (research.md §14)
```

**Structure Decision**: Single Next.js project (`src/app/` + `components/` + `lib/`), matching the
repository's existing layout. No `backend/`/`frontend/` split, no mobile target — this is a
server-rendered web application, not a library/CLI/mobile project, so the template's "Option 2: Web
application" split does not apply (there is one deployable, not two); the template's Option 1/3
scaffolding is likewise unused and removed above.

## Complexity Tracking

*No entries — the Constitution Check above reported no violations requiring justification.*
