# Implementation Plan: Member Dashboard

**Feature**: `004-member-dashboard` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)
**Status**: Planning prepared — implementation NOT started

## Summary

Build the single member application shell at `/dashboard`: capability-adaptive navigation, an
overview that answers the four member questions, explicit acting-organization context, and a
documented module-registration contract that 005–009/012 plug into. Seller capability is additive;
navigation is never the authorization boundary.

## Technical Context

**Rendering**: Server Components by default; interactive islands only for the sidebar drawer, the
organization switcher and the (reserved) notification entry.
**Data**: no new tables. Reads are delegated to module features; this feature reads only
`organizations`/`organization_members`/`profiles` through 003's eligibility layer.
**Caching**: none shared. Any per-organization memoisation is request-scoped only.
**Design**: approved dashboard layout from `docs/claude-design/` (fixed 264px sidebar, sticky topbar,
tablet drawer, mobile card lists, status badge = dot + closed-vocabulary label).
**Testing**: Vitest integration tests for capability gating and state rendering, using 003's extended
fixtures.

## Database capabilities consumed

Only what 003's eligibility layer already resolves — `is_org_member`, `organization_can_buy`,
`organization_can_sell`, `is_authorized_member`, plus `organizations`/`organization_members` reads
under their existing RLS policies. **No new query surface is introduced by this feature**; module
data comes from module features.

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| III Database authority | PASS | Zero schema change; no new tables or functions |
| IV Locked root files | PASS | Untouched |
| V Surface separation | PASS | `/dashboard` only; `/dashboard-admin` untouched |
| VI Buyer/Seller additive model | PASS | FR-001, FR-002, SC-001, SC-003 enforce one portal |
| VIII Server-side authorization | PASS | FR-003, SEC-001, SEC-002 — nav visibility is never the gate |
| XI Caching | PASS | FR-012, SEC-003 — no shared cache of private data |
| XIII Design fidelity | PASS | FR-007, FR-008 follow the approved dashboard layout/vocabulary |
| XV Ambiguity rule | PASS | DB-BLOCK-04 recorded; module shapes deferred to owning features |

## Architecture decisions

1. **Module registration contract.** `lib/dashboard/modules.ts` defines a `DashboardModule` type:
   `{ id, navEntries: NavEntry[], requiredCapability, overviewCards: OverviewCard[] }`. Modules
   register at build time via a static registry file; the shell renders only registered entries.
   The registry is **declarative only** — it never grants access; each module's own routes verify
   capability server-side (FR-003/SEC-002).
2. **Capability declaration ≠ enforcement.** A `NavEntry` declares `requiredCapability: 'buy' | 'sell'
   | 'member'`; the shell uses it to decide *rendering*, and the module's route independently calls
   the eligibility layer to decide *access*. Both must agree; the route wins.
3. **Overview composes contributions.** Each module contributes zero or more `OverviewCard`s mapped
   to one of the four questions (bought / owe / where / needs-action). Missing modules contribute
   nothing — no placeholders (FR-006).
4. **Actions area is its own contribution type.** "Needs action" items come from 003 (agreements,
   KYB) and later modules (payment proof, delivery decision), each providing a specific label and a
   direct href (FR-011).
5. **Acting organization flows through props, not globals.** The layout resolves it once per request
   from 003 and passes it explicitly to every module render — no ambient singleton that could bleed
   across requests or tabs.
6. **Responsive strategy is layout-level.** Sidebar → drawer at tablet; tables → card lists at
   mobile, implemented once in shared components so modules inherit the behaviour.
7. **Notification entry is reserved, not implemented.** The topbar renders the entry disabled/inert
   with a documented pointer to 012 and DB-BLOCK-04.

## Project structure (files this feature adds/edits)

```text
src/app/dashboard/
├── layout.tsx                     # EDITED — extends 001's guard layout with the real shell
├── page.tsx                       # NEW — member overview
├── loading.tsx / error.tsx        # EDITED — shell-aware states
└── (module routes are owned by 005–009/012)

lib/dashboard/
├── modules.ts                     # NEW — DashboardModule/NavEntry/OverviewCard contract
├── registry.ts                    # NEW — static registry of implemented modules
└── overview.ts                    # NEW — composes contributions into the four question areas

components/dashboard/              # NEW — sidebar, topbar, drawer, org switcher, breadcrumb,
                                   #       overview card, action list, kpi/figure formatting,
                                   #       responsive table→cards helper

tests/dashboard/                   # NEW — capability gating, state rendering, registry tests
```

## Testing strategy

- **Capability gating (highest value)**: buyer-only fixture sees no seller nav *and* is refused at a
  seller route; buyer+seller sees both; revocation reflected next request.
- **State coverage**: pending / under-review / suspended / rejected organizations each render their
  distinct screen; zero-organization user routes to 003's onboarding state.
- **Registry behaviour**: an unregistered module contributes nothing; a registered module's entries
  render in the correct nav group and overview area.
- **Formatting**: figures render with unit/currency; reference codes monospaced.
- **Responsive/RTL/a11y**: drawer behaviour, keyboard traversal of the sidebar, `dir="rtl"` layout,
  focus visibility.
- **No-JS**: shell and overview render with JavaScript disabled.

## Risks & blockers

| Risk / blocker | Impact | Handling |
|---|---|---|
| Modules do not exist yet | Sparse overview | Honest empty states; no placeholders (FR-006) |
| **DB-BLOCK-04** | Notification entry inert | Reserve the entry only; 012 owns resolution |
| Registry could become a hidden authorization mechanism | Security regression | SEC-002 + route-level verification tests make the split explicit |
| Overview summaries could become unbounded queries | Performance | Each module contributes a bounded summary query; reviewed at registration |
